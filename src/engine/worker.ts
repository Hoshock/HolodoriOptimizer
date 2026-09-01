/// <reference lib="webworker" />
import { cards, holomen, songById } from "../data";
import { bloomOf, cardAtBloom } from "../data/bloom";
import type { BloomMap } from "../data/bloom";
import { DEFAULT_SONG_DURATION_SECONDS } from "../data/live";
import type { Card } from "../data/types";
import type { LiveBreakdown } from "./optimize";
import type { ScoreBreakdown } from "./score";
import { buildHolomenMap } from "./score";
import { optimize } from "./optimize";

/**
 * 最適化を UI スレッド外で実行する Web Worker。
 * データセットは Worker 側のバンドルに含まれるため、メッセージはカード ID のみ交換する。
 */

export interface OptimizeWorkerRequest {
  /** null = リーダーも探索する(除外カードを除く全カードが候補) */
  leaderId: string | null;
  fixedMemberIds: string[];
  excludedCardIds: string[];
  /** 曲別最適化の対象。null なら代表曲条件(全曲の中央値)で期待値を計算する */
  songId: string | null;
  /** カード ID → 開花段階。未登録のカードは 0凸として扱う */
  blooms: BloomMap;
  topN: number;
}

export type OptimizeWorkerResponse =
  | { kind: "progress"; done: number; total: number }
  | {
      kind: "result";
      candidates: {
        leaderId: string;
        memberIds: string[];
        breakdown: ScoreBreakdown;
        live: LiveBreakdown;
      }[];
      evaluated: number;
    }
  | { kind: "error"; message: string };

const holomenMap = buildHolomenMap(holomen);

self.addEventListener("message", (event: MessageEvent<OptimizeWorkerRequest>) => {
  const post = (response: OptimizeWorkerResponse): void => {
    self.postMessage(response);
  };
  try {
    const { leaderId, fixedMemberIds, excludedCardIds, songId, blooms, topN } = event.data;
    // 曲未指定(または曲長不明)は代表曲条件(全曲の中央値)で期待値を計算する
    const song = songId === null ? null : (songById.get(songId) ?? null);
    const durationSeconds = song?.durationSeconds ?? DEFAULT_SONG_DURATION_SECONDS;
    // 開花段階を解決したカードで探索する(探索コアは開花を知らない)
    const resolvedCards = cards.map((c) => cardAtBloom(c, bloomOf(blooms, c.id)));
    const resolvedById = new Map(resolvedCards.map((c) => [c.id, c]));
    let leader: Card | null = null;
    if (leaderId !== null) {
      leader = resolvedById.get(leaderId) ?? null;
      if (!leader) throw new Error(`リーダーのカードが見つからない: ${leaderId}`);
    }
    const fixedMembers = fixedMemberIds.map((id) => {
      const card = resolvedById.get(id);
      if (!card) throw new Error(`固定メンバーのカードが見つからない: ${id}`);
      return card;
    });
    const result = optimize(
      {
        leader,
        fixedMembers,
        excludedCardIds,
        live: { durationSeconds },
        topN,
        onProgress: (done, total) => {
          post({ kind: "progress", done, total });
        },
        progressInterval: 500_000,
      },
      resolvedCards,
      holomenMap,
    );
    post({
      kind: "result",
      candidates: result.candidates.map((c) => ({
        leaderId: c.leader.id,
        memberIds: c.members.map((m) => m.id),
        breakdown: c.breakdown,
        live: c.live,
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
