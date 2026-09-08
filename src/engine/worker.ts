/// <reference lib="webworker" />
import { cards, holomen, songById } from "../data";
import type { BloomMap } from "../data/bloom";
import { accountGreenEffects } from "../data/greenBoard";
import { DEFAULT_SONG_DURATION_SECONDS } from "../data/live";
import { redUnitEffectsByHolomen } from "../data/redBoard";
import { resolveCard } from "../data/resolve";
import { accountYellowEffects, yellowSongBonusPermil } from "../data/yellowBoard";
import type { Card } from "../data/types";
import type { BoardMap } from "../storage/boards";
import type { LiveBreakdown } from "./optimize";
import type { AccountBonus, StaticPowerBreakdown } from "./power";
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
  /** リーダー候補・メンバー候補の両方から除外(所持カードから探すときの所持外カードもここ) */
  excludedCardIds: string[];
  /** リーダー候補(おまかせ)からだけ除外 / メンバー候補からだけ除外(さがすのオプション「リーダーから除外」「メンバーから除外」) */
  excludedLeaderCardIds: string[];
  excludedMemberCardIds: string[];
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
  /** アカウント共通の補正(メモリーの「ユニットパラメータ +X%」とメンバー強化ボーナス +X%)。総合力に別枠で加算する */
  account: AccountBonus;
  topN: number;
}

export type OptimizeWorkerResponse =
  | { kind: "progress"; done: number; total: number }
  | {
      kind: "result";
      candidates: {
        leaderId: string;
        memberIds: string[];
        breakdown: StaticPowerBreakdown;
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
    const {
      leaderId,
      fixedMemberIds,
      excludedCardIds,
      excludedLeaderCardIds,
      excludedMemberCardIds,
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
      account,
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
        excludedLeaderCardIds,
        excludedMemberCardIds,
        leaderCandidateIds: leaderCandidateIds ?? undefined,
        requiredMemberHolomenIds,
        requireCostumeSkill,
        requireAllPassives,
        live: { durationSeconds, songBonus },
        redByHolomen,
        account,
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
