/**
 * ライブ中スキル(アクティブ・SP)の期待値計算に使う仮定値。
 *
 * 発動確率の実数値・SP の発動回数はゲーム内で未公開・実測未確認のため、
 * ここの値はすべて仮定(docs/ai/tmp/pending.md の 6)。判明したらこのファイルだけ差し替える。
 * スコアへの反映方法は src/engine/live.ts を参照。
 */
import { songs } from "./index";

/**
 * アクティブスキルの発動確率段階に割り当てる仮の実数値。
 * 高 55% / 中 46% / 低 37%: 2026-09-08 の実機のユニットスコア詳細「アクティブスキル」欄 8 ケース(63.7〜78.4%)を
 * 5 人共通タイムライン(src/engine/displayScore.ts)で ±0.1 pt に再現する値(外部コミュニティ解析の有力値と同じ。
 * 55 / 45 / 35 だと 0.4 pt 低い)。低確率は実測のカードが少なく精度が低い
 */
export const ACTIVE_PROBABILITY: Record<"low" | "medium" | "high" | "unknown", number> = {
  low: 0.37,
  medium: 0.46,
  high: 0.55,
  unknown: 0.46,
};

/** SP スキルは 1 曲あたりこの回数発動すると仮定する */
export const SP_ACTIVATIONS_PER_SONG = 1;

/** スコアサポート効果(%)をスコア UP(%)と等価に扱う重み(実測未確認の仮定) */
export const SCORE_SUPPORT_WEIGHT = 1;

/** 曲未指定時の代表曲条件: 全曲の演奏時間の中央値(秒) */
export const DEFAULT_SONG_DURATION_SECONDS = (() => {
  const durations = songs
    .map((s) => s.durationSeconds)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);
  return durations[Math.floor(durations.length / 2)] ?? 120;
})();
