import type { RedUnitEffects } from "../data/redBoard";
import type { BuffSkillStructured, Card, SkillTrigger } from "../data/types";
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
 * ゲームのユニット編成画面に表示されるスコアボーナスとユニットスコアの試算モデル。
 *
 * 現在の確定事項・強い推定・棄却済み仮説は docs/human/display-score.md を正典とする。
 * このファイルには実装上の近似が残る。特に redScoreSupportDisplayGain の
 * `X × 基準候補秒 / T` は追加実測で一般式として反証済みであり、ゲーム内部式とみなさない。
 * Golden の実機観測値をこの近似へ合わせて変更しない。
 */

/**
 * アクティブスキルの発動確率段階の実数値。この表示スコアボーナスのモデル専用に持つ。
 *
 * 高 55% / 中 46% / 低 37% は 2 つの独立した根拠が一致している値:
 * (1) 2026-09-08 の実機のユニットスコア詳細「アクティブスキル」欄 8 形成(63.7〜78.4%)を下のタイムラインで
 *     ±0.1 pt に再現する(55 / 45 / 35 だと 0.4 pt 低い)。
 * (2) コミュニティが公開しているマスターデータでも同じ 3 値(‰ 単位の整数 370 / 460 / 550)【外部情報】。
 * ゲーム内に数値表示がないので実機確認はできず、確定扱いにはしない(game-facts.md)。ただし「カードの基礎発動率が
 * この 3 値である」ことと「表示スコアボーナスの評価式がこの値をどう扱うか」は別問題で、後者は未解明のまま。
 *
 * unknown: 0.46 は確率がデータ未整備のカード用のフォールバック(medium と同じ値にしてある)で、外部情報にある値ではない。
 * 将来の実ライブスコアのエンジン(未実装)が同じ値になる保証はないため、共有の置き場には置かない(2026-09-09)
 */
export const ACTIVE_PROBABILITY: Record<"low" | "medium" | "high" | "unknown", number> = {
  low: 0.37,
  medium: 0.46,
  high: 0.55,
  unknown: 0.46,
};

/** メニュー画面のスコアボーナスが前提にする仮想タイムライン(秒) */
export const VIRTUAL_TIMELINE_SECONDS = 200;
/** ユニットスコア = ceil(総合力 × (1 + スコアボーナス/100) × この係数)。実機 20 ケースで一致 */
export const DISPLAY_UNIT_SCORE_FACTOR = 2.03734;
/** SP 欄のスコアサポート部分の分母(120 秒 × 100%) */
export const SP_SUPPORT_DIVISOR = 12000;
/** SP 欄のスキル発動率 UP 部分の分母(秒)。実測に最も合った値で意味は未確定 */
export const SP_RATE_SECONDS = 100;
/**
 * 青補正前タイムラインで候補が1人以上いる秒数。
 * 旧赤スコアサポート近似の入力として残す実装ヘルパーで、ゲーム仕様の量とは確定していない。
 */
export function baseCandidateSeconds(
  histBase: Float64Array,
  T: number = VIRTUAL_TIMELINE_SECONDS,
): number {
  return T - (histBase[0] ?? 0);
}

/**
 * 赤スコアサポートの現行近似。`X × 基準候補秒 / T` は追加実測で一般式として反証済み。
 * 実装互換のため残しているだけで、ゲーム内部式・強い仮説として引用しない。
 */
export function redScoreSupportDisplayGain(
  redSupportPercent: number,
  candidateSeconds: number,
  T: number = VIRTUAL_TIMELINE_SECONDS,
): number {
  return (redSupportPercent * candidateSeconds) / T;
}

/**
 * ゲームのユニット編成画面に出るスコアボーナスの内訳。**実機の表示 4 欄**に合わせた形で、
 * サーバー側の算出カテゴリ(アクティブ / リーダー(衣装) / パッシブ / スキルツリー / スペシャルの 5 つ【外部情報】)
 * とは一致しない — board / passive はタイムラインの差分で配賦した近似(ファイル冒頭の仮説)。
 * 実機 20 ケースでは衣装(リーダー)由来のスコアボーナスが 0 だったので、5 つ目の欄は観測できていない。
 */
export interface DisplayScoreBreakdown {
  /** アクティブスキル欄(%。青ボードなしの基準値) */
  active: number;
  /**
   * ホロメンボード効果欄(%。青ボード + 旧近似による赤スコアサポート増分。実機ではその一部がパッシブ欄に
   * 入るが配賦の式は未解明なのでツールは全部ここに入れる)。曲を選んでいれば
   * **黄ボードの楽曲スコアボーナスの増分もここに入る**(2026-09-11 実機確定。songBoardRaw)
   */
  board: number;
  /** パッシブスキル欄(%。パッシブ・衣装のスコアサポートによる増分。実機では赤スコアサポートでも動くが式は未解明) */
  passive: number;
  /** スペシャルスキル欄(%) */
  special: number;
  /** 表示 4 欄を小数 1 桁に丸めて加算した合計(%。ゲーム内表示と同じ) */
  total: number;
  /** ユニットスコア(試算) = ceil(総合力 × (1 + total/100) × DISPLAY_UNIT_SCORE_FACTOR)。曲を選んでいれば黄込み */
  unitScore: number;
  /**
   * board / total / unitScore に組み込んだ黄ボードの楽曲スコアボーナス(比。0.1 = +10%)。曲未選択・黄なしは 0。
   * 順位づけでこの値をもう一度掛けてはいけない(黄はすでに unitScore に入っている)
   */
  songBonus: number;
}

/** 表示の小数 1 桁への丸め(まだ整数化規則が分かっていない欄と、合計の浮動小数の整形に使う) */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 2 進小数の誤差で 76.9 を 77.0 に切り上げてしまうのを防ぐガード。表示の 0.1 pt より 8 桁小さく、
 * 実機値へ寄せるための補正ではない(ケース別の補正・magic constant は入れない — game-facts.md)
 */
const SCORE_BONUS_PERMIL_EPSILON = 1e-9;

/**
 * スコアボーナス欄の permil(0.1% 単位)への整数化【アクティブ欄は実機 20 ケースで確定】。
 * サーバー応答はカテゴリごとに permil の整数を返す【外部情報】。実機 20 ケースのアクティブ欄は
 * 四捨五入だと 15/20 しか一致しないのに、0.1% 単位の切り上げなら **20/20 完全一致**する
 * (SP 欄も 10/20 → 15/20。ボード欄・パッシブ欄は生の式自体が未解明なのでどちらの規則でも一致しない)。
 * 総合力・ユニットスコア・パラメータの丸めには流用しない — スコアボーナス欄専用(ADR-004 / ADR-006)。
 */
export function toScoreBonusPermil(rawPercent: number): number {
  const permil = Math.ceil(rawPercent * 10 - SCORE_BONUS_PERMIL_EPSILON);
  return permil === 0 ? 0 : permil; // 0 のとき Math.ceil が返す -0 をそろえる
}
/** permil 整数 → 表示の % */
export function fromScoreBonusPermil(permil: number): number {
  return permil / 10;
}
/** 生の % を permil 整数化した表示値(%) */
export function scoreBonusPercent(rawPercent: number): number {
  return fromScoreBonusPermil(toScoreBonusPermil(rawPercent));
}

/** ユニットスコア(試算) = ceil(総合力 × (1 + スコアボーナス/100) × 係数) */
export function displayUnitScore(totalPower: number, bonusTotalPercent: number): number {
  return Math.ceil(totalPower * (1 + bonusTotalPercent / 100) * DISPLAY_UNIT_SCORE_FACTOR - 1e-6);
}

/** 表示に丸める前のスコアボーナス 4 欄の raw 値(%) */
export interface RawScoreBonus {
  active: number;
  board: number;
  passive: number;
  special: number;
}

/**
 * 曲を選んだときのホロメンボード効果欄の raw 値(%)【2026-09-11 実機 8 点(黄 0〜10%)で強い推定】。
 *
 *   ボード欄(黄込み) = ボード欄 + 黄 × (100 + アクティブ + パッシブ + SP)
 *
 * 黄はボード欄以外を変えない(総合力・アクティブ・パッシブ・SP は黄 0% と 10% で同じ値 — 実機確定)。
 * 4 欄とも**表示に丸める前の raw 値**を渡すこと: 表示済みの 77.0 / 14.2 / 2.3 / 46.0 から計算すると 9.86% で
 * 実機(36.4)と丸め境界が合わず 36.5 になる。raw の区間(切り上げ前の値は表示値より小さい)の中には 8 点すべてを
 * 再現する値があり、テストで固定している(src/engine/displayScore.test.ts「黄ボードの適用位置」)。
 * この関数は黄の増分の形だけを持ち、ボード欄・パッシブ欄そのものの算出式(pending 12)には触れない
 */
export function songBoardRaw(raw: RawScoreBonus, songBonus: number): number {
  return raw.board + songBonus * (100 + raw.active + raw.passive + raw.special);
}

/** 追加条件の数値表現。kind 3 = ライフ・コンボ(満たされているとみなす) */
export interface CompiledTrigger {
  kind: 0 | 1 | 2 | 3;
  index: number;
  min: number;
}

export function compileTrigger(
  trigger: SkillTrigger,
  affIndex: ReadonlyMap<string, number>,
): CompiledTrigger {
  if (trigger.kind === "life" || trigger.kind === "combo") return { kind: 3, index: -1, min: 0 };
  return compileCondition(trigger, affIndex);
}

export function triggerMet(
  t: CompiledTrigger,
  typeCounts: ArrayLike<number>,
  affCounts: ArrayLike<number>,
): boolean {
  if (t.kind === 3) return true;
  return conditionMet(t as CompiledCondition, typeCounts, affCounts);
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

/** アクティブスキルの数値表現 */
export interface CompiledActive {
  intervalSeconds: number;
  durationSeconds: number;
  /** 発動確率(基準) */
  p0: number;
  /** 青ボードの発動率 UP を加算した確率(上限 1) */
  pBlue: number;
  scoreUpPercent: number;
  /** 条件つきスコア UP(条件成立時に scoreUpPercent をこの値に置き換える) */
  conditional: { trigger: CompiledTrigger; percent: number } | null;
  /** 基準の周期での発動候補の秒(添字 1..T。0 番は未使用) */
  onBase: Uint8Array;
  /** 青ボードの発動頻度 UP を掛けた周期での発動候補の秒 */
  onBlue: Uint8Array;
  /** 上限枝刈り用: 正規化なしの寄与(%) Σ_s onBase × p0 × up / T */
  linearRaw: number;
  /** 上限枝刈り用: 青込み・正規化なしの寄与(%) */
  linearBlue: number;
}

/** SP の数値表現 */
export interface CompiledSpecial {
  durationSeconds: number;
  scoreSupportPercent: number;
  rate: { trigger: CompiledTrigger; percent: number } | null;
}

/** 表示スコアボーナスの計算に必要なメンバー 1 人の数値表現(探索と詳細で共通) */
export interface DisplayMemberView extends MemberView {
  active: CompiledActive | null;
  special: CompiledSpecial | null;
  /** パッシブのスコアサポート効果(スキル全体の条件は passiveCondition) */
  supportEffects: readonly CompiledSupportEffect[];
}

/**
 * 青ボードの「発動率 +r%」を発動確率に反映する【仮説】。現在は確率に r ポイントを加算(上限 1)。
 * マスの効果種別が「発動確率 UP(‰ 加算)」であること自体は外部情報で分かっているが、表示スコアボーナスの
 * ホロメンボード効果欄がそれをどう換算するかは未解明。実機では発動率の効きがこのモデルより弱い
 * (フブキの発動率 33% → 15% で実機のボード欄は −0.4 pt なのにモデルは約 −1.2 pt 下がる — status.md の 9.14 / 9.16)。
 * p0 × (1 + r/100) の乗算型は局所的な実験や外部の実装が支持するが、ゴールデン 20 ケース全体に当てると
 * 悪化するケースがあるので採用しない(実ライブ中の発動確率への適用と、この画面の欄の算出を同一視しない)。
 * 頻度を変えずに発動率だけを変えた実機 2 点(ボードの連結性の制約で作りにくい)が出るまで式は変えない — pending 12
 */
export function blueActivationProbability(baseProbability: number, rateUpPercent: number): number {
  return Math.min(1, baseProbability + rateUpPercent / 100);
}

/**
 * 青ボードの「発動頻度 +f%」を発動周期に反映する【仮説】。現在は周期 ÷ (1 + f/100)。
 * マスの効果種別が「クールタイム短縮(‰)」であることは外部情報で分かっており、表示文も
 * 「アクティブスキル発動頻度が X%UP」なので方向は確かだが、表示スコアボーナス評価時の刻み(tick)・量子化・
 * サーバー側の換算は未解明。実機のボード欄は頻度 0 → 4 → 8 → 12% で 4.6 → 4.7 → 4.4 → 5.0 と単調でなく
 * (status.md の 9.13〜9.15 と 2026-09-09 追加の 12%)、この連続時間の式では再現できない。
 * 丸めや tick の入った式を推測で採用しない — pending 12
 */
export function blueActivationInterval(baseInterval: number, frequencyUpPercent: number): number {
  return baseInterval / (1 + frequencyUpPercent / 100);
}

/** 発動候補の秒を印す(k × 周期 ≤ s < k × 周期 + 効果時間、k ≥ 1、s = 1..T) */
export function activeSeconds(
  intervalSeconds: number,
  durationSeconds: number,
  T: number = VIRTUAL_TIMELINE_SECONDS,
): Uint8Array {
  const on = new Uint8Array(T + 1);
  if (intervalSeconds <= 0 || durationSeconds <= 0) return on;
  for (let k = 1; k * intervalSeconds <= T + 1e-9; k++) {
    const start = k * intervalSeconds;
    for (let s = Math.ceil(start - 1e-9); s <= T && s < start + durationSeconds - 1e-9; s++) {
      if (s >= 1) on[s] = 1;
    }
  }
  return on;
}

function countOn(on: Uint8Array): number {
  let n = 0;
  for (let s = 1; s < on.length; s++) n += on[s] ?? 0;
  return n;
}

export function compileDisplayMember(
  card: Card,
  holomenMap: HolomenMap,
  affIndex: ReadonlyMap<string, number>,
  account: AccountBonus = NO_ACCOUNT_BONUS,
  T: number = VIRTUAL_TIMELINE_SECONDS,
): DisplayMemberView {
  let active: CompiledActive | null = null;
  const a = card.activeSkill.structured;
  if (a && a.scoreUpPercent !== null && a.durationSeconds !== null) {
    const p0 = ACTIVE_PROBABILITY[a.probability];
    const board = card.boardLive;
    const pBlue = blueActivationProbability(p0, board?.activeRatePercent ?? 0);
    const intervalBlue = blueActivationInterval(
      a.intervalSeconds,
      board?.activeFrequencyPercent ?? 0,
    );
    const onBase = activeSeconds(a.intervalSeconds, a.durationSeconds, T);
    const onBlue = activeSeconds(intervalBlue, a.durationSeconds, T);
    const upMax = Math.max(a.scoreUpPercent, a.conditionalScoreUp?.percent ?? 0);
    active = {
      intervalSeconds: a.intervalSeconds,
      durationSeconds: a.durationSeconds,
      p0,
      pBlue,
      scoreUpPercent: a.scoreUpPercent,
      conditional: a.conditionalScoreUp
        ? {
            trigger: compileTrigger(a.conditionalScoreUp.condition, affIndex),
            percent: a.conditionalScoreUp.percent,
          }
        : null,
      onBase,
      onBlue,
      linearRaw: (countOn(onBase) * p0 * upMax) / T,
      linearBlue: (countOn(onBlue) * pBlue * upMax) / T,
    };
  }
  let special: CompiledSpecial | null = null;
  const s = card.specialSkill.structured;
  if (s && s.scoreSupportPercent !== null && s.durationSeconds !== null) {
    special = {
      durationSeconds: s.durationSeconds,
      scoreSupportPercent: s.scoreSupportPercent,
      rate: s.skillRateUp
        ? {
            trigger: compileTrigger(s.skillRateUp.condition, affIndex),
            percent: s.skillRateUp.percent,
          }
        : null,
    };
  }
  return {
    ...compileMember(card, holomenMap, affIndex, account),
    active,
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
 * スコアサポート効果(%)を対象メンバーに足す。対象のうち素値合計が高い順に count 人(0 = 全員。仮説)。
 * 総合力のパッシブ(paramUp)も 2026-09-12 に同じ「素値合計の上位 count 人」が実機と一致した(power.ts の passiveParamBonus。
 * 「編成順の先頭」にすると 9.13〜9.17 のパッシブ欄が実機から遠のき、総合力側も編成順の入替で否定された)
 * matrix なら S[source × MEMBER_SLOTS + target] に、そうでなければ out[target] に足す。sourceIndex はリーダーの衣装なら -1
 */
function addSupport(
  members: readonly MemberView[],
  effect: CompiledParamEffect,
  sourceIndex: number,
  out: Float64Array,
  matrix: boolean,
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
    const idx = matrix ? sourceIndex * MEMBER_SLOTS + m : m;
    out[idx] = (out[idx] ?? 0) + effect.percent;
  }
}

/** 探索中の再利用のための作業領域 */
export interface DisplayScratch {
  ups: Float64Array;
  p: Float64Array;
  /** S[j × MEMBER_SLOTS + i] = メンバー j がメンバー i に与えるスコアサポート(%) */
  supportMatrix: Float64Array;
  /** リーダーの衣装のスコアサポート(%。メンバーごと) */
  costumeSupport: Float64Array;
  staticMult: Float64Array;
  order: Int32Array;
  /** 発動候補の組合せ(ビットマスク)ごとの秒数。基準の周期 / 青ボードの周期 */
  histBase: Float64Array;
  histBlue: Float64Array;
}

const MASK_COUNT = 1 << MEMBER_SLOTS;

export function createDisplayScratch(): DisplayScratch {
  return {
    ups: new Float64Array(MEMBER_SLOTS),
    p: new Float64Array(MEMBER_SLOTS),
    supportMatrix: new Float64Array(MEMBER_SLOTS * MEMBER_SLOTS),
    costumeSupport: new Float64Array(MEMBER_SLOTS),
    staticMult: new Float64Array(MEMBER_SLOTS),
    order: new Int32Array(MEMBER_SLOTS),
    histBase: new Float64Array(MASK_COUNT),
    histBlue: new Float64Array(MASK_COUNT),
  };
}

/**
 * 各秒の「発動候補のメンバーの組合せ」をビットマスクにし、組合せごとの秒数を数える。
 * タイムラインの期待値は組合せごとの値 × 秒数の和で求まる(秒ごとに計算するより 30 倍ほど速い。結果は同じ)
 */
export function buildHistogram(
  members: readonly DisplayMemberView[],
  useBlue: boolean,
  out: Float64Array,
  T: number = VIRTUAL_TIMELINE_SECONDS,
): void {
  out.fill(0);
  // 各メンバーの発動候補の配列を先に取り出す(ホットループで optional chaining を避ける)
  const n = members.length;
  const ons: (Uint8Array | null)[] = [];
  for (let i = 0; i < n; i++) {
    const a = members[i]?.active;
    ons.push(a ? (useBlue ? a.onBlue : a.onBase) : null);
  }
  const o0 = ons[0] ?? null;
  const o1 = ons[1] ?? null;
  const o2 = ons[2] ?? null;
  const o3 = ons[3] ?? null;
  const o4 = ons[4] ?? null;
  for (let s = 1; s <= T; s++) {
    let mask = 0;
    if (o0 && o0[s]) mask |= 1;
    if (o1 && o1[s]) mask |= 2;
    if (o2 && o2[s]) mask |= 4;
    if (o3 && o3[s]) mask |= 8;
    if (o4 && o4[s]) mask |= 16;
    out[mask] = (out[mask] ?? 0) + 1;
  }
}

/** 秒ごとの組合せ(ビットマスク)の配列から組合せごとの秒数を数える(探索が増分で維持する配列用) */
export function histogramFromMasks(
  masks: Uint8Array,
  out: Float64Array,
  T: number = VIRTUAL_TIMELINE_SECONDS,
): void {
  out.fill(0);
  for (let s = 1; s <= T; s++) {
    const mask = masks[s] ?? 0;
    out[mask] = (out[mask] ?? 0) + 1;
  }
}

/**
 * 組合せごとの秒数から 5 人共通タイムラインの期待スコア UP(%)を求める。
 * - p: メンバーごとの発動確率(useBlue に応じた値、または SP の発動率 UP で置き換えた値)
 * - supportMatrix: 供給側 j も発動候補のとき、対象 i のスコア UP を (1 + S_ji × p0_j / 100) 倍
 * - staticMult: メンバーごとの常時倍率(衣装のスコアサポート)
 */
export function histogramScore(
  hist: Float64Array,
  members: readonly DisplayMemberView[],
  ups: ArrayLike<number>,
  p: ArrayLike<number>,
  supportMatrix: ArrayLike<number> | null,
  staticMult: ArrayLike<number> | null,
  T: number = VIRTUAL_TIMELINE_SECONDS,
): number {
  const n = members.length;
  let total = 0;
  if (!supportMatrix && !staticMult) {
    // 高速経路(探索の大半): 組合せごとに Σ up × p と Σ p だけ
    for (let mask = 1; mask < MASK_COUNT; mask++) {
      const seconds = hist[mask] ?? 0;
      if (seconds === 0) continue;
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        if (!(mask & (1 << i))) continue;
        const pi = p[i] ?? 0;
        den += pi;
        num += (ups[i] ?? 0) * pi;
      }
      total += (seconds * num) / (den > 1 ? den : 1);
    }
    return total / T;
  }
  for (let mask = 1; mask < MASK_COUNT; mask++) {
    const seconds = hist[mask] ?? 0;
    if (seconds === 0) continue;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const pi = p[i] ?? 0;
      den += pi;
      let value = (ups[i] ?? 0) * pi;
      if (supportMatrix) {
        let mult = 1;
        for (let j = 0; j < n; j++) {
          if (!(mask & (1 << j))) continue;
          const sj = supportMatrix[j * MEMBER_SLOTS + i] ?? 0;
          if (sj !== 0) mult += (sj * (members[j]?.active?.p0 ?? 0)) / 100;
        }
        value *= mult;
      }
      if (staticMult) value *= staticMult[i] ?? 1;
      num += value;
    }
    total += (seconds * num) / (den > 1 ? den : 1);
  }
  return total / T;
}

/** 秒ごとに評価する参照実装(histogramScore と同じ値になることをテストで確認する) */
export function timelineScore(
  members: readonly DisplayMemberView[],
  ups: ArrayLike<number>,
  useBlue: boolean,
  pOverride: ArrayLike<number> | null,
  supportMatrix: ArrayLike<number> | null,
  staticMult: ArrayLike<number> | null,
  T: number = VIRTUAL_TIMELINE_SECONDS,
): number {
  const hist = new Float64Array(MASK_COUNT);
  buildHistogram(members, useBlue, hist, T);
  const p = new Float64Array(MEMBER_SLOTS);
  members.forEach((m, i) => {
    const a = m.active;
    p[i] = pOverride ? (pOverride[i] ?? 0) : a ? (useBlue ? a.pBlue : a.p0) : 0;
  });
  return histogramScore(hist, members, ups, p, supportMatrix, staticMult, T);
}

/** メンバー 5 人だけで決まる部分(リーダーに依存しない) */
export interface DisplayMemberPart {
  /** アクティブ欄(基準タイムライン) */
  active: number;
  /** 青込みタイムライン */
  blue: number;
  /** 青 + パッシブのスコアサポート込みタイムライン */
  withPassive: number;
  /** SP 欄 */
  special: number;
  /** 基準タイムラインで発動候補が 1 人以上いる秒数(赤スコアサポートの換算に使う — baseCandidateSeconds) */
  baseCandidateSeconds: number;
}

/**
 * 段階 1: 条件つきスコア UP を解決し、基準タイムラインからアクティブ欄と SP 欄を出す(scratch.ups / histBase を埋める)。
 * 探索はこの後に上限で枝刈りしてから段階 2・3 へ進む(青・スコアサポートの評価を省く)
 */
export function prepareBase(
  members: readonly DisplayMemberView[],
  typeCounts: ArrayLike<number>,
  affCounts: ArrayLike<number>,
  scratch: DisplayScratch,
  out: DisplayMemberPart,
  T: number = VIRTUAL_TIMELINE_SECONDS,
  /** 探索が増分で維持している秒ごとの組合せ(基準)。渡されればヒストグラムをここから数える */
  baseMasks?: Uint8Array,
): void {
  const n = members.length;
  for (let i = 0; i < n; i++) {
    const a = members[i]?.active;
    scratch.ups[i] = a
      ? a.conditional && triggerMet(a.conditional.trigger, typeCounts, affCounts)
        ? a.conditional.percent
        : a.scoreUpPercent
      : 0;
  }
  if (baseMasks) histogramFromMasks(baseMasks, scratch.histBase, T);
  else buildHistogram(members, false, scratch.histBase, T);
  out.baseCandidateSeconds = baseCandidateSeconds(scratch.histBase, T);
  for (let i = 0; i < n; i++) scratch.p[i] = members[i]?.active?.p0 ?? 0;
  const active = histogramScore(scratch.histBase, members, scratch.ups, scratch.p, null, null, T);
  out.active = active;
  // SP: スコアサポート部分 + スキル発動率 UP 部分(青ボードなしの基準タイムラインで)。
  // 発動率 UP の値が同じ SP は同じタイムラインなので 1 回だけ評価する
  let special = 0;
  let lastRate = -1;
  let lastBoost = 0;
  for (let i = 0; i < n; i++) {
    const sp = members[i]?.special;
    if (!sp) continue;
    special += (active * sp.scoreSupportPercent * sp.durationSeconds) / SP_SUPPORT_DIVISOR;
    if (sp.rate && triggerMet(sp.rate.trigger, typeCounts, affCounts)) {
      if (sp.rate.percent !== lastRate) {
        for (let j = 0; j < n; j++) {
          const aj = members[j]?.active;
          scratch.p[j] = aj ? Math.min(1, aj.p0 + sp.rate.percent / 100) : 0;
        }
        lastBoost =
          histogramScore(scratch.histBase, members, scratch.ups, scratch.p, null, null, T) - active;
        lastRate = sp.rate.percent;
      }
      special += (sp.durationSeconds / SP_RATE_SECONDS) * lastBoost;
    }
  }
  out.special = special;
}

/** 段階 2: 青ボード込みタイムライン(scratch.histBlue / p を埋める。prepareBase の後に呼ぶ) */
export function prepareBlue(
  members: readonly DisplayMemberView[],
  scratch: DisplayScratch,
  out: DisplayMemberPart,
  T: number = VIRTUAL_TIMELINE_SECONDS,
  blueMasks?: Uint8Array,
): void {
  if (blueMasks) histogramFromMasks(blueMasks, scratch.histBlue, T);
  else buildHistogram(members, true, scratch.histBlue, T);
  for (let i = 0; i < members.length; i++) scratch.p[i] = members[i]?.active?.pBlue ?? 0;
  out.blue = histogramScore(scratch.histBlue, members, scratch.ups, scratch.p, null, null, T);
}

/** 段階 3: パッシブのスコアサポートを足したタイムライン(scratch.supportMatrix を埋める。prepareBlue の後に呼ぶ) */
export function preparePassive(
  members: readonly DisplayMemberView[],
  typeCounts: ArrayLike<number>,
  affCounts: ArrayLike<number>,
  scratch: DisplayScratch,
  out: DisplayMemberPart,
  T: number = VIRTUAL_TIMELINE_SECONDS,
): void {
  const n = members.length;
  scratch.supportMatrix.fill(0);
  let anySupport = false;
  for (let j = 0; j < n; j++) {
    const source = members[j];
    if (!source || source.supportEffects.length === 0) continue;
    if (source.passiveCondition && !conditionMet(source.passiveCondition, typeCounts, affCounts)) {
      continue;
    }
    for (const e of source.supportEffects) {
      if (e.condition && !conditionMet(e.condition, typeCounts, affCounts)) continue;
      addSupport(members, e.target, j, scratch.supportMatrix, true, scratch.order);
      anySupport = true;
    }
  }
  for (let i = 0; i < n; i++) scratch.p[i] = members[i]?.active?.pBlue ?? 0;
  out.withPassive = anySupport
    ? histogramScore(
        scratch.histBlue,
        members,
        scratch.ups,
        scratch.p,
        scratch.supportMatrix,
        null,
        T,
      )
    : out.blue;
}

/** 3 段階をまとめて評価する(詳細表示用) */
export function prepareDisplay(
  members: readonly DisplayMemberView[],
  typeCounts: ArrayLike<number>,
  affCounts: ArrayLike<number>,
  scratch: DisplayScratch,
  out: DisplayMemberPart,
  T: number = VIRTUAL_TIMELINE_SECONDS,
  masks?: { base: Uint8Array; blue: Uint8Array },
): void {
  prepareBase(members, typeCounts, affCounts, scratch, out, T, masks?.base);
  prepareBlue(members, scratch, out, T, masks?.blue);
  preparePassive(members, typeCounts, affCounts, scratch, out, T);
}

/**
 * 3 本のタイムライン(基準 / 青込み / スコアサポート込み)と赤スコアサポートの増分から、表示のボード欄・パッシブ欄への
 * 配賦を決める【配賦は仮説】。ボード欄 = 青込み − 基準 + 赤の増分(X × 基準候補秒 / T — redScoreSupportDisplayGain)、
 * パッシブ欄 = サポート込み − 青込み。
 *
 * 合計に足す赤の増分は実機 3 編成 + X = 24 で支持される強い仮説(ファイル冒頭)。それを**どう 2 欄に分けるか**は未解明で、
 * 実機では パッシブ欄も動く(R-002 +10 で 旧編成 ボード +8.4 / パッシブ +0.4・ノエル編成 +8.0 / +0.5・フワワ編成 +8.4 / +0.3、
 * 歌唱者条件 +24 で ボード +20.9 / パッシブ +0.2)。パッシブ側の増分は X に比例せず頭打ちするので、X に比例して配る形はどれも合わず、ここでは
 * 全部ボード欄に入れる(合計とユニットスコアは実機と量子化の範囲で一致し、2 欄の内訳が ±0.5 程度ずれる既知のずれ)。
 * サーバー側はカテゴリごとに独立した値を返す【外部情報】ので、この差分による配賦は**ゲーム内部の式ではなく、算出式が
 * 不明なあいだの近似**である — pending 12
 */
export function attributeDisplaySupport(
  part: DisplayMemberPart,
  withCostume: number,
  redSupportPercent: number,
  T: number = VIRTUAL_TIMELINE_SECONDS,
): { board: number; passive: number } {
  return {
    board:
      part.blue -
      part.active +
      redScoreSupportDisplayGain(redSupportPercent, part.baseCandidateSeconds, T),
    passive: withCostume - part.blue,
  };
}

/**
 * リーダー側(衣装のスコアサポート・赤の全員のスコアサポート)と、曲を選んでいれば黄ボードの楽曲スコアボーナス
 * (songBonus。比。ボード欄の raw に足す — songBoardRaw)を足して表示 4 欄にする
 */
export function finishDisplay(
  members: readonly DisplayMemberView[],
  part: DisplayMemberPart,
  typeCounts: ArrayLike<number>,
  affCounts: ArrayLike<number>,
  costumeCondition: CompiledCondition | null,
  costumeSupport: readonly CompiledSupportEffect[],
  redSupportPercent: number,
  songBonus: number,
  scratch: DisplayScratch,
  out: { active: number; board: number; passive: number; special: number; total: number },
  T: number = VIRTUAL_TIMELINE_SECONDS,
): void {
  let withCostume = part.withPassive;
  if (costumeSupport.length > 0) {
    scratch.costumeSupport.fill(0);
    let any = false;
    for (const e of costumeSupport) {
      const cond = e.condition ?? costumeCondition;
      if (cond && !conditionMet(cond, typeCounts, affCounts)) continue;
      addSupport(members, e.target, -1, scratch.costumeSupport, false, scratch.order);
      any = true;
    }
    if (any) {
      for (let i = 0; i < MEMBER_SLOTS; i++) {
        scratch.staticMult[i] = 1 + (scratch.costumeSupport[i] ?? 0) / 100;
      }
      for (let i = 0; i < MEMBER_SLOTS; i++) scratch.p[i] = members[i]?.active?.pBlue ?? 0;
      withCostume = histogramScore(
        scratch.histBlue,
        members,
        scratch.ups,
        scratch.p,
        scratch.supportMatrix,
        scratch.staticMult,
        T,
      );
    }
  }
  const { board, passive } = attributeDisplaySupport(part, withCostume, redSupportPercent, T);
  // 黄ボードの楽曲スコアボーナスは、**量子化の前に** raw のボード欄へ足す(2026-09-11 実機確定: 黄はボード欄だけを
  // 増やし、表示済みの値からでは 9.86% の丸め境界が合わない)。黄 0 なら従来と同じ値
  const boardWithSong =
    songBonus === 0
      ? board
      : songBoardRaw({ active: part.active, board, passive, special: part.special }, songBonus);
  // 各欄はサーバーが返す permil 整数に合わせて整数化した「表示値」を入れる。アクティブ欄と SP 欄は
  // 0.1% 単位の切り上げ(実機 20 ケースで検証済み)、生の式が未解明のボード欄・パッシブ欄は従来の
  // 四捨五入のまま置く — 切り上げに変えても実機と一致せず(0/20)、合計の誤差が増えるだけなので、
  // 式が解けるまで規則を確定させない(pending 12。黄込みのボード欄も同じ規則で、黄 8 点はどちらの規則とも整合する)
  out.active = scoreBonusPercent(part.active);
  out.board = round1(boardWithSong);
  out.passive = round1(passive);
  out.special = scoreBonusPercent(part.special);
  out.total = round1(out.active + out.board + out.passive + out.special);
}

export interface DisplayScoreOptions {
  /** リーダーのホロメンの赤ボード(スコアサポート効果を使う)。なければ null */
  red?: RedUnitEffects | null;
  /**
   * 曲を選んだときの黄ボードの楽曲スコアボーナス(比。0.1 = +10%。上限 10.0% は src/data/yellowBoard.ts が掛ける)。
   * ホロメンボード効果欄の raw に組み込む(2026-09-11 実機確定)。曲未選択・黄なしは省略(0)
   */
  songBonus?: number;
  timelineSeconds?: number;
}

/**
 * メニュー画面のスコアボーナス 4 欄とユニットスコアを試算する(探索と同じ中核関数を通る)。
 * options.songBonus を渡すと「曲を選んだときのユニットスコア」(黄込み)になる
 */
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
  const scratch = createDisplayScratch();
  const part: DisplayMemberPart = {
    active: 0,
    blue: 0,
    withPassive: 0,
    special: 0,
    baseCandidateSeconds: 0,
  };
  prepareDisplay(members, typeCounts, affCounts, scratch, part, T);
  const costume = unit.leader.costumeSkill.structured;
  const out = { active: 0, board: 0, passive: 0, special: 0, total: 0 };
  const songBonus = options.songBonus ?? 0;
  finishDisplay(
    members,
    part,
    typeCounts,
    affCounts,
    costume ? compileCondition(costume.condition, affIndex) : null,
    compileSupportEffects(costume, affIndex),
    options.red?.scoreSupportPercent ?? 0,
    songBonus,
    scratch,
    out,
    T,
  );
  return { ...out, unitScore: displayUnitScore(totalPower, out.total), songBonus };
}
