import { onUnmounted, readonly, ref } from "vue";

import {
  CERTIFY_SHORTLIST_MAX,
  kthRanked,
  mergeRanked,
  needsCertifyPass,
  selectShortlist,
} from "../engine/optimize";
import type { ScoreModifierBreakdown } from "../engine/optimize";
import type { OptimizeRunRequest } from "../engine/request";
import type { SearchWorkerRequest, SearchWorkerResponse } from "../engine/searchWorkerHandler";
import type { DisplayScoreBreakdown } from "../engine/displayScore";
import type { StaticPowerBreakdown } from "../engine/power";
import { workerCount } from "./workerCount";

export interface CandidateView {
  /** この候補のリーダー(リーダー探索時は候補ごとに異なりうる) */
  leaderId: string;
  memberIds: string[];
  /** 総合力(ゲーム画面の「総合力」の再現)とその内訳 */
  breakdown: StaticPowerBreakdown;
  /** メニュー画面のスコアボーナス 5 項目とユニットスコアの試算 */
  display: DisplayScoreBreakdown;
  /** 曲で決まる補正の内訳(黄は display に組み込み済みの表示用情報、イベントは後掛けの倍率)と順位づけの値 */
  modifiers: ScoreModifierBreakdown;
}

/**
 * Web Worker で最適化を実行する composable。実行中の再実行は前の Worker を破棄して置き換える。
 * 再実行のあいだも前回の候補は消さない(結果が届いたときに置き換える) — 消すと結果セクションが一瞬アンマウントされ、
 * その下のフッタが繰り上がってチラつく(2026-09-11 ユーザー指摘「結果のところがチラつく。後ろに脚注が一瞬見えてしまう」)。
 * 失敗したときだけ候補を消す(失敗の文言の下に前回の結果を残さない)
 *
 * **Worker を何本か立てて探索を分担する**(2026-10-08「計算の高速化」。本数は `workerCount`)。組合せの 1 枚目の添字で分け、
 * `optimize.ts` の `searchInProcess` と同じ手順(数える → 全体の上位を選ぶ → 分担ごとに正確に評価してまとめる → 要れば 2 パス目)を
 * Worker との受け答え(`searchWorkerHandler.ts`)で踏む。何本で探しても 1 本と同じ候補が同じ並びで返る
 */
export function useOptimizer() {
  const running = ref(false);
  /**
   * 進み具合: 数え終えた組合せの数 / 全体と、その時点の経過時間(始めてからのミリ秒。残り時間の見積もりに使う —
   * `src/ui/searchProgress.ts`)。準備が済んだら 0 件で入り、数えるあいだ届くたびに更新する
   */
  const progress = ref<{ done: number; total: number; elapsedMs: number } | null>(null);
  /** 始めた時刻(`performance.now()`。実行していないあいだは null) */
  const startedAt = ref<number | null>(null);
  const candidates = ref<CandidateView[] | null>(null);
  const evaluated = ref(0);
  const error = ref<string | null>(null);
  let workers: Worker[] = [];

  const terminate = (): void => {
    for (const worker of workers) worker.terminate();
    workers = [];
  };

  const run = (request: OptimizeRunRequest): void => {
    terminate();
    running.value = true;
    progress.value = null;
    error.value = null;
    const start = performance.now();
    startedAt.value = start;
    const count = workerCount();
    const pool = Array.from(
      { length: count },
      () => new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" }),
    );
    workers = pool;
    const live = (): boolean => workers === pool;
    const fail = (message: string): void => {
      if (!live()) return;
      error.value = message;
      candidates.value = null;
      running.value = false;
      terminate();
    };
    /** Worker ごとの、答えを待っている依頼 */
    const waiting = new Map<Worker, (data: SearchWorkerResponse) => void>();
    /** Worker ごとの、数え終えた組合せの数(進み具合は合計) */
    const done = pool.map(() => 0);
    pool.forEach((worker, i) => {
      worker.addEventListener("message", (event: MessageEvent<SearchWorkerResponse>) => {
        if (!live()) return;
        const data = event.data;
        if (data.kind === "progress") {
          done[i] = data.done;
          progress.value = {
            done: done.reduce((sum, d) => sum + d, 0),
            total: data.total,
            elapsedMs: performance.now() - start,
          };
        } else if (data.kind === "error") fail(data.message);
        else waiting.get(worker)?.(data);
      });
      worker.addEventListener("error", (event) => {
        fail(event.message || "計算中にエラーが発生しました");
      });
    });
    const ask = (worker: Worker, message: SearchWorkerRequest): Promise<SearchWorkerResponse> =>
      new Promise((resolve) => {
        waiting.set(worker, resolve);
        worker.postMessage(message);
      });
    const askAll = <K extends SearchWorkerResponse["kind"]>(
      kind: K,
      message: (index: number) => SearchWorkerRequest,
    ): Promise<Extract<SearchWorkerResponse, { kind: K }>[]> =>
      Promise.all(
        pool.map((worker, index) =>
          ask(worker, message(index)).then((data) => {
            if (data.kind !== kind) throw new Error(`探索の Worker から想定外の答え: ${data.kind}`);
            return data as Extract<SearchWorkerResponse, { kind: K }>;
          }),
        ),
      );

    void (async () => {
      const prepared = await askAll("prepared", (index) => ({
        kind: "prepare",
        request,
        partition: { index, count },
      }));
      const head = prepared[0];
      if (!head || !live()) return;
      progress.value ??= { done: 0, total: head.total, elapsedMs: performance.now() - start };
      /** 1 パス数えて、全体の上位を選び、分担ごとに正確に評価してまとめる(`searchInProcess` の `round`) */
      const round = async (floor: number, size: number, withProgress: boolean) => {
        const counted = await askAll("counted", () => ({
          kind: "enumerate",
          floor,
          size,
          progress: withProgress,
        }));
        const selection = selectShortlist(counted, size);
        const ranked = await askAll("ranked", (index) => ({
          kind: "score",
          take: selection.take[index] ?? 0,
        }));
        return {
          selection,
          ranked: mergeRanked(
            ranked.map((r) => r.ranked),
            head.topN,
          ),
          evaluated: counted.reduce((sum, c) => sum + c.evaluated, 0),
        };
      };
      const first = await round(-Infinity, head.baseShortlistSize, true);
      let ranked = first.ranked;
      const kth = kthRanked(ranked, head.topN);
      if (needsCertifyPass(first.selection.dropped, kth, head.total))
        ranked = (await round(kth, CERTIFY_SHORTLIST_MAX, false)).ranked;
      if (!live()) return;
      candidates.value = ranked.map((c) => ({
        leaderId: c.leaderId,
        memberIds: c.memberIds,
        breakdown: c.breakdown,
        display: c.display,
        modifiers: c.modifiers,
      }));
      evaluated.value = first.evaluated;
      running.value = false;
      terminate();
    })().catch((e: unknown) => {
      fail(e instanceof Error ? e.message : String(e));
    });
  };

  const cancel = (): void => {
    terminate();
    running.value = false;
    progress.value = null;
  };

  onUnmounted(terminate);

  return {
    running: readonly(running),
    progress: readonly(progress),
    startedAt: readonly(startedAt),
    candidates,
    evaluated: readonly(evaluated),
    error: readonly(error),
    run,
    cancel,
  };
}
