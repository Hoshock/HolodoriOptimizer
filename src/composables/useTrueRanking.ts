import { onUnmounted, readonly, ref, shallowRef } from "vue";

import type { RankingWorkerResponse } from "../engine/rankingWorker";
import { rankingWorkload } from "../engine/trueRanking";
import type {
  ProxyBoards,
  TrueRankingInput,
  TrueRankingItem,
  TrueRankingPhase,
} from "../engine/trueRanking";

/**
 * 結果一覧の「最適化順」を裏で計算する composable(`rankingWorker.ts`)。`run` で前の計算を捨てて始め直す(呼ぶのは探索の結果が届いたとき —
 * `OptimizerPanel`。登録が変わっても始め直さない)。
 *
 * - `status`: 始める前 `idle` → 計算中 `running` → 全件そろって `done`(失敗は `error`)
 * - `items`: 最適化した編成(見込みの順。届いたものから埋まる)
 * - `progress`: いまの段と済んだ数。`workload` は段ごとの仕事の数(見込みのボードを使い回すときは最初の段が 0)
 * - 見込みのボード(最初の段)は `proxyKey` が同じなら使い回す(登録・条件が変わっていなければ同じ結果になる)
 */
export type TrueRankingStatus = "idle" | "running" | "done" | "error";

export function useTrueRanking() {
  const status = ref<TrueRankingStatus>("idle");
  const error = ref<string | null>(null);
  const items = shallowRef<(TrueRankingItem | null)[]>([]);
  const progress = ref<{ phase: TrueRankingPhase; done: number } | null>(null);
  const workload = ref<Record<TrueRankingPhase, number>>({ proxy: 0, search: 0, optimize: 0 });
  const startedAt = ref<number | null>(null);
  const finishedAt = ref<number | null>(null);
  let worker: Worker | null = null;
  let cached: { key: string; proxy: ProxyBoards } | null = null;

  const terminate = (): void => {
    worker?.terminate();
    worker = null;
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
  };

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
    const reuse = cached?.key === proxyKey ? cached.proxy : null;
    const planned = plannedWorkload(input, proxyKey);
    cancel();
    status.value = "running";
    workload.value = planned;
    startedAt.value = Date.now();
    worker = new Worker(new URL("../engine/rankingWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event: MessageEvent<RankingWorkerResponse>) => {
      const data = event.data;
      if (data.kind === "progress") {
        progress.value = { phase: data.phase, done: data.done };
        if (workload.value[data.phase] !== data.total)
          workload.value = { ...workload.value, [data.phase]: data.total };
      } else if (data.kind === "proxy") {
        cached = { key: proxyKey, proxy: data.proxy };
      } else if (data.kind === "item") {
        // 届いていない添字は null で埋める(穴のある配列にしない)
        const next = Array.from(
          { length: Math.max(items.value.length, data.index + 1) },
          (_, i) => items.value[i] ?? null,
        );
        next[data.index] = data.item;
        items.value = next;
      } else if (data.kind === "done") {
        status.value = "done";
        finishedAt.value = Date.now();
        terminate();
      } else {
        fail(data.message);
      }
    });
    worker.addEventListener("error", (event) => {
      fail(event.message || "計算中にエラーが発生しました");
    });
    worker.postMessage({ input, proxy: reuse });
  };

  onUnmounted(terminate);

  return {
    status: readonly(status),
    error: readonly(error),
    items,
    progress: readonly(progress),
    workload: readonly(workload),
    startedAt: readonly(startedAt),
    finishedAt: readonly(finishedAt),
    plannedWorkload,
    run,
    cancel,
  };
}
