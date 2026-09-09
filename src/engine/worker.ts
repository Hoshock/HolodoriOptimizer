/// <reference lib="webworker" />
import type { DisplayScoreBreakdown } from "./displayScore";
import type { ScoreModifierBreakdown } from "./optimize";
import type { StaticPowerBreakdown } from "./power";
import { runOptimize } from "./request";
import type { OptimizeRunRequest } from "./request";

/**
 * 最適化を UI スレッド外で実行する Web Worker。
 * 依頼の解決と探索そのものは src/engine/request.ts の runOptimize が持つ(UI スレッドからも呼ぶため)。
 * この層はメッセージの受け渡し(カード ID だけを交換する)と例外の報告に専念する。
 */

export type { OptimizeRunRequest };

export type OptimizeWorkerResponse =
  | { kind: "progress"; done: number; total: number }
  | {
      kind: "result";
      candidates: {
        leaderId: string;
        memberIds: string[];
        breakdown: StaticPowerBreakdown;
        display: DisplayScoreBreakdown;
        modifiers: ScoreModifierBreakdown;
      }[];
      evaluated: number;
    }
  | { kind: "error"; message: string };

self.addEventListener("message", (event: MessageEvent<OptimizeRunRequest>) => {
  const post = (response: OptimizeWorkerResponse): void => {
    self.postMessage(response);
  };
  try {
    const result = runOptimize(event.data, (done, total) => {
      post({ kind: "progress", done, total });
    });
    post({
      kind: "result",
      candidates: result.candidates.map((c) => ({
        leaderId: c.leader.id,
        memberIds: c.members.map((m) => m.id),
        breakdown: c.breakdown,
        display: c.display,
        modifiers: c.modifiers,
      })),
      evaluated: result.evaluated,
    });
  } catch (error) {
    post({
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
