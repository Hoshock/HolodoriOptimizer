/// <reference lib="webworker" />
import { planBoardConnect } from "./boardConnectPlan";
import type { BoardConnectPlanInput, BoardConnectPlanResult } from "./boardConnectPlan";

/**
 * 「ボードの最適化」(ホロメンボード + コネクト)を UI スレッド外で実行する Web Worker。計算そのものは `boardConnectPlan.ts` の
 * `planBoardConnect` が持ち、この層はメッセージの受け渡しと例外の報告に専念する。
 * 評価を数千〜数万回行い、ボード → コネクトを最大 3 周回すので、スマートフォンでは数十秒かかることがあり、UI スレッドを止めないようにする
 */
export type BoardWorkerResponse =
  | { kind: "result"; result: BoardConnectPlanResult }
  | { kind: "error"; message: string };

self.addEventListener("message", (event: MessageEvent<BoardConnectPlanInput>) => {
  const post = (response: BoardWorkerResponse): void => {
    self.postMessage(response);
  };
  try {
    post({ kind: "result", result: planBoardConnect(event.data) });
  } catch (error) {
    post({ kind: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
