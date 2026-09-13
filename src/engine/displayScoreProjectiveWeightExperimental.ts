import { VIRTUAL_TIMELINE_SECONDS } from "./displayScore";
import { DISPLAY_TICK } from "./displayScoreCategoryRedistributionExperimental";
import { MEMBER_SLOTS } from "./power";
import type { SourceEnvironment } from "./displayScoreSourceAttributionExperimental";

/**
 * **解析用 / production 未採用。** 表示スコアボーナスの 衣装 / ボード / パッシブ を
 *
 * ```txt
 * (C, B, P) = T × (W_C, W_B, W_P) / (W_C + W_B + W_P)
 * ```
 *
 * という **source ごとに分離した projective weight** で書く仮説のハーネス。`T` は pre-yellow の 3 欄合計
 * （既存の「青は乗算型・パッシブは静的・支援は加算合成」の総量）。
 *
 * - `W_C = (L/100) × H_C`（リーダー衣装のスコアサポート L%）
 * - `W_B = W_blue + (X/100) × H_B`（青ボード由来の分と赤スコアサポート X%）
 * - `W_P = H_P`（パッシブのスコアサポート）
 *
 * `W` は**最終的な寄与量ではなく配分の重み**で、全体を任意の定数倍しても同じ表示になる（projective）。
 * したがって「baseline の λ を 1 に固定して候補をそのまま `W_C` にする」試験
 * （displayScoreCategoryRedistributionExperimental.test.ts の oracle-baseline stage）は
 * **その gauge での失敗**を示すだけで、kernel の比まで否定するものではない。ここでは先に
 * **gauge によらない比**（`H_B / H_C`、`W_blue / H_P`）を測り、生き残った候補だけ normalize する。
 *
 * kernel はすべて production と同じ 200 秒タイムライン・正規化 `max(1, Σp)` から作る一般形で、
 * 自由係数・カード別定数・ケース別分岐は置かない。
 */

/** kernel の作り方: どの窓を使い、分子と競合の分母にどの確率を使うか */
export interface KernelSpec {
  /** 発動候補の秒: 基準周期か、青の発動頻度 UP 込みか */
  window: "base" | "blue";
  /** 分子（対象メンバー自身）の発動確率 */
  numerator: "p0" | "blueAdditive" | "blueMultiplicative";
  /** 同時候補の競合（`max(1, Σp)` の分母）に使う発動確率 */
  denominator: "p0" | "blueAdditive" | "blueMultiplicative";
  /** 条件つきスコア UP の解決（既定は production と同じ resolved） */
  ups?: "resolved" | "deckUnresolved" | "unconditional";
}

/** パッシブのスコアサポートの入れ方（供給側 j → 対象 i の `S_ji` をどう数えるか） */
export type PassiveKernelMode =
  /** 入れない */
  | "none"
  /** 対象に常に `S_ji`（供給側の発動を問わない。現在の production） */
  | "static"
  /** 供給側 j がその秒の発動候補にいるときだけ `S_ji × p0_j`（2026-09-13 まで production が使っていた型） */
  | "gatedP0"
  /** 供給側 j が候補にいるときだけ `S_ji × p_j`（p は spec の分子確率） */
  | "gatedSpec"
  /** 供給側 j が候補にいるという条件だけ残し、`S_ji` に供給側の確率を掛けない */
  | "gatedUnweighted";

const probOf = (env: SourceEnvironment, kind: KernelSpec["numerator"]): Float64Array =>
  kind === "p0" ? env.p0 : kind === "blueAdditive" ? env.pBlueAdditive : env.pBlue;

const upsOf = (env: SourceEnvironment, kind: KernelSpec["ups"]): Float64Array =>
  kind === "deckUnresolved"
    ? env.deckUnresolvedUps
    : kind === "unconditional"
      ? env.unconditionalUps
      : env.ups;

function passiveMultiplier(
  env: SourceEnvironment,
  i: number,
  mask: number,
  pNum: Float64Array,
  mode: PassiveKernelMode,
): number {
  if (mode === "none") return 0;
  let sum = 0;
  for (let j = 0; j < env.views.length; j++) {
    const sj = env.supportMatrix[j * MEMBER_SLOTS + i] ?? 0;
    if (sj === 0) continue;
    if (mode === "static") {
      sum += sj / 100;
      continue;
    }
    if (!(mask & (1 << j))) continue;
    const weight =
      mode === "gatedUnweighted" ? 1 : mode === "gatedP0" ? (env.p0[j] ?? 0) : (pNum[j] ?? 0);
    sum += (sj * weight) / 100;
  }
  return sum;
}

function maskAt(env: SourceEnvironment, s: number, window: KernelSpec["window"]): number {
  let mask = 0;
  const on = window === "blue" ? env.onBlue : env.onBase;
  for (let i = 0; i < env.views.length; i++) if (on[i]?.[s]) mask |= 1 << i;
  return mask;
}

/**
 * `Σ_s Σ_{i∈候補} (1 + P_i) × up_i × p_分子,i / max(1, Σ p_分母) / T`。
 * 支援（リーダー衣装・赤）は掛けない — ここで作るのは source ごとの独立な kernel で、
 * 支援の割合はあとで `W` の係数として掛ける。
 */
export function kernelValue(
  env: SourceEnvironment,
  spec: KernelSpec,
  passive: PassiveKernelMode = "none",
): number {
  const pNum = probOf(env, spec.numerator);
  const pDen = probOf(env, spec.denominator);
  const ups = upsOf(env, spec.ups);
  const n = env.views.length;
  let total = 0;
  for (let s = 1; s <= env.T; s++) {
    const mask = maskAt(env, s, spec.window);
    if (mask === 0) continue;
    let den = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) den += pDen[i] ?? 0;
    const norm = den > 1 ? den : 1;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const mult = 1 + passiveMultiplier(env, i, mask, pNum, passive);
      total += ((ups[i] ?? 0) * (pNum[i] ?? 0) * mult) / norm;
    }
  }
  return total / env.T;
}

/** パッシブのスコアサポートだけの取り分（`passive あり − passive なし`） */
export function passiveKernel(
  env: SourceEnvironment,
  spec: KernelSpec,
  mode: PassiveKernelMode,
): number {
  return kernelValue(env, spec, mode) - kernelValue(env, spec, "none");
}

/** 基準（青なし）の評価値。production のアクティブ欄の raw と同じ */
export const SPEC_BASE: KernelSpec = { window: "base", numerator: "p0", denominator: "p0" };
/** 青の頻度 UP 込みの窓 + 乗算型の確率（総量モデルの `E_blue`） */
export const SPEC_BLUE_MULT: KernelSpec = {
  window: "blue",
  numerator: "blueMultiplicative",
  denominator: "blueMultiplicative",
};
/** 青の頻度 UP 込みの窓 + 加算型の確率（比較用。production は 2026-09-13 から乗算型） */
export const SPEC_BLUE_ADD: KernelSpec = {
  window: "blue",
  numerator: "blueAdditive",
  denominator: "blueAdditive",
};
/**
 * **p0Only リーダー kernel**: 青の窓で、対象自身は基準確率 `p0`、競合の分母だけ青の乗算型。
 * `attributeColumns(rule: "p0Only")` の衣装欄を `L` で割った量と同じで、ここでは kernel として直接作る。
 */
export const SPEC_P0_ONLY: KernelSpec = {
  window: "blue",
  numerator: "p0",
  denominator: "blueMultiplicative",
};
/** 青の発動頻度 UP だけを入れる（窓は青、確率は基準） */
export const SPEC_FREQ_ONLY: KernelSpec = { window: "blue", numerator: "p0", denominator: "p0" };
/** 青の発動率 UP だけを入れる（窓は基準、確率は乗算型） */
export const SPEC_RATE_ONLY: KernelSpec = {
  window: "base",
  numerator: "blueMultiplicative",
  denominator: "blueMultiplicative",
};

/** C* の基礎量 E*: 編成条件を未解決にした up × 青の頻度込みの窓 × 基準確率 p0 */
export const SPEC_C_STAR: KernelSpec = {
  window: "blue",
  numerator: "p0",
  denominator: "p0",
  ups: "deckUnresolved",
};

/** 自由係数のない primitive kernel の全列挙（窓 2 × 分子 3 × 分母 3 + C*） */
export function allPrimitiveKernels(env: SourceEnvironment): Record<string, number> {
  const out: Record<string, number> = { "C* 基礎量": kernelValue(env, SPEC_C_STAR) };
  for (const window of ["base", "blue"] as const)
    for (const numerator of ["p0", "blueAdditive", "blueMultiplicative"] as const)
      for (const denominator of ["p0", "blueAdditive", "blueMultiplicative"] as const)
        out[`${window}|${numerator}|${denominator}`] = kernelValue(env, {
          window,
          numerator,
          denominator,
        });
  return out;
}

export interface ProjectivePrimitives {
  eBase: number;
  eBlueMultiplicative: number;
  eBlueAdditive: number;
  /** p0Only リーダー kernel */
  hP0Only: number;
  eFreqOnly: number;
  eRateOnly: number;
  /** C* の基礎量 */
  eCStar: number;
}

export function projectivePrimitives(env: SourceEnvironment): ProjectivePrimitives {
  return {
    eBase: kernelValue(env, SPEC_BASE),
    eBlueMultiplicative: kernelValue(env, SPEC_BLUE_MULT),
    eBlueAdditive: kernelValue(env, SPEC_BLUE_ADD),
    hP0Only: kernelValue(env, SPEC_P0_ONLY),
    eFreqOnly: kernelValue(env, SPEC_FREQ_ONLY),
    eRateOnly: kernelValue(env, SPEC_RATE_ONLY),
    eCStar: kernelValue(env, SPEC_C_STAR),
  };
}

/** 青ボード由来の重み `W_blue` の候補（自由係数なし。青がなければどれも 0 になる） */
export function blueWeightCandidates(env: SourceEnvironment): Record<string, number> {
  const p = projectivePrimitives(env);
  return {
    "E_blue(add) − H_p0Only": p.eBlueAdditive - p.hP0Only,
    "E_blue(mult) − H_p0Only": p.eBlueMultiplicative - p.hP0Only,
    "E_blue(add) − E_base": p.eBlueAdditive - p.eBase,
    "E_blue(mult) − E_base": p.eBlueMultiplicative - p.eBase,
    "頻度のみ − E_base": p.eFreqOnly - p.eBase,
    "発動率のみ − E_base": p.eRateOnly - p.eBase,
    "頻度 + 発動率": p.eFreqOnly + p.eRateOnly - 2 * p.eBase,
  };
}

/** 赤の kernel `H_B` の候補 */
export function redKernelCandidates(env: SourceEnvironment): Record<string, number> {
  const p = projectivePrimitives(env);
  return {
    "E_blue(mult)": p.eBlueMultiplicative,
    "E_blue(add)": p.eBlueAdditive,
    E_base: p.eBase,
    H_p0Only: p.hP0Only,
    頻度のみ: p.eFreqOnly,
  };
}

/** リーダーの kernel `H_C` の候補 */
export function leaderKernelCandidates(env: SourceEnvironment): Record<string, number> {
  const p = projectivePrimitives(env);
  return {
    H_p0Only: p.hP0Only,
    E_base: p.eBase,
    "C* 基礎量": p.eCStar,
    "E_blue(mult)": p.eBlueMultiplicative,
    "E_blue(add)": p.eBlueAdditive,
    頻度のみ: p.eFreqOnly,
  };
}

/** パッシブの kernel `H_P` の候補 */
export function passiveKernelCandidates(env: SourceEnvironment): Record<string, number> {
  return {
    "静的（青乗算型）": passiveKernel(env, SPEC_BLUE_MULT, "static"),
    "gated p0（2026-09-13 まで production が使っていた型）": passiveKernel(
      env,
      SPEC_BLUE_MULT,
      "gatedP0",
    ),
    "gated（供給側の確率を掛けない）": passiveKernel(env, SPEC_BLUE_MULT, "gatedUnweighted"),
    "gated spec": passiveKernel(env, SPEC_BLUE_MULT, "gatedSpec"),
    "p0Only × 静的": passiveKernel(env, SPEC_P0_ONLY, "static"),
    "p0Only × gated p0": passiveKernel(env, SPEC_P0_ONLY, "gatedP0"),
    "p0Only × gated（確率なし）": passiveKernel(env, SPEC_P0_ONLY, "gatedUnweighted"),
    "基準窓 × 静的": passiveKernel(env, SPEC_BASE, "static"),
    "基準窓 × gated p0": passiveKernel(env, SPEC_BASE, "gatedP0"),
    "基準窓 × gated（確率なし）": passiveKernel(env, SPEC_BASE, "gatedUnweighted"),
  };
}

export interface ProjectiveWeights {
  costume: number;
  board: number;
  passive: number;
}

/** `W_C = (L/100) H_C` / `W_B = W_blue + (X/100) H_B` / `W_P = H_P` */
export function projectiveWeights(input: {
  leaderPercent: number;
  redPercent: number;
  hC: number;
  hB: number;
  hP: number;
  wBlue: number;
}): ProjectiveWeights {
  return {
    costume: (input.leaderPercent / 100) * input.hC,
    board: input.wBlue + (input.redPercent / 100) * input.hB,
    passive: input.hP,
  };
}

/** `(C, B, P) = T × W / ΣW`（pre-yellow）。ΣW = 0 なら 3 欄とも 0 */
export function projectiveColumns(total: number, w: ProjectiveWeights): ProjectiveWeights {
  const sum = w.costume + w.board + w.passive;
  if (sum <= 0) return { costume: 0, board: 0, passive: 0 };
  return {
    costume: (total * w.costume) / sum,
    board: (total * w.board) / sum,
    passive: (total * w.passive) / sum,
  };
}

/**
 * 黄の楽曲スコアボーナスは既知の後段のボード加算（`songBoardRaw`）。normalization には混ぜず、
 * pre-yellow の 3 欄を出したあとにボードへ足す / 表示値から引く。
 */
export function yellowBoardIncrement(
  songBonus: number,
  columns: { costume: number; active: number; passive: number; special: number },
): number {
  return songBonus * (100 + columns.costume + columns.active + columns.passive + columns.special);
}

export const PROJECTIVE_TIMELINE_SECONDS = VIRTUAL_TIMELINE_SECONDS;

/**
 * ## member-local な `W_blue` の候補（2026-09-13 K7 以降）
 *
 * 「編成全体の評価値どうしの差」（`blueWeightCandidates`）は K7 で全滅する。次の族は、青を**持っているメンバー本人**の
 * 量に青ボードの % を掛けて足す
 *
 * ```txt
 * W_blue = Σ_j (R_j / 100) × A_j(発動率側の kernel) + Σ_j (F_j / 100) × A_j(発動頻度側の kernel)
 * ```
 *
 * という形。`A_j` は production と同じ 200 秒タイムラインから作る member-local kernel で、
 * **カード別係数・fit 係数・ケース別定数は置かない**（窓・分子・分母の選び方だけが自由度）。
 * `R_j` / `F_j` は環境の `blueRatePercent` / `blueFrequencyPercent` から読む（`pBlue` は上限 1 で頭打ちするので使わない）。
 */
export type MemberNumerator = "p0" | "blueAdditive" | "blueMultiplicative" | "one";
export type MemberDenominator = "none" | "p0" | "blueAdditive" | "blueMultiplicative";

export interface MemberKernelSpec {
  window: "base" | "blue";
  /** 分子（対象メンバー自身）。`one` は確率を掛けず「発動候補の秒 × スコア UP」だけを見る */
  numerator: MemberNumerator;
  /** 同時候補の競合。`none` は production の `max(1, Σp)` で割らない */
  denominator: MemberDenominator;
}

/** メンバー j ごとの `A_j = Σ_s∈窓(j) up_j × 分子_j / max(1, Σ 分母) / T` */
export function memberKernel(env: SourceEnvironment, spec: MemberKernelSpec): number[] {
  const on = spec.window === "blue" ? env.onBlue : env.onBase;
  const den =
    spec.denominator === "p0"
      ? env.p0
      : spec.denominator === "blueAdditive"
        ? env.pBlueAdditive
        : env.pBlue;
  const n = env.views.length;
  const out: number[] = Array.from({ length: n }, () => 0);
  for (let s = 1; s <= env.T; s++) {
    let mask = 0;
    for (let i = 0; i < n; i++) if (on[i]?.[s]) mask |= 1 << i;
    if (mask === 0) continue;
    let sum = 0;
    if (spec.denominator !== "none")
      for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += den[i] ?? 0;
    const norm = spec.denominator === "none" ? 1 : sum > 1 ? sum : 1;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const q =
        spec.numerator === "one"
          ? 1
          : spec.numerator === "p0"
            ? (env.p0[i] ?? 0)
            : spec.numerator === "blueAdditive"
              ? (env.pBlueAdditive[i] ?? 0)
              : (env.pBlue[i] ?? 0);
      out[i] = (out[i] ?? 0) + ((env.ups[i] ?? 0) * q) / norm / env.T;
    }
  }
  return out;
}

/** 青ボードの % を持つメンバーの kernel だけを足した member-local な重み */
export function memberLocalBlueWeight(
  env: SourceEnvironment,
  source: "rate" | "frequency",
  spec: MemberKernelSpec,
): number {
  const a = memberKernel(env, spec);
  const percent = source === "rate" ? env.blueRatePercent : env.blueFrequencyPercent;
  let total = 0;
  for (let i = 0; i < a.length; i++) total += ((percent[i] ?? 0) / 100) * (a[i] ?? 0);
  return total;
}

export const MEMBER_KERNEL_SPECS: readonly MemberKernelSpec[] = (() => {
  const out: MemberKernelSpec[] = [];
  for (const window of ["base", "blue"] as const)
    for (const numerator of ["p0", "blueAdditive", "blueMultiplicative", "one"] as const)
      for (const denominator of ["none", "p0", "blueAdditive", "blueMultiplicative"] as const)
        out.push({ window, numerator, denominator });
  return out;
})();

export const memberKernelName = (spec: MemberKernelSpec): string =>
  `${spec.window}|${spec.numerator}|${spec.denominator}`;

/** 発動率 % 由来の member-local 候補（32 通り。青がなければどれも 0） */
export function memberLocalRateCandidates(env: SourceEnvironment): Record<string, number> {
  const out: Record<string, number> = {};
  for (const spec of MEMBER_KERNEL_SPECS)
    out[memberKernelName(spec)] = memberLocalBlueWeight(env, "rate", spec);
  return out;
}

/** 発動頻度 % 由来の member-local 候補（32 通り） */
export function memberLocalFrequencyCandidates(env: SourceEnvironment): Record<string, number> {
  const out: Record<string, number> = {};
  for (const spec of MEMBER_KERNEL_SPECS)
    out[memberKernelName(spec)] = memberLocalBlueWeight(env, "frequency", spec);
  return out;
}

/**
 * 実測の表示値から逆算した raw weight の比。`W_C = (L/100) H_C` を基準に、
 * `W_blue / H_C = (L/100) × B / C`、`H_P / H_C = (L/100) × P / C`。
 * 表示は 0.1 刻みなので区間で返す（`lo` / `hi`）。衣装欄が 0 の行（支援なし側）は使えないので null。
 */
export interface WeightRatioInterval {
  lo: number;
  hi: number;
  point: number;
}

export function weightRatioToCostume(
  leaderPercent: number,
  costumeDisplayed: number,
  otherDisplayed: number,
): WeightRatioInterval | null {
  const cLo = costumeDisplayed - DISPLAY_TICK / 2;
  if (leaderPercent <= 0 || cLo <= 0) return null;
  const cHi = costumeDisplayed + DISPLAY_TICK / 2;
  const k = leaderPercent / 100;
  return {
    lo: (k * (otherDisplayed - DISPLAY_TICK / 2)) / cHi,
    hi: (k * (otherDisplayed + DISPLAY_TICK / 2)) / cLo,
    point: (k * otherDisplayed) / costumeDisplayed,
  };
}

/** 区間の共通部分（空なら null） */
export function intersectRatio(
  a: WeightRatioInterval,
  b: WeightRatioInterval,
): { lo: number; hi: number } | null {
  const lo = Math.max(a.lo, b.lo);
  const hi = Math.min(a.hi, b.hi);
  return lo <= hi ? { lo, hi } : null;
}

/**
 * ## `W_blue` の残差診断（2026-09-13）
 *
 * 第一候補 `W_blue = E_blue(加算) − H_C` の残差（予測 − 実測要求）は
 * K1 +0.71 / K2 +0.06 / K3 +3.51 / K4 +3.68 / K7 −0.07 で、**一様ではない**。
 * 「青持ちが複数いるから」では説明できない（K2 も K1 も複数の青持ちを含むのに残差がほぼ 0）。
 * ここでは残差と対応する**構造量**を、自由係数なしで測るための道具を置く。
 */

/** メンバーごとの静的なパッシブ支援の割合 `P_i = Σ_j S_ji / 100`（供給側の発動を問わない） */
export function staticPassiveShare(env: SourceEnvironment): number[] {
  const n = env.views.length;
  const out: number[] = Array.from({ length: n }, () => 0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += (env.supportMatrix[j * MEMBER_SLOTS + i] ?? 0) / 100;
    out[i] = sum;
  }
  return out;
}

/**
 * **青 × パッシブ支援の交差項**: 青で増えた確率ぶんに乗るパッシブ支援
 *
 * ```txt
 * Σ_s Σ_{i∈候補} up_i × (p_青,i − p0_i) × P_i / max(1, Σ p_分母) / T
 * ```
 *
 * `(C,B,P) = T × W/ΣW` は `W_blue`（青）と `W_P`（パッシブ）を独立な重みとして足すので、
 * **両方が同じメンバーに乗る部分**はどちらの重みにも属さない。パッシブ支援の対象が青を持たなければ 0 になる。
 * 自由係数はない（`P_i` は実機のスキル %、確率差は production の青モデルそのもの）。
 */
export function bluePassiveCrossTerm(
  env: SourceEnvironment,
  numerator: "blueAdditive" | "blueMultiplicative",
  denominator: "p0" | "blueAdditive" | "blueMultiplicative",
): number {
  const P = staticPassiveShare(env);
  const n = env.views.length;
  const pd = probOf(env, denominator);
  const pn = probOf(env, numerator);
  let total = 0;
  for (let s = 1; s <= env.T; s++) {
    const mask = maskAt(env, s, "blue");
    if (mask === 0) continue;
    let d = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) d += pd[i] ?? 0;
    const norm = d > 1 ? d : 1;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      total += ((env.ups[i] ?? 0) * ((pn[i] ?? 0) - (env.p0[i] ?? 0)) * (P[i] ?? 0)) / norm;
    }
  }
  return total / env.T;
}

export interface BlueStructure {
  /** 青（発動率 or 発動頻度）を持つメンバー数 */
  blueCount: number;
  rateCount: number;
  frequencyCount: number;
  sumRatePercent: number;
  sumFrequencyPercent: number;
  /** 青持ちが 2 人以上同時に発動候補になる秒 */
  blueCoCandidateSeconds: number;
  /** 青の乗算型の確率和が 1 を超える秒（正規化が効く秒） */
  denominatorOverOneSeconds: number;
  /** 発動候補が 1 人以上いる秒 */
  candidateSeconds: number;
  /** パッシブのスコアサポートの対象に青持ちがいる */
  passiveOnBlueHolder: boolean;
  /** パッシブのスコアサポートの対象に青なしがいる */
  passiveOnNonBlueHolder: boolean;
}

/** 残差と突き合わせるための構造量（式ではなく観測の性質） */
export function blueStructure(env: SourceEnvironment): BlueStructure {
  const n = env.views.length;
  const holder = (i: number): boolean =>
    (env.blueRatePercent[i] ?? 0) > 0 || (env.blueFrequencyPercent[i] ?? 0) > 0;
  const P = staticPassiveShare(env);
  let blueCo = 0;
  let over1 = 0;
  let candidate = 0;
  for (let s = 1; s <= env.T; s++) {
    const mask = maskAt(env, s, "blue");
    if (mask === 0) continue;
    candidate++;
    let d = 0;
    let holders = 0;
    for (let i = 0; i < n; i++)
      if (mask & (1 << i)) {
        d += env.pBlue[i] ?? 0;
        if (holder(i)) holders++;
      }
    if (d > 1) over1++;
    if (holders >= 2) blueCo++;
  }
  const idx = [...Array(n).keys()];
  return {
    blueCount: idx.filter(holder).length,
    rateCount: idx.filter((i) => (env.blueRatePercent[i] ?? 0) > 0).length,
    frequencyCount: idx.filter((i) => (env.blueFrequencyPercent[i] ?? 0) > 0).length,
    sumRatePercent: idx.reduce((a, i) => a + (env.blueRatePercent[i] ?? 0), 0),
    sumFrequencyPercent: idx.reduce((a, i) => a + (env.blueFrequencyPercent[i] ?? 0), 0),
    blueCoCandidateSeconds: blueCo,
    denominatorOverOneSeconds: over1,
    candidateSeconds: candidate,
    passiveOnBlueHolder: idx.some((i) => (P[i] ?? 0) > 0 && holder(i)),
    passiveOnNonBlueHolder: idx.some((i) => (P[i] ?? 0) > 0 && !holder(i)),
  };
}

/**
 * メンバーごとの `E_blue(加算)` と `H_C` の取り分（第一候補の差分がどのメンバーから来ているかの分解）。
 * 分母が違う 2 つの kernel を引くので、メンバー単位で見ないと「誰の取り分が過大か」が分からない
 */
export function perMemberBlueDifference(env: SourceEnvironment): {
  blueAdditive: number[];
  leaderKernel: number[];
  difference: number[];
} {
  const n = env.views.length;
  const blueAdditive: number[] = Array.from({ length: n }, () => 0);
  const leaderKernel: number[] = Array.from({ length: n }, () => 0);
  for (let s = 1; s <= env.T; s++) {
    const mask = maskAt(env, s, "blue");
    if (mask === 0) continue;
    let dA = 0;
    let dM = 0;
    for (let i = 0; i < n; i++)
      if (mask & (1 << i)) {
        dA += env.pBlueAdditive[i] ?? 0;
        dM += env.pBlue[i] ?? 0;
      }
    const nA = dA > 1 ? dA : 1;
    const nM = dM > 1 ? dM : 1;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      blueAdditive[i] =
        (blueAdditive[i] ?? 0) + ((env.ups[i] ?? 0) * (env.pBlueAdditive[i] ?? 0)) / nA;
      leaderKernel[i] = (leaderKernel[i] ?? 0) + ((env.ups[i] ?? 0) * (env.p0[i] ?? 0)) / nM;
    }
  }
  const scale = (xs: number[]): number[] => xs.map((x) => x / env.T);
  const a = scale(blueAdditive);
  const b = scale(leaderKernel);
  return { blueAdditive: a, leaderKernel: b, difference: a.map((x, i) => x - (b[i] ?? 0)) };
}

/** 19 個の primitive kernel の**差**を全通り（`A − B`）作る。自由係数なし */
export function primitiveDifferenceCandidates(env: SourceEnvironment): Record<string, number> {
  const prim = allPrimitiveKernels(env);
  const out: Record<string, number> = {};
  for (const [a, va] of Object.entries(prim))
    for (const [b, vb] of Object.entries(prim)) {
      if (a === b) continue;
      out[`${a} − ${b}`] = va - vb;
    }
  return out;
}
