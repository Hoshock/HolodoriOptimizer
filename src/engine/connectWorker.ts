/// <reference lib="webworker" />
import { planConnects } from "./connectPlan";
import type { ConnectPlanInput, ConnectPlanResult } from "./connectPlan";

/**
 * コネクトの最適化を UI スレッド外で実行する Web Worker。計算そのものは `connectPlan.ts` の `planConnects` が持ち、
 * この層はメッセージの受け渡しと例外の報告に専念する(`worker.ts` と同じ作り)。
 * 評価を数百〜千回行うので、スマートフォンでは数秒かかることがあり、UI スレッドを止めないようにする
 */
export type ConnectWorkerResponse =
  | { kind: "result"; result: ConnectPlanResult }
  | { kind: "error"; message: string };

self.addEventListener("message", (event: MessageEvent<ConnectPlanInput>) => {
  const post = (response: ConnectWorkerResponse): void => {
    self.postMessage(response);
  };
  try {
    post({ kind: "result", result: planConnects(event.data) });
  } catch (error) {
    post({ kind: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
