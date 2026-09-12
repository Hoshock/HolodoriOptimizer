import type { RedUnitEffects } from "../data/redBoard";
import { naturalStatsOf } from "../data/resolve";
import type {
  BuffSkillStructured,
  Card,
  CardType,
  ParamKind,
  SkillCondition,
  StatBlock,
} from "../data/types";
import type { HolomenMap, Unit } from "./score";
import { isConditionMet, PARAM_KINDS } from "./score";

/**
 * 総合力(ゲームのユニット編成画面に表示される「総合力」)の静的モデル。
 *
 * 2026-09-08 のユーザー実機観測(同じメンバー 5 枚でリーダーを 2 通り。内訳 6 項目とメンバー別の表示値)で確定・強く支持された構造:
 *
 *   総合力 = メンバーパラメータ + 衣装スキル + ホロメンボード効果 + パッシブスキル + メモリー効果 + メンバー強化ボーナス
 *
 * - 各項目は**別々に**計算して最後に加算する。「前の補正後の値に次の倍率を掛ける」連鎖乗算ではない(実機確定)
 * - 割合効果(衣装・パッシブ・赤ボードの %・メモリー)の基準は**素のメンバーパラメータ**(開花後・ボード前の本体値 =
 *   Card.naturalStats)。カード詳細画面の P/T/S(青・緑ボード込み)を基準にしない(実機確定: 衣装 +50% = 素値合計のほぼ 50%)
 * - メンバーパラメータ = 5 人の素値の合計。リーダー自身のパラメータは入らない(実機確定)
 * - ホロメンボード効果 = 青・緑による増分(カード詳細値 − 素値。実機で 171343 − 122533 = 48810 と一致)
 *   + リーダーの赤ボード(固定値 × 5 人 + 割合分。割合は同じパラメータの % を合算し、5 人の素値合計に掛けて切り上げ —
 *   41190 と完全一致した強い推定)
 * - パッシブ = 対象メンバー × 対象パラメータごとに ceil(素値 × %)(20340 と完全一致)。「◯◯2人の」は条件に合う
 *   メンバーのうち**素値合計(P + T + S)の上位 count 人**へ(自身を含む。2026-09-12 の水着フワワリーダーの実機 24,500 と
 *   編成順を入れ替えても 24,500 のままだったことと一致する強い推定。「対象パラメータが高い順」は 26,688、「編成順の先頭」は
 *   23,946 で否定。2026-09-08 までは 3 つの選び方が同じ集合になるケースしかなく区別できていなかった。「全員へ」は誤り)
 * - メモリー効果 = メンバー × パラメータごとに ceil(素値 × メモリー%)(7359 と完全一致)
 * - メンバー強化ボーナス = メンバーごとに ceil((素値 + ボード + 衣装 + パッシブ) × 強化%)。**メモリーは基準に含めない**
 *   (8709 / 7161 と一致。含めると大きく外れる)
 *
 * 端数処理の単位(どこで切り上げるか)は実機の内訳に最も合う仮説で、コード中に「仮説」と明記する。ゴールデンケースは
 * src/engine/power.test.ts。素の 0/1凸パラメータの復元(src/data/bloom.ts の ÷1.1)に ±1 の不確かさがあり、
 * 合計で 2 点ずれる(pending 7)。
 *
 * 2026-09-11 の実機観測(同じ 5 人・同じリーダー(水着ミオ)で曲だけを変え、赤の歌唱者条件を OFF / ON にした 2 点。
 * docs/ai/tmp/status.md「赤の歌唱者条件」)で追加で確定・判明したこと:
 * - 【実機で確定】歌唱者条件の「全員の P/T/S +10.0%」は**総合力のホロメンボード効果**に入り(90,130 → 102,381)、
 *   その増分は**メンバー強化ボーナスの基準にも入る**(8,787 → 9,154)。メンバーパラメータ・衣装・パッシブ・メモリーは不変。
 *   実装は redUnitEffects(singer = true)が割合を 13% → 23% に合算して同じ経路に流すだけで、式の追加はない
 * - 【既知のずれ】ボード効果の OFF → ON の増分は実機 +12,251 に対しこのモデル(パラメータ別の素値合計 × 23% と × 13% を
 *   それぞれ切り上げた差)は +12,253(+2)。素値の ±1 の不確かさ(pending 7)をどう振っても +12,252〜+12,255 で、
 *   +12,251 には届かない。単位(パラメータ合計 / メンバー / メンバー × パラメータ / 全体)× 丸め(切り上げ / 切り捨て /
 *   四捨五入)× 合算(23% で 1 回 / 13% と 10% を別々)の 24 通りのうち、2026-09-08 の 41,190・メンバー別表示値と
 *   この +12,251 をすべて満たすのは「メンバー × パラメータごとに四捨五入して 23% で 1 回」だけだった。ただし
 *   その候補は取りうる値の幅が 12 点と広く(当たりやすい)、根拠がこの 1 つの差分しかないので**採用しない** —
 *   式は変えず、差分 +2 をゴールデンの known diff として固定する。次の観測で 2 点目が出たら再判定する
 * - 【実機で確定(2026-09-11)】アカウントのメンバー強化ボーナスは 3.00%(ユーザー確認)。実機値(8,787 / 9,154、黄の観測の
 *   7,306)は基準(メモリー抜きの合計)の 3.00% にメンバーごとの切り上げで整合し、2026-09-08 時点の 2.96% では
 *   100〜120 点足りない — 内訳からの逆算とアカウント画面が一致した(status.md の「アカウント共通値」)
 *
 * この総合力は「ゲーム画面に表示される値の再現」が目的で、表示スコアボーナス(src/engine/displayScore.ts)とは別レイヤー。
 * 探索(src/engine/optimize.ts)の高速評価器も同じ関数(staticPowerTotals / passiveParamBonus)を使う。
 */

/** アカウント共通の補正(ゲーム内表示の % をそのまま。現在値は docs/ai/tmp/status.md) */
export interface AccountBonus {
  /** メモリーの「ユニットパラメータ +X%」 */
  memoryPercent: number;
  /** メンバー強化ボーナス +X% */
  enhancementPercent: number;
}

export const NO_ACCOUNT_BONUS: AccountBonus = { memoryPercent: 0, enhancementPercent: 0 };

export const MEMBER_SLOTS = 5;
export const PARAM_COUNT = 3;

export const TYPE_INDEX: Readonly<Record<CardType, number>> = { cute: 0, happy: 1, pure: 2 };

/**
 * ceil(value × percent / 100)。ゲームの割合効果の端数は切り上げ(青ボードの割合 UP で実測と整合し、
 * 総合力の内訳でも一致した)。浮動小数の誤差で整数がわずかに上振れして 1 多く切り上がるのを防ぐ
 */
export function ceilPercent(value: number, percent: number): number {
  if (percent === 0 || value === 0) return 0;
  return Math.ceil((value * percent) / 100 - 1e-6);
}

/** 条件の数値表現(0 = always / 1 = typeCount / 2 = affiliationCount。index は type / 所属の連番、-1 = 未知) */
export interface CompiledCondition {
  kind: 0 | 1 | 2;
  index: number;
  min: number;
}

/**
 * パラメータ UP 効果の数値表現。targetKind: 0 = 全員 / 1 = タイプ / 2 = 所属 / 3 = 自身。
 * count は「◯◯2人の」の人数(0 = 制限なし)。paramIndex は 0..2、-1 = 全パラメータ
 */
export interface CompiledParamEffect {
  targetKind: 0 | 1 | 2 | 3;
  targetIndex: number;
  count: number;
  paramIndex: number;
  percent: number;
}

/** 総合力の計算に必要なメンバー 1 人の数値表現(探索と詳細で共通) */
export interface MemberView {
  card: Card;
  /** 素値 [P, T, S] */
  natural: readonly [number, number, number];
  /** 青・緑ボードによる増分の合計(カード詳細値 − 素値) */
  boardDelta: number;
  typeIndex: number;
  affIndices: readonly number[];
  passiveCondition: CompiledCondition | null;
  passiveEffects: readonly CompiledParamEffect[];
  /** メモリー効果 Σ_p ceil(素値_p × メモリー%)(メンバーだけで決まるので前計算) */
  memorySum: number;
}

/** 所属 ID → 連番(条件・対象の判定を配列で行うため) */
export function buildAffIndex(holomenMap: HolomenMap): Map<string, number> {
  const affIndex = new Map<string, number>();
  for (const h of holomenMap.values()) {
    for (const a of h.affiliations) {
      if (!affIndex.has(a)) affIndex.set(a, affIndex.size);
    }
  }
  return affIndex;
}

export function compileCondition(
  condition: SkillCondition,
  affIndex: ReadonlyMap<string, number>,
): CompiledCondition {
  switch (condition.kind) {
    case "always":
      return { kind: 0, index: -1, min: 0 };
    case "typeCount":
      return { kind: 1, index: TYPE_INDEX[condition.type], min: condition.min };
    case "affiliationCount":
      return { kind: 2, index: affIndex.get(condition.affiliation) ?? -1, min: condition.min };
  }
}

export function paramIndexOf(param: ParamKind | "all"): number {
  return param === "all" ? -1 : PARAM_KINDS.indexOf(param);
}

/** 条件+効果型スキルの paramUp 効果だけを数値表現にする(scoreSupport は総合力の外) */
export function compileParamEffects(
  structured: BuffSkillStructured | null,
  affIndex: ReadonlyMap<string, number>,
): CompiledParamEffect[] {
  if (!structured) return [];
  const effects: CompiledParamEffect[] = [];
  for (const e of structured.effects) {
    if (e.kind !== "paramUp") continue;
    const target = e.target;
    effects.push({
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
      paramIndex: paramIndexOf(e.param),
      percent: e.percent,
    });
  }
  return effects;
}

/** メモリー効果(1 人分): パラメータごとに ceil(素値 × メモリー%) の合計(端数の単位は実機 7359 と一致した仮説) */
export function memoryEffectOf(
  natural: readonly [number, number, number],
  memoryPercent: number,
): number {
  return (
    ceilPercent(natural[0], memoryPercent) +
    ceilPercent(natural[1], memoryPercent) +
    ceilPercent(natural[2], memoryPercent)
  );
}

export function compileMember(
  card: Card,
  holomenMap: HolomenMap,
  affIndex: ReadonlyMap<string, number>,
  account: AccountBonus,
): MemberView {
  const n = naturalStatsOf(card);
  const natural: [number, number, number] = [n.performance, n.technique, n.sense];
  const boardDelta =
    card.stats.performance -
    n.performance +
    (card.stats.technique - n.technique) +
    (card.stats.sense - n.sense);
  const affiliations = holomenMap.get(card.holomenId)?.affiliations ?? [];
  const passive = card.passiveSkill.structured;
  return {
    card,
    natural,
    boardDelta,
    typeIndex: TYPE_INDEX[card.type],
    affIndices: affiliations.map((a) => affIndex.get(a) ?? -1).filter((i) => i >= 0),
    passiveCondition: passive ? compileCondition(passive.condition, affIndex) : null,
    passiveEffects: compileParamEffects(passive, affIndex),
    memorySum: memoryEffectOf(natural, account.memoryPercent),
  };
}

/** メンバー 5 人のタイプ別・所属別の人数で条件を判定する */
export function conditionMet(
  cond: CompiledCondition,
  typeCounts: ArrayLike<number>,
  affCounts: ArrayLike<number>,
): boolean {
  if (cond.kind === 0) return true;
  if (cond.index < 0) return false;
  const count = cond.kind === 1 ? (typeCounts[cond.index] ?? 0) : (affCounts[cond.index] ?? 0);
  return count >= cond.min;
}

function matchesEffect(e: CompiledParamEffect, target: MemberView, m: number, s: number): boolean {
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

/** 「◯◯2人の」の選択キー: 対象パラメータの素値(全パラメータなら 3 つの合計 — 複数パラメータのときの並べ方は未確認の仮説) */
function naturalSum(member: MemberView): number {
  return member.natural[0] + member.natural[1] + member.natural[2];
}

/**
 * メンバー 5 人のパッシブ(paramUp)の加算値を out[m × 3 + p] に書く(整数。呼び出し側で 0 に初期化しない — ここで埋める)。
 * 効果ごとに対象メンバーを選び、対象パラメータごとに ceil(素値 × %) を足す(効果同士は別々に切り上げる仮説)。
 * count つきの対象(「◯◯2人の」)は、条件に合うメンバーのうち**素値合計(P + T + S)の上位 count 人**(自身を含む。同値は編成順の先)。
 * 【強い推定(2026-09-12)】水着フワワリーダー(フワワ・おかゆ・ころね・みこ・ミオ)の実機パッシブ 24,500 は、
 * 「対象パラメータの上位 count 人」だと 26,688(+2,188)で合わず、みこの P 32% とミオの T 32% を素値合計上位 2 人のピュア
 * (ころね 25,920・フワワ 23,663)に当てるとちょうど一致する。編成順を みこ・ミオ・フワワ・おかゆ・ころね に入れ替えても
 * 実機は 24,500 のままなので「編成順の先頭 2 人」(23,946 になる)ではない。2026-09-08 のケース(20,340)は 3 つの選び方が同じ集合。
 * 表示側のスコアサポートの対象選択(displayScore.ts の addSupport)と同じ選び方
 * scratch は長さ MEMBER_SLOTS 以上の作業配列(探索中のアロケーション回避)
 */
export function passiveParamBonus(
  members: readonly MemberView[],
  typeCounts: ArrayLike<number>,
  affCounts: ArrayLike<number>,
  out: Float64Array,
  scratch: Int32Array,
): void {
  out.fill(0);
  for (let s = 0; s < members.length; s++) {
    const source = members[s];
    if (!source || source.passiveEffects.length === 0) continue;
    if (source.passiveCondition && !conditionMet(source.passiveCondition, typeCounts, affCounts)) {
      continue;
    }
    for (const e of source.passiveEffects) {
      // 候補を素値合計の降順で scratch に挿入する(n ≤ 5 なので挿入ソートで足りる。同値は編成順の先)
      let n = 0;
      for (let m = 0; m < members.length; m++) {
        const target = members[m];
        if (!target || !matchesEffect(e, target, m, s)) continue;
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
      const chosen = e.count > 0 ? Math.min(e.count, n) : n;
      for (let i = 0; i < chosen; i++) {
        const m = scratch[i] ?? 0;
        const target = members[m];
        if (!target) continue;
        if (e.paramIndex === -1) {
          for (let p = 0; p < PARAM_COUNT; p++) {
            out[m * PARAM_COUNT + p] =
              (out[m * PARAM_COUNT + p] ?? 0) + ceilPercent(target.natural[p] ?? 0, e.percent);
          }
        } else {
          out[m * PARAM_COUNT + e.paramIndex] =
            (out[m * PARAM_COUNT + e.paramIndex] ?? 0) +
            ceilPercent(target.natural[e.paramIndex] ?? 0, e.percent);
        }
      }
    }
  }
}

/** リーダーの衣装スキルの割合 [P, T, S](%)。同じパラメータへの複数効果は合算する(そういう衣装は未確認) */
export function costumePercentsOf(
  structured: BuffSkillStructured | null,
): [number, number, number] {
  const percents: [number, number, number] = [0, 0, 0];
  if (!structured) return percents;
  for (const e of structured.effects) {
    if (e.kind !== "paramUp") continue;
    const p = paramIndexOf(e.param);
    if (p === -1) {
      for (let i = 0; i < PARAM_COUNT; i++) percents[i] = (percents[i] ?? 0) + e.percent;
    } else {
      percents[p] = (percents[p] ?? 0) + e.percent;
    }
  }
  return percents;
}

/** 衣装スキル効果(1 人分): パラメータごとに ceil(素値 × %) の合計(端数の単位は仮説。パラメータ合計に 1 回だと 2 点ずれる) */
export function costumeEffectOf(
  natural: readonly [number, number, number],
  percents: readonly [number, number, number],
): number {
  return (
    ceilPercent(natural[0], percents[0]) +
    ceilPercent(natural[1], percents[1]) +
    ceilPercent(natural[2], percents[2])
  );
}

/** リーダーの赤ボードの数値表現(固定値・割合 [P, T, S]) */
export interface RedInputs {
  fixed: readonly [number, number, number];
  percent: readonly [number, number, number];
}

export function redInputsOf(red: RedUnitEffects | null | undefined): RedInputs | null {
  if (!red) return null;
  return {
    fixed: [red.fixed.performance, red.fixed.technique, red.fixed.sense],
    percent: [red.percent.performance, red.percent.technique, red.percent.sense],
  };
}

/** 総合力の内訳(ゲームの表示項目と同じ 6 項目 + ボードの青緑 / 赤の分解) */
export interface StaticPowerTotals {
  /** メンバー 5 人の素値の合計 */
  memberParameters: number;
  costumeEffect: number;
  /** 青・緑の増分 + 赤(固定値 + 割合) */
  boardEffect: number;
  blueGreenEffect: number;
  redEffect: number;
  passiveEffect: number;
  memoryEffect: number;
  memberEnhancementEffect: number;
  totalPower: number;
}

export function emptyTotals(): StaticPowerTotals {
  return {
    memberParameters: 0,
    costumeEffect: 0,
    boardEffect: 0,
    blueGreenEffect: 0,
    redEffect: 0,
    passiveEffect: 0,
    memoryEffect: 0,
    memberEnhancementEffect: 0,
    totalPower: 0,
  };
}

/**
 * 総合力の中核(探索と詳細で共通。アロケーションなし)。
 * - passiveBonus: passiveParamBonus の出力(15 要素)
 * - costumePerMember: メンバーごとの衣装スキル効果(costumeEffectOf。不発なら 0)
 * - red: リーダーの赤ボード(なければ null)。固定値は各メンバーに、割合は 5 人の素値合計に掛けて切り上げ(仮説)
 * - memberTotals を渡すとメンバーごとの合計(赤の割合分は小数のまま)も書く。ゲームの各メンバー下の表示値は
 *   これを四捨五入した値と ±1 で整合する
 */
export function staticPowerTotals(
  members: readonly MemberView[],
  passiveBonus: ArrayLike<number>,
  costumePerMember: ArrayLike<number>,
  red: RedInputs | null,
  enhancementPercent: number,
  out: StaticPowerTotals,
  memberTotals?: number[],
): void {
  let n0 = 0;
  let n1 = 0;
  let n2 = 0;
  let blueGreen = 0;
  let passive = 0;
  let memory = 0;
  for (let m = 0; m < members.length; m++) {
    const member = members[m];
    if (!member) continue;
    n0 += member.natural[0];
    n1 += member.natural[1];
    n2 += member.natural[2];
    blueGreen += member.boardDelta;
    memory += member.memorySum;
    for (let p = 0; p < PARAM_COUNT; p++) passive += passiveBonus[m * PARAM_COUNT + p] ?? 0;
  }
  const redFixedPerMember = red ? red.fixed[0] + red.fixed[1] + red.fixed[2] : 0;
  const redPercentTotal = red
    ? ceilPercent(n0, red.percent[0]) +
      ceilPercent(n1, red.percent[1]) +
      ceilPercent(n2, red.percent[2])
    : 0;
  let costume = 0;
  let enhancement = 0;
  for (let m = 0; m < members.length; m++) {
    const member = members[m];
    if (!member) continue;
    const c = costumePerMember[m] ?? 0;
    costume += c;
    let memberPassive = 0;
    for (let p = 0; p < PARAM_COUNT; p++) memberPassive += passiveBonus[m * PARAM_COUNT + p] ?? 0;
    // メンバーごとの赤の割合分は小数のまま(合計側はパラメータ合計で切り上げる)
    const memberRed = red
      ? redFixedPerMember +
        (member.natural[0] * red.percent[0] +
          member.natural[1] * red.percent[1] +
          member.natural[2] * red.percent[2]) /
          100
      : 0;
    const base =
      member.natural[0] +
      member.natural[1] +
      member.natural[2] +
      member.boardDelta +
      c +
      memberPassive +
      memberRed;
    // 強化ボーナスはメンバーごとに切り上げ、メモリーは基準に含めない(実機 8709 / 7161 と一致)
    const e = ceilPercent(base, enhancementPercent);
    enhancement += e;
    if (memberTotals) memberTotals[m] = base + member.memorySum + e;
  }
  out.memberParameters = n0 + n1 + n2;
  out.costumeEffect = costume;
  out.blueGreenEffect = blueGreen;
  out.redEffect = red ? redFixedPerMember * members.length + redPercentTotal : 0;
  out.boardEffect = out.blueGreenEffect + out.redEffect;
  out.passiveEffect = passive;
  out.memoryEffect = memory;
  out.memberEnhancementEffect = enhancement;
  out.totalPower =
    out.memberParameters +
    out.costumeEffect +
    out.boardEffect +
    out.passiveEffect +
    out.memoryEffect +
    out.memberEnhancementEffect;
}

/** メンバー 1 人分の内訳(パラメータ別。red の割合分と total は小数を含む) */
export interface MemberPowerBreakdown {
  card: Card;
  natural: StatBlock;
  /** 青・緑ボードの増分 */
  board: StatBlock;
  costume: StatBlock;
  passive: StatBlock;
  /** 赤ボード(固定値 + 割合分。割合分はこのメンバーの素値 × % で小数のまま) */
  red: StatBlock;
  memory: StatBlock;
  enhancement: number;
  /** ゲームの各メンバー下の表示値に相当(四捨五入前) */
  total: number;
}

export interface StaticPowerBreakdown extends StaticPowerTotals {
  members: MemberPowerBreakdown[];
  /** リーダーの衣装スキルが発動したか(paramUp がない衣装でも条件成立なら true) */
  costumeSkillActive: boolean;
  redApplied: boolean;
}

export interface StaticPowerOptions {
  /** リーダーのホロメンの赤ボード(なければ null) */
  red?: RedUnitEffects | null;
  account?: AccountBonus;
}

function statBlockOf(values: ArrayLike<number>, offset = 0): StatBlock {
  return {
    performance: values[offset] ?? 0,
    technique: values[offset + 1] ?? 0,
    sense: values[offset + 2] ?? 0,
  };
}

/** 総合力を内訳つきで計算する(上位候補の詳細表示・検算用。探索の高速評価器と同じ中核関数を通る) */
export function computeStaticPower(
  unit: Unit,
  holomenMap: HolomenMap,
  options: StaticPowerOptions = {},
): StaticPowerBreakdown {
  const account = options.account ?? NO_ACCOUNT_BONUS;
  const affIndex = buildAffIndex(holomenMap);
  const members = unit.members.map((c) => compileMember(c, holomenMap, affIndex, account));
  const typeCounts = new Int32Array(3);
  const affCounts = new Int32Array(affIndex.size);
  for (const m of members) {
    typeCounts[m.typeIndex] = (typeCounts[m.typeIndex] ?? 0) + 1;
    for (const a of m.affIndices) affCounts[a] = (affCounts[a] ?? 0) + 1;
  }
  const passiveBonus = new Float64Array(members.length * PARAM_COUNT);
  passiveParamBonus(members, typeCounts, affCounts, passiveBonus, new Int32Array(MEMBER_SLOTS));

  const costume = unit.leader.costumeSkill.structured;
  const costumeSkillActive =
    costume !== null && isConditionMet(costume.condition, unit.members, holomenMap);
  const percents = costumeSkillActive ? costumePercentsOf(costume) : ([0, 0, 0] as const);
  const costumePerMember = members.map((m) => costumeEffectOf(m.natural, percents));

  const red = redInputsOf(options.red);
  const totals = emptyTotals();
  const memberTotals: number[] = [];
  staticPowerTotals(
    members,
    passiveBonus,
    costumePerMember,
    red,
    account.enhancementPercent,
    totals,
    memberTotals,
  );

  const breakdownMembers: MemberPowerBreakdown[] = members.map((m, i) => {
    const costumeBlock: StatBlock = {
      performance: ceilPercent(m.natural[0], percents[0]),
      technique: ceilPercent(m.natural[1], percents[1]),
      sense: ceilPercent(m.natural[2], percents[2]),
    };
    const redBlock: StatBlock = red
      ? {
          performance: red.fixed[0] + (m.natural[0] * red.percent[0]) / 100,
          technique: red.fixed[1] + (m.natural[1] * red.percent[1]) / 100,
          sense: red.fixed[2] + (m.natural[2] * red.percent[2]) / 100,
        }
      : { performance: 0, technique: 0, sense: 0 };
    const stats = m.card.stats;
    const board: StatBlock = {
      performance: stats.performance - m.natural[0],
      technique: stats.technique - m.natural[1],
      sense: stats.sense - m.natural[2],
    };
    const memory: StatBlock = {
      performance: ceilPercent(m.natural[0], account.memoryPercent),
      technique: ceilPercent(m.natural[1], account.memoryPercent),
      sense: ceilPercent(m.natural[2], account.memoryPercent),
    };
    const passive = statBlockOf(passiveBonus, i * PARAM_COUNT);
    const total = memberTotals[i] ?? 0;
    const enhancement =
      total -
      (m.natural[0] +
        m.natural[1] +
        m.natural[2] +
        m.boardDelta +
        (costumePerMember[i] ?? 0) +
        passive.performance +
        passive.technique +
        passive.sense +
        redBlock.performance +
        redBlock.technique +
        redBlock.sense +
        m.memorySum);
    return {
      card: m.card,
      natural: statBlockOf(m.natural),
      board,
      costume: costumeBlock,
      passive,
      red: redBlock,
      memory,
      enhancement: Math.round(enhancement),
      total,
    };
  });

  return {
    ...totals,
    members: breakdownMembers,
    costumeSkillActive,
    redApplied: red !== null,
  };
}
