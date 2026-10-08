/// <reference lib="webworker" />
import { planOptimize } from "./optimizePlan";
import type { OptimizePlanInput, OptimizePlanResult } from "./optimizePlan";

/**
 * 結果一覧の「最適化順」(2026-10-08 ユーザー指示「非同期で裏側で真のランキングを計算させておきたい」)を UI スレッド外で計算する Web Worker。
 * 探索の上位の編成それぞれに「最適化」(`planOptimize`)をかけ、1 件終わるごとに結果を返す。計算そのものは `optimizePlan.ts` が持つ。
 * 1 件で数秒かかるので、全件で数十秒〜数分になる(探索の結果を出したあとに裏で回す)
 */
export interface RankingWorkerRequest {
  inputs: OptimizePlanInput[];
}

export type RankingWorkerResponse =
  | { kind: "item"; index: number; result: OptimizePlanResult }
  | { kind: "done" }
  | { kind: "error"; message: string };

self.addEventListener("message", (event: MessageEvent<RankingWorkerRequest>) => {
  const post = (response: RankingWorkerResponse): void => {
    self.postMessage(response);
  };
  try {
    event.data.inputs.forEach((input, index) => {
      post({ kind: "item", index, result: planOptimize(input) });
    });
    post({ kind: "done" });
  } catch (error) {
    post({ kind: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
