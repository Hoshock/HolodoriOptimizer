import type { Card } from "../data/types";
import { VIRTUAL_TIMELINE_SECONDS } from "./displayScore";
import type { CostumeEnvironment } from "./displayScoreCostumeExperimental";
import { buildCostumeEnvironment } from "./displayScoreCostumeExperimental";
import { MEMBER_SLOTS } from "./power";
import type { HolomenMap } from "./score";

/**
 * **解析用 / production 未採用。** リーダー衣装「全員のスコアサポート効果 S%」が表示スコアボーナスへ与える増分を、
 * 「総量」と「カテゴリ配賦」に分けて調べるハーネス。
 *
 * 材料は 2026-09-12 の Leader-only matched pairs（同じメンバー 5 人で、リーダーだけを 恒常みこ 0凸（支援 0%）→
 * 典獄クロニー 0凸（支援 60%）に替えた 5 組。赤 0・黄 0・曲指定なし）。
 *
 * - 総量: observedLeaderGain = Δ衣装 + Δボード + Δパッシブ（アクティブ / SP は不変）を、自由係数なしの
 *   `S/100 × E` （E = E_base / E_blue 加算型 / E_blue 乗算型）と比べる。赤の総量モデル（displayScoreExperimental.ts の
 *   `X/100 × E_blue(乗算)`）と同じ形なので、supportGain() は「支援 %」を引数に取る一般形にしてある。
 * - カテゴリ配賦: 衣装欄は `S/100 × E` の E をどう取っても K1〜K4 を説明しない（K5 = 青・パッシブ支援なしの clean control
 *   だけが `0.60 × E_base`）。ここでは候補として「条件つきスコア UP を master の基準値で評価した E」等を並べ、
 *   残差 `S/100 × E_blue(乗算) − 衣装候補` が Δボード + Δパッシブ を説明するかを測る。
 *
 * 自由係数・カード別分岐・ケース別定数は置かない。production の computeDisplayScoreBonus / attributeDisplaySupport /
 * blueActivationProbability / redScoreSupportDisplayGain には繋がない。
 */

/** 条件つきスコア UP の解決のしかた */
export type UpsResolution =
  /** production と同じ（編成条件は typeCounts / affCounts で判定、ライフ・コンボ条件は成立扱い） */
  | "resolved"
  /** 編成条件（タイプ人数・所属人数）だけを未解決にして基準値を使う。ライフ・コンボ条件は production と同じく成立扱い */
  | "deckUnresolved"
  /** すべての条件つきスコア UP を基準値にする */
  | "allUnresolved";

/** 青ボードの入れ方 */
export type BlueModel =
  /** 基準タイムライン・p0（= production のアクティブ欄の raw） */
  | "none"
  /** 青の頻度込みタイムライン + 加算型 p（production のボード換算） */
  | "additive"
  /** 青の頻度込みタイムライン + 乗算型 p（赤の総量モデルの E_blue） */
  | "multiplicative";

export interface LeaderSupportEnvironment extends CostumeEnvironment {
  /** 編成条件だけ未解決にしたスコア UP */
  deckUnresolvedUps: Float64Array;
  /** リーダーと同じホロメンのメンバー枠（構造仮説の材料。クロニーリーダーでは全 false） */
  sameHolomenAsLeader: boolean[];
}

export function buildLeaderSupportEnvironment(
  leader: Card,
  members: readonly Card[],
  holomenMap: HolomenMap,
  T: number = VIRTUAL_TIMELINE_SECONDS,
): LeaderSupportEnvironment {
  const env = buildCostumeEnvironment(leader, members, holomenMap, T);
  const deckUnresolvedUps = new Float64Array(MEMBER_SLOTS);
  env.views.forEach((v, i) => {
    const a = v.active;
    if (!a) return;
    // 編成条件（kind 1 / 2）は基準値、ライフ・コンボ（kind 3）は production と同じ成立扱い
    deckUnresolvedUps[i] =
      a.conditional && a.conditional.trigger.kind === 3 ? a.conditional.percent : a.scoreUpPercent;
  });
  return {
    ...env,
    deckUnresolvedUps,
    sameHolomenAsLeader: members.map((m) => m.holomenId === leader.holomenId),
  };
}

export interface ExpectedActiveOptions {
  ups?: UpsResolution;
  blue?: BlueModel;
  /** 評価から外すメンバー枠（構造仮説「リーダーと同じホロメンには効かない」等の確認用） */
  exclude?: readonly boolean[];
  /** パッシブのスコアサポート行列を入れる（供給側は production と同じ p0） */
  passiveSupport?: boolean;
  timelineSeconds?: number;
}

function upsOf(env: LeaderSupportEnvironment, kind: UpsResolution): Float64Array {
  if (kind === "resolved") return env.ups;
  if (kind === "deckUnresolved") return env.deckUnresolvedUps;
  return env.unconditionalUps;
}

/**
 * production のアクティブ評価器（200 秒・同時候補は Σ up p / max(1, Σ p)）で期待値 E を求める。
 * blue = none なら production のアクティブ欄の raw、multiplicative なら赤の総量モデルの E_blue と同じ値になる。
 */
export function expectedActive(
  env: LeaderSupportEnvironment,
  options: ExpectedActiveOptions = {},
): number {
  const T = options.timelineSeconds ?? VIRTUAL_TIMELINE_SECONDS;
  const blue = options.blue ?? "none";
  const ups = upsOf(env, options.ups ?? "resolved");
  const hist = blue === "none" ? env.histBase : env.histBlue;
  const p = blue === "none" ? env.p0 : blue === "additive" ? env.pBlueAdditive : env.pBlue;
  const exclude = options.exclude ?? null;
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
      if (exclude && exclude[i]) continue;
      let value = (ups[i] ?? 0) * pi;
      if (options.passiveSupport) {
        let mult = 1;
        for (let j = 0; j < n; j++) {
          if (!(mask & (1 << j))) continue;
          const sj = env.supportMatrix[j * MEMBER_SLOTS + i] ?? 0;
          if (sj !== 0) mult += (sj * (env.p0[j] ?? 0)) / 100;
        }
        value *= mult;
      }
      num += value;
    }
    total += (seconds * num) / (den > 1 ? den : 1);
  }
  return total / T;
}

/**
 * スコアサポート S% の総増分候補 `S/100 × E`。赤（X）でもリーダー衣装（S）でも同じ形。
 * blue = multiplicative が赤 13 対照で最有力（displayScoreExperimental.ts）。
 */
export function experimentalSupportGain(
  env: LeaderSupportEnvironment,
  supportPercent: number,
  blue: BlueModel,
): number {
  return (supportPercent / 100) * expectedActive(env, { blue });
}

/** 衣装欄の候補: `S/100 × E(ups, blue, exclude)`。S は環境の衣装支援（条件不成立なら 0） */
export function experimentalLeaderCostumeCandidate(
  env: LeaderSupportEnvironment,
  options: ExpectedActiveOptions = {},
): number {
  if (env.supportPercent === 0) return 0;
  return (env.supportPercent / 100) * expectedActive(env, options);
}

/**
 * パッシブ欄の増分候補: 支援 S% が、パッシブのスコアサポートによる期待値の増分（production の passive 欄と同じ形、
 * 供給側 p0）を S/100 倍する。青は総量モデルと同じ乗算型
 */
export function experimentalLeaderPassiveCandidate(
  env: LeaderSupportEnvironment,
  blue: BlueModel = "multiplicative",
): number {
  if (env.supportPercent === 0) return 0;
  const withSupport = expectedActive(env, { blue, passiveSupport: true });
  const without = expectedActive(env, { blue });
  return (env.supportPercent / 100) * (withSupport - without);
}

export interface LeaderSupportErrorStats {
  rmse: number;
  maxAbsError: number;
  bias: number;
}

export function leaderSupportErrorStats(errors: readonly number[]): LeaderSupportErrorStats {
  if (errors.length === 0) return { rmse: 0, maxAbsError: 0, bias: 0 };
  return {
    rmse: Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length),
    maxAbsError: Math.max(...errors.map((e) => Math.abs(e))),
    bias: errors.reduce((s, e) => s + e, 0) / errors.length,
  };
}
