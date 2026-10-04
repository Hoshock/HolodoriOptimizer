/// <reference lib="webworker" />
import { planBoards } from "./boardPlan";
import type { BoardPlanInput, BoardPlanResult } from "./boardPlan";

/**
 * ホロメンボードの最適化を UI スレッド外で実行する Web Worker。計算そのものは `boardPlan.ts` の `planBoards` が持ち、
 * この層はメッセージの受け渡しと例外の報告に専念する(`connectWorker.ts` と同じ作り)。
 * 評価を数千〜数万回行うので、スマートフォンでは数秒〜数十秒かかることがあり、UI スレッドを止めないようにする
 */
export type BoardWorkerResponse =
  | { kind: "result"; result: BoardPlanResult }
  | { kind: "error"; message: string };

self.addEventListener("message", (event: MessageEvent<BoardPlanInput>) => {
  const post = (response: BoardWorkerResponse): void => {
    self.postMessage(response);
  };
  try {
    post({ kind: "result", result: planBoards(event.data) });
  } catch (error) {
    post({ kind: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
