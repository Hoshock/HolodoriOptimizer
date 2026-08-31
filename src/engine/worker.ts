/// <reference lib="webworker" />
import { cardById, cards, holomen } from "../data";
import type { ScoreBreakdown } from "./score";
import { buildHolomenMap } from "./score";
import { optimize } from "./optimize";

/**
 * 最適化を UI スレッド外で実行する Web Worker。
 * データセットは Worker 側のバンドルに含まれるため、メッセージはカード ID のみ交換する。
 */

export interface OptimizeWorkerRequest {
  leaderId: string;
  fixedMemberIds: string[];
  excludedCardIds: string[];
  topN: number;
}

export type OptimizeWorkerResponse =
  | { kind: "progress"; done: number; total: number }
  | {
      kind: "result";
      candidates: { memberIds: string[]; breakdown: ScoreBreakdown }[];
      evaluated: number;
    }
  | { kind: "error"; message: string };

const holomenMap = buildHolomenMap(holomen);

self.addEventListener("message", (event: MessageEvent<OptimizeWorkerRequest>) => {
  const post = (response: OptimizeWorkerResponse): void => {
    self.postMessage(response);
  };
  try {
    const { leaderId, fixedMemberIds, excludedCardIds, topN } = event.data;
    const leader = cardById.get(leaderId);
    if (!leader) throw new Error(`リーダーのカードが見つからない: ${leaderId}`);
    const fixedMembers = fixedMemberIds.map((id) => {
      const card = cardById.get(id);
      if (!card) throw new Error(`固定メンバーのカードが見つからない: ${id}`);
      return card;
    });
    const result = optimize(
      {
        leader,
        fixedMembers,
        excludedCardIds,
        topN,
        onProgress: (done, total) => {
          post({ kind: "progress", done, total });
        },
        progressInterval: 500_000,
      },
      cards,
      holomenMap,
    );
    post({
      kind: "result",
      candidates: result.candidates.map((c) => ({
        memberIds: c.members.map((m) => m.id),
        breakdown: c.breakdown,
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
