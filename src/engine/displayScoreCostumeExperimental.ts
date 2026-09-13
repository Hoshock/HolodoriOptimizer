import type { Card } from "../data/types";
import { VIRTUAL_TIMELINE_SECONDS } from "./displayScore";
import type { AttributionEnvironment } from "./displayScoreAttributionExperimental";
import { buildAttributionEnvironment } from "./displayScoreAttributionExperimental";
import { MEMBER_SLOTS } from "./power";
import type { HolomenMap } from "./score";

/**
 * **解析用 / production 未採用。** 表示ユニットスコア詳細の「衣装スキル」欄（サーバーの by_live_leader_skill に相当）の
 * 絶対値を、リーダー衣装の「全員のスコアサポート 25%」から独立に算出する候補評価器を並べて比較するハーネス。
 *
 * 前提（display-score.md）: 衣装欄は「全員のスコア UP を一様に ×1.25 したときの 差分」ではない
 * （どの配賦法でも衣装欄 ≥ 0.25 × 基準アクティブ になるが、実機は 13.4〜17.4 で下限 17.7〜19.9 を下回る）。
 * したがってここでは実スコア期待値の marginal ではなく、「支援 25% という effect 量を材料にした独立カテゴリ評価器」を
 * 候補として列挙し、水着フワワリーダー 9 編成（X = 26 / 50）と R-061 の 3 点系列（X = 23 / 26 / 50）で比較する。
 *
 * **候補族は「最終的な衣装欄の値」としては全滅したが、2026-09-13 に同じ量を projective weight の raw kernel として 読み替える経路ができた**（`displayScoreProjectiveWeightExperimental.ts`）。ここでの反証は「そのまま表示値にすると合わない」 という意味で、kernel としての比まで否定したものではない。
 *
 * 自由係数は持たない。support は記載の 25 をそのまま使い、量子化（round / ceil / floor）は全ケース共通。
 * ケース別・カード別の分岐は置かない。結果はテストに「反証」または「候補」として固定し、production の
 * computeDisplayScoreBonus / attributeDisplaySupport には繋がない。
 */

export interface CostumeEnvironment extends AttributionEnvironment {
  /** 条件を無視した基準スコア UP（conditionalScoreUp を使わない） */
  unconditionalUps: Float64Array;
  /** production と同じ加算型の青込み確率 min(1, p0 + r/100) */
  pBlueAdditive: Float64Array;
  /** 衣装のスコアサポート（%）。条件不成立・支援なしなら 0 */
  supportPercent: number;
}

export function buildCostumeEnvironment(
  leader: Card,
  members: readonly Card[],
  holomenMap: HolomenMap,
  T: number = VIRTUAL_TIMELINE_SECONDS,
): CostumeEnvironment {
  const env = buildAttributionEnvironment(leader, members, holomenMap, T);
  const unconditionalUps = new Float64Array(MEMBER_SLOTS);
  const pBlueAdditive = new Float64Array(MEMBER_SLOTS);
  env.views.forEach((v, i) => {
    unconditionalUps[i] = v.active?.scoreUpPercent ?? 0;
    pBlueAdditive[i] = v.active?.pBlue ?? 0;
  });
  // 一様な「全員」支援だけを扱うので、倍率はメンバー 0 の値で代表できる（buildAttributionEnvironment が対象 all を保証）
  const supportPercent = Math.round(((env.costumeMultiplier[0] ?? 1) - 1) * 100 * 1e6) / 1e6;
  return { ...env, unconditionalUps, pBlueAdditive, supportPercent };
}

/** 候補評価器の構成。どれもゲーム上の意味を持つ選択肢だけ（自由係数なし） */
export interface CostumeEvaluatorOptions {
  /** スコア UP: 条件解決済み（production のアクティブ欄と同じ）か、条件を無視した基準値か */
  ups?: "resolved" | "unconditional";
  /** 発動候補の秒: 基準周期か、青の発動頻度 UP 込みの周期か */
  timeline?: "base" | "blue";
  /** 発動確率: 基準 p0、加算型の青込み、乗算型の青込み */
  probability?: "p0" | "blueAdditive" | "blueMultiplicative";
  /**
   * 支援 25% の効き方
   * - multiplier: 各候補のスコア UP を 25% 増幅した期待値の増分（0.25 × Σ up p / norm）
   * - additive: 各候補のスコア UP に 25 を加算した期待値の増分（25 × Σ p / norm）
   * - presence: 誰かのアクティブが発動している秒だけ 25% が乗る（25 × (1 − Π(1 − p))）
   */
  effect?: "multiplier" | "additive" | "presence";
  /** 同時候補の扱い: production の max(1, Σp)、割らない、常に Σp で割る、候補人数で割る */
  normalization?: "maxOne" | "none" | "sumP" | "count";
  /** 赤スコアサポート X の入れ方: 入れない、スコア UP を ×(1 + X/100)、結果を ×(1 + X/100)（反証確認用） */
  red?: "none" | "upsScaled" | "afterScale";
  /** 候補人数の範囲に限る（例: 1 人だけ、2 人以上だけ）。省略は全部 */
  candidateCount?: { min: number; max: number };
  timelineSeconds?: number;
}

export type CostumeQuantization = "round" | "ceil" | "floor";

export function quantizeTenth(value: number, mode: CostumeQuantization): number {
  const scaled = value * 10 + (mode === "round" ? 1e-9 : 0);
  const q =
    mode === "round"
      ? Math.round(scaled)
      : mode === "ceil"
        ? Math.ceil(scaled - 1e-9)
        : Math.floor(scaled + 1e-9);
  return q / 10;
}

/**
 * 衣装欄の候補 raw 値（%）。条件不成立（supportPercent = 0）なら常に 0（negative control）。
 */
export function experimentalCostumeEvaluate(
  env: CostumeEnvironment,
  redSupportPercent: number,
  options: CostumeEvaluatorOptions = {},
): number {
  const support = env.supportPercent;
  if (support === 0) return 0;
  const T = options.timelineSeconds ?? VIRTUAL_TIMELINE_SECONDS;
  const upsKind = options.ups ?? "resolved";
  const timeline = options.timeline ?? "base";
  const probability = options.probability ?? "p0";
  const effect = options.effect ?? "multiplier";
  const normalization = options.normalization ?? "maxOne";
  const red = options.red ?? "none";
  const range = options.candidateCount ?? { min: 1, max: MEMBER_SLOTS };
  const hist = timeline === "base" ? env.histBase : env.histBlue;
  const p =
    probability === "p0" ? env.p0 : probability === "blueAdditive" ? env.pBlueAdditive : env.pBlue;
  const baseUps = upsKind === "resolved" ? env.ups : env.unconditionalUps;
  const redScale = red === "upsScaled" ? 1 + redSupportPercent / 100 : 1;
  const n = env.views.length;
  let total = 0;
  for (let mask = 1; mask < 1 << MEMBER_SLOTS; mask++) {
    const seconds = hist[mask] ?? 0;
    if (seconds === 0) continue;
    let count = 0;
    let sumP = 0;
    let sumUpP = 0;
    let noneFires = 1;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const pi = p[i] ?? 0;
      count++;
      sumP += pi;
      sumUpP += (baseUps[i] ?? 0) * redScale * pi;
      noneFires *= 1 - pi;
    }
    if (count < range.min || count > range.max) continue;
    const norm =
      normalization === "maxOne"
        ? Math.max(1, sumP)
        : normalization === "none"
          ? 1
          : normalization === "sumP"
            ? Math.max(sumP, 1e-12)
            : count;
    let value: number;
    if (effect === "multiplier") value = ((support / 100) * sumUpP) / norm;
    else if (effect === "additive") value = (support * sumP) / norm;
    else value = support * (1 - noneFires);
    total += seconds * value;
  }
  total /= T;
  if (red === "afterScale") total *= 1 + redSupportPercent / 100;
  return total;
}

export interface CostumeErrorStats {
  rmse: number;
  maxAbsError: number;
  bias: number;
}

export function costumeErrorStats(errors: readonly number[]): CostumeErrorStats {
  if (errors.length === 0) return { rmse: 0, maxAbsError: 0, bias: 0 };
  const sq = errors.reduce((s, e) => s + e * e, 0);
  return {
    rmse: Math.sqrt(sq / errors.length),
    maxAbsError: Math.max(...errors.map((e) => Math.abs(e))),
    bias: errors.reduce((s, e) => s + e, 0) / errors.length,
  };
}

/** 編成ごとの内部特徴量（候補評価器の材料。表にして比較するための値） */
export interface CostumeFeatures {
  /** 基準タイムライン・p0・条件解決済み up の正規化期待値（= production のアクティブ欄の raw） */
  eBase: number;
  /** 青タイムライン + 加算型 p（production の Board 換算に使う値） */
  eBlueAdditive: number;
  /** 青タイムライン + 乗算型 p（赤の総量モデルの E_blue） */
  eBlueMultiplicative: number;
  /** 正規化なしの線形和 Σ_s Σ_i on_i(s) p_i up_i / T（基準 / 青乗算型） */
  linearBase: number;
  linearBlue: number;
  /** 候補人数 k = 0..5 ごとの秒数・Σ up p・Σ p・正規化後の寄与（基準タイムライン、いずれも /T 済み） */
  byCandidateCount: { seconds: number; sumUpP: number; sumP: number; normalized: number }[];
  /** メンバーごとの leave-one-out 限界寄与 E(all) − E(without i) と単独期待値（基準） */
  members: { marginal: number; solo: number }[];
}

export function experimentalCostumeFeatures(
  env: CostumeEnvironment,
  T: number = VIRTUAL_TIMELINE_SECONDS,
): CostumeFeatures {
  const n = env.views.length;
  const evaluate = (hist: Float64Array, p: Float64Array, normalized: boolean) => {
    let total = 0;
    for (let mask = 1; mask < 1 << MEMBER_SLOTS; mask++) {
      const seconds = hist[mask] ?? 0;
      if (seconds === 0) continue;
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        if (!(mask & (1 << i))) continue;
        const pi = p[i] ?? 0;
        den += pi;
        num += (env.ups[i] ?? 0) * pi;
      }
      total += (seconds * num) / (normalized ? Math.max(1, den) : 1);
    }
    return total / T;
  };
  const byCandidateCount = Array.from({ length: MEMBER_SLOTS + 1 }, () => ({
    seconds: 0,
    sumUpP: 0,
    sumP: 0,
    normalized: 0,
  }));
  for (let mask = 0; mask < 1 << MEMBER_SLOTS; mask++) {
    const seconds = env.histBase[mask] ?? 0;
    if (seconds === 0) continue;
    let k = 0;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      k++;
      const pi = env.p0[i] ?? 0;
      den += pi;
      num += (env.ups[i] ?? 0) * pi;
    }
    const bucket = byCandidateCount[k];
    if (!bucket) continue;
    bucket.seconds += seconds;
    bucket.sumUpP += (seconds * num) / T;
    bucket.sumP += (seconds * den) / T;
    bucket.normalized += (seconds * num) / Math.max(1, den) / T;
  }
  const eBase = evaluate(env.histBase, env.p0, true);
  const members = env.views.map((_v, i) => {
    const pWithout = Float64Array.from(env.p0);
    pWithout[i] = 0;
    const histWithout = new Float64Array(1 << MEMBER_SLOTS);
    const histSolo = new Float64Array(1 << MEMBER_SLOTS);
    for (let mask = 0; mask < 1 << MEMBER_SLOTS; mask++) {
      const seconds = env.histBase[mask] ?? 0;
      if (seconds === 0) continue;
      const without = mask & ~(1 << i);
      histWithout[without] = (histWithout[without] ?? 0) + seconds;
      const solo = mask & (1 << i);
      histSolo[solo] = (histSolo[solo] ?? 0) + seconds;
    }
    const pSolo = new Float64Array(MEMBER_SLOTS);
    pSolo[i] = env.p0[i] ?? 0;
    return {
      marginal: eBase - evaluate(histWithout, pWithout, true),
      solo: evaluate(histSolo, pSolo, true),
    };
  });
  return {
    eBase,
    eBlueAdditive: evaluate(env.histBlue, env.pBlueAdditive, true),
    eBlueMultiplicative: evaluate(env.histBlue, env.pBlue, true),
    linearBase: evaluate(env.histBase, env.p0, false),
    linearBlue: evaluate(env.histBlue, env.pBlue, false),
    byCandidateCount,
    members,
  };
}
