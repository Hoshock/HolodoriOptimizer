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
 * 表示 5 欄は「source ごとの増分の和(総量)」と「source ごとの raw weight による配分(projective)」の
 * 2 レイヤーで作る(`attributeDisplaySupport`)。総量は強い推定だが、青ボードの raw weight `W_blue` の
 * 決定式は未確定で、ここでは member-local 型を使う既知の近似 — pending.md「W_blue の決定式」。
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
 * ゲームのユニット編成画面に出るスコアボーナスの内訳。実機は **5 カテゴリ**(衣装 / アクティブ / ホロメンボード /
 * パッシブ / SP。2026-09-12 に衣装欄を実機で観測 — docs/human/display-score.md)で、0 の欄は表示上省略されることがある。
 * costume / board / passive は source ごとの増分の和を source ごとの raw weight で配分した値
 * (`attributeDisplaySupport`)。総量は強い推定、配賦の比も支持されているが、`W_blue` の決定式は未確定。
 */
export interface DisplayScoreBreakdown {
  /** 衣装スキル欄(%)。リーダー衣装の「全員のスコアサポート効果 X%」由来。衣装にスコアサポートがなければ 0 */
  costume: number;
  /** アクティブスキル欄(%。青ボードなしの基準値) */
  active: number;
  /**
   * ホロメンボード効果欄(%)。青ボードと赤スコアサポートの raw weight のぶん。曲を選んでいれば
   * **黄ボードの楽曲スコアボーナスの増分もここに入る**(2026-09-11 実機確定。songBoardRaw)
   */
  board: number;
  /** パッシブスキル欄(%)。パッシブのスコアサポートの raw weight のぶん */
  passive: number;
  /** スペシャルスキル欄(%) */
  special: number;
  /** 表示 5 欄を小数 1 桁に丸めて加算した合計(%。ゲーム内表示と同じ) */
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
 * (SP 欄も 10/20 → 15/20)。衣装 / ボード / パッシブ も 2026-09-13 に同じ規則へそろえたが、そちらは**確定ではない**
 * (`finishDisplay` のコメントと display-score.md「量子化」)。
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

/** 表示に丸める前のスコアボーナス 5 欄の raw 値(%) */
export interface RawScoreBonus {
  costume: number;
  active: number;
  board: number;
  passive: number;
  special: number;
}

/**
 * 曲を選んだときのホロメンボード効果欄の raw 値(%)【2026-09-11 実機 8 点(黄 0〜10%)+ 2026-09-12 の衣装欄ありの直接対照で強い推定】。
 *
 *   ボード欄(黄込み) = ボード欄 + 黄 × (100 + 衣装 + アクティブ + パッシブ + SP)
 *
 * 黄はボード欄以外を変えない(総合力・衣装・アクティブ・パッシブ・SP は黄 0% と 10% で同じ値 — 実機確定。
 * 衣装 14.1 / アクティブ 77.7 / パッシブ 1.9 / SP 47.0 の編成で黄 10% のボード欄は 40.7 → 64.8 の +24.1 =
 * 0.1 × (100 + 14.1 + 77.7 + 1.9 + 47.0) = 24.07 — docs/human/repro/display-score-20260912.md)。
 * 5 欄とも**表示に丸める前の raw 値**を渡すこと: 表示済みの 77.0 / 14.2 / 2.3 / 46.0 から計算すると 9.86% で
 * 実機(36.4)と丸め境界が合わず 36.5 になる。raw の区間(切り上げ前の値は表示値より小さい)の中には 8 点すべてを
 * 再現する値があり、テストで固定している(src/engine/displayScore.test.ts「黄ボードの適用位置」)。
 * この関数は黄の増分の形だけを持ち、衣装欄・ボード欄・パッシブ欄そのものの算出式(pending.md「5カテゴリの内部式」)には触れない
 */
export function songBoardRaw(raw: RawScoreBonus, songBonus: number): number {
  return raw.board + songBonus * (100 + raw.costume + raw.active + raw.passive + raw.special);
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
  /** 青ボードの発動率 UP を反映した確率(上限 1) */
  pBlue: number;
  /** 青ボードの発動率 UP(%)。`pBlue` は上限 1 で頭打ちするので raw weight にはこちらを使う */
  blueRatePercent: number;
  /** 青ボードの発動頻度 UP(%)。`onBlue` の周期に反映済み */
  blueFrequencyPercent: number;
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
 * 青ボードの「発動率 +r%」を発動確率に反映する【強い推定】。**乗算型** `min(1, p0 × (1 + r/100))`。
 *
 * マスの効果種別が「発動確率 UP(‰ 加算)」であること自体は外部情報で分かっているが、表示スコアボーナスの
 * 評価器がそれをどう換算するかは別問題で、実機は乗算型を支持する: 支援(リーダー衣装・赤)の表示合計への
 * 総増分は `支援/100 × E_blue(乗算)` が 13 対照 + Leader-only matched pair 7 組 + 2026-09-13 の
 * 発動頻度 ownership 4 状態(F0〜F3)で量子化の範囲に収まる。加算型 `p0 + r/100` は同じ材料で 2〜4 pt 外れる。
 * 実ライブ中の発動確率(`liveSkillTimeline.ts`)とは意図的に別式のままにする(ADR-007)。
 */
export function blueActivationProbability(baseProbability: number, rateUpPercent: number): number {
  return Math.min(1, baseProbability * (1 + rateUpPercent / 100));
}

/**
 * 青ボードの「発動頻度 +f%」を発動周期に反映する【強い推定】。周期 ÷ (1 + f/100)。
 *
 * マスの効果種別が「クールタイム短縮(‰)」であることは外部情報で分かっており、表示文も
 * 「アクティブスキル発動頻度が X%UP」なので方向は確か。**この連続時間の式は非単調な実機系列を再現する**:
 * 2026-09-13 の発動頻度 ownership 系列(F0〜F3。ΣR・Σ発動頻度 12% を固定したまま所有者だけを 水着みこ →
 * 水着おかゆ へ移す 4 状態)で、pre-yellow 合計の増分は 45.7 / 46.4 / 39.3 / 46.2 と F2 だけ大きく落ちる。
 * この式で周期を短縮すると同時候補の競合(`max(1, Σp)`)の入り方が変わり、F2 では青込みタイムラインが
 * 青なしより**下がる**ので、同じ落ち込みが自由係数なしで出る(docs/human/repro/display-score-20260913-frequency.md)。
 * 評価時の刻み(tick)・サーバー側の換算そのものは未確認なので、丸めや tick を推測で足さない。
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
      blueRatePercent: board?.activeRatePercent ?? 0,
      blueFrequencyPercent: board?.activeFrequencyPercent ?? 0,
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
  /** パッシブのスコアサポートの合計(%。メンバーごと。供給側の発動を問わない静的な値) */
  passiveSupport: Float64Array;
  staticMult: Float64Array;
  order: Int32Array;
  /** 発動候補の組合せ(ビットマスク)ごとの秒数。基準の周期 / 青ボードの周期 */
  histBase: Float64Array;
  histBlue: Float64Array;
  /** kernel のメンバーごとの取り分(Σ = kernel 値)。raw weight の材料 */
  share: Float64Array;
}

const MASK_COUNT = 1 << MEMBER_SLOTS;

export function createDisplayScratch(): DisplayScratch {
  return {
    ups: new Float64Array(MEMBER_SLOTS),
    p: new Float64Array(MEMBER_SLOTS),
    supportMatrix: new Float64Array(MEMBER_SLOTS * MEMBER_SLOTS),
    costumeSupport: new Float64Array(MEMBER_SLOTS),
    passiveSupport: new Float64Array(MEMBER_SLOTS),
    staticMult: new Float64Array(MEMBER_SLOTS),
    order: new Int32Array(MEMBER_SLOTS),
    histBase: new Float64Array(MASK_COUNT),
    histBlue: new Float64Array(MASK_COUNT),
    share: new Float64Array(MEMBER_SLOTS),
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

/**
 * source ごとの raw weight の材料になる **kernel**。`Σ_s Σ_{i∈候補} up_i × pNum_i × staticMult_i / max(1, Σ_{i∈候補} pDen_i) / T`。
 *
 * `histogramScore` と違い**分子と分母で別の発動確率を使える**。表示 5 欄の配賦に要る 2 つの量を同じ 1 本で作る:
 * - `pNum = pDen = pBlue`: 青込みの期待値 `E_blue`(支援の総増分 `支援/100 × E_blue` の基礎量)
 * - `pNum = p0`・`pDen = pBlue`: **p0Only kernel** `H_C`(青の窓で、対象自身は基準確率、競合の分母だけ青)
 *
 * `share` を渡すとメンバーごとの取り分(Σ = 戻り値)を書き込む。青ボードの raw weight
 * `W_blue = Σ_i (発動率 UP_i + 発動頻度 UP_i)/100 × share_i` に使う。
 */
export function histogramKernel(
  hist: Float64Array,
  members: readonly DisplayMemberView[],
  ups: ArrayLike<number>,
  pNum: ArrayLike<number>,
  pDen: ArrayLike<number>,
  staticMult: ArrayLike<number> | null,
  share: Float64Array | null,
  T: number = VIRTUAL_TIMELINE_SECONDS,
): number {
  const n = members.length;
  share?.fill(0);
  let total = 0;
  for (let mask = 1; mask < MASK_COUNT; mask++) {
    const seconds = hist[mask] ?? 0;
    if (seconds === 0) continue;
    let den = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) den += pDen[i] ?? 0;
    const norm = den > 1 ? den : 1;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const value =
        (seconds * (ups[i] ?? 0) * (pNum[i] ?? 0) * (staticMult ? (staticMult[i] ?? 1) : 1)) / norm;
      total += value;
      if (share) share[i] = (share[i] ?? 0) + value / T;
    }
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
  /** アクティブ欄(基準タイムライン。青なし・支援なしの期待スコア UP) */
  active: number;
  /** 青込みタイムライン `E_blue`(発動頻度で短縮した周期 + 乗算型の発動確率) */
  blue: number;
  /** 青 + パッシブのスコアサポート(静的)込みタイムライン */
  withPassive: number;
  /** SP 欄 */
  special: number;
  /** `H_C`: p0Only kernel(青の窓で、対象自身は基準確率 p0、競合の分母だけ青の乗算型) */
  costumeKernel: number;
  /** `H_P`: パッシブのスコアサポートが p0Only kernel に足す量(静的) */
  passiveKernel: number;
  /** `W_blue`: 青ボードの raw weight = Σ_i (発動率 UP_i + 発動頻度 UP_i)/100 × H_C のメンバー取り分 */
  blueWeight: number;
  /** H_C のメンバーごとの取り分(リーダー衣装が全員対象でないときの `W_C` に使う) */
  costumeShare: Float64Array;
  /** E_blue のメンバーごとの取り分(リーダー衣装が全員対象でないときの総増分に使う) */
  blueShare: Float64Array;
}

export function createDisplayMemberPart(): DisplayMemberPart {
  return {
    active: 0,
    blue: 0,
    withPassive: 0,
    special: 0,
    costumeKernel: 0,
    passiveKernel: 0,
    blueWeight: 0,
    costumeShare: new Float64Array(MEMBER_SLOTS),
    blueShare: new Float64Array(MEMBER_SLOTS),
  };
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

/**
 * 段階 2: 青込みタイムライン `E_blue` と p0Only kernel `H_C`・青の raw weight `W_blue` を作る
 * (scratch.histBlue / p / share を埋める。prepareBase の後に呼ぶ)
 */
export function prepareBlue(
  members: readonly DisplayMemberView[],
  scratch: DisplayScratch,
  out: DisplayMemberPart,
  T: number = VIRTUAL_TIMELINE_SECONDS,
  blueMasks?: Uint8Array,
): void {
  const n = members.length;
  if (blueMasks) histogramFromMasks(blueMasks, scratch.histBlue, T);
  else buildHistogram(members, true, scratch.histBlue, T);
  for (let i = 0; i < n; i++) scratch.p[i] = members[i]?.active?.pBlue ?? 0;
  out.blue = histogramKernel(
    scratch.histBlue,
    members,
    scratch.ups,
    scratch.p,
    scratch.p,
    null,
    out.blueShare,
    T,
  );
  // H_C: 分子だけ基準確率 p0 に戻す(競合の分母は青の乗算型のまま)
  const p0 = new Float64Array(MEMBER_SLOTS);
  for (let i = 0; i < n; i++) p0[i] = members[i]?.active?.p0 ?? 0;
  out.costumeKernel = histogramKernel(
    scratch.histBlue,
    members,
    scratch.ups,
    p0,
    scratch.p,
    null,
    out.costumeShare,
    T,
  );
  let blueWeight = 0;
  for (let i = 0; i < n; i++) {
    const a = members[i]?.active;
    if (!a) continue;
    const percent = a.blueRatePercent + a.blueFrequencyPercent;
    if (percent !== 0) blueWeight += (percent / 100) * (out.costumeShare[i] ?? 0);
  }
  out.blueWeight = blueWeight;
}

/**
 * 段階 3: パッシブのスコアサポートを**静的に**足したタイムラインと raw weight `H_P` を作る
 * (scratch.supportMatrix / passiveSupport を埋める。prepareBlue の後に呼ぶ)。
 *
 * 供給側の発動確率で割り引く gated 型(以前の実装)は、青のない K6(恒常マリン 1凸 9% が フレア との 3期生 2 人で成立)で
 * パッシブ欄 1.0 を返し実機 2.9 に届かないので棄却した。静的型は同じケースで 2.85 を返す。
 */
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
  scratch.passiveSupport.fill(0);
  if (!anySupport) {
    out.withPassive = out.blue;
    out.passiveKernel = 0;
    return;
  }
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += scratch.supportMatrix[j * MEMBER_SLOTS + i] ?? 0;
    scratch.passiveSupport[i] = sum;
    scratch.staticMult[i] = 1 + sum / 100;
  }
  for (let i = 0; i < n; i++) scratch.p[i] = members[i]?.active?.pBlue ?? 0;
  out.withPassive = histogramKernel(
    scratch.histBlue,
    members,
    scratch.ups,
    scratch.p,
    scratch.p,
    scratch.staticMult,
    null,
    T,
  );
  let passiveKernel = 0;
  for (let i = 0; i < n; i++) {
    passiveKernel += ((scratch.passiveSupport[i] ?? 0) / 100) * (out.costumeShare[i] ?? 0);
  }
  out.passiveKernel = passiveKernel;
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

/** 表示 3 欄(衣装 / ボード / パッシブ)の raw 値と、その配賦に使った総量・raw weight */
export interface ProjectiveAttribution {
  costume: number;
  board: number;
  passive: number;
  /** pre-yellow の 3 欄合計 `T`(source ごとの増分の和) */
  total: number;
  weightCostume: number;
  weightBoard: number;
  weightPassive: number;
}

/**
 * pre-yellow の 衣装 / ボード / パッシブ 欄【強い推定。docs/human/display-score.md】。**総量と配賦を別レイヤーで作る**。
 *
 * 1. 総量 `T` は source ごとの増分の**和**(2026-09-13 の F0〜F3 と K5 / K6 / K7 で支持):
 *
 * ```txt
 * T = Σ_i (衣装支援_i/100) × E_blue の取り分_i   リーダー衣装のスコアサポート
 *   + (X/100) × E_blue                            赤「全員のスコアサポート効果」
 *   + (E_blue − アクティブ欄)                     青ボードの純増分
 *   + (パッシブ込み − E_blue)                     パッシブのスコアサポート(静的)
 * ```
 *
 * 2. 配賦は **projective**: 3 欄は source ごとの raw weight `W` に比例する。1 つの source だけを変えた
 *    matched pair で「native 以外の 2 欄の比が保存される」ことは 12 件(リーダー 4・赤 8)+ K7 で反例がない。
 *
 * ```txt
 * W_C = Σ_i (衣装支援_i/100) × H_C の取り分_i     W_B = W_blue + (X/100) × E_blue     W_P = H_P
 * (衣装, ボード, パッシブ) = T × (W_C, W_B, W_P) / (W_C + W_B + W_P)
 * ```
 *
 * `W` は全体を定数倍しても同じ表示になる(gauge 自由)。`W_blue` の決定式だけは未確定で、ここでは
 * **member-local 型**(青を持つメンバー本人の H_C 取り分に 発動率 + 発動頻度 の % を掛けて足す)を使う。
 * 「編成全体の評価値どうしの差」型(`E_blue(加算) − H_C` など)は F0〜F3 が要求する一定値 0.2208〜0.2215 に対し
 * 0.175〜0.277 とばらつくので棄却した — pending.md「W_blue の決定式」。
 *
 * 3 欄が負になる編成(F2 の支援なし側のように、青の頻度配置で青込みタイムラインが青なしより下がる場合)は
 * 実機も 0 表示なので 0 で切る。
 */
export function attributeDisplaySupport(
  part: DisplayMemberPart,
  costumeSupport: ArrayLike<number>,
  redSupportPercent: number,
  memberCount: number,
): ProjectiveAttribution {
  let leaderGain = 0;
  let weightCostume = 0;
  for (let i = 0; i < memberCount; i++) {
    const percent = (costumeSupport[i] ?? 0) / 100;
    if (percent === 0) continue;
    leaderGain += percent * (part.blueShare[i] ?? 0);
    weightCostume += percent * (part.costumeShare[i] ?? 0);
  }
  const red = redSupportPercent / 100;
  const total =
    leaderGain + red * part.blue + (part.blue - part.active) + (part.withPassive - part.blue);
  const weightBoard = part.blueWeight + red * part.blue;
  const weightPassive = part.passiveKernel;
  const sum = weightCostume + weightBoard + weightPassive;
  if (sum <= 0) {
    return {
      costume: 0,
      board: 0,
      passive: 0,
      total,
      weightCostume,
      weightBoard,
      weightPassive,
    };
  }
  return {
    costume: Math.max(0, (total * weightCostume) / sum),
    board: Math.max(0, (total * weightBoard) / sum),
    passive: Math.max(0, (total * weightPassive) / sum),
    total,
    weightCostume,
    weightBoard,
    weightPassive,
  };
}

/**
 * リーダー側(衣装のスコアサポート・赤の全員のスコアサポート)と、曲を選んでいれば黄ボードの楽曲スコアボーナス
 * (songBonus。比。ボード欄の raw に足す — songBoardRaw)を足して表示 5 欄(衣装 / アクティブ / ボード / パッシブ / SP)にする
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
  out: {
    costume: number;
    active: number;
    board: number;
    passive: number;
    special: number;
    total: number;
  },
  T: number = VIRTUAL_TIMELINE_SECONDS,
): void {
  scratch.costumeSupport.fill(0);
  for (const e of costumeSupport) {
    const cond = e.condition ?? costumeCondition;
    if (cond && !conditionMet(cond, typeCounts, affCounts)) continue;
    addSupport(members, e.target, -1, scratch.costumeSupport, false, scratch.order);
  }
  const attribution = attributeDisplaySupport(
    part,
    scratch.costumeSupport,
    redSupportPercent,
    members.length,
  );
  const { costume, board, passive } = attribution;
  // 黄ボードの楽曲スコアボーナスは、**量子化の前に** raw のボード欄へ足す(2026-09-11 実機確定: 黄はボード欄だけを
  // 増やし、表示済みの値からでは 9.86% の丸め境界が合わない。基底には衣装欄も入る — 2026-09-12 の直接対照)。黄 0 なら従来と同じ値
  const boardWithSong =
    songBonus === 0
      ? board
      : songBoardRaw(
          { costume, active: part.active, board, passive, special: part.special },
          songBonus,
        );
  // 5 欄ともサーバーが返す permil 整数に合わせて 0.1% 単位で切り上げる。アクティブ欄・SP 欄は実機 20 ケースで
  // 検証済み(四捨五入 15/20 → 切り上げ 20/20)。衣装 / ボード / パッシブ も同じ規則にそろえた —
  // 2026-09-13 のコーパス 126 列で 切り上げ 43 列 / 四捨五入 42 列 と 1 列しか違わないが、切り上げのほうが
  // ボード欄・パッシブ欄の RMSE が小さく、規則を 2 つ持たずに済む。ただし raw 側にまだ 0.3〜0.9 の残差が
  // あるので、この規則は**確定ではない**(K5 は切り上げだと 37.9 → 38.0 でずれ、K6 は四捨五入だと
  // 44.3 → 44.2 でずれる。最小の矛盾集合 — display-score.md「量子化」)
  out.costume = scoreBonusPercent(costume);
  out.active = scoreBonusPercent(part.active);
  out.board = scoreBonusPercent(boardWithSong);
  out.passive = scoreBonusPercent(passive);
  out.special = scoreBonusPercent(part.special);
  out.total = round1(out.costume + out.active + out.board + out.passive + out.special);
  void T;
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
 * メニュー画面のスコアボーナス 5 欄とユニットスコアを試算する(探索と同じ中核関数を通る)。
 * options.songBonus を渡すと「曲を選んだときのユニットスコア」(黄込み)になる
 */
/**
 * 表示に量子化する前の 5 欄(raw)。量子化規則の機械比較に使う(display-score.md「量子化」)。
 * 黄の楽曲スコアボーナスは `board` に組み込み済み(2026-09-11 実機確定の順序)。
 */
export function computeDisplayScoreRaw(
  unit: Unit,
  holomenMap: HolomenMap,
  options: DisplayScoreOptions = {},
): RawScoreBonus {
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
  const part = createDisplayMemberPart();
  prepareDisplay(members, typeCounts, affCounts, scratch, part, T);
  const costumeStructured = unit.leader.costumeSkill.structured;
  const costumeCondition = costumeStructured
    ? compileCondition(costumeStructured.condition, affIndex)
    : null;
  scratch.costumeSupport.fill(0);
  for (const e of compileSupportEffects(costumeStructured, affIndex)) {
    const cond = e.condition ?? costumeCondition;
    if (cond && !conditionMet(cond, typeCounts, affCounts)) continue;
    addSupport(members, e.target, -1, scratch.costumeSupport, false, scratch.order);
  }
  const { costume, board, passive } = attributeDisplaySupport(
    part,
    scratch.costumeSupport,
    options.red?.scoreSupportPercent ?? 0,
    members.length,
  );
  const raw: RawScoreBonus = {
    costume,
    active: part.active,
    board,
    passive,
    special: part.special,
  };
  const songBonus = options.songBonus ?? 0;
  return songBonus === 0 ? raw : { ...raw, board: songBoardRaw(raw, songBonus) };
}

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
  const part = createDisplayMemberPart();
  prepareDisplay(members, typeCounts, affCounts, scratch, part, T);
  const costume = unit.leader.costumeSkill.structured;
  const out = { costume: 0, active: 0, board: 0, passive: 0, special: 0, total: 0 };
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
