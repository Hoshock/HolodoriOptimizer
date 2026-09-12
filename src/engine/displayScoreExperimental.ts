import type { Card } from "../data/types";
import type { DisplayMemberPart, DisplayMemberView } from "./displayScore";
import {
  buildHistogram,
  compileDisplayMember,
  createDisplayScratch,
  histogramScore,
  prepareBase,
  redScoreSupportDisplayGain,
  VIRTUAL_TIMELINE_SECONDS,
} from "./displayScore";
import { buildAffIndex, MEMBER_SLOTS, NO_ACCOUNT_BONUS } from "./power";
import type { HolomenMap } from "./score";

/**
 * **解析用 / production 未採用。** 赤「全員のスコアサポート効果 +X%」が表示スコアボーナスの合計に足す増分の
 * **現在最有力仮説**（強い推定。確定ではない — docs/human/display-score.md「赤『全員のスコアサポート効果』」）:
 *
 *   ΔRed(X) = (X / 100) × E_blue
 *
 * E_blue は production のアクティブ欄と同じ 200 秒タイムライン・同じ条件解決（prepareBase が scratch.ups に作る
 * 条件解決済みのスコア UP）・同じ確率和の正規化（Σ up × p / max(1, Σ p)）で、青ボードだけを
 *
 *   p_i        = min(1, p0_i × (1 + 発動率 UP_i / 100))   … 乗算型（production の blueActivationProbability は加算型。ここでは使わない）
 *   interval_i = interval_i / (1 + 発動頻度 UP_i / 100)    … production の onBlue（blueActivationInterval）と同じ
 *
 * で反映したアクティブ期待値。実機 13 対照（赤 +24 × 9、R-061 +3、R-002 +10 × 3）で RMSE ≈ 0.1 pt・最大誤差 ≈ 0.2 pt
 * （displayScoreExperimental.test.ts）。旧 `X × 基準候補秒 / 200` は一般式として反証済み。
 *
 * **本番の表示計算には使わない**: 総増分は説明できても、実機ではその増分が 衣装 / ボード / パッシブ の各カテゴリへ
 * 分かれて動き（赤 +24 で 衣装 +0.5 / ボード +20.4 など）、その配賦式が未解明なため。総量だけ合わせて全部ボード欄に
 * 入れると 5 カテゴリ表示が間違い、黄が衣装 / パッシブを基底に使うぶん黄込みの結果にも波及する。
 * また「乗算型が赤の内部基準量として強い」ことは、production の青ボード欄の換算を乗算型へ変える根拠ではない。
 * production の attributeDisplaySupport / redScoreSupportDisplayGain / computeDisplayScoreBonus / blueActivationProbability は
 * このモジュールから触らない。
 */

/** 青の発動率 UP を発動確率に反映する型。multiplicative が現在最有力、additive は production と同じ加算型（比較用） */
export type ExperimentalRateModel = "multiplicative" | "additive";

/** 解析用: 発動率 UP の反映（乗算型 / 加算型）。production の blueActivationProbability には依存しない */
export function experimentalBlueAdjustedProbability(
  baseProbability: number,
  rateUpPercent: number,
  model: ExperimentalRateModel,
): number {
  if (model === "multiplicative") return Math.min(1, baseProbability * (1 + rateUpPercent / 100));
  return Math.min(1, baseProbability + rateUpPercent / 100);
}

export interface ExperimentalRedSupportOptions {
  model?: ExperimentalRateModel;
  timelineSeconds?: number;
}

export interface ExperimentalRedSupportEvaluation {
  /** 青補正なしのアクティブ期待値（production のアクティブ欄の raw と同じ値） */
  baseActive: number;
  /** 青補正なしのタイムラインで候補が 1 人以上いる秒数（旧近似の入力） */
  baseCandidateSeconds: number;
  /** E_blue: 青を乗算型（または加算型）で反映したアクティブ期待値 */
  expectedActive: number;
  /** 現在最有力仮説の増分 = expectedActive × X / 100 */
  gain: number;
  /** 旧近似（反証済み）= X × 基準候補秒 / T。比較用 */
  legacyGain: number;
}

/**
 * 解析用: メンバー 5 人（観測時点の開花・青の実効値を boardLive に載せた Card）から E_blue と ΔRed(X) を求める。
 * リーダーには依存しない（衣装のスコアサポートは入れない）。
 * production の評価器（compileDisplayMember / prepareBase / buildHistogram / histogramScore）をそのまま通し、
 * 発動確率だけをこのモジュールの式で差し替える（pBlue は使わない）。
 */
export function experimentalRedSupportEvaluate(
  members: readonly Card[],
  holomenMap: HolomenMap,
  redSupportPercent: number,
  options: ExperimentalRedSupportOptions = {},
): ExperimentalRedSupportEvaluation {
  const T = options.timelineSeconds ?? VIRTUAL_TIMELINE_SECONDS;
  const model = options.model ?? "multiplicative";
  const affIndex = buildAffIndex(holomenMap);
  const views: DisplayMemberView[] = members.map((c) =>
    compileDisplayMember(c, holomenMap, affIndex, NO_ACCOUNT_BONUS, T),
  );
  const typeCounts = new Int32Array(3);
  const affCounts = new Int32Array(affIndex.size);
  for (const v of views) {
    typeCounts[v.typeIndex] = (typeCounts[v.typeIndex] ?? 0) + 1;
    for (const a of v.affIndices) affCounts[a] = (affCounts[a] ?? 0) + 1;
  }
  const scratch = createDisplayScratch();
  const part: DisplayMemberPart = {
    active: 0,
    blue: 0,
    withPassive: 0,
    special: 0,
    baseCandidateSeconds: 0,
  };
  // 条件解決済みのスコア UP（scratch.ups）と基準タイムラインは production と同じ経路で作る
  prepareBase(views, typeCounts, affCounts, scratch, part, T);
  // 候補窓は発動頻度 UP で短縮した周期（production の onBlue と同じ）
  buildHistogram(views, true, scratch.histBlue, T);
  const p = new Float64Array(MEMBER_SLOTS);
  members.forEach((card, i) => {
    const a = views[i]?.active;
    if (!a) return;
    p[i] = experimentalBlueAdjustedProbability(a.p0, card.boardLive?.activeRatePercent ?? 0, model);
  });
  const expectedActive = histogramScore(scratch.histBlue, views, scratch.ups, p, null, null, T);
  return {
    baseActive: part.active,
    baseCandidateSeconds: part.baseCandidateSeconds,
    expectedActive,
    gain: experimentalRedSupportGain(expectedActive, redSupportPercent),
    legacyGain: redScoreSupportDisplayGain(redSupportPercent, part.baseCandidateSeconds, T),
  };
}

/** 解析用: ΔRed(X) = E_blue × X / 100 */
export function experimentalRedSupportGain(
  blueAdjustedExpectedActive: number,
  redSupportPercent: number,
): number {
  return (blueAdjustedExpectedActive * redSupportPercent) / 100;
}

/** 解析用: 予測 − 実測 の配列から RMSE と最大絶対誤差 */
export function experimentalErrorStats(errors: readonly number[]): {
  rmse: number;
  maxAbsError: number;
} {
  if (errors.length === 0) return { rmse: 0, maxAbsError: 0 };
  const sq = errors.reduce((sum, e) => sum + e * e, 0);
  return {
    rmse: Math.sqrt(sq / errors.length),
    maxAbsError: Math.max(...errors.map((e) => Math.abs(e))),
  };
}
