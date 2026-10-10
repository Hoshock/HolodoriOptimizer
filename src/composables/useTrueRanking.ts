import { onUnmounted, readonly, ref, shallowRef } from "vue";

import type { RankingWorkerRequest, RankingWorkerResponse } from "../engine/rankingWorker";
import {
  assembleProxyBoards,
  pickRankingTeams,
  proxyJobs,
  rankingWorkload,
  searchJobs,
} from "../engine/trueRanking";
import type {
  Proxy,
  ProxyBoards,
  SearchFound,
  TrueRankingInput,
  TrueRankingItem,
  TrueRankingPhase,
} from "../engine/trueRanking";
import { fingerprint } from "./usePlanCache";
import { workerCount } from "./workerCount";
import { CALC_FAILED } from "../ui/messages";

/**
 * 結果の「組み直すと」を裏で計算する composable(`rankingWorker.ts`)。`run` で前の計算を捨てて始め直す(呼ぶのは探索の結果が届いたとき —
 * `OptimizerPanel`。登録が変わっても始め直さない)。
 *
 * - `status`: 始める前 `idle` → 計算中 `running` → 全件そろって `done`(失敗は `error`)
 * - `items`: 最適化した編成(見込みの順。届いたものから埋まる)
 * - `progress`: いまの段と済んだ数。`workload` は段ごとの仕事の数(見込みのボードを使い回すときは最初の段が 0)
 * - 見込みのボード(最初の段)は `proxyKey` が同じなら使い回す(登録・条件が変わっていなければ同じ結果になる)
 * - **そろった結果は、依頼(条件・曲・登録・探索の上位)が同じならサイトを更新するまで使い回す**(2026-10-10 ユーザー指示
 *   「組み直すとの結果はサイトを更新しない限りキャッシュして欲しい」)。同じ条件で探し直しても計算し直さず、すぐ一覧になる。
 *   持つのは直近 `DONE_CACHE_LIMIT` 件の依頼(曲を変えて探し、元の曲へ戻したときにも効く)
 * - `pausedMs`: 計算が止まっていた時間。iPhone は別のアプリへ切り替えるとページごと止まる(2026-10-08 ユーザー報告)ので、残り時間の
 *   補正から除く。裏に回ってから表へ戻るまでのうち、最後に Worker から届いた後の時間を数える(PC のように裏でも進む場合は届き続けるので数えない)
 *
 * **Worker を何本か立てて仕事を配る**(2026-10-08「計算の高速化」。本数は `workerCount`)。3 段はどれも互いに独立した仕事の集まりで、
 * 空いた Worker から次の仕事を渡す。段の切れ目で全部の結果を仕事の並びの順にまとめるので、何本で計算しても 1 本と同じ結果になる
 */
export type TrueRankingStatus = "idle" | "running" | "done" | "error";

/** そろった結果を持っておく依頼の数(古いものから捨てる。1 件は最適化した編成 130 件ほど) */
const DONE_CACHE_LIMIT = 8;
/** そろった結果(依頼の指紋 → 結果)。ページの中で 1 つ(サイトを更新すると消える) */
const doneCache = new Map<
  string,
  { items: (TrueRankingItem | null)[]; workload: Record<TrueRankingPhase, number> }
>();

/** そろった結果を捨てる(テストの後始末用。アプリからは呼ばない) */
export function clearTrueRankingCache(): void {
  doneCache.clear();
}

export function useTrueRanking() {
  const status = ref<TrueRankingStatus>("idle");
  const error = ref<string | null>(null);
  const items = shallowRef<(TrueRankingItem | null)[]>([]);
  const progress = ref<{ phase: TrueRankingPhase; done: number } | null>(null);
  const workload = ref<Record<TrueRankingPhase, number>>({ proxy: 0, search: 0, optimize: 0 });
  const startedAt = ref<number | null>(null);
  const finishedAt = ref<number | null>(null);
  const pausedMs = ref(0);
  /** 裏に回っている間の、止まっていたかもしれない区間の始まり(表にいる間・計算していない間は null) */
  let hiddenSince: number | null = null;
  let workers: Worker[] = [];
  let cached: { key: string; proxy: ProxyBoards } | null = null;

  const terminate = (): void => {
    for (const worker of workers) worker.terminate();
    workers = [];
  };

  /** 計算を捨てて始める前へ戻す(見込みのボードの使い回しは残す) */
  const cancel = (): void => {
    terminate();
    status.value = "idle";
    error.value = null;
    items.value = [];
    progress.value = null;
    startedAt.value = null;
    finishedAt.value = null;
    pausedMs.value = 0;
    hiddenSince = null;
  };

  const onVisibility = (): void => {
    if (status.value !== "running") return;
    if (document.hidden) {
      hiddenSince = Date.now();
    } else if (hiddenSince !== null) {
      pausedMs.value += Date.now() - hiddenSince;
      hiddenSince = null;
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  /** 始める前の見積もり用の仕事の数(見込みのボードを使い回せるなら最初の段は 0) */
  const plannedWorkload = (
    input: TrueRankingInput,
    proxyKey: string,
  ): Record<TrueRankingPhase, number> => {
    const w = rankingWorkload(input);
    return cached?.key === proxyKey ? { ...w, proxy: 0 } : w;
  };

  const fail = (message: string): void => {
    error.value = message;
    status.value = "error";
    finishedAt.value = Date.now();
    terminate();
  };

  const run = (input: TrueRankingInput, proxyKey: string): void => {
    const doneKey = fingerprint(input);
    const done = doneCache.get(doneKey);
    if (done) {
      cancel();
      doneCache.delete(doneKey);
      doneCache.set(doneKey, done);
      workload.value = done.workload;
      items.value = done.items;
      progress.value = { phase: "optimize", done: done.workload.optimize };
      status.value = "done";
      startedAt.value = finishedAt.value = Date.now();
      return;
    }
    const reuse = cached?.key === proxyKey ? cached.proxy : null;
    const planned = plannedWorkload(input, proxyKey);
    cancel();
    status.value = "running";
    workload.value = planned;
    startedAt.value = Date.now();
    hiddenSince = document.hidden ? Date.now() : null;

    const pool = Array.from(
      { length: workerCount() },
      () => new Worker(new URL("../engine/rankingWorker.ts", import.meta.url), { type: "module" }),
    );
    workers = pool;
    /** いまの段で、Worker から結果が届いたときの処理 */
    let onResult: ((worker: Worker, data: RankingWorkerResponse) => void) | null = null;
    for (const worker of pool) {
      worker.addEventListener("message", (event: MessageEvent<RankingWorkerResponse>) => {
        if (workers !== pool) return;
        if (hiddenSince !== null) hiddenSince = Date.now();
        const data = event.data;
        if (data.kind === "error") fail(data.message);
        else onResult?.(worker, data);
      });
      worker.addEventListener("error", (event) => {
        if (workers === pool) fail(event.message || CALC_FAILED);
      });
      const start: RankingWorkerRequest = { kind: "start", input };
      worker.postMessage(start);
    }

    /** 1 つの段: 仕事 `total` 件を空いた Worker へ 1 件ずつ渡し、全部そろったら `next` */
    const runPhase = (
      phase: TrueRankingPhase,
      total: number,
      request: (index: number) => RankingWorkerRequest,
      receive: (data: RankingWorkerResponse) => void,
      next: () => void,
    ): void => {
      progress.value = { phase, done: 0 };
      if (workload.value[phase] !== total) workload.value = { ...workload.value, [phase]: total };
      if (total === 0) {
        onResult = null;
        next();
        return;
      }
      let given = 0;
      let received = 0;
      const give = (worker: Worker): void => {
        if (given >= total) return;
        worker.postMessage(request(given));
        given += 1;
      };
      onResult = (worker, data) => {
        receive(data);
        received += 1;
        progress.value = { phase, done: received };
        if (received === total) {
          onResult = null;
          next();
        } else give(worker);
      };
      for (const worker of pool) give(worker);
    };

    const finish = (): void => {
      doneCache.set(doneKey, { items: items.value, workload: { ...workload.value } });
      while (doneCache.size > DONE_CACHE_LIMIT) {
        const oldest = doneCache.keys().next().value;
        if (oldest === undefined) break;
        doneCache.delete(oldest);
      }
      status.value = "done";
      finishedAt.value = Date.now();
      terminate();
    };
    const optimizePhase = (proxy: ProxyBoards): void => {
      const jobs = searchJobs(input, proxy);
      const found: SearchFound[][] = jobs.map(() => []);
      runPhase(
        "search",
        jobs.length,
        (index) => ({ kind: "search", index }),
        (data) => {
          if (data.kind === "search") found[data.index] = data.found;
        },
        () => {
          const teams = pickRankingTeams(input, found);
          runPhase(
            "optimize",
            teams.length,
            (index) => ({
              kind: "optimize",
              index,
              team: teams[index] ?? { leaderId: "", memberIds: [] },
            }),
            (data) => {
              if (data.kind !== "item") return;
              // 届いていない添字は null で埋める(穴のある配列にしない)
              const nextItems = Array.from(
                { length: Math.max(items.value.length, data.index + 1) },
                (_, i) => items.value[i] ?? null,
              );
              nextItems[data.index] = data.item;
              items.value = nextItems;
            },
            finish,
          );
        },
      );
    };
    const searchPhase = (proxy: ProxyBoards): void => {
      cached = { key: proxyKey, proxy };
      for (const worker of pool) {
        const use: RankingWorkerRequest = { kind: "useProxy", proxy };
        worker.postMessage(use);
      }
      optimizePhase(proxy);
    };

    if (reuse) {
      searchPhase(reuse);
      return;
    }
    const jobs = proxyJobs(input);
    const proxies: Proxy[] = [];
    runPhase(
      "proxy",
      jobs.length,
      (index) => ({ kind: "proxy", index }),
      (data) => {
        if (data.kind === "proxy") proxies[data.index] = data.proxy;
      },
      () => {
        searchPhase(assembleProxyBoards(jobs, proxies));
      },
    );
  };

  onUnmounted(() => {
    terminate();
    document.removeEventListener("visibilitychange", onVisibility);
  });

  return {
    status: readonly(status),
    error: readonly(error),
    items,
    progress: readonly(progress),
    workload: readonly(workload),
    startedAt: readonly(startedAt),
    finishedAt: readonly(finishedAt),
    pausedMs: readonly(pausedMs),
    plannedWorkload,
    run,
    cancel,
  };
}
