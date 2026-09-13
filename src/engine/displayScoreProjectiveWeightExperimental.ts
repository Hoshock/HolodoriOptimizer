import { VIRTUAL_TIMELINE_SECONDS } from "./displayScore";
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
  /** 対象に常に `S_ji`（供給側の発動を問わない） */
  | "static"
  /** 供給側 j がその秒の発動候補にいるときだけ `S_ji × p0_j`（production と同じ） */
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
/** 青の頻度 UP 込みの窓 + 加算型の確率（production のボード換算） */
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
    "gated p0（production 相当）": passiveKernel(env, SPEC_BLUE_MULT, "gatedP0"),
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
