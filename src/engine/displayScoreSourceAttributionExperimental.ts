import type { Card } from "../data/types";
import { VIRTUAL_TIMELINE_SECONDS } from "./displayScore";
import type { LeaderSupportEnvironment } from "./displayScoreLeaderSupportExperimental";
import { buildLeaderSupportEnvironment } from "./displayScoreLeaderSupportExperimental";
import { MEMBER_SLOTS } from "./power";
import type { HolomenMap } from "./score";

/**
 * **解析用 / production 未採用。** 表示スコアボーナスの 衣装 / ボード / パッシブ 欄を、編成全体の評価値 F の ON/OFF ではなく
 * **秒 × 発動候補（メンバー）単位**で source（青の発動頻度 Q / 発動率 R / パッシブのスコアサポート P / リーダー衣装 L /
 * 赤スコアサポート X）へ帰属させる候補ルールを並べて比較するハーネス。
 *
 * 材料（2026-09-13 時点）:
 * - 青なしの negative control K5（パッシブ支援なし）/ K6（恒常マリン 1凸 9% がフレアとの 2 人で成立）: リーダー 60% の増分は
 *   両方とも全量が衣装欄で、Δボード = Δパッシブ = 0。つまり L × P 単独の相互作用は 0 で、支援は乗算ではなく加算
 *   （up × (1 + L + X + P_i)）で合成される。
 * - 青あり K1〜K4: 総増分は S × E_blue(乗算)。衣装欄はそれより小さく、残りがボード / パッシブへ動く。
 *
 * 評価器は production と同じ 200 秒タイムライン・確率和の正規化 `max(1, Σp)`。青は乗算型 p（総量モデルと同じ）。
 * 自由係数・ケース別分岐は置かない。結果はテストに支持 / 反証として固定する。
 */

/** パッシブ支援の掛け方 */
export type PassiveMode =
  /** production と同じ: 供給側 j も発動候補の秒だけ、対象 i に S_ji × p_j を足す */
  | "gated"
  /** 対象 i に常に S_ji を足す（リーダー衣装と同じ静的な掛け方） */
  | "static";

export interface SourceConfig {
  /** 青の発動頻度 UP を候補窓に入れる */
  freq: boolean;
  /** 青の発動率 UP を確率に入れる（乗算型） */
  rate: boolean;
  passive: PassiveMode | "none";
  /** リーダー衣装のスコアサポート S%（環境の値を使うなら undefined、0 なら無効） */
  leaderPercent?: number;
  /** 赤スコアサポート X% */
  redPercent?: number;
  /** 支援 3 種の合成: 加算 (1 + L + X + P) / 乗算 (1 + L)(1 + X)(1 + P) */
  combine?: "additive" | "multiplicative";
}

export interface SourceEnvironment extends LeaderSupportEnvironment {
  onBase: (Uint8Array | null)[];
  onBlue: (Uint8Array | null)[];
  T: number;
}

export function buildSourceEnvironment(
  leader: Card,
  members: readonly Card[],
  holomenMap: HolomenMap,
  T: number = VIRTUAL_TIMELINE_SECONDS,
): SourceEnvironment {
  const env = buildLeaderSupportEnvironment(leader, members, holomenMap, T);
  return {
    ...env,
    onBase: env.views.map((v) => v.active?.onBase ?? null),
    onBlue: env.views.map((v) => v.active?.onBlue ?? null),
    T,
  };
}

/** 秒 s の候補集合と正規化分母 */
function maskAt(env: SourceEnvironment, s: number, freq: boolean): number {
  let mask = 0;
  const on = freq ? env.onBlue : env.onBase;
  for (let i = 0; i < env.views.length; i++) if (on[i]?.[s]) mask |= 1 << i;
  return mask;
}

function passiveMultiplier(
  env: SourceEnvironment,
  i: number,
  mask: number,
  p: Float64Array,
  mode: PassiveMode | "none",
): number {
  if (mode === "none") return 0;
  let sum = 0;
  for (let j = 0; j < env.views.length; j++) {
    const sj = env.supportMatrix[j * MEMBER_SLOTS + i] ?? 0;
    if (sj === 0) continue;
    if (mode === "static") sum += sj / 100;
    else if (mask & (1 << j)) sum += (sj * (p[j] ?? 0)) / 100;
  }
  return sum;
}

/** 秒 × 候補ごとの値（%・/T 済み）を返す。members[i][s] */
export function secondwiseValues(env: SourceEnvironment, config: SourceConfig): Float64Array[] {
  const n = env.views.length;
  const p = config.rate ? env.pBlue : env.p0;
  const L = (config.leaderPercent ?? env.supportPercent) / 100;
  const X = (config.redPercent ?? 0) / 100;
  const combine = config.combine ?? "additive";
  const out = Array.from({ length: n }, () => new Float64Array(env.T + 1));
  for (let s = 1; s <= env.T; s++) {
    const mask = maskAt(env, s, config.freq);
    if (mask === 0) continue;
    let den = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) den += p[i] ?? 0;
    const norm = den > 1 ? den : 1;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const P = passiveMultiplier(env, i, mask, p, config.passive);
      const mult = combine === "additive" ? 1 + L + X + P : (1 + L) * (1 + X) * (1 + P);
      const row = out[i];
      if (row) row[s] = ((env.ups[i] ?? 0) * (p[i] ?? 0) * mult) / norm / env.T;
    }
  }
  return out;
}

export function evaluateTotal(env: SourceEnvironment, config: SourceConfig): number {
  let total = 0;
  for (const row of secondwiseValues(env, config))
    for (let s = 1; s <= env.T; s++) total += row[s] ?? 0;
  return total;
}

export function evaluateMembers(env: SourceEnvironment, config: SourceConfig): number[] {
  return secondwiseValues(env, config).map((row) => {
    let t = 0;
    for (let s = 1; s <= env.T; s++) t += row[s] ?? 0;
    return t;
  });
}

/** 秒 × 候補単位の配賦ルール */
export type CandidateAttributionRule =
  /** 支援の増分はすべて自分の source へ（L → 衣装、X / 青 → ボード、P → パッシブ）。青と支援の相互作用は支援側へ */
  | "lastApplied"
  /** 青との相互作用（青の候補窓・確率で増えた支援ぶん）はボードへ。衣装 = S × E_base、パッシブ = 基準タイムラインの静的 P */
  | "interactionToBoard"
  /** 候補 i の基準窓（青の頻度 UP なしでも候補の秒）に載る支援は自分の source へ、頻度 UP で増えた秒に載る支援はボードへ */
  | "baseWindow"
  /** baseWindow に加え、発動率 UP で増えた確率ぶん（p_i − p0_i）の支援もボードへ */
  | "baseWindowP0"
  /** 発動率 UP ぶんだけボードへ（候補窓は青のまま） */
  | "p0Only";

export const CANDIDATE_RULES: readonly CandidateAttributionRule[] = [
  "lastApplied",
  "interactionToBoard",
  "baseWindow",
  "baseWindowP0",
  "p0Only",
];

export interface AttributedColumns {
  active: number;
  costume: number;
  board: number;
  passive: number;
  total: number;
}

export interface AttributionInput {
  passive: PassiveMode;
  leaderPercent?: number;
  redPercent?: number;
  rule: CandidateAttributionRule;
}

/**
 * 5 欄（黄・SP を除く）の raw を秒 × 候補単位で配賦する。
 * 総量は常に F(all) = Σ up p (1 + L + X + P) / norm（加算合成）で、配賦ルールは総量を変えない。
 */
export function attributeColumns(
  env: SourceEnvironment,
  input: AttributionInput,
): AttributedColumns {
  const n = env.views.length;
  const L = (input.leaderPercent ?? env.supportPercent) / 100;
  const X = (input.redPercent ?? 0) / 100;
  const base = secondwiseValues(env, {
    freq: false,
    rate: false,
    passive: "none",
    leaderPercent: 0,
  });
  let active = 0;
  for (const row of base) for (let s = 1; s <= env.T; s++) active += row[s] ?? 0;

  if (input.rule === "interactionToBoard") {
    // 衣装 = S × E_base、パッシブ = 基準タイムラインの P、赤 = X × E_base、残り（青 + 相互作用）はボード
    const basePassive =
      evaluateTotal(env, { freq: false, rate: false, passive: input.passive, leaderPercent: 0 }) -
      active;
    const total = evaluateTotal(env, {
      freq: true,
      rate: true,
      passive: input.passive,
      leaderPercent: L * 100,
      redPercent: X * 100,
    });
    const costume = L * active;
    const passive = basePassive;
    const board = total - active - costume - passive;
    return { active, costume, board, passive, total };
  }

  let costume = 0;
  let passive = 0;
  let total = 0;
  for (let s = 1; s <= env.T; s++) {
    const mask = maskAt(env, s, true);
    if (mask === 0) continue;
    let den = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) den += env.pBlue[i] ?? 0;
    const norm = den > 1 ? den : 1;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const pi = env.pBlue[i] ?? 0;
      const v = ((env.ups[i] ?? 0) * pi) / norm / env.T; // 支援なしの候補値（青込み）
      const P = passiveMultiplier(env, i, mask, env.pBlue, input.passive);
      const leaderPart = L * v;
      const passivePart = P * v;
      total += v + leaderPart + X * v + passivePart;
      // 自分の source に残す割合 share（残りはボードへ）
      let share = 1;
      const inBaseWindow = !!env.onBase[i]?.[s];
      const p0ratio = pi > 0 ? (env.p0[i] ?? 0) / pi : 1;
      if (input.rule === "baseWindow") share = inBaseWindow ? 1 : 0;
      else if (input.rule === "baseWindowP0") share = inBaseWindow ? p0ratio : 0;
      else if (input.rule === "p0Only") share = p0ratio;
      costume += leaderPart * share;
      passive += passivePart * share;
    }
  }
  // 赤・青の純増分（F_blue − F_base）・自分の source に残さなかった支援ぶんはすべてボードへ（総量保存）
  const board = total - active - costume - passive;
  return { active, costume, board, passive, total };
}

export interface ErrorStats {
  rmse: number;
  maxAbsError: number;
  bias: number;
}

export function sourceErrorStats(errors: readonly number[]): ErrorStats {
  if (errors.length === 0) return { rmse: 0, maxAbsError: 0, bias: 0 };
  return {
    rmse: Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length),
    maxAbsError: Math.max(...errors.map((e) => Math.abs(e))),
    bias: errors.reduce((s, e) => s + e, 0) / errors.length,
  };
}
