import type { Card } from "../data/types";
import { ACTIVE_PROBABILITY, SCORE_SUPPORT_WEIGHT, SP_ACTIVATIONS_PER_SONG } from "../data/live";

/**
 * ライブ中スキル(アクティブ・SP)の期待値モデル(試算・実測未確認)。
 *
 * - スコアはライブ中ほぼ一様に積み上がる近似を置き、効果は「効果量 × カバー時間 / 曲長」で
 *   スコア比の寄与に換算する。総合期待スコア = ユニットスコア × (1 + 寄与合計)。
 * - アクティブ: 発動機会 floor(曲長 / 周期) × 発動率(確率段階の仮数値、src/data/live.ts)。
 *   ライフ等の追加条件は満たされている前提。期待カバー時間は曲長で頭打ちにする。
 * - SP: 1 曲 SP_ACTIVATIONS_PER_SONG 回発動と仮定し、スコアサポート効果(%)を
 *   SCORE_SUPPORT_WEIGHT でスコア UP と等価に扱う。
 * - リーダー枠はパッシブ同様にアクティブ・SP も発動しない前提(寄与はメンバー 5 枠のみ)。
 *   カード単体で完結し編成に依存しないため、探索前にカード単位で前計算できる。
 */

/** ライブ条件(曲)。曲未指定時は代表値(DEFAULT_SONG_DURATION_SECONDS)を使う */
export interface LiveParams {
  durationSeconds: number;
}

export interface LiveBonus {
  /** アクティブスキルの期待寄与(ユニットスコア比。0.12 = +12%) */
  active: number;
  /** SP スキルの期待寄与(ユニットスコア比) */
  sp: number;
}

/** カード 1 枚がメンバー枠で生むライブ中の期待スコア寄与 */
export function liveBonusOf(card: Card, params: LiveParams): LiveBonus {
  const songSeconds = params.durationSeconds;
  let active = 0;
  const a = card.activeSkill.structured;
  if (a && a.scoreUpPercent !== null && songSeconds > 0) {
    const chances = Math.floor(songSeconds / a.intervalSeconds);
    const expectedCovered = Math.min(
      chances * ACTIVE_PROBABILITY[a.probability] * (a.durationSeconds ?? 0),
      songSeconds,
    );
    active = (a.scoreUpPercent / 100) * (expectedCovered / songSeconds);
  }
  let sp = 0;
  const s = card.specialSkill.structured;
  if (s && s.scoreSupportPercent !== null && s.durationSeconds !== null && songSeconds > 0) {
    const covered = Math.min(SP_ACTIVATIONS_PER_SONG * s.durationSeconds, songSeconds);
    sp = SCORE_SUPPORT_WEIGHT * (s.scoreSupportPercent / 100) * (covered / songSeconds);
  }
  return { active, sp };
}
