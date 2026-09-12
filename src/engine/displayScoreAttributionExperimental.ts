import type { Card } from "../data/types";
import type { DisplayMemberPart, DisplayMemberView } from "./displayScore";
import {
  buildHistogram,
  compileDisplayMember,
  compileSupportEffects,
  createDisplayScratch,
  histogramScore,
  prepareBase,
  preparePassive,
  round1,
  scoreBonusPercent,
  songBoardRaw,
  VIRTUAL_TIMELINE_SECONDS,
} from "./displayScore";
import { experimentalBlueAdjustedProbability } from "./displayScoreExperimental";
import {
  buildAffIndex,
  compileCondition,
  conditionMet,
  MEMBER_SLOTS,
  NO_ACCOUNT_BONUS,
} from "./power";
import type { HolomenMap } from "./score";

/**
 * **解析用 / production 未採用。** 赤「全員のスコアサポート効果」の総増分（ΔRed = X/100 × E_blue、displayScoreExperimental.ts）が
 * 衣装 / ボード / パッシブ の各カテゴリへどう配賦されるかを調べるための "source attribution" ハーネス。
 *
 * 仮説: 5 カテゴリは共通の非線形評価器 F に source（SkillTree = 青 + 赤スコアサポート、Leader = 衣装スコアサポート、
 * Passive = パッシブのスコアサポート）を順に足したときの marginal contribution ではないか。
 *   Contribution(source) = F(prefix + source) − F(prefix)
 * F は production のアクティブ評価器（200 秒・条件解決済み up・確率和の正規化）で、青は乗算型（experimental）。
 * 3 source の 6 順序、供給側確率（p0 / 乗算型 pBlue）、衣装の扱い、量子化（四捨五入 / 切り上げ）を総当たりで評価する。
 *
 * 2026-09-12 の結果（displayScoreAttributionExperimental.test.ts に固定）: **どの順序でも実機と合わない**。
 * - 衣装を「全員 ×(1 + 25/100) の静的倍率」にすると、Leader が SkillTree の後なら赤 +24 で衣装欄が +5.2 動く（実機 +0.3〜+0.5）、
 *   前なら赤の総増分が衣装で 1.25 倍されてボード欄が +5 ずれる（総量モデルと矛盾）。
 * - さらに一様な ×(1 + c) の衣装 source は、どんな配賦法（sequential / isolated / leave-one-out / Shapley）でも
 *   衣装欄 ≥ c × F(∅ 以外の最小の prefix) ≥ c × 基準アクティブ になるが、実機の衣装欄 13.4〜17.4 は 0.25 × 基準アクティブ
 *   （17.7〜19.9）を全ケースで下回る。つまり衣装欄は「全員のスコア UP を一様に 1.25 倍」した量ではない（衣装 source の形が未解明）。
 * - パッシブ欄の赤による増分（実機: R-002 +10 で +0.3〜+0.5、水着ミオリーダー +24 で +0.2）も既存のパッシブ支援モデルの
 *   marginal（+0.1〜+0.2 / +0.5）では逆の大小関係になる。
 * これらは反証であって式ではない。ケース別の係数で合わせることはしない。production（attributeDisplaySupport 等）には繋がない。
 */

export type AttributionSource = "S" | "L" | "P";
export const ATTRIBUTION_ORDERS: readonly (readonly AttributionSource[])[] = [
  ["S", "P", "L"],
  ["S", "L", "P"],
  ["P", "S", "L"],
  ["P", "L", "S"],
  ["L", "S", "P"],
  ["L", "P", "S"],
];

export interface AttributionOptions {
  /** パッシブ支援の供給側確率: production と同じ p0、または乗算型の青込み確率 */
  supplier?: "p0" | "blueMultiplicative";
  /** 衣装スコアサポートの扱い: 全員への静的倍率 ×(1 + c/100)（production と同じ形）、または無視 */
  costume?: "staticMultiplier" | "none";
  timelineSeconds?: number;
}

/** 1 編成ぶんの評価器の状態（source を足す前の材料） */
export interface AttributionEnvironment {
  views: DisplayMemberView[];
  ups: Float64Array;
  p0: Float64Array;
  pBlue: Float64Array;
  histBase: Float64Array;
  histBlue: Float64Array;
  supportMatrix: Float64Array;
  /** 衣装スコアサポートの倍率（メンバーごと。条件不成立・衣装に支援なしなら 1） */
  costumeMultiplier: Float64Array;
  baseActive: number;
  special: number;
}

export function buildAttributionEnvironment(
  leader: Card,
  members: readonly Card[],
  holomenMap: HolomenMap,
  T: number = VIRTUAL_TIMELINE_SECONDS,
): AttributionEnvironment {
  const affIndex = buildAffIndex(holomenMap);
  const views = members.map((c) =>
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
  prepareBase(views, typeCounts, affCounts, scratch, part, T);
  buildHistogram(views, true, scratch.histBlue, T);
  // production と同じ対象選択でパッシブ支援の行列を作る（withPassive の値自体は使わない）
  preparePassive(views, typeCounts, affCounts, scratch, part, T);
  const p0 = new Float64Array(MEMBER_SLOTS);
  const pBlue = new Float64Array(MEMBER_SLOTS);
  members.forEach((card, i) => {
    const a = views[i]?.active;
    if (!a) return;
    p0[i] = a.p0;
    pBlue[i] = experimentalBlueAdjustedProbability(
      a.p0,
      card.boardLive?.activeRatePercent ?? 0,
      "multiplicative",
    );
  });
  const costumeMultiplier = new Float64Array(MEMBER_SLOTS).fill(1);
  const costume = leader.costumeSkill.structured;
  if (costume) {
    const condition = compileCondition(costume.condition, affIndex);
    for (const e of compileSupportEffects(costume, affIndex)) {
      const cond = e.condition ?? condition;
      if (cond && !conditionMet(cond, typeCounts, affCounts)) continue;
      if (e.target.targetKind !== 0) {
        throw new Error("このハーネスは「全員」対象の衣装スコアサポートだけを扱う");
      }
      for (let i = 0; i < views.length; i++) {
        costumeMultiplier[i] = (costumeMultiplier[i] ?? 1) * (1 + e.target.percent / 100);
      }
    }
  }
  return {
    views,
    ups: Float64Array.from(scratch.ups),
    p0,
    pBlue,
    histBase: Float64Array.from(scratch.histBase),
    histBlue: Float64Array.from(scratch.histBlue),
    supportMatrix: Float64Array.from(scratch.supportMatrix),
    costumeMultiplier,
    baseActive: part.active,
    special: part.special,
  };
}

/** 共通評価器 F。供給側確率が p0 なら production の histogramScore そのもの、乗算型なら同じ式で供給側だけ差し替える */
function evaluate(
  env: AttributionEnvironment,
  hist: Float64Array,
  p: Float64Array,
  useSupport: boolean,
  supplier: "p0" | "blueMultiplicative",
  staticMult: Float64Array | null,
  T: number,
): number {
  if (!useSupport || supplier === "p0") {
    return histogramScore(
      hist,
      env.views,
      env.ups,
      p,
      useSupport ? env.supportMatrix : null,
      staticMult,
      T,
    );
  }
  const n = env.views.length;
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
      let value = (env.ups[i] ?? 0) * pi;
      let mult = 1;
      for (let j = 0; j < n; j++) {
        if (!(mask & (1 << j))) continue;
        const sj = env.supportMatrix[j * MEMBER_SLOTS + i] ?? 0;
        if (sj !== 0) mult += (sj * (p[j] ?? 0)) / 100;
      }
      value *= mult;
      if (staticMult) value *= staticMult[i] ?? 1;
      num += value;
    }
    total += (seconds * num) / (den > 1 ? den : 1);
  }
  return total / T;
}

function evaluateSet(
  env: AttributionEnvironment,
  applied: ReadonlySet<AttributionSource>,
  redSupportPercent: number,
  options: Required<AttributionOptions>,
): number {
  const useBlue = applied.has("S");
  const staticMult = new Float64Array(MEMBER_SLOTS).fill(1);
  let anyStatic = false;
  if (useBlue && redSupportPercent !== 0) {
    for (let i = 0; i < MEMBER_SLOTS; i++)
      staticMult[i] = (staticMult[i] ?? 1) * (1 + redSupportPercent / 100);
    anyStatic = true;
  }
  if (applied.has("L") && options.costume === "staticMultiplier") {
    for (let i = 0; i < MEMBER_SLOTS; i++) {
      const m = env.costumeMultiplier[i] ?? 1;
      if (m !== 1) anyStatic = true;
      staticMult[i] = (staticMult[i] ?? 1) * m;
    }
  }
  return evaluate(
    env,
    useBlue ? env.histBlue : env.histBase,
    useBlue ? env.pBlue : env.p0,
    applied.has("P"),
    options.supplier,
    anyStatic ? staticMult : null,
    options.timelineSeconds,
  );
}

export interface AttributedFields {
  /** 各 source の marginal contribution（raw %） */
  costume: number;
  board: number;
  passive: number;
  active: number;
  special: number;
}

/** 順序どおりに source を足したときの marginal を 5 欄の raw にする（黄は含めない） */
export function experimentalSequentialAttribution(
  env: AttributionEnvironment,
  order: readonly AttributionSource[],
  redSupportPercent: number,
  options: AttributionOptions = {},
): AttributedFields {
  const opts: Required<AttributionOptions> = {
    supplier: options.supplier ?? "p0",
    costume: options.costume ?? "staticMultiplier",
    timelineSeconds: options.timelineSeconds ?? VIRTUAL_TIMELINE_SECONDS,
  };
  const applied = new Set<AttributionSource>();
  let previous = evaluateSet(env, applied, redSupportPercent, opts);
  const marginal: Record<AttributionSource, number> = { S: 0, L: 0, P: 0 };
  for (const source of order) {
    applied.add(source);
    const value = evaluateSet(env, applied, redSupportPercent, opts);
    marginal[source] = value - previous;
    previous = value;
  }
  return {
    costume: marginal.L,
    board: marginal.S,
    passive: marginal.P,
    active: env.baseActive,
    special: env.special,
  };
}

export type AttributionQuantization = "round" | "ceil";

/** 5 欄の表示値（黄を raw のボード欄に入れてから量子化。衣装 / ボード / パッシブは指定の規則、アクティブ / SP は切り上げ） */
export function experimentalAttributedDisplay(
  fields: AttributedFields,
  songBonus: number,
  quantization: AttributionQuantization,
): { costume: number; active: number; board: number; passive: number; special: number } {
  const q = (v: number): number => (quantization === "round" ? round1(v) : scoreBonusPercent(v));
  const boardWithSong = songBonus === 0 ? fields.board : songBoardRaw(fields, songBonus);
  return {
    costume: q(fields.costume),
    active: scoreBonusPercent(fields.active),
    board: q(boardWithSong),
    passive: q(fields.passive),
    special: scoreBonusPercent(fields.special),
  };
}

/** 解析用: 予測 − 実測 の配列から RMSE と最大絶対誤差 */
export function attributionErrorStats(errors: readonly number[]): {
  rmse: number;
  maxAbsError: number;
} {
  if (errors.length === 0) return { rmse: 0, maxAbsError: 0 };
  return {
    rmse: Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length),
    maxAbsError: Math.max(...errors.map((e) => Math.abs(e))),
  };
}
