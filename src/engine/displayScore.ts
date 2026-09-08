import { ACTIVE_PROBABILITY } from "../data/live";
import type { RedUnitEffects } from "../data/redBoard";
import { naturalStatsOf } from "../data/resolve";
import type { BuffTarget, Card, SkillCondition } from "../data/types";
import type { HolomenMap, Unit } from "./score";
import { isConditionMet, matchesTarget } from "./score";

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
 * 総合力(src/engine/power.ts)とは分離し、特定楽曲の期待スコア(src/engine/live.ts。探索の順位づけに使う)とも別モデル。
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

/** スコアサポート効果(%)をメンバーごとに集計する。source のスキルの効果を、対象 count 人(素値合計の高い順)に足す */
function addSupport(
  into: number[],
  members: Card[],
  source: Card,
  target: BuffTarget,
  percent: number,
  holomenMap: HolomenMap,
): void {
  const candidates = members
    .map((m, i) => ({ i, key: sumOf(m) }))
    .filter(({ i }) => {
      const m = members[i];
      return m !== undefined && matchesTarget(target, m, source, holomenMap);
    })
    .sort((a, b) => b.key - a.key);
  const count = (target.kind === "type" || target.kind === "affiliation") && target.count;
  const chosen = count ? candidates.slice(0, count) : candidates;
  for (const { i } of chosen) into[i] = (into[i] ?? 0) + percent;
}

function sumOf(card: Card): number {
  const n = naturalStatsOf(card);
  return n.performance + n.technique + n.sense;
}

export interface DisplayScoreOptions {
  /** リーダーのホロメンの赤ボード(スコアサポート効果を使う)。なければ null */
  red?: RedUnitEffects | null;
  timelineSeconds?: number;
}

/** メニュー画面のスコアボーナス 4 項目とユニットスコアを試算する */
export function computeDisplayScoreBonus(
  unit: Unit,
  holomenMap: HolomenMap,
  totalPower: number,
  options: DisplayScoreOptions = {},
): DisplayScoreBreakdown {
  const T = options.timelineSeconds ?? VIRTUAL_TIMELINE_SECONDS;
  const { leader, members } = unit;

  // 1. 基準のアクティブ寄与と、青ボードを掛けた寄与(メンバーごと、%)
  const raw: number[] = [];
  const withBlue: number[] = [];
  for (const m of members) {
    const a = m.activeSkill.structured;
    if (!a || a.scoreUpPercent === null || a.durationSeconds === null) {
      raw.push(0);
      withBlue.push(0);
      continue;
    }
    const rate0 = ACTIVE_PROBABILITY[a.probability];
    raw.push(
      (a.scoreUpPercent * activeCoverageSeconds(a.intervalSeconds, a.durationSeconds, rate0, T)) /
        T,
    );
    const board = m.boardLive;
    const rate1 = Math.min(1, rate0 * (1 + (board?.activeRatePercent ?? 0) / 100));
    const interval1 = a.intervalSeconds / (1 + (board?.activeFrequencyPercent ?? 0) / 100);
    withBlue.push(
      (a.scoreUpPercent * activeCoverageSeconds(interval1, a.durationSeconds, rate1, T)) / T,
    );
  }

  // 2. スコアサポート効果(%)をメンバーごとに集計: パッシブ(メンバー)・衣装(リーダー)・赤(リーダーのボード)
  const skillSupport: number[] = members.map(() => 0);
  for (const source of members) {
    const s = source.passiveSkill.structured;
    if (!s || !isConditionMet(s.condition, members, holomenMap)) continue;
    for (const e of s.effects) {
      if (e.kind !== "scoreSupport") continue;
      const cond: SkillCondition = e.condition ?? s.condition;
      if (!isConditionMet(cond, members, holomenMap)) continue;
      addSupport(skillSupport, members, source, e.target, e.percent, holomenMap);
    }
  }
  const costume = leader.costumeSkill.structured;
  if (costume) {
    for (const e of costume.effects) {
      if (e.kind !== "scoreSupport") continue;
      const cond: SkillCondition = e.condition ?? costume.condition;
      if (!isConditionMet(cond, members, holomenMap)) continue;
      addSupport(skillSupport, members, leader, e.target, e.percent, holomenMap);
    }
  }
  const redSupport = options.red?.scoreSupportPercent ?? 0;

  // 3. 配賦: 基準 → 青 → スキルのスコアサポート → 赤のスコアサポート
  let active = 0;
  let blueTotal = 0;
  let skillTotal = 0;
  let finalTotal = 0;
  members.forEach((_, i) => {
    const r = raw[i] ?? 0;
    const b = withBlue[i] ?? 0;
    const s = b * (1 + (skillSupport[i] ?? 0) / 100);
    active += r;
    blueTotal += b;
    skillTotal += s;
    finalTotal += s * (1 + redSupport / 100);
  });
  const board = blueTotal - active + (finalTotal - skillTotal);
  const passive = skillTotal - blueTotal;

  // 4. スペシャルスキル(1 曲 1 回発動の仮定)
  let special = 0;
  for (const m of members) {
    const s = m.specialSkill.structured;
    if (!s || s.scoreSupportPercent === null || s.durationSeconds === null) continue;
    special += (s.scoreSupportPercent * Math.min(s.durationSeconds, T)) / T;
  }

  const total = active + board + passive + special;
  return {
    active,
    board,
    passive,
    special,
    total,
    unitScore: totalPower * (1 + total / 100) * DISPLAY_UNIT_SCORE_FACTOR,
  };
}
