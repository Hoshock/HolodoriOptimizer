/// <reference lib="webworker" />
import { cards, eventById, holomen, songById } from "../data";
import type { BloomMap } from "../data/bloom";
import { accountGreenEffects } from "../data/greenBoard";
import { DEFAULT_SONG_DURATION_SECONDS } from "../data/live";
import { redUnitEffectsByHolomen } from "../data/redBoard";
import { resolveCard } from "../data/resolve";
import { accountYellowEffects, yellowSongBonusPermil } from "../data/yellowBoard";
import type { Card } from "../data/types";
import type { BoardMap } from "../storage/boards";
import { eventAcquisitionBonusByCard } from "./event";
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
  /** リーダー未指定時の候補をこの ID に限定する(null = 限定なし)。おかゆモードで使う */
  leaderCandidateIds: string[] | null;
  /** メンバーに必ず含めるホロメン ID(おかゆモードで使う。通常は空) */
  requiredMemberHolomenIds: string[];
  /** 衣装スキルが発動しない編成を除く(Step 5 のしぼりこみ) */
  requireCostumeSkill: boolean;
  /** パッシブが 1 人でも発動しない編成を除く(Step 5 のしぼりこみ) */
  requireAllPassives: boolean;
  /** 曲別最適化の対象。null なら代表曲条件(全曲の中央値)で期待値を計算する */
  songId: string | null;
  /** カード ID → 開花段階。未登録のカードは 0凸として扱う */
  blooms: BloomMap;
  /** ホロメン ID → 解放した青ホロメンボードのマス ID。未登録はボードなし */
  boards: BoardMap;
  /** ホロメン ID → 解放した緑ホロメンボードのマス ID。全ホロメン分の合計が全カードに効く */
  greenBoards: BoardMap;
  /** ホロメン ID → 解放した黄ホロメンボードのマス ID。曲を指定したときにその曲の楽曲スコアボーナスになる */
  yellowBoards: BoardMap;
  /** ホロメン ID → 解放した赤ホロメンボードのマス ID。そのホロメンをリーダーにした編成のメンバー 5 人に効く */
  redBoards: BoardMap;
  /**
   * 順位づけの目的。"eventBonus" はイベント Pt・バッジの獲得ボーナス(%)が最大の編成(同率は総合期待スコア順)。
   * eventId(とチャプター制なら eventChapterId)が必要。"score" でも eventId があれば候補に獲得ボーナス % を付ける
   */
  objective: "score" | "eventBonus";
  /** 開催中のイベント ID(UI が現在日時で判定)。null = イベントなし */
  eventId: string | null;
  /** チャプター制イベントの進行中チャプター ID。チャプター制でなければ null */
  eventChapterId: string | null;
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
        /** メンバー 5 人のイベント獲得ボーナスの和(%)。イベントなしは 0 */
        eventBonusPercent: number;
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
    const {
      leaderId,
      fixedMemberIds,
      excludedCardIds,
      leaderCandidateIds,
      requiredMemberHolomenIds,
      requireCostumeSkill,
      requireAllPassives,
      songId,
      blooms,
      boards,
      greenBoards,
      yellowBoards,
      redBoards,
      objective,
      eventId,
      eventChapterId,
      topN,
    } = event.data;
    // 曲未指定(または曲長不明)は代表曲条件(全曲の中央値)で期待値を計算する
    const song = songId === null ? null : (songById.get(songId) ?? null);
    const durationSeconds = song?.durationSeconds ?? DEFAULT_SONG_DURATION_SECONDS;
    // 黄ボードの楽曲スコアボーナスは曲を指定したときだけ(曲未指定は曲ごとに違うので掛けない)
    const songBonus = song
      ? yellowSongBonusPermil(accountYellowEffects(yellowBoards), song) / 1000
      : 0;
    // 赤ボードはリーダーのホロメンで決まり、歌唱者条件は曲を指定したときだけ判定する
    const redByHolomen = redUnitEffectsByHolomen(redBoards, song);
    // 開花段階と青・緑ボードを解決したカードで探索する(探索コアは開花・青・緑を知らない。赤はリーダー依存なので探索へ渡す)
    const green = accountGreenEffects(greenBoards);
    const resolvedCards = cards.map((c) => resolveCard(c, blooms, boards, green));
    // イベントの獲得ボーナス(カード 1 枚ごと。開花は探索と同じ blooms)。イベント Pt の換算はしない(src/engine/event.ts)
    const liveEvent = eventId === null ? null : (eventById.get(eventId) ?? null);
    if (eventId !== null && !liveEvent) throw new Error(`イベントが見つからない: ${eventId}`);
    const eventBonusByCardId = liveEvent
      ? eventAcquisitionBonusByCard(liveEvent, cards, blooms, eventChapterId ?? undefined)
      : {};
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
        leaderCandidateIds: leaderCandidateIds ?? undefined,
        requiredMemberHolomenIds,
        requireCostumeSkill,
        requireAllPassives,
        live: { durationSeconds, songBonus },
        redByHolomen,
        objective,
        eventBonusByCardId,
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
        eventBonusPercent: c.eventBonusPercent,
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
