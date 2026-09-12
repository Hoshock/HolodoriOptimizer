import type { RedUnitEffects } from "../data/redBoard";
import type { Card } from "../data/types";
import type {
  CompiledSupportEffect,
  DisplayMemberView,
  DisplayScoreBreakdown,
} from "./displayScore";
import type { AccountBonus, CompiledCondition, RedInputs, StaticPowerBreakdown } from "./power";
import type { HolomenMap } from "./score";
import {
  ACTIVE_PROBABILITY,
  compileDisplayMember,
  compileSupportEffects,
  computeDisplayScoreBonus,
  displayUnitScore,
  SP_RATE_SECONDS,
  SP_SUPPORT_DIVISOR,
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
 * タイムライン評価(displayScore.ts)は葉ごとに行うには重いので、探索中は「上限値」(総合力の上限 × (1 + スコアボーナスの
 * 正規化なし線形上限))で上位 shortlistSize 件を集め、探索後にその候補だけを computeStaticPower / computeDisplayScoreBonus で
 * 正確に評価して並べ直す(絞り込みは近似、表示する値は正確 — 2026-09-08。真の上位が漏れないことの検証は
 * src/engine/exactSearch.ts の全候補評価と比べる exactSearch.test.ts で行う)。組合せ生成は再帰インデックス方式で、
 * 将来の Web Worker 分割(先頭インデックスでのチャンク化)を想定している。
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
   * true ならリーダーの衣装スキルが発動しない編成を候補から除く。
   * 衣装スキルが未構造化(structured: null)のリーダーは判定できないため除かない
   */
  requireCostumeSkill?: boolean;
  /**
   * true ならメンバー 5 人のパッシブがひとつでも発動しない編成を候補から除く。
   * 未構造化のパッシブは判定できないため除かない
   */
  requireAllPassives?: boolean;
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
   * 通常スコアを求めた後に掛ける隔離した実装で、省略時はなし。リーダー枠は判定に含めない(ゲーム仕様 — 2026-09-08 ユーザー確認)
   */
  eventScore?: { percent: number; cardIds: readonly string[] };
  /** 返す候補数(既定 10) */
  topN?: number;
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

export interface OptimizeResult {
  /** 順位づけの値(曲条件つきユニットスコア(試算) × イベント)の降順の候補(リーダー探索時は候補ごとにリーダーが異なりうる) */
  candidates: {
    leader: Card;
    members: Card[];
    breakdown: StaticPowerBreakdown;
    /** メニュー画面のスコアボーナス 4 項目とユニットスコアの試算(src/engine/displayScore.ts。曲を選んでいれば黄込み。順位づけの値の元) */
    display: DisplayScoreBreakdown;
    modifiers: ScoreModifierBreakdown;
  }[];
  /** 評価した組合せ数 */
  evaluated: number;
}

/** 絞り込みの件数: topN × この倍率(最小 SHORTLIST_MIN)。上限値と正確な値の比(1.0〜1.3)を吸収する余裕 */
export const SHORTLIST_FACTOR = 50;
export const SHORTLIST_MIN = 500;

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
  /** 枝刈りの上限用: 正規化なしのアクティブ寄与(%)(基準 / 青込み) */
  linearRaw: number;
  linearBlue: number;
  /** 枝刈りの上限用: 確率を +r ポイントにしたときの正規化なし寄与の増分(%)。r は SP の発動率 UP の値ごと */
  linearDelta: Float64Array;
  /** 枝刈りの上限用: SP のスコアサポート% × 効果時間 / 12000 */
  spSupportFactor: number;
  /** 枝刈りの上限用: SP の発動率 UP の効果時間 / 100 と、その r の添字(発動率 UP がなければ 0 / -1) */
  spRateFactor: number;
  spRateIndex: number;
}

/**
 * 順位づけの倍率(曲条件つきユニットスコア(試算)に後から掛ける)。**イベントスコアボーナスだけ**。
 * 黄の楽曲スコアボーナスは display.unitScore に組み込み済みなのでここには入れない(2026-09-11。二重に掛けない)。
 * イベントの適用位置は未確認のまま(pending 11)— 黄が確定したからといってイベントも同じとは扱わない
 */
export function scoreModifierFactor(modifiers: Pick<ScoreModifierBreakdown, "eventBonus">): number {
  return 1 + modifiers.eventBonus;
}

export function optimize(
  request: OptimizeRequest,
  allCards: Card[],
  holomenMap: HolomenMap,
): OptimizeResult {
  const {
    leader,
    fixedMembers = [],
    excludedCardIds = [],
    excludedLeaderCardIds = [],
    excludedMemberCardIds = [],
    leaderCandidateIds,
    requiredMemberHolomenIds = [],
    requireCostumeSkill = false,
    requireAllPassives = false,
    songBonus = 0,
    redByHolomen = {},
    account = NO_ACCOUNT_BONUS,
    eventScore,
    topN = 10,
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

  // SP の発動率 UP の値(全カードで数種類)。枝刈りの上限で「全員の確率を +r にした線形和の増分」を値ごとに前計算する
  const spRates = [
    ...new Set(
      allCards
        .map((c) => c.specialSkill.structured?.skillRateUp?.percent ?? 0)
        .filter((r) => r > 0),
    ),
  ].sort((a, b) => a - b);
  const maxP0 = Math.max(...Object.values(ACTIVE_PROBABILITY));

  let nextIndex = 0;
  const compile = (card: Card): CompiledCard => {
    const view = compileDisplayMember(card, holomenMap, affIndex, account);
    const a = view.active;
    const sp = view.special;
    const linearDelta = new Float64Array(spRates.length);
    if (a) {
      spRates.forEach((r, i) => {
        linearDelta[i] = (a.linearRaw / a.p0) * (Math.min(1, a.p0 + r / 100) - a.p0);
      });
    }
    return {
      ...view,
      index: nextIndex++,
      eventTarget: eventTargets.has(card.id),
      supportPercentSum: view.supportEffects.reduce((sum, e) => sum + e.target.percent, 0),
      linearRaw: a?.linearRaw ?? 0,
      linearBlue: a?.linearBlue ?? 0,
      linearDelta,
      spSupportFactor: sp ? (sp.scoreSupportPercent * sp.durationSeconds) / SP_SUPPORT_DIVISOR : 0,
      spRateFactor: sp?.rate ? sp.durationSeconds / SP_RATE_SECONDS : 0,
      spRateIndex: sp?.rate ? spRates.indexOf(sp.rate.percent) : -1,
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
  // 赤『全員のスコアサポート効果』の shortlist 用保守上限。一般式は未解明なので、
  // 現行の既知近似 redScoreSupportDisplayGain より緩い X pt を枝刈り上限として使う。ゲーム内部式ではない。
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
    /** 赤の全員のスコアサポートに対するshortlist用の保守上限(pt = X。一般式は未解明) */
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
  // 探索状態(再帰中のアロケーションなし。push/pop は確保済み容量を再利用する)
  const typeCounts = new Int32Array(3);
  const affCounts = new Int32Array(affIndex.size);
  const members: CompiledCard[] = [];
  const bonus = new Float64Array(MEMBER_SLOTS * PARAM_COUNT);
  const scratch = new Int32Array(MEMBER_SLOTS);
  /** 現在のメンバー 5 枠のうちイベントスコアボーナスの対象カードの枚数 */
  let eventTargetCount = 0;

  const addMember = (c: CompiledCard): void => {
    members.push(c);
    typeCounts[c.typeIndex] = (typeCounts[c.typeIndex] ?? 0) + 1;
    for (const a of c.affIndices) affCounts[a] = (affCounts[a] ?? 0) + 1;
    if (c.eventTarget) eventTargetCount++;
    if (requiredHolomen.has(c.card.holomenId)) requiredMet++;
  };
  const removeMember = (): void => {
    const c = members.pop();
    if (!c) return;
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
   * 探索中は「上限値」(総合力の上限 × (1 + スコアボーナスの線形上限))で上位 shortlistSize 件を集め、
   * 探索後にその候補だけをタイムラインで正確に評価して並べ直す。上限値は正確な値の 1.0〜1.3 倍なので
   * 真の上位が絞り込みから漏れる可能性はごく小さいが 0 ではない(近似。詳細表示の値は常に正確)
   */
  const shortlistSize = Math.max(SHORTLIST_MIN, topN * SHORTLIST_FACTOR);
  // shortlist はリーダークラス単位で持つ(同じクラスのリーダーは正確な値も同じ)。正確評価の前にリーダーへ展開する
  const topScores: number[] = [];
  const topMembers: Card[][] = [];
  const topClasses: number[] = [];
  let evaluated = 0;
  let sinceProgress = 0;

  const insertCandidate = (score: number, classIndex: number): void => {
    const worst = topScores[topScores.length - 1] ?? -Infinity;
    if (topScores.length >= shortlistSize && score <= worst) return;
    // 挿入位置を二分探索(降順)
    let lo = 0;
    let hi = topScores.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((topScores[mid] ?? -Infinity) >= score) lo = mid + 1;
      else hi = mid;
    }
    topScores.splice(lo, 0, score);
    topMembers.splice(
      lo,
      0,
      members.map((c) => c.card),
    );
    topClasses.splice(lo, 0, classIndex);
    if (topScores.length > shortlistSize) {
      topScores.length = shortlistSize;
      topMembers.length = shortlistSize;
      topClasses.length = shortlistSize;
    }
  };

  const evaluate = (): void => {
    evaluated += leaderCount;
    sinceProgress += leaderCount;
    if (onProgress && sinceProgress >= progressInterval) {
      sinceProgress = 0;
      onProgress(evaluated, total);
    }
    // しぼりこみ: パッシブが 1 人でも不発なら、この 5 人はどのリーダーでも候補にしない
    if (requireAllPassives) {
      for (let s = 0; s < MEMBER_SLOTS; s++) {
        const cond = members[s]?.passiveCondition;
        if (cond && !conditionMet(cond, typeCounts, affCounts)) return;
      }
    }
    passiveParamBonus(members, typeCounts, affCounts, bonus, scratch);
    // イベントスコアボーナスはユニットスコア(試算)の後に掛ける倍率(上限値にもそのまま使える)。
    // 黄はスコアボーナスの中(ボード欄)に入るので、下の scoreBonusBound 側で足す
    const modifierFactor = eventTargetCount > 0 ? eventMul : 1;
    const worst =
      topScores.length >= shortlistSize
        ? (topScores[topScores.length - 1] ?? -Infinity)
        : -Infinity;

    // 上限値: リーダー非依存の量(素値・ボード・パッシブ・メモリー)にクラスごとの衣装・赤を足した総合力の上限と、
    // 正規化なしの線形和(タイムラインの正規化は必ず値を下げる)によるスコアボーナスの上限。
    // 切り上げの上振れは強化ボーナス 5 人分 + 赤 3 つを足して吸収する
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let rest = 0;
    let rawLinear = 0;
    let blueLinear = 0;
    let spSupport = 0;
    let passiveSupportSum = 0;
    for (let m = 0; m < MEMBER_SLOTS; m++) {
      const c = members[m];
      if (!c) continue;
      n0 += c.natural[0];
      n1 += c.natural[1];
      n2 += c.natural[2];
      rest += c.boardDelta + c.memorySum;
      for (let p = 0; p < PARAM_COUNT; p++) rest += bonus[m * PARAM_COUNT + p] ?? 0;
      rawLinear += c.linearRaw;
      blueLinear += c.linearBlue;
      spSupport += c.spSupportFactor;
      passiveSupportSum += c.supportPercentSum;
    }
    // SP の発動率 UP: 正規化した期待値の増分 ≤ 分子(線形和)の増分なので、値ごとの線形増分の合計で上から抑える
    let spRateBound = 0;
    for (let m = 0; m < MEMBER_SLOTS; m++) {
      const c = members[m];
      if (!c || c.spRateIndex < 0) continue;
      let delta = 0;
      for (let j = 0; j < MEMBER_SLOTS; j++) delta += members[j]?.linearDelta[c.spRateIndex] ?? 0;
      spRateBound += c.spRateFactor * delta;
    }
    // アクティブ + ボード + パッシブ ≤ 青込み線形和 × (1 + パッシブのスコアサポート × 最大確率) × 衣装の倍率
    //   + 赤の全員のスコアサポートの保守上限(X。一般式は未解明。現行legacy近似でも増分≤X)、
    // SP ≤ 基準線形和 × Σ(サポート × 時間)/12000 + 発動率 UP の線形増分。+0.3 は 4 項目の表示丸め(最大 +0.05 × 4)の余裕
    const memberBonusLinear = blueLinear * (1 + (passiveSupportSum * maxP0) / 100);
    const spBound = rawLinear * spSupport + spRateBound + 0.3;
    // 黄(曲を選んだとき)はボード欄に 黄 × (100 + 衣装 + アクティブ + パッシブ + SP) として入る(songBoardRaw)。
    // 5 欄の合計 X に対し 黄込みの合計 = X + 黄 × (100 + X − ボード) ≤ X × (1 + 黄) + 100 × 黄(ボード ≥ 0)なので、
    // 5 欄の合計の上限 U(衣装の倍率 bonusMul 込み)を U × (1 + 黄) + 100 × 黄 に置き換えれば上限のまま(候補共通の倍率ではないが単調)
    const songScale = 1 + songBonus;
    const songOffset = 100 * songBonus;
    const baseParams = n0 + n1 + n2 + rest;
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
      const scoreBonusBound =
        (memberBonusLinear * group.bonusMul + group.redGain + spBound) * songScale + songOffset;
      let costume = 0;
      for (let m = 0; m < MEMBER_SLOTS; m++) {
        const c = members[m];
        if (c) costume += group.costumeByCard[c.index] ?? 0;
      }
      // 衣装スキルが発動したときの上限。これが最下位以下ならグループ内のどのクラスも候補に入らない
      const metBound =
        displayUnitScore(powerNoCostume + costume * enhancementMul, scoreBonusBound) *
        modifierFactor;
      if (metBound <= worst) continue;
      let unmetBound = -1;
      for (const k of group.classIndices) {
        const cls = leaderClasses[k];
        if (!cls) continue;
        const met = cls.condition !== null && conditionMet(cls.condition, typeCounts, affCounts);
        // しぼりこみ: 衣装スキル不発のリーダーは候補にしない(未構造化は判定不能なので残す)
        if (requireCostumeSkill && cls.condition !== null && !met) continue;
        if (met) {
          insertCandidate(metBound, k);
          continue;
        }
        if (unmetBound < 0) {
          unmetBound = displayUnitScore(powerNoCostume, scoreBonusBound) * modifierFactor;
        }
        if (unmetBound <= worst) continue;
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
      addMember(card);
      recurse(i + 1, remaining - 1);
      removeMember();
    }
  };

  recurse(0, openSlots);
  onProgress?.(evaluated, total);

  // 絞り込んだ候補を正確に評価し(総合力 + タイムライン。曲を選んでいれば黄込み)、ユニットスコア(試算)× イベントで
  // 並べ直して上位 topN 件を返す
  const scored = topMembers.flatMap((memberCards, i) => {
    const cls = leaderClasses[topClasses[i] ?? -1];
    if (!cls) return [];
    // クラス内のリーダーは正確な値も同じ(衣装・赤・スコアサポートが同一)なので、1 回計算して展開する
    const leaderCard = cls.leaders[0];
    if (!leaderCard) return [];
    const breakdown = computeStaticPower({ leader: leaderCard, members: memberCards }, holomenMap, {
      red: redByHolomen[leaderCard.holomenId] ?? null,
      account,
    });
    const display = computeDisplayScoreBonus(
      { leader: leaderCard, members: memberCards },
      holomenMap,
      breakdown.totalPower,
      { red: redByHolomen[leaderCard.holomenId] ?? null, songBonus },
    );
    const eventBonus =
      eventScore && memberCards.some((m) => eventTargets.has(m.id)) ? eventScore.percent / 100 : 0;
    // 黄は display.unitScore に入っているので、ここで掛けるのはイベントだけ
    const modifiers: ScoreModifierBreakdown = {
      songBonus,
      eventBonus,
      adjustedUnitScore: display.unitScore * scoreModifierFactor({ eventBonus }),
    };
    return cls.leaders.map((l) => ({
      leader: l,
      members: memberCards,
      breakdown,
      display,
      modifiers,
    }));
  });
  scored.sort((a, b) => b.modifiers.adjustedUnitScore - a.modifiers.adjustedUnitScore);
  const candidates = scored.slice(0, topN);

  return { candidates, evaluated };
}
