import { ACTIVE_PROBABILITY } from "../data/live";
import type { RedUnitEffects } from "../data/redBoard";
import type { BuffSkillStructured, Card } from "../data/types";
import type { AccountBonus, CompiledCondition, CompiledParamEffect, MemberView } from "./power";
import {
  buildAffIndex,
  compileCondition,
  compileMember,
  conditionMet,
  MEMBER_SLOTS,
  NO_ACCOUNT_BONUS,
  TYPE_INDEX,
} from "./power";
import type { HolomenMap, Unit } from "./score";

/**
 * ゲームのユニット編成画面(メニュー)に表示される「スコアボーナス」と「ユニットスコア」の試算モデル。
 *
 *   ユニットスコア = 総合力 × (1 + スコアボーナス / 100) × DISPLAY_UNIT_SCORE_FACTOR
 *   スコアボーナス = アクティブスキル + ホロメンボード効果 + パッシブスキル + スペシャルスキル
 *
 * 4 項目の加算と「ユニットスコア ∝ (1 + スコアボーナス)」は 2026-09-08 の実機で確定。項目の中身は
 * 引き継ぎメモ(別エージェント)の仮定をそのまま実装したもので、実機とはずれる(ゴールデンは src/engine/displayScore.test.ts
 * に「どの項目が何点ずれるか」を明記。ユーザー指示 2026-09-08「多少ズレてもいいから別エージェントが言ってた仮定で実装して」):
 *
 * - 曲は選ばれていないので約 200 秒の仮想タイムライン(コミュニティ解析の報告)で、アクティブは周期ごとの時刻
 *   (周期, 2 × 周期, ...)に発動確率で発動し、効果時間(タイムラインの終端で打ち切り)だけスコア UP が乗る。
 *   寄与(%) = スコア UP% × 期待カバー秒 / 200。ライフ等の追加条件は評価しない(構造化された基本値を使う)
 * - 発動確率の段階は 高 55% / 中 45% / 低 35%(src/data/live.ts と共通の仮定値)
 * - **アクティブスキル欄** = 青ボードなしの基準値(実機で青を変えても 77.0 のまま — 確定)
 * - 青ボード: 発動率 +r% は確率 × (1 + r/100)(上限 1)、発動頻度 +f% は周期 ÷ (1 + f/100)。青を掛けた寄与と基準値の差を
 *   **ホロメンボード効果欄**に配賦する
 * - スコアサポート効果 X% は、その対象メンバーのアクティブ寄与に (1 + X/100) を掛ける(引き継ぎの「Active ScoreUp × ScoreSupport」
 *   の最も単純な形)。パッシブ・衣装のスコアサポートによる増分を**パッシブスキル欄**に、リーダーの赤ボード「全員のスコアサポート
 *   効果」による増分をホロメンボード効果欄に配賦する。「◯◯2人の」は対象のうち素値合計が高い順に count 人(仮説)
 * - **スペシャルスキル欄** = Σ メンバーの SP のスコアサポート効果% × 効果時間 / 200(1 曲 1 回発動の仮定。実機 46.0 との
 *   ずれが最も大きい — 式は未確定)
 * - リーダー枠のアクティブ・SP・パッシブは数えない。黄ボードは曲を選ぶ画面でだけ効くので入れない
 *
 * 総合力(src/engine/power.ts)とは分離する。探索(src/engine/optimize.ts)は同じ中核関数(compileDisplayMember /
 * supportPercents / displayBonusTotal)でこのユニットスコアを順位づけの値にする(2026-09-08 ユーザー指示「結果の値は最終的な
 * ユニットスコア値に」)。特定楽曲の期待スコア(src/engine/live.ts)は別モデルとして残す。
 */

/** メニュー画面のスコアボーナスが前提にする仮想タイムライン(秒)。コミュニティ解析の報告値で実機未確認 */
export const VIRTUAL_TIMELINE_SECONDS = 200;

/**
 * ユニットスコア = 総合力 × (1 + スコアボーナス/100) × この係数。実機 4 例(1660900 / 1245189 / 1231609 / 1231087)から
 * 逆算するとほぼ一定(引き継ぎメモ)。桁・最終の丸めは未確定
 */
export const DISPLAY_UNIT_SCORE_FACTOR = 2.03734;

export interface DisplayScoreBreakdown {
  /** アクティブスキル欄(%。青ボードなしの基準値) */
  active: number;
  /** ホロメンボード効果欄(%。青ボード + 赤のスコアサポートによる増分) */
  board: number;
  /** パッシブスキル欄(%。パッシブ・衣装のスコアサポートによる増分) */
  passive: number;
  /** スペシャルスキル欄(%) */
  special: number;
  /** 4 項目の合計(%) */
  total: number;
  /** ユニットスコア(試算) = 総合力 × (1 + total/100) × DISPLAY_UNIT_SCORE_FACTOR */
  unitScore: number;
}

/**
 * 周期ごとに発動確率で発動するアクティブスキルの期待カバー秒。発動時刻は 周期, 2 × 周期, ... ≤ T で、
 * 効果は T で打ち切る(重複はしない — 周期 ≥ 効果時間のカードしかない)
 */
export function activeCoverageSeconds(
  intervalSeconds: number,
  durationSeconds: number,
  rate: number,
  timelineSeconds: number = VIRTUAL_TIMELINE_SECONDS,
): number {
  if (intervalSeconds <= 0 || durationSeconds <= 0 || rate <= 0) return 0;
  let covered = 0;
  for (let t = intervalSeconds; t <= timelineSeconds + 1e-9; t += intervalSeconds) {
    covered += Math.min(durationSeconds, timelineSeconds - t);
  }
  return covered * rate;
}

/** スコアサポート効果の数値表現(対象の絞り込みは CompiledParamEffect と同じ。condition は効果側の上書き、null ならスキル全体の条件) */
export interface CompiledSupportEffect {
  target: CompiledParamEffect;
  condition: CompiledCondition | null;
}

/** 条件+効果型スキル(パッシブ・衣装)のスコアサポート効果だけを数値表現にする */
export function compileSupportEffects(
  structured: BuffSkillStructured | null,
  affIndex: ReadonlyMap<string, number>,
): CompiledSupportEffect[] {
  if (!structured) return [];
  const effects: CompiledSupportEffect[] = [];
  for (const e of structured.effects) {
    if (e.kind !== "scoreSupport") continue;
    const target = e.target;
    effects.push({
      target: {
        targetKind:
          target.kind === "all"
            ? 0
            : target.kind === "type"
              ? 1
              : target.kind === "affiliation"
                ? 2
                : 3,
        targetIndex:
          target.kind === "type"
            ? TYPE_INDEX[target.type]
            : target.kind === "affiliation"
              ? (affIndex.get(target.affiliation) ?? -1)
              : -1,
        count:
          (target.kind === "type" || target.kind === "affiliation") && target.count
            ? target.count
            : 0,
        paramIndex: -1,
        percent: e.percent,
      },
      condition: e.condition ? compileCondition(e.condition, affIndex) : null,
    });
  }
  return effects;
}

/** 表示スコアボーナスの計算に必要なメンバー 1 人の数値表現(探索と詳細で共通) */
export interface DisplayMemberView extends MemberView {
  /** 青ボードなしのアクティブ寄与(%) */
  rawActive: number;
  /** 青ボード(boardLive)を掛けたアクティブ寄与(%) */
  blueActive: number;
  /** SP のスコアサポート効果% × 効果時間 / T */
  special: number;
  /** パッシブのスコアサポート効果(スキル全体の条件は passiveCondition) */
  supportEffects: readonly CompiledSupportEffect[];
}

export function compileDisplayMember(
  card: Card,
  holomenMap: HolomenMap,
  affIndex: ReadonlyMap<string, number>,
  account: AccountBonus = NO_ACCOUNT_BONUS,
  timelineSeconds: number = VIRTUAL_TIMELINE_SECONDS,
): DisplayMemberView {
  const T = timelineSeconds;
  let rawActive = 0;
  let blueActive = 0;
  const a = card.activeSkill.structured;
  if (a && a.scoreUpPercent !== null && a.durationSeconds !== null) {
    const rate0 = ACTIVE_PROBABILITY[a.probability];
    rawActive =
      (a.scoreUpPercent * activeCoverageSeconds(a.intervalSeconds, a.durationSeconds, rate0, T)) /
      T;
    const board = card.boardLive;
    const rate1 = Math.min(1, rate0 * (1 + (board?.activeRatePercent ?? 0) / 100));
    const interval1 = a.intervalSeconds / (1 + (board?.activeFrequencyPercent ?? 0) / 100);
    blueActive =
      (a.scoreUpPercent * activeCoverageSeconds(interval1, a.durationSeconds, rate1, T)) / T;
  }
  let special = 0;
  const s = card.specialSkill.structured;
  if (s && s.scoreSupportPercent !== null && s.durationSeconds !== null) {
    special = (s.scoreSupportPercent * Math.min(s.durationSeconds, T)) / T;
  }
  return {
    ...compileMember(card, holomenMap, affIndex, account),
    rawActive,
    blueActive,
    special,
    supportEffects: compileSupportEffects(card.passiveSkill.structured, affIndex),
  };
}

function matchesTarget(e: CompiledParamEffect, target: MemberView, m: number, s: number): boolean {
  switch (e.targetKind) {
    case 0:
      return true;
    case 1:
      return target.typeIndex === e.targetIndex;
    case 2:
      return target.affIndices.includes(e.targetIndex);
    case 3:
      return m === s;
  }
}

function naturalSum(member: MemberView): number {
  return member.natural[0] + member.natural[1] + member.natural[2];
}

/**
 * スコアサポート効果(%)を out[m] に足す。効果の対象メンバーのうち素値合計が高い順に count 人(0 = 全員)。
 * sourceIndex は効果を持つメンバーの枠(自身対象の判定用。リーダーの衣装は -1)
 */
export function addSupportPercent(
  members: readonly MemberView[],
  effect: CompiledParamEffect,
  sourceIndex: number,
  out: Float64Array,
  scratch: Int32Array,
): void {
  let n = 0;
  for (let m = 0; m < members.length; m++) {
    const target = members[m];
    if (!target || !matchesTarget(effect, target, m, sourceIndex)) continue;
    const key = naturalSum(target);
    let i = n;
    while (i > 0) {
      const prev = members[scratch[i - 1] ?? 0];
      if (!prev || naturalSum(prev) >= key) break;
      scratch[i] = scratch[i - 1] ?? 0;
      i--;
    }
    scratch[i] = m;
    n++;
  }
  const chosen = effect.count > 0 ? Math.min(effect.count, n) : n;
  for (let i = 0; i < chosen; i++) {
    const m = scratch[i] ?? 0;
    out[m] = (out[m] ?? 0) + effect.percent;
  }
}

/** メンバー 5 人のパッシブのスコアサポート効果(%)を out[m] に書く(0 で初期化してから足す) */
export function passiveSupportPercents(
  members: readonly DisplayMemberView[],
  typeCounts: ArrayLike<number>,
  affCounts: ArrayLike<number>,
  out: Float64Array,
  scratch: Int32Array,
): void {
  out.fill(0);
  for (let s = 0; s < members.length; s++) {
    const source = members[s];
    if (!source || source.supportEffects.length === 0) continue;
    if (source.passiveCondition && !conditionMet(source.passiveCondition, typeCounts, affCounts)) {
      continue;
    }
    for (const e of source.supportEffects) {
      if (e.condition && !conditionMet(e.condition, typeCounts, affCounts)) continue;
      addSupportPercent(members, e.target, s, out, scratch);
    }
  }
}

/** リーダーの衣装スキルのスコアサポート効果(%)を out[m] に足す(条件はスキル全体 → 効果側の上書きの順に判定) */
export function addCostumeSupportPercents(
  members: readonly MemberView[],
  costumeCondition: CompiledCondition | null,
  effects: readonly CompiledSupportEffect[],
  typeCounts: ArrayLike<number>,
  affCounts: ArrayLike<number>,
  out: Float64Array,
  scratch: Int32Array,
): void {
  for (const e of effects) {
    const cond = e.condition ?? costumeCondition;
    if (cond && !conditionMet(cond, typeCounts, affCounts)) continue;
    addSupportPercent(members, e.target, -1, out, scratch);
  }
}

/**
 * スコアボーナス合計(%) = Σ_m 青込みアクティブ寄与 × (1 + スキルのスコアサポート/100) × (1 + 赤のスコアサポート/100) + Σ SP。
 * (4 項目の配賦は合計に影響しない。探索の順位づけはこの合計だけを使う)
 */
export function displayBonusTotal(
  members: readonly DisplayMemberView[],
  supportPercents: ArrayLike<number>,
  redSupportPercent: number,
): number {
  let total = 0;
  const redMul = 1 + redSupportPercent / 100;
  for (let m = 0; m < members.length; m++) {
    const member = members[m];
    if (!member) continue;
    total += member.blueActive * (1 + (supportPercents[m] ?? 0) / 100) * redMul + member.special;
  }
  return total;
}

/** ユニットスコア(試算) = 総合力 × (1 + スコアボーナス/100) × 係数 */
export function displayUnitScore(totalPower: number, bonusTotalPercent: number): number {
  return totalPower * (1 + bonusTotalPercent / 100) * DISPLAY_UNIT_SCORE_FACTOR;
}

export interface DisplayScoreOptions {
  /** リーダーのホロメンの赤ボード(スコアサポート効果を使う)。なければ null */
  red?: RedUnitEffects | null;
  timelineSeconds?: number;
}

/** メニュー画面のスコアボーナス 4 項目とユニットスコアを試算する(探索と同じ中核関数を通る) */
export function computeDisplayScoreBonus(
  unit: Unit,
  holomenMap: HolomenMap,
  totalPower: number,
  options: DisplayScoreOptions = {},
): DisplayScoreBreakdown {
  const T = options.timelineSeconds ?? VIRTUAL_TIMELINE_SECONDS;
  const affIndex = buildAffIndex(holomenMap);
  const members = unit.members.map((c) =>
    compileDisplayMember(c, holomenMap, affIndex, NO_ACCOUNT_BONUS, T),
  );
  const typeCounts = new Int32Array(3);
  const affCounts = new Int32Array(affIndex.size);
  for (const m of members) {
    typeCounts[m.typeIndex] = (typeCounts[m.typeIndex] ?? 0) + 1;
    for (const a of m.affIndices) affCounts[a] = (affCounts[a] ?? 0) + 1;
  }
  const scratch = new Int32Array(MEMBER_SLOTS);
  const support = new Float64Array(members.length);
  passiveSupportPercents(members, typeCounts, affCounts, support, scratch);
  const costume = unit.leader.costumeSkill.structured;
  addCostumeSupportPercents(
    members,
    costume ? compileCondition(costume.condition, affIndex) : null,
    compileSupportEffects(costume, affIndex),
    typeCounts,
    affCounts,
    support,
    scratch,
  );
  const redSupport = options.red?.scoreSupportPercent ?? 0;

  // 配賦: 基準 → 青 → スキルのスコアサポート → 赤のスコアサポート
  let active = 0;
  let blueTotal = 0;
  let skillTotal = 0;
  let finalTotal = 0;
  let special = 0;
  members.forEach((m, i) => {
    const s = m.blueActive * (1 + (support[i] ?? 0) / 100);
    active += m.rawActive;
    blueTotal += m.blueActive;
    skillTotal += s;
    finalTotal += s * (1 + redSupport / 100);
    special += m.special;
  });
  const board = blueTotal - active + (finalTotal - skillTotal);
  const passive = skillTotal - blueTotal;
  const total = displayBonusTotal(members, support, redSupport);
  return {
    active,
    board,
    passive,
    special,
    total,
    unitScore: displayUnitScore(totalPower, total),
  };
}
