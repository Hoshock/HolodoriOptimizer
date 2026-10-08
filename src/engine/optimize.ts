import type { RedUnitEffects } from "../data/redBoard";
import type { Card } from "../data/types";
import type {
  CompiledSupportEffect,
  DisplayMemberView,
  DisplayScoreBreakdown,
} from "./displayScore";
import type { AccountBonus, CompiledCondition, RedInputs, StaticPowerBreakdown } from "./power";
import { bestTieOrder } from "./tieOrder";
import type { HolomenMap } from "./score";
import {
  ACTIVE_PROBABILITY,
  compileDisplayMember,
  compileSupportEffects,
  computeDisplayScoreBonus,
  displayUnitScore,
  SP_RATE_UP_DIVISOR,
  SP_SUPPORT_DIVISOR,
  VIRTUAL_TIMELINE_SECONDS,
} from "./displayScore";
import {
  buildAffIndex,
  ceilPercent,
  compileCondition,
  computeStaticPower,
  conditionMet,
  costumeEffectOf,
  costumePercentsOf,
  MEMBER_SLOTS,
  NO_ACCOUNT_BONUS,
  PARAM_COUNT,
  passiveParamBonus,
  redInputsOf,
} from "./power";

/**
 * 編成最適化: リーダー(と任意の固定メンバー)を与え、残り枠の全組合せを探索して
 * 上位 topN 件を返す(ADR-003 / ADR-005)。
 *
 * 制約: メンバー 5 人同士は同一ホロメン 1 枚まで。リーダーはメンバーとは別枠で、
 * メンバーと同一ホロメン・同一カードでもよい(2026-08-31 ユーザー確認のゲーム仕様)。
 *
 * 順位づけの値 = 曲条件つきユニットスコア(試算)(src/engine/displayScore.ts: 総合力 × (1 + スコアボーナス/100) × 係数。
 * 総合力は src/engine/power.ts。曲を選んでいれば黄ボードの楽曲スコアボーナスがホロメンボード効果欄に入った値 —
 * 2026-09-11 実機確定)× 後から掛かる倍率(イベントスコアボーナスだけ。適用位置は未確認)。
 * 2026-09-08 ユーザー指示「結果の値は最終的なユニットスコア値に」。イベントは編成の中身ではなく曲で決まる
 * score modifier として扱う(ScoreModifierBreakdown)。**黄は後掛けしない** — 以前の display.unitScore × (1 + 黄) は
 * 実機と一致しなかった。黄の増分は候補ごとの アクティブ + パッシブ + SP に比例するので、曲を選ぶと候補の順位が
 * 変わりうる。よって shortlist の上限値・正確評価・並べ替えのすべてで黄込みの値を使う。
 * 実ライブ中のスコアは別問題で、専用のエンジンは未実装 —
 * 曲長に基づく旧簡易期待値(src/engine/live.ts)は順位づけに使われていなかったので 2026-09-09 に削除した(ADR-006)。
 * この探索は曲長・譜面を見ない。
 * タイムライン評価(displayScore.ts)は葉ごとに行うには重いので、探索中は「上限値」(総合力の上限 × (1 + スコアボーナスの上限。
 * 発動候補の秒ごとの `Σ up×p / max(1, Σp)` をスコア UP の最大値で評価した合計 — メンバーの追加・削除で秒だけ更新))で
 * 上位 shortlistSize 件を最小ヒープに集め、探索後にその候補だけを computeStaticPower / computeDisplayScoreBonus で
 * 上限値の高い順に正確に評価して並べ直す(表示する値は正確 — 2026-09-08)。上位 topN 件の正確な値が次の候補の上限値以上に
 * なれば、shortlist から漏れた編成も含めて厳密な上位だと言える(`certified`)。言えなければ 2 パス目で上限値が topN 件目を
 * 超える編成をすべて集め直す(2026-09-30。線形和の上限は緩すぎて真の上位を落としていた — ADR-005)。真の上位が漏れないことの
 * 検証は src/engine/exactSearch.ts の全候補評価と比べる exactSearch.test.ts / optimizeShortlist.test.ts で行う。
 * 組合せ生成は再帰インデックス方式で、将来の Web Worker 分割(先頭インデックスでのチャンク化)を想定している。
 *
 * リーダー探索(leader: null)は、メンバー側の量(素値・ボード増分・パッシブ・メモリー・アクティブ寄与・SP)がリーダー非依存で
 * あることを使い、組合せを 1 回だけ列挙して葉ごとに「衣装スキルと赤ボードの同型クラス」を評価する。衣装スキル効果は
 * メンバー × クラスで前計算し、葉では加算だけにする。加えて最大値による上限枝刈りで、リーダー数ぶんの単純な倍数化を避けている
 */

export interface OptimizeRequest {
  /** リーダー。null なら除外カードを除く全カードをリーダー候補として探索する */
  leader: Card | null;
  /** 固定するメンバー(0〜4 枚)。残り枠が探索対象になる */
  fixedMembers?: Card[];
  /** 探索から除外するカード ID(リーダー候補・メンバー候補の両方から) */
  excludedCardIds?: string[];
  /** リーダー候補(おまかせ)からだけ除外するカード ID。指定したリーダーには効かない(2026-09-08 ユーザー指示で役割別に) */
  excludedLeaderCardIds?: string[];
  /** メンバー候補からだけ除外するカード ID。固定メンバーには効かない */
  excludedMemberCardIds?: string[];
  /**
   * 黄ボードの楽曲スコアボーナス(比。0.075 = +7.5%)。曲とアカウントで決まる値だが、**ホロメンボード効果欄の raw に
   * 黄 × (100 + アクティブ + パッシブ + SP) として入る**(2026-09-11 実機確定)ので、候補ごとに効き方が違い順位も変わりうる。
   * 上限値・正確評価の両方で src/engine/displayScore.ts に渡す。曲未指定・黄なしは 0。曲長・譜面はこの探索では使わない
   */
  songBonus?: number;
  /**
   * リーダー未指定(null)のときのリーダー候補を、この ID のカードに限定する。
   * 省略時は除外カードを除く全カード(おかゆモードでリーダーをおかゆんに限るために使う)
   */
  leaderCandidateIds?: string[];
  /**
   * メンバー 5 人に必ず含めるホロメン ID(固定メンバーで満たしていてもよい)。
   * メンバー同士は同一ホロメン不可なので、各ホロメンはちょうど 1 枚入る。
   * 満たせない組合せは枝刈りされる(残り枠 < 未充足数で打ち切り)
   */
  requiredMemberHolomenIds?: string[];
  /**
   * リーダーのホロメン ID → 赤ホロメンボードの効果(メンバー 5 人への固定値と割合)。
   * 省略・該当なしのリーダーは赤なし(src/data/redBoard.ts の redUnitEffectsByHolomen)
   */
  redByHolomen?: Readonly<Record<string, RedUnitEffects>>;
  /** アカウント共通の補正(メモリー % ・メンバー強化ボーナス %)。省略時は 0 */
  account?: AccountBonus;
  /**
   * イベントスコアボーナス(src/engine/event.ts)。指定した曲がイベントの課題曲のとき、その対象カード(cardIds)が
   * メンバー 5 人にひとつでもあれば順位づけの値に (1 + percent/100) を掛ける(複数枚でも重複しない)。
   * 通常スコアを求めた後に掛ける隔離した実装で、省略時はなし。リーダー枠は判定に含めない(ゲーム仕様 — 2026-09-08 ユーザー確認)。
   * **アプリからは未接続** — `runOptimize`(request.ts)がこの引数を作らないので、画面の値には掛からない(2026-09-30 確認)
   */
  eventScore?: { percent: number; cardIds: readonly string[] };
  /** 返す候補数(既定 10) */
  topN?: number;
  /**
   * 上限値の shortlist の件数(検証用。既定は SHORTLIST_MIN と topN × SHORTLIST_FACTOR の大きい方)。
   * 小さくすると取りこぼしの検証(2 パス目)が働く場面を小さなプールで再現できる
   */
  shortlistSize?: number;
  /** 進捗コールバック(評価済み組合せ数 / 総組合せ数)。約 progressInterval 件ごと */
  onProgress?: (done: number, total: number) => void;
  progressInterval?: number;
}

/**
 * 順位づけの値と、曲で決まる補正の内訳(候補ごと)。
 * 実ライブのスコア(アクティブ・SP の実際の発動)ではない — 名前も「期待スコア」を避ける(ADR-006)
 */
export interface ScoreModifierBreakdown {
  /**
   * 黄ボードの楽曲スコアボーナス(比。曲とアカウントで決まる)。**表示用の情報**で、値はすでに display.board /
   * display.total / display.unitScore に組み込まれている(2026-09-11 実機確定)。ここでもう一度掛けない
   */
  songBonus: number;
  /** イベントスコアボーナス(比。0.1 = +10%)。課題曲の対象カードがメンバーにあるときだけ。イベント未指定は 0 */
  eventBonus: number;
  /** display.unitScore(黄込み)× (1 + eventBonus)。順位づけに使う値(結果一覧・詳細の見出し) */
  adjustedUnitScore: number;
}

type ScoredCandidate = OptimizeResult["candidates"][number];

export interface OptimizeResult {
  /** 順位づけの値(曲条件つきユニットスコア(試算) × イベント)の降順の候補(リーダー探索時は候補ごとにリーダーが異なりうる) */
  candidates: {
    leader: Card;
    members: Card[];
    breakdown: StaticPowerBreakdown;
    /** メニュー画面のスコアボーナス 5 項目とユニットスコアの試算(src/engine/displayScore.ts。曲を選んでいれば黄込み。順位づけの値の元) */
    display: DisplayScoreBreakdown;
    modifiers: ScoreModifierBreakdown;
  }[];
  /** 評価した組合せ数 */
  evaluated: number;
}

/** 絞り込みの件数: topN × この倍率(最小 SHORTLIST_MIN)。上限値が正確な値より緩いぶんを吸収する余裕(証明は下の 2 パス目) */
export const SHORTLIST_FACTOR = 50;
export const SHORTLIST_MIN = 200_000;
/**
 * 取りこぼしの検証(2 パス目)で集める件数の上限。上限値が「上位 topN 件の正確な値」を超える編成は通常これより
 * ずっと少ないが、超えたときは上限値の上位だけを正確に評価する近似に戻る
 */
/**
 * 取りこぼしの検証(2 パス目)をやり直す組合せ数の上限。これを超える探索(おまかせ・全カードなど)は 1 パスが長いので、
 * 2 パス目は行わず shortlist の上位を正確に評価した結果で返す(近似。shortlist が大きいので取りこぼしは起きにくい)
 */
export const CERTIFY_MAX_LEAVES = 6_000_000;
export const CERTIFY_SHORTLIST_MAX = 300_000;

/** nCk(進捗表示用) */
export function combinationCount(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = (result * (n - k + i)) / i;
  }
  return Math.round(result);
}

interface CompiledCard extends DisplayMemberView {
  /** 前計算表(衣装スキル効果のクラス別)の添字 */
  index: number;
  /** イベントスコアボーナスの対象カードか(eventScore.cardIds に含まれる) */
  eventTarget: boolean;
  /** 枝刈りの上限用: パッシブのスコアサポート効果の % 合計 */
  supportPercentSum: number;
  /**
   * 枝刈りの上限用: SP 1 本ぶんの係数 `支援% × 効果時間 / 12000 × (1 + 発動率 UP% / 200)`。
   * 発動率 UP の条件は編成が決まるまで分からないので、**成立側**(上限)で持つ
   */
  spFactorMax: number;
  /**
   * 枝刈りの上限用: アクティブのスコア UP の最大値(%)、基準 / 青込みの発動確率、基準 / 青込みの発動候補の秒の一覧。
   * 同時候補の正規化 `max(1, Σp)` を上限に効かせる(`numBlue` ほか)
   */
  upMax: number;
  pBase: number;
  pBlueValue: number;
  baseSeconds: Int16Array;
  blueSeconds: Int16Array;
}

const NO_SECONDS = new Int16Array(0);

function secondsOf(on: Uint8Array | undefined): Int16Array {
  if (!on) return NO_SECONDS;
  const list: number[] = [];
  for (let s = 1; s < on.length; s++) if (on[s]) list.push(s);
  return Int16Array.from(list);
}

/**
 * 順位づけの倍率(曲条件つきユニットスコア(試算)に後から掛ける)。**イベントスコアボーナスだけ**。
 * 黄の楽曲スコアボーナスは display.unitScore に組み込み済みなのでここには入れない(2026-09-11。二重に掛けない)。
 * イベントの適用位置は未確認のまま(pending.md「イベントスコアボーナスの適用位置」)— 黄が確定したからといってイベントも同じとは扱わない
 */
export function scoreModifierFactor(modifiers: Pick<ScoreModifierBreakdown, "eventBonus">): number {
  return 1 + modifiers.eventBonus;
}

/** 探索の分担: 組合せの 1 枚目のプール内の添字が `count` で割って `index` 余るものだけを数える(2026-10-08「計算の高速化」) */
export interface SearchPartition {
  index: number;
  count: number;
}

/** 1 パスの数え方: 分担・これ以下の上限値は集めない床・shortlist の件数・進み具合を知らせるか */
export interface SearchPass {
  partition: SearchPartition;
  floor: number;
  size: number;
  progress: boolean;
}

/**
 * 上限値の上位の候補(shortlist)。**上限値の高い順(同じなら番号の小さい順)に並べてある**。
 * `paths` は 1 件あたり空き枠の数ずつ並んだ、プール内の添字(同じ依頼から作ったプールでだけ意味を持つ)
 */
export interface Shortlist {
  scores: Float64Array;
  seqs: Float64Array;
  classes: Int32Array;
  paths: Int16Array;
}

/** 正確に評価した候補と、並べ替えの鍵(上限値・番号・クラスの中のリーダーの順) */
export interface RankedCandidate extends ScoredCandidate {
  bound: number;
  seq: number;
  leaderOrder: number;
}

/** 並べ替えに使う鍵だけ(Worker から届いた、カードを ID にした候補でも使う) */
export interface RankedKeys {
  modifiers: { adjustedUnitScore: number };
  bound: number;
  seq: number;
  leaderOrder: number;
}

/**
 * 探索結果の並び: 順位づけの値の高い順、同じなら上限値の高い順、さらに同じなら番号の小さい順(同じクラスのリーダーはクラスの中の順)。
 * 何本に分けて探しても同じ並びになるよう、同点を評価した順に頼らない
 */
export function compareRanked(a: RankedKeys, b: RankedKeys): number {
  return (
    b.modifiers.adjustedUnitScore - a.modifiers.adjustedUnitScore ||
    b.bound - a.bound ||
    a.seq - b.seq ||
    a.leaderOrder - b.leaderOrder
  );
}

/** 準備した探索(`prepareSearch`)。数える(`enumerate`)と正確に評価する(`score`)を分担ごとに呼べる */
export interface SearchContext {
  /** 総組合せ数(リーダー × メンバー。進み具合の分母) */
  total: number;
  topN: number;
  baseShortlistSize: number;
  /** 空き枠の数(shortlist の `paths` の 1 件の長さ) */
  openSlots: number;
  enumerate(pass: SearchPass): { shortlist: Shortlist; evaluated: number };
  /** shortlist の先頭 `take` 件を正確に評価し、`compareRanked` の順で上位 topN 件を返す */
  score(shortlist: Shortlist, take: number): RankedCandidate[];
}

/**
 * 分担ごとの shortlist(どれも上限値の高い順。同じなら番号の小さい順)から、全体の上位 `size` 件を選ぶ。
 * 分担ごとの shortlist はその分担の上位 `size` 件なので、全体の上位 `size` 件はそれらの和に必ず入り、分担ごとに見ると先頭からの連続になる。
 * 返すのは分担ごとの件数(先頭から何件か)と、件数が `size` に届いたときの最下位の上限値(`dropped`。届かなければ -Infinity)
 * — 1 本で探したときのヒープの根と同じ。並べ替えの鍵(上限値・番号)だけを読むので、Worker からは鍵だけを受け取ればよい
 */
export function selectShortlist(
  lists: readonly Pick<Shortlist, "scores" | "seqs">[],
  size: number,
): { take: number[]; dropped: number } {
  const take = lists.map(() => 0);
  let taken = 0;
  let last = -Infinity;
  while (taken < size) {
    let best = -1;
    for (let l = 0; l < lists.length; l++) {
      const list = lists[l];
      const i = take[l] ?? 0;
      if (!list || i >= list.scores.length) continue;
      if (best < 0) {
        best = l;
        continue;
      }
      const other = lists[best];
      const j = take[best] ?? 0;
      const s = list.scores[i] ?? 0;
      const t = other?.scores[j] ?? 0;
      if (s > t || (s === t && (list.seqs[i] ?? 0) < (other?.seqs[j] ?? 0))) best = l;
    }
    if (best < 0) break;
    last = lists[best]?.scores[take[best] ?? 0] ?? -Infinity;
    take[best] = (take[best] ?? 0) + 1;
    taken += 1;
  }
  return { take, dropped: taken >= size ? last : -Infinity };
}

/** 分担ごとの上位(`SearchContext.score` の結果)を 1 つの上位 `topN` 件にまとめる(並びは `compareRanked`) */
export function mergeRanked<T extends RankedKeys>(
  lists: readonly (readonly T[])[],
  topN: number,
): T[] {
  return lists.flat().sort(compareRanked).slice(0, topN);
}

/** 上位 topN 件目の正確な値(届かなければ -Infinity)。2 パス目の床と、取りこぼしの判定に使う */
export function kthRanked(ranked: readonly RankedKeys[], topN: number): number {
  return ranked.length >= topN
    ? (ranked[topN - 1]?.modifiers.adjustedUnitScore ?? -Infinity)
    : -Infinity;
}

/**
 * 上限値の取りこぼしの検証(2026-09-30)で 2 パス目が要るか。shortlist は「上限値の上位 N 件」なので、上限値が正確な値より緩い編成が
 * 上位を埋めると、正確な値の高い編成が N 件の外へ落ちる — 上限が同時候補の正規化を無視した線形和だった頃は、
 * 実データでボードを開けたアカウント 40 通りのうち 9 通りで、おまかせ探索の 1 位が厳密探索の 1 位に届かなかった
 * (固定メンバーで探すより低いユニットスコアが出る現象)。落ちた編成の上限値はどれも shortlist の最下位の上限値以下なので、
 * 上位 topN 件の正確な値 T がそれ以上なら取りこぼしはない。T より小さければ、上限値が T を超える編成をすべて集め直して
 * (2 パス目)正確に評価する。上限値は正確な値以上なので、上限値が T 以下の編成は topN 件に入りえず、
 * 2 パス目の結果は厳密な上位 topN 件になる(件数が上限を超えたときだけ従来の近似)。組合せが多すぎる探索は 2 パス目を行わない
 */
export function needsCertifyPass(dropped: number, kth: number, total: number): boolean {
  return !(dropped <= kth) && total <= CERTIFY_MAX_LEAVES;
}

/**
 * 分担した探索を、このスレッドで順に回す(1 本の探索と、分担の結果が 1 本と同じことのテスト用)。Worker で分けるときは
 * `useOptimizer` が同じ手順(1 パス目 → 上位を選ぶ → 正確に評価してまとめる → 要れば 2 パス目)を踏む
 */
export function searchInProcess(contexts: readonly SearchContext[]): OptimizeResult {
  const head = contexts[0];
  if (!head) return { candidates: [], evaluated: 0 };
  const count = contexts.length;
  const pass = (floor: number, size: number, progress: boolean) =>
    contexts.map((ctx, index) =>
      ctx.enumerate({ partition: { index, count }, floor, size, progress }),
    );
  /** 1 パス数えて、全体の上位を選び、分担ごとに正確に評価してまとめる */
  const round = (floor: number, size: number, progress: boolean) => {
    const counted = pass(floor, size, progress);
    const selection = selectShortlist(
      counted.map((r) => r.shortlist),
      size,
    );
    const ranked = mergeRanked(
      contexts.map((ctx, i) => {
        const shortlist = counted[i]?.shortlist;
        return shortlist ? ctx.score(shortlist, selection.take[i] ?? 0) : [];
      }),
      head.topN,
    );
    return { counted, selection, ranked };
  };

  const first = round(-Infinity, head.baseShortlistSize, true);
  const evaluated = first.counted.reduce((sum, r) => sum + r.evaluated, 0);
  let ranked = first.ranked;
  const kth = kthRanked(ranked, head.topN);
  if (needsCertifyPass(first.selection.dropped, kth, head.total))
    ranked = round(kth, CERTIFY_SHORTLIST_MAX, false).ranked;
  return {
    candidates: ranked.map((c) => ({
      leader: c.leader,
      members: c.members,
      breakdown: c.breakdown,
      display: c.display,
      modifiers: c.modifiers,
    })),
    evaluated,
  };
}

export function optimize(
  request: OptimizeRequest,
  allCards: Card[],
  holomenMap: HolomenMap,
): OptimizeResult {
  return searchInProcess([prepareSearch(request, allCards, holomenMap)]);
}

/** 6 枚が決まった編成 1 つを正確に評価するときの、リーダーと曲で決まる入力 */
export interface TeamScoreOptions {
  /** リーダーのホロメンの赤ボード(なければ null) */
  red: RedUnitEffects | null;
  account: AccountBonus;
  /** 黄ボードの楽曲スコアボーナス(比。曲未指定・黄なしは 0) */
  songBonus: number;
  eventScore?: { percent: number; cardIds: readonly string[] };
}

/**
 * 6 枚が決まった編成 1 つの正確な値(総合力 + タイムライン。曲を選んでいれば黄込み)。探索の shortlist の正確な評価と、
 * 最適化の各段が編成を繰り返し測る評価(`request.ts` の `createTeamScorer`)の両方がこの 1 本を通る。
 * 素値合計が同値のメンバーの並びで表示スコアボーナスが変わりうるので、最良の並びを採り、返す `members` はその並び(tieOrder.ts)
 */
export function scoreTeam(
  leader: Card,
  members: readonly Card[],
  holomenMap: HolomenMap,
  options: TeamScoreOptions,
): ScoredCandidate {
  const { red, account, songBonus, eventScore } = options;
  const { order, result } = bestTieOrder(
    members,
    leader,
    (ordered) => {
      const breakdown = computeStaticPower({ leader, members: ordered }, holomenMap, {
        red,
        account,
      });
      const display = computeDisplayScoreBonus(
        { leader, members: ordered },
        holomenMap,
        breakdown.totalPower,
        { red, songBonus },
      );
      const eventBonus =
        eventScore && ordered.some((m) => eventScore.cardIds.includes(m.id))
          ? eventScore.percent / 100
          : 0;
      // 黄は display.unitScore に入っているので、ここで掛けるのはイベントだけ
      const modifiers: ScoreModifierBreakdown = {
        songBonus,
        eventBonus,
        adjustedUnitScore: display.unitScore * scoreModifierFactor({ eventBonus }),
      };
      return { breakdown, display, modifiers };
    },
    (r) => r.modifiers.adjustedUnitScore,
  );
  return { leader, members: order, ...result };
}

export function prepareSearch(
  request: OptimizeRequest,
  allCards: Card[],
  holomenMap: HolomenMap,
): SearchContext {
  const {
    leader,
    fixedMembers = [],
    excludedCardIds = [],
    excludedLeaderCardIds = [],
    excludedMemberCardIds = [],
    leaderCandidateIds,
    requiredMemberHolomenIds = [],
    songBonus = 0,
    redByHolomen = {},
    account = NO_ACCOUNT_BONUS,
    eventScore,
    topN = 10,
    shortlistSize: shortlistSizeOption,
    onProgress,
    progressInterval = 200_000,
  } = request;

  if (fixedMembers.length > MEMBER_SLOTS) {
    throw new Error(`固定メンバーは最大 ${String(MEMBER_SLOTS)} 枚`);
  }
  const openSlots = MEMBER_SLOTS - fixedMembers.length;

  // メンバー 5 人同士は同一ホロメン不可。リーダーはメンバーと重複してよい(ゲーム仕様)
  const fixedHolomen = new Set(fixedMembers.map((c) => c.holomenId));
  if (fixedHolomen.size !== fixedMembers.length) {
    throw new Error("固定メンバーに同一ホロメンが重複している");
  }
  const excludedFromMembers = new Set([...excludedCardIds, ...excludedMemberCardIds]);
  const excludedFromLeaders = new Set([...excludedCardIds, ...excludedLeaderCardIds]);
  const fixedCardIds = new Set(fixedMembers.map((c) => c.id));

  const affIndex = buildAffIndex(holomenMap);
  const eventTargets = new Set(eventScore?.cardIds ?? []);
  // イベントスコアボーナスの倍率(対象カードがメンバーに 1 枚でもあれば掛ける。src/engine/event.ts)
  const eventMul = eventScore ? 1 + eventScore.percent / 100 : 1;

  const maxP0 = Math.max(...Object.values(ACTIVE_PROBABILITY));

  let nextIndex = 0;
  const compile = (card: Card): CompiledCard => {
    const view = compileDisplayMember(card, holomenMap, affIndex, account);
    const a = view.active;
    const sp = view.special;
    return {
      ...view,
      index: nextIndex++,
      eventTarget: eventTargets.has(card.id),
      supportPercentSum: view.supportEffects.reduce((sum, e) => sum + e.target.percent, 0),
      spFactorMax: sp
        ? ((sp.scoreSupportPercent * sp.durationSeconds) / SP_SUPPORT_DIVISOR) *
          (1 + (sp.rate?.percent ?? 0) / SP_RATE_UP_DIVISOR)
        : 0,
      upMax: a ? Math.max(a.scoreUpPercent, a.conditional?.percent ?? 0) : 0,
      pBase: a?.p0 ?? 0,
      pBlueValue: a?.pBlue ?? 0,
      baseSeconds: secondsOf(a?.onBase),
      blueSeconds: secondsOf(a?.onBlue),
    };
  };

  // 候補プール: 除外カードと、固定メンバーのカード・ホロメンを外す。
  // リーダーのカード・ホロメンは外さない(リーダーはメンバーを兼ねられる)。
  // プール内の同一ホロメン別カード同士は組合せ側で排他する。
  const pool = allCards
    .filter(
      (c) =>
        !excludedFromMembers.has(c.id) && !fixedCardIds.has(c.id) && !fixedHolomen.has(c.holomenId),
    )
    .map(compile);
  // 素値の大きい順に並べる: 上位候補が早く見つかり、上限枝刈りが早く効く(結果は順序に依存しない)
  pool.sort(
    (a, b) =>
      b.natural[0] + b.natural[1] + b.natural[2] - (a.natural[0] + a.natural[1] + a.natural[2]),
  );
  const fixed = fixedMembers.map(compile);
  const compiledCount = nextIndex;

  // リーダー候補: 指定があればその 1 枚。null なら除外カードを除く全カード(leaderCandidateIds で限定可)
  const leaderAllowed = leaderCandidateIds ? new Set(leaderCandidateIds) : null;
  const leaderCandidates = leader
    ? [leader]
    : allCards.filter(
        (c) =>
          !excludedFromLeaders.has(c.id) && (leaderAllowed === null || leaderAllowed.has(c.id)),
      );

  // 必須ホロメン: 再帰中は充足数を数え、残り枠で満たせなくなったら打ち切る
  const requiredHolomen = new Set(requiredMemberHolomenIds);
  let requiredMet = 0;

  /**
   * リーダーを「衣装スキル(条件 + 割合)と赤ボードが同一」の同型クラスにまとめる。
   * メンバー側の量はリーダー非依存なので、組合せを 1 回だけ列挙して葉ごとにクラス単位で評価すれば、
   * リーダー探索も O(組合せ数 × クラス数) で済む
   */
  interface LeaderClass {
    condition: CompiledCondition | null;
    percents: [number, number, number];
    red: RedInputs | null;
    /** 衣装スキル効果のメンバー別前計算(添字は CompiledCard.index) */
    costumeByCard: Float64Array;
    /** 衣装スキルのスコアサポート効果(表示スコアボーナス用) */
    supportEffects: CompiledSupportEffect[];
    /** 赤ボードの全員のスコアサポート効果(%) */
    redSupport: number;
    leaders: Card[];
  }
  const classMap = new Map<string, LeaderClass>();
  for (const leaderCard of leaderCandidates) {
    const costume = leaderCard.costumeSkill.structured;
    const condition = costume ? compileCondition(costume.condition, affIndex) : null;
    const percents = costumePercentsOf(costume);
    const redUnit = redByHolomen[leaderCard.holomenId];
    const red = redInputsOf(redUnit);
    const supportEffects = compileSupportEffects(costume, affIndex);
    const redSupport = redUnit?.scoreSupportPercent ?? 0;
    const key = JSON.stringify([condition, percents, red, supportEffects, redSupport]);
    const existing = classMap.get(key);
    if (existing) {
      existing.leaders.push(leaderCard);
    } else {
      classMap.set(key, {
        condition,
        percents,
        red,
        costumeByCard: new Float64Array(compiledCount),
        supportEffects,
        redSupport,
        leaders: [leaderCard],
      });
    }
  }
  const leaderClasses = [...classMap.values()];
  const leaderCount = leaderCandidates.length;
  for (const cls of leaderClasses) {
    for (const c of pool) cls.costumeByCard[c.index] = costumeEffectOf(c.natural, cls.percents);
    for (const c of fixed) cls.costumeByCard[c.index] = costumeEffectOf(c.natural, cls.percents);
  }

  // 枝刈り用(クラスごと): 赤の固定値 1 人分、衣装のスコアサポート % 合計による倍率の上限、
  // 赤『全員のスコアサポート効果』の shortlist 用保守上限。表示側の総増分は `(X/100) × E_blue` だが、
  // 上限としては E_blue ≤ 100 を使った X pt をそのまま採る(枝刈りを緩める側なので安全)。ゲーム内部式ではない。
  const enhancementMul = 1 + account.enhancementPercent / 100;
  const classRedFixed = new Float64Array(leaderClasses.length);
  const classBonusMul = new Float64Array(leaderClasses.length);
  const classRedGain = new Float64Array(leaderClasses.length);
  leaderClasses.forEach((cls, k) => {
    classRedFixed[k] = cls.red ? cls.red.fixed[0] + cls.red.fixed[1] + cls.red.fixed[2] : 0;
    const costumeSupport = cls.supportEffects.reduce((sum, e) => sum + e.target.percent, 0);
    classBonusMul[k] = 1 + costumeSupport / 100;
    classRedGain[k] = cls.redSupport;
  });
  // 葉ごとの枝刈りはクラスを「衣装効果の % ・赤・スコアサポート倍率・赤スコアサポートの増分」が同じグループにまとめて行う。
  // グループ内のクラスは条件だけが違うので、条件が満たされたときの上限はグループで 1 回計算すれば足りる
  interface LeaderGroup {
    classIndices: number[];
    costumeByCard: Float64Array;
    red: RedInputs | null;
    redFixed: number;
    bonusMul: number;
    /** 赤の全員のスコアサポートに対するshortlist用の保守上限(pt = X。総増分 (X/100) × E_blue の上から抑える値) */
    redGain: number;
  }
  const groupMap = new Map<string, LeaderGroup>();
  leaderClasses.forEach((cls, k) => {
    const key = JSON.stringify([cls.percents, cls.red, classBonusMul[k], classRedGain[k]]);
    const existing = groupMap.get(key);
    if (existing) existing.classIndices.push(k);
    else {
      groupMap.set(key, {
        classIndices: [k],
        costumeByCard: cls.costumeByCard,
        red: cls.red,
        redFixed: classRedFixed[k] ?? 0,
        bonusMul: classBonusMul[k] ?? 1,
        redGain: classRedGain[k] ?? 0,
      });
    }
  });
  const leaderGroups = [...groupMap.values()];
  // 葉ごとの足切りの前段(2026-10-08「計算の高速化」): 全グループをまとめた上限 1 つで先に比べる。赤の固定値・赤の割合・衣装の効果・
  // スコアサポートの倍率をそれぞれグループの最大で取るので、どのグループの上限(衣装が発動したとき)よりも小さくならない
  // (上限の式は各成分に単調)。これが最下位以下なら、どのグループも候補に入らないので、グループごとの計算を省いても結果は同じ
  const maxCostumeByCard = new Float64Array(compiledCount);
  const maxRedPercent = [0, 0, 0];
  let maxRedFixed = 0;
  let maxBonusScale = 0;
  for (const group of leaderGroups) {
    for (let i = 0; i < compiledCount; i++) {
      const v = group.costumeByCard[i] ?? 0;
      if (v > (maxCostumeByCard[i] ?? 0)) maxCostumeByCard[i] = v;
    }
    maxRedFixed = Math.max(maxRedFixed, group.redFixed);
    for (let p = 0; p < PARAM_COUNT; p++)
      maxRedPercent[p] = Math.max(maxRedPercent[p] ?? 0, group.red?.percent[p] ?? 0);
    maxBonusScale = Math.max(maxBonusScale, group.bonusMul * (1 + group.redGain / 100));
  }
  /** 前段を使うか(グループが 1 つなら、まとめた上限はそのグループの上限と同じなので省く) */
  const groupPrecheck = leaderGroups.length > 1;
  // 探索状態(再帰中のアロケーションなし。push/pop は確保済み容量を再利用する)
  const typeCounts = new Int32Array(3);
  const affCounts = new Int32Array(affIndex.size);
  const members: CompiledCard[] = [];
  const bonus = new Float64Array(MEMBER_SLOTS * PARAM_COUNT);
  const scratch = new Int32Array(MEMBER_SLOTS);
  // 上限用のタイムライン(秒ごとの分子 Σ up×p と分母 Σ p。青込み / 基準)と、正規化込みの合計 Σ_s 分子/max(1, 分母)。
  // メンバーの追加・削除で発動候補の秒だけを更新するので、葉では追加コストがほぼ「1 人ぶんの発動候補の秒数」で済む
  const numBlue = new Float64Array(VIRTUAL_TIMELINE_SECONDS + 1);
  const denBlue = new Float64Array(VIRTUAL_TIMELINE_SECONDS + 1);
  const numBase = new Float64Array(VIRTUAL_TIMELINE_SECONDS + 1);
  const denBase = new Float64Array(VIRTUAL_TIMELINE_SECONDS + 1);
  let sumBlue = 0;
  let sumBase = 0;
  const sumStack = new Float64Array(2 * (MEMBER_SLOTS + 1));
  let sumDepth = 0;
  /** 現在のメンバー 5 枠のうちイベントスコアボーナスの対象カードの枚数 */
  let eventTargetCount = 0;

  const ratioBlue = new Float64Array(VIRTUAL_TIMELINE_SECONDS + 1);
  const ratioBase = new Float64Array(VIRTUAL_TIMELINE_SECONDS + 1);
  /** メンバーを加えたときの Σ_s 分子/max(1, 分母) の増分。write = false なら配列を書き換えず増分だけ返す(最後の 1 枠用) */
  const addTimeline = (
    seconds: Int16Array,
    num: Float64Array,
    den: Float64Array,
    ratio: Float64Array,
    up: number,
    p: number,
    write: boolean,
  ): number => {
    let delta = 0;
    const add = up * p;
    for (let i = 0; i < seconds.length; i++) {
      const s = seconds[i] as number;
      const n1 = (num[s] as number) + add;
      const d1 = (den[s] as number) + p;
      const r1 = n1 / (d1 > 1 ? d1 : 1);
      delta += r1 - (ratio[s] as number);
      if (write) {
        num[s] = n1;
        den[s] = d1;
        ratio[s] = r1;
      }
    }
    return delta;
  };
  const removeTimeline = (
    seconds: Int16Array,
    num: Float64Array,
    den: Float64Array,
    ratio: Float64Array,
    up: number,
    p: number,
  ): void => {
    for (let i = 0; i < seconds.length; i++) {
      const s = seconds[i] as number;
      const n0 = (num[s] as number) - up * p;
      const d0 = (den[s] as number) - p;
      num[s] = n0;
      den[s] = d0;
      ratio[s] = n0 / (d0 > 1 ? d0 : 1);
    }
  };
  /** peek = true は最後の 1 枠用: 上限用タイムラインの配列は書き換えず、合計だけ更新する(removeMember も同じ peek で呼ぶ) */
  const addMember = (c: CompiledCard, peek = false): void => {
    if (c.upMax > 0) {
      sumStack[sumDepth++] = sumBlue;
      sumStack[sumDepth++] = sumBase;
      sumBlue += addTimeline(
        c.blueSeconds,
        numBlue,
        denBlue,
        ratioBlue,
        c.upMax,
        c.pBlueValue,
        !peek,
      );
      sumBase += addTimeline(c.baseSeconds, numBase, denBase, ratioBase, c.upMax, c.pBase, !peek);
    }
    members.push(c);
    typeCounts[c.typeIndex] = (typeCounts[c.typeIndex] ?? 0) + 1;
    for (const a of c.affIndices) affCounts[a] = (affCounts[a] ?? 0) + 1;
    if (c.eventTarget) eventTargetCount++;
    if (requiredHolomen.has(c.card.holomenId)) requiredMet++;
  };
  const removeMember = (peek = false): void => {
    const c = members.pop();
    if (!c) return;
    if (c.upMax > 0) {
      if (!peek) {
        removeTimeline(c.blueSeconds, numBlue, denBlue, ratioBlue, c.upMax, c.pBlueValue);
        removeTimeline(c.baseSeconds, numBase, denBase, ratioBase, c.upMax, c.pBase);
      }
      sumBase = sumStack[--sumDepth] as number;
      sumBlue = sumStack[--sumDepth] as number;
    }
    typeCounts[c.typeIndex] = (typeCounts[c.typeIndex] ?? 0) - 1;
    for (const a of c.affIndices) affCounts[a] = (affCounts[a] ?? 0) - 1;
    if (c.eventTarget) eventTargetCount--;
    if (requiredHolomen.has(c.card.holomenId)) requiredMet--;
  };
  for (const c of fixed) addMember(c);

  // 「通り」= (リーダー, メンバー組合せ) の組の数(従来の表示と同じ意味を保つ)
  // 総組合せ数(進捗表示用)。必須ホロメンがあれば「未充足のホロメンをすべて含む組合せ」に
  // 包除原理で絞る(同一ホロメン排他は従来どおり数えない概算)
  const unmetRequiredCounts = [...requiredHolomen]
    .filter((h) => !fixedHolomen.has(h))
    .map((h) => pool.filter((c) => c.card.holomenId === h).length);
  let memberCombos = 0;
  for (let mask = 0; mask < 1 << unmetRequiredCounts.length; mask++) {
    let removed = 0;
    let bits = 0;
    for (let i = 0; i < unmetRequiredCounts.length; i++) {
      if (mask & (1 << i)) {
        removed += unmetRequiredCounts[i] ?? 0;
        bits++;
      }
    }
    memberCombos += (bits % 2 === 0 ? 1 : -1) * combinationCount(pool.length - removed, openSlots);
  }
  const total = memberCombos * leaderCount;
  /**
   * 探索中は「上限値」(総合力の上限 × (1 + スコアボーナスの上限))で上位 shortlistSize 件を集め、
   * 探索後にその候補だけをタイムラインで正確に評価して並べ直す。上位 topN 件が厳密な上位だと証明できなければ
   * 2 パス目で集め直す(組合せが多すぎる探索を除く。その場合は近似。詳細表示の値は常に正確)
   */
  const baseShortlistSize = shortlistSizeOption ?? Math.max(SHORTLIST_MIN, topN * SHORTLIST_FACTOR);
  // shortlist はリーダークラス単位で持つ(同じクラスのリーダーは正確な値も同じ)。正確評価の前にリーダーへ展開する。
  // 探索は 1〜2 パス(探索の後半の「上限値の取りこぼしの検証」を参照)。パスごとに件数の上限 shortlistSize と、
  // これ以下の上限値は集めない床 boundFloor が変わる
  let shortlistSize = baseShortlistSize;
  let boundFloor = -Infinity;
  /** 探索の分担(2026-10-08「計算の高速化」): 組合せの 1 枚目のプール内の添字が count で割って index 余るものだけを数える。分けないときは 0 / 1 */
  let partitionIndex = 0;
  let partitionCount = 1;
  const topScores: number[] = [];
  /**
   * 上限値が同じ候補どうしの順(小さいほうが上)。組合せのプール内の添字の辞書順の番号 × クラス数 + クラス。
   * 何本に分けて探しても、shortlist に残る候補と正確に評価する順が同じになるように、同点を見つけた順ではなくこの番号で決める
   */
  const topSeqs: number[] = [];
  /** 空き枠ぶんのプール内の添字(固定メンバーは含めない)。1 件あたり openSlots 個ずつ、ヒープの位置の順に並べる */
  let topPaths = new Int16Array(Math.max(1, openSlots) * 1024);
  const topClasses: number[] = [];
  let evaluated = 0;
  let sinceProgress = 0;
  let reportProgress = true;
  /** いまの組合せのプール内の添字(空き枠ぶん)と、その辞書順の番号 */
  const path = new Int16Array(openSlots);
  let depth = 0;
  let pathRank = 0;
  const classCount = leaderClasses.length;

  // shortlist は上限値の最小ヒープ(根が最下位)。件数が多い検証パスでも 1 件の挿入が O(log N) で済む
  /** i の候補が j より下か(上限値が小さい、同じなら番号が大きい) */
  const below = (i: number, j: number): boolean => {
    const si = topScores[i] as number;
    const sj = topScores[j] as number;
    return si < sj || (si === sj && (topSeqs[i] as number) > (topSeqs[j] as number));
  };
  const swapTop = (i: number, j: number): void => {
    const s = topScores[i] as number;
    topScores[i] = topScores[j] as number;
    topScores[j] = s;
    const q = topSeqs[i] as number;
    topSeqs[i] = topSeqs[j] as number;
    topSeqs[j] = q;
    for (let k = 0; k < openSlots; k++) {
      const a = i * openSlots + k;
      const b = j * openSlots + k;
      const m = topPaths[a] as number;
      topPaths[a] = topPaths[b] as number;
      topPaths[b] = m;
    }
    const c = topClasses[i] as number;
    topClasses[i] = topClasses[j] as number;
    topClasses[j] = c;
  };
  const siftUp = (from: number): void => {
    let i = from;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!below(i, parent)) break;
      swapTop(parent, i);
      i = parent;
    }
  };
  const siftDown = (from: number): void => {
    let i = from;
    const n = topScores.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < n && below(l, smallest)) smallest = l;
      if (r < n && below(r, smallest)) smallest = r;
      if (smallest === i) break;
      swapTop(i, smallest);
      i = smallest;
    }
  };
  /** 満杯のときの最下位の上限値(満杯でなければ -Infinity)。これ未満の編成は shortlist に入らない(同じ値なら番号で決める) */
  const shortlistWorst = (): number =>
    topScores.length >= shortlistSize ? (topScores[0] as number) : -Infinity;

  const insertCandidate = (score: number, classIndex: number): void => {
    if (score <= boundFloor) return;
    const seq = pathRank * classCount + classIndex;
    if (topScores.length >= shortlistSize) {
      const root = topScores[0] as number;
      if (score < root || (score === root && seq > (topSeqs[0] as number))) return;
      topScores[0] = score;
      topSeqs[0] = seq;
      topPaths.set(path, 0);
      topClasses[0] = classIndex;
      siftDown(0);
      return;
    }
    const at = topScores.length;
    if ((at + 1) * openSlots > topPaths.length) {
      const grown = new Int16Array(topPaths.length * 2);
      grown.set(topPaths);
      topPaths = grown;
    }
    topScores.push(score);
    topSeqs.push(seq);
    topPaths.set(path, at * openSlots);
    topClasses.push(classIndex);
    siftUp(at);
  };

  const evaluate = (): void => {
    evaluated += leaderCount;
    sinceProgress += leaderCount;
    if (reportProgress && onProgress && sinceProgress >= progressInterval) {
      sinceProgress = 0;
      onProgress(evaluated, total);
    }
    passiveParamBonus(members, typeCounts, affCounts, bonus, scratch);
    // イベントスコアボーナスはユニットスコア(試算)の後に掛ける倍率(上限値にもそのまま使える)。
    // 黄はスコアボーナスの中(ボード欄)に入るので、下の scoreBonusBound 側で足す
    const modifierFactor = eventTargetCount > 0 ? eventMul : 1;
    const worst = Math.max(boundFloor, shortlistWorst());

    // 上限値: リーダー非依存の量(素値・ボード・パッシブ・メモリー)にクラスごとの衣装・赤を足した総合力の上限と、
    // 同時候補の正規化を入れた秒ごとの合計(下の `sumBlue` / `sumBase`)によるスコアボーナスの上限。
    // 切り上げの上振れは強化ボーナス 5 人分 + 赤 3 つを足して吸収する
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let rest = 0;
    let spFactor = 0;
    let passiveSupportSum = 0;
    for (let m = 0; m < MEMBER_SLOTS; m++) {
      const c = members[m];
      if (!c) continue;
      n0 += c.natural[0];
      n1 += c.natural[1];
      n2 += c.natural[2];
      rest += c.boardDelta + c.memorySum;
      for (let p = 0; p < PARAM_COUNT; p++) rest += bonus[m * PARAM_COUNT + p] ?? 0;
      spFactor += c.spFactorMax;
      passiveSupportSum += c.supportPercentSum;
    }
    // アクティブ + ボード + パッシブ ≤ 青込みの上限 × (1 + パッシブのスコアサポート × 最大確率) × 衣装の倍率
    //   + 赤の全員のスコアサポートの保守上限(X。総増分 (X/100) × E_blue ≤ X)、
    // SP ≤ (基準の上限 + 0.1) × Σ 係数(発動率 UP は成立側)。表示アクティブ欄は raw を 0.1% 単位で切り上げた値なので
    // 基準の上限 + 0.1 で上から抑える。+0.3 は 5 項目の表示丸め(最大 +0.05 × 5)の余裕
    // 上限は「秒ごとの Σ up×p / max(1, Σ p)」をスコア UP の最大値で評価した値(`numBlue` ほか。histogramScore と同じ正規化で、
    // 実際のスコア UP は最大値以下なので上限のまま)。同時候補の正規化を無視した線形和(`blueLinear` / `rawLinear`)は、
    // 青ボードで発動率・頻度を上げたアカウントほど正確な値の 1.3 倍近くまで緩み、shortlist が上限値の緩い編成で埋まって
    // 真の上位を落としていた(2026-09-30)。線形和は正規化込みの値以上なので、ここでは使わない。
    // 浮動小数の加減算の積み残しぶん 1e-9 を見込む
    const blueBound = (sumBlue / VIRTUAL_TIMELINE_SECONDS) * (1 + 1e-9);
    const baseBound = (sumBase / VIRTUAL_TIMELINE_SECONDS) * (1 + 1e-9);
    const memberBonusLinear = blueBound * (1 + (passiveSupportSum * maxP0) / 100);
    const spBound = (baseBound + 0.1) * spFactor + 0.3;
    // 黄(曲を選んだとき)はボード欄に 黄 × (100 + 衣装 + アクティブ + パッシブ + SP) として入る(songBoardRaw)。
    // 5 欄の合計 X に対し 黄込みの合計 = X + 黄 × (100 + X − ボード) ≤ X × (1 + 黄) + 100 × 黄(ボード ≥ 0)なので、
    // 5 欄の合計の上限 U(衣装の倍率 bonusMul 込み)を U × (1 + 黄) + 100 × 黄 に置き換えれば上限のまま(候補共通の倍率ではないが単調)
    const songScale = 1 + songBonus;
    const songOffset = 100 * songBonus;
    const baseParams = n0 + n1 + n2 + rest;
    if (groupPrecheck) {
      const redPercentMax =
        ceilPercent(n0, maxRedPercent[0] ?? 0) +
        ceilPercent(n1, maxRedPercent[1] ?? 0) +
        ceilPercent(n2, maxRedPercent[2] ?? 0);
      let costumeMax = 0;
      for (let m = 0; m < MEMBER_SLOTS; m++) {
        const c = members[m];
        if (c) costumeMax += maxCostumeByCard[c.index] ?? 0;
      }
      const powerMax =
        (baseParams + maxRedFixed * MEMBER_SLOTS + redPercentMax) * enhancementMul +
        MEMBER_SLOTS +
        PARAM_COUNT +
        costumeMax * enhancementMul;
      const scoreBonusMax = (memberBonusLinear * maxBonusScale + spBound) * songScale + songOffset;
      // 掛け算の順が違うぶんの浮動小数の差(1 ulp 程度)で上限を下回らないよう、わずかに大きく取る
      const boundMax =
        displayUnitScore(powerMax * (1 + 1e-9), scoreBonusMax * (1 + 1e-9)) * modifierFactor;
      if (boundMax < worst) return;
    }
    for (const group of leaderGroups) {
      const redPercent = group.red
        ? ceilPercent(n0, group.red.percent[0]) +
          ceilPercent(n1, group.red.percent[1]) +
          ceilPercent(n2, group.red.percent[2])
        : 0;
      const powerNoCostume =
        (baseParams + group.redFixed * MEMBER_SLOTS + redPercent) * enhancementMul +
        MEMBER_SLOTS +
        PARAM_COUNT;
      let costume = 0;
      for (let m = 0; m < MEMBER_SLOTS; m++) {
        const c = members[m];
        if (c) costume += group.costumeByCard[c.index] ?? 0;
      }
      // 赤の全員のスコアサポートの総増分は (X/100) × E_blue(青込みの期待スコア UP)。E_blue を上の上限(パッシブ・衣装の倍率込み)で抑える
      // (以前は E_blue ≤ 100 として X をそのまま採っていたが、E_blue は 100 を超えうるので上限にならない)
      const scoreBonusBound =
        (memberBonusLinear * group.bonusMul * (1 + group.redGain / 100) + spBound) * songScale +
        songOffset;
      // 衣装スキルが発動したときの上限。これが最下位以下ならグループ内のどのクラスも候補に入らない
      const metBound =
        displayUnitScore(powerNoCostume + costume * enhancementMul, scoreBonusBound) *
        modifierFactor;
      if (metBound < worst) continue;
      let unmetBound = -1;
      for (const k of group.classIndices) {
        const cls = leaderClasses[k];
        if (!cls) continue;
        const met = cls.condition !== null && conditionMet(cls.condition, typeCounts, affCounts);
        if (met) {
          insertCandidate(metBound, k);
          continue;
        }
        if (unmetBound < 0) {
          unmetBound = displayUnitScore(powerNoCostume, scoreBonusBound) * modifierFactor;
        }
        if (unmetBound < worst) continue;
        insertCandidate(unmetBound, k);
      }
    }
  };

  const recurse = (startIndex: number, remaining: number): void => {
    // 必須ホロメンの未充足数が残り枠を超えたら、この枝では満たせない
    if (requiredHolomen.size - requiredMet > remaining) return;
    if (remaining === 0) {
      evaluate();
      return;
    }
    for (let i = startIndex; i <= pool.length - remaining; i++) {
      // 探索の分担: 組合せの 1 枚目だけを添字の余りで分ける
      if (depth === 0 && i % partitionCount !== partitionIndex) continue;
      const card = pool[i];
      if (!card) continue;
      // 同一ホロメンの別カードとの排他(プール内・固定メンバー含む)
      let duplicated = false;
      for (let m = 0; m < members.length; m++) {
        if (members[m]?.card.holomenId === card.card.holomenId) {
          duplicated = true;
          break;
        }
      }
      if (duplicated) continue;
      const last = remaining === 1;
      addMember(card, last);
      path[depth] = i;
      depth += 1;
      const rank = pathRank;
      pathRank = pathRank * pool.length + i;
      recurse(i + 1, remaining - 1);
      pathRank = rank;
      depth -= 1;
      removeMember(last);
    }
  };

  /** 1 パスぶん数えて、shortlist(上限値の上位)を返す。床・件数・分担はパスごと */
  const enumerate = (pass: SearchPass): { shortlist: Shortlist; evaluated: number } => {
    shortlistSize = pass.size;
    boundFloor = pass.floor;
    partitionIndex = pass.partition.index;
    partitionCount = pass.partition.count;
    reportProgress = pass.progress;
    evaluated = 0;
    sinceProgress = 0;
    topScores.length = 0;
    topSeqs.length = 0;
    topClasses.length = 0;
    depth = 0;
    pathRank = 0;
    // 空き枠がないとき(6 枠すべて固定)は組合せが 1 通りなので、分担の 0 番だけが数える
    if (openSlots > 0 || partitionIndex === 0) recurse(0, openSlots);
    if (pass.progress) onProgress?.(evaluated, total);
    // 上限値の高い順(同じなら番号の小さい順)に並べて返す。分担ごとの上位を合わせるときも、正確に評価するときもこの順で読む
    const n = topScores.length;
    const order = Array.from({ length: n }, (_, i) => i).sort(
      (x, y) =>
        (topScores[y] as number) - (topScores[x] as number) ||
        (topSeqs[x] as number) - (topSeqs[y] as number),
    );
    const shortlist: Shortlist = {
      scores: new Float64Array(n),
      seqs: new Float64Array(n),
      classes: new Int32Array(n),
      paths: new Int16Array(n * openSlots),
    };
    order.forEach((from, to) => {
      shortlist.scores[to] = topScores[from] as number;
      shortlist.seqs[to] = topSeqs[from] as number;
      shortlist.classes[to] = topClasses[from] as number;
      shortlist.paths.set(
        topPaths.subarray(from * openSlots, (from + 1) * openSlots),
        to * openSlots,
      );
    });
    return { shortlist, evaluated };
  };

  // shortlist の候補を 1 件ずつ正確に評価する(総合力 + タイムライン。曲を選んでいれば黄込み)。
  // クラス内のリーダーは正確な値も同じ(衣装・赤・スコアサポートが同一)なので、1 回計算してリーダーへ展開する
  const scoreEntry = (memberCards: Card[], classIndex: number): ScoredCandidate[] => {
    const cls = leaderClasses[classIndex];
    const leaderCard = cls?.leaders[0];
    if (!cls || !leaderCard) return [];
    const scored = scoreTeam(leaderCard, memberCards, holomenMap, {
      red: redByHolomen[leaderCard.holomenId] ?? null,
      account,
      songBonus,
      ...(eventScore ? { eventScore } : {}),
    });
    return cls.leaders.map((l) => ({
      leader: l,
      members: scored.members,
      breakdown: scored.breakdown,
      display: scored.display,
      modifiers: scored.modifiers,
    }));
  };

  /**
   * shortlist を上限値の高い順(同じなら番号の小さい順)に正確に評価し、`compareRanked` の順で上位 topN 件を返す。
   * 上位 topN 件の正確な値 T が次の候補の上限値以上になったら打ち切る(上限値は正確な値以上なので、残りは topN 件に入りえない)
   */
  const score = (shortlist: Shortlist, take: number): RankedCandidate[] => {
    const { scores, seqs, classes, paths } = shortlist;
    const ranked: RankedCandidate[] = [];
    const best: number[] = []; // 正確な値の上位 topN 件(降順)
    const kth = (): number => (best.length >= topN ? (best[topN - 1] ?? -Infinity) : -Infinity);
    for (let i = 0; i < Math.min(take, scores.length); i++) {
      const bound = scores[i] ?? 0;
      if (bound <= kth()) break;
      const memberCards = [
        ...fixed.map((c) => c.card),
        ...Array.from(paths.subarray(i * openSlots, (i + 1) * openSlots), (p) => {
          const c = pool[p];
          if (!c) throw new Error(`プールの添字が範囲外: ${String(p)}`);
          return c.card;
        }),
      ];
      scoreEntry(memberCards, classes[i] ?? -1).forEach((c, leaderOrder) => {
        ranked.push({ ...c, bound, seq: seqs[i] ?? 0, leaderOrder });
        const v = c.modifiers.adjustedUnitScore;
        let pos = best.length;
        while (pos > 0 && (best[pos - 1] ?? 0) < v) pos--;
        if (pos < topN) {
          best.splice(pos, 0, v);
          if (best.length > topN) best.length = topN;
        }
      });
    }
    ranked.sort(compareRanked);
    return ranked.slice(0, topN);
  };

  return { total, topN, baseShortlistSize, openSlots, enumerate, score };
}
