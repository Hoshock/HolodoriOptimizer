/// <reference lib="webworker" />
import { planOptimize } from "./optimizePlan";
import type { PlanStep } from "./boardConnectPlan";
import type { OptimizePlanInput, OptimizePlanResult } from "./optimizePlan";

/**
 * 「最適化」(ボード → コネクト → 頻度)を UI スレッド外で実行する Web Worker。計算そのものは `optimizePlan.ts` の
 * `planOptimize` が持ち、この層はメッセージの受け渡しと例外の報告に専念する。
 * 評価を数千〜数万回行い、ボード → コネクトを最大 3 周回すので、スマートフォンでは数十秒かかることがあり、UI スレッドを止めないようにする
 */
export type OptimizeWorkerResponse =
  | { kind: "progress"; done: PlanStep[]; remaining: PlanStep[] }
  | { kind: "result"; result: OptimizePlanResult }
  | { kind: "error"; message: string };

self.addEventListener("message", (event: MessageEvent<OptimizePlanInput>) => {
  const post = (response: OptimizeWorkerResponse): void => {
    self.postMessage(response);
  };
  try {
    const result = planOptimize({
      ...event.data,
      // 段が済むたびに知らせる(シートの「最適化を実行」の残り時間 — `src/ui/planProgress.ts`)
      onProgress: (done, remaining) => {
        post({ kind: "progress", done: [...done], remaining: [...remaining] });
      },
    });
    post({ kind: "result", result });
  } catch (error) {
    post({ kind: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
