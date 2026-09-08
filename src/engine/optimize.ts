import type { RedUnitEffects } from "../data/redBoard";
import type { Card } from "../data/types";
import type { DisplayScoreBreakdown } from "./displayScore";
import type { LiveParams } from "./live";
import type {
  AccountBonus,
  CompiledCondition,
  MemberView,
  RedInputs,
  StaticPowerBreakdown,
} from "./power";
import type { HolomenMap } from "./score";
import { computeDisplayScoreBonus } from "./displayScore";
import { liveBonusOf } from "./live";
import {
  buildAffIndex,
  ceilPercent,
  compileCondition,
  compileMember,
  computeStaticPower,
  conditionMet,
  costumeEffectOf,
  costumePercentsOf,
  emptyTotals,
  MEMBER_SLOTS,
  NO_ACCOUNT_BONUS,
  PARAM_COUNT,
  passiveParamBonus,
  redInputsOf,
  staticPowerTotals,
} from "./power";

/**
 * 編成最適化: リーダー(と任意の固定メンバー)を与え、残り枠の全組合せを探索して
 * 総合期待スコア上位 topN 件を返す(ADR-003)。
 *
 * 制約: メンバー 5 人同士は同一ホロメン 1 枚まで。リーダーはメンバーとは別枠で、
 * メンバーと同一ホロメン・同一カードでもよい(2026-08-31 ユーザー確認のゲーム仕様)。
 *
 * 順位づけの値 = 総合力(src/engine/power.ts。ゲーム画面の「総合力」の再現)× ライブ期待値の倍率(src/engine/live.ts。
 * アクティブ・SP・黄の楽曲スコアボーナス・イベントスコアボーナス — 特定楽曲の期待スコア側のモデル)。
 * 探索中は power.ts の中核関数(passiveParamBonus / staticPowerTotals)をアロケーションなしで呼び、上位候補にだけ
 * computeStaticPower で内訳を付け直す(同じ関数を通るので乖離しない。テストで検証)。組合せ生成は再帰インデックス方式で、
 * 将来の Web Worker 分割(先頭インデックスでのチャンク化)を想定している。
 *
 * リーダー探索(leader: null)は、メンバー側の量(素値・ボード増分・パッシブ・メモリー)がリーダー非依存であることを使い、
 * 組合せを 1 回だけ列挙して葉ごとに「衣装スキルと赤ボードの同型クラス」を評価する。衣装スキル効果はメンバー × クラスで
 * 前計算し、葉では加算だけにする。加えて最大値による上限枝刈りで、リーダー数ぶんの単純な倍数化を避けている
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
   * ライブ条件。指定するとアクティブ・SP の期待寄与を含む総合期待スコアで
   * 順位づけする(src/engine/live.ts)。省略時は総合力のみ(寄与 0)
   */
  live?: LiveParams;
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
   * メンバー 5 人にひとつでもあれば総合期待スコアに (1 + percent/100) を掛ける(複数枚でも重複しない)。
   * 通常スコアを求めた後に掛ける隔離した実装で、省略時はなし。リーダー枠は判定に含めない(ゲーム仕様 — 2026-09-08 ユーザー確認)
   */
  eventScore?: { percent: number; cardIds: readonly string[] };
  /** 返す候補数(既定 10) */
  topN?: number;
  /** 進捗コールバック(評価済み組合せ数 / 総組合せ数)。約 progressInterval 件ごと */
  onProgress?: (done: number, total: number) => void;
  progressInterval?: number;
}

/** ライブ中スキルの期待寄与と総合期待スコア(候補ごと) */
export interface LiveBreakdown {
  /** アクティブスキルの期待寄与(総合力比) */
  active: number;
  /** SP スキルの期待寄与(総合力比) */
  sp: number;
  /** 黄ボードの楽曲スコアボーナス(比。曲とアカウントで決まり、編成に依存しない) */
  songBonus: number;
  /** イベントスコアボーナス(比。0.1 = +10%)。課題曲の対象カードがメンバーにあるときだけ。イベント未指定は 0 */
  eventBonus: number;
  /** totalPower × (1 + active + sp) × (1 + songBonus) × (1 + eventBonus)。順位づけに使う値 */
  expectedScore: number;
}

export interface OptimizeResult {
  /** 総合期待スコア降順の候補(リーダー探索時は候補ごとにリーダーが異なりうる) */
  candidates: {
    leader: Card;
    members: Card[];
    breakdown: StaticPowerBreakdown;
    /** メニュー画面のスコアボーナス 4 項目とユニットスコアの試算(src/engine/displayScore.ts。順位づけには使わない) */
    display: DisplayScoreBreakdown;
    live: LiveBreakdown;
  }[];
  /** 評価した組合せ数 */
  evaluated: number;
}

/** nCk(進捗表示用) */
export function combinationCount(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = (result * (n - k + i)) / i;
  }
  return Math.round(result);
}

interface CompiledCard extends MemberView {
  /** 前計算表(衣装スキル効果のクラス別)の添字 */
  index: number;
  /** ライブ中スキルの期待寄与(active + sp、編成非依存の前計算値)。live 未指定なら 0 */
  liveBonus: number;
  /** イベントスコアボーナスの対象カードか(eventScore.cardIds に含まれる) */
  eventTarget: boolean;
}

/** 総合期待スコアの倍率(総合力に掛ける。ライブ期待値とイベントスコアボーナス) */
export function liveFactorOf(live: LiveBreakdown): number {
  return (1 + live.active + live.sp) * (1 + live.songBonus) * (1 + live.eventBonus);
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
    live = null,
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

  let nextIndex = 0;
  const compile = (card: Card): CompiledCard => {
    let liveBonus = 0;
    if (live) {
      const bonus = liveBonusOf(card, live);
      liveBonus = bonus.active + bonus.sp;
    }
    return {
      ...compileMember(card, holomenMap, affIndex, account),
      index: nextIndex++,
      liveBonus,
      eventTarget: eventTargets.has(card.id),
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
    leaders: Card[];
  }
  const classMap = new Map<string, LeaderClass>();
  for (const leaderCard of leaderCandidates) {
    const costume = leaderCard.costumeSkill.structured;
    const condition = costume ? compileCondition(costume.condition, affIndex) : null;
    const percents = costumePercentsOf(costume);
    const red = redInputsOf(redByHolomen[leaderCard.holomenId]);
    const key = JSON.stringify([condition, percents, red]);
    const existing = classMap.get(key);
    if (existing) {
      existing.leaders.push(leaderCard);
    } else {
      classMap.set(key, {
        condition,
        percents,
        red,
        costumeByCard: new Float64Array(compiledCount),
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

  // 枝刈り用の上限: 衣装スキル効果はメンバーごとのクラス最大、赤ボードは固定値・割合の最大
  const maxCostumeByCard = new Float64Array(compiledCount);
  for (const cls of leaderClasses) {
    for (let i = 0; i < compiledCount; i++) {
      maxCostumeByCard[i] = Math.max(maxCostumeByCard[i] ?? 0, cls.costumeByCard[i] ?? 0);
    }
  }
  const maxRedFixed: [number, number, number] = [0, 0, 0];
  const maxRedPercent: [number, number, number] = [0, 0, 0];
  for (const cls of leaderClasses) {
    if (!cls.red) continue;
    for (let p = 0; p < PARAM_COUNT; p++) {
      maxRedFixed[p] = Math.max(maxRedFixed[p] ?? 0, cls.red.fixed[p] ?? 0);
      maxRedPercent[p] = Math.max(maxRedPercent[p] ?? 0, cls.red.percent[p] ?? 0);
    }
  }
  const maxRedFixedPerMember = maxRedFixed[0] + maxRedFixed[1] + maxRedFixed[2];
  const enhancementMul = 1 + account.enhancementPercent / 100;

  // 探索状態(再帰中のアロケーションなし。push/pop は確保済み容量を再利用する)
  const typeCounts = new Int32Array(3);
  const affCounts = new Int32Array(affIndex.size);
  const members: CompiledCard[] = [];
  const bonus = new Float64Array(MEMBER_SLOTS * PARAM_COUNT);
  const scratch = new Int32Array(MEMBER_SLOTS);
  const costumePerMember = new Float64Array(MEMBER_SLOTS);
  const zeroCostume = new Float64Array(MEMBER_SLOTS);
  const totals = emptyTotals();
  /** 現在のメンバー 5 枠のライブ期待寄与の合計(前計算値の加減算で維持する) */
  let liveSum = 0;
  /** 現在のメンバー 5 枠のうちイベントスコアボーナスの対象カードの枚数 */
  let eventTargetCount = 0;

  const addMember = (c: CompiledCard): void => {
    members.push(c);
    typeCounts[c.typeIndex] = (typeCounts[c.typeIndex] ?? 0) + 1;
    for (const a of c.affIndices) affCounts[a] = (affCounts[a] ?? 0) + 1;
    liveSum += c.liveBonus;
    if (c.eventTarget) eventTargetCount++;
    if (requiredHolomen.has(c.card.holomenId)) requiredMet++;
  };
  const removeMember = (): void => {
    const c = members.pop();
    if (!c) return;
    typeCounts[c.typeIndex] = (typeCounts[c.typeIndex] ?? 0) - 1;
    for (const a of c.affIndices) affCounts[a] = (affCounts[a] ?? 0) - 1;
    liveSum -= c.liveBonus;
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
  const topScores: number[] = [];
  const topMembers: Card[][] = [];
  const topLeaders: Card[] = [];
  let evaluated = 0;
  let sinceProgress = 0;

  const insertCandidate = (score: number, leaderCard: Card): void => {
    const worst = topScores[topScores.length - 1] ?? -Infinity;
    if (topScores.length >= topN && score <= worst) return;
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
    topLeaders.splice(lo, 0, leaderCard);
    if (topScores.length > topN) {
      topScores.length = topN;
      topMembers.length = topN;
      topLeaders.length = topN;
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
    // ライブ期待値とイベントスコアボーナスは総合力の後に掛ける倍率(枝刈りの上限にもそのまま使える)
    const liveFactor = (1 + liveSum) * (eventTargetCount > 0 ? eventMul : 1);
    // 上限枝刈り: リーダー非依存の量(素値・ボード・パッシブ・メモリー)に、衣装スキルと赤ボードの最大値を足しても
    // 現在の下限に届かない組合せはリーダー評価を丸ごと飛ばす(切り上げの上振れは強化ボーナス 5 人分 + 赤 3 つを足して吸収)
    if (topScores.length >= topN) {
      let n0 = 0;
      let n1 = 0;
      let n2 = 0;
      let rest = 0;
      for (let m = 0; m < MEMBER_SLOTS; m++) {
        const c = members[m];
        if (!c) continue;
        n0 += c.natural[0];
        n1 += c.natural[1];
        n2 += c.natural[2];
        rest +=
          c.boardDelta + c.memorySum + (maxCostumeByCard[c.index] ?? 0) + maxRedFixedPerMember;
        for (let p = 0; p < PARAM_COUNT; p++) rest += bonus[m * PARAM_COUNT + p] ?? 0;
      }
      const redPercentMax =
        ceilPercent(n0, maxRedPercent[0]) +
        ceilPercent(n1, maxRedPercent[1]) +
        ceilPercent(n2, maxRedPercent[2]);
      const bound =
        ((n0 + n1 + n2 + rest + redPercentMax) * enhancementMul + MEMBER_SLOTS + PARAM_COUNT) *
        liveFactor;
      if (bound <= (topScores[topScores.length - 1] ?? -Infinity)) return;
    }
    for (const cls of leaderClasses) {
      const met = cls.condition !== null && conditionMet(cls.condition, typeCounts, affCounts);
      // しぼりこみ: 衣装スキル不発のリーダーは候補にしない(未構造化は判定不能なので残す)
      if (requireCostumeSkill && cls.condition !== null && !met) continue;
      let costume: Float64Array = zeroCostume;
      if (met) {
        for (let m = 0; m < MEMBER_SLOTS; m++) {
          const c = members[m];
          costumePerMember[m] = c ? (cls.costumeByCard[c.index] ?? 0) : 0;
        }
        costume = costumePerMember;
      }
      staticPowerTotals(members, bonus, costume, cls.red, account.enhancementPercent, totals);
      const score = totals.totalPower * liveFactor;
      if (topScores.length >= topN && score <= (topScores[topScores.length - 1] ?? -Infinity)) {
        continue;
      }
      for (const leaderCard of cls.leaders) {
        insertCandidate(score, leaderCard);
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

  // 上位候補にだけ内訳を付け直す(探索と同じ中核関数を通る)
  const candidates = topMembers.flatMap((memberCards, i) => {
    const leaderCard = topLeaders[i];
    if (!leaderCard) return [];
    const breakdown = computeStaticPower({ leader: leaderCard, members: memberCards }, holomenMap, {
      red: redByHolomen[leaderCard.holomenId] ?? null,
      account,
    });
    let active = 0;
    let sp = 0;
    if (live) {
      for (const m of memberCards) {
        const b = liveBonusOf(m, live);
        active += b.active;
        sp += b.sp;
      }
    }
    const songBonus = live?.songBonus ?? 0;
    const eventBonus =
      eventScore && memberCards.some((m) => eventTargets.has(m.id)) ? eventScore.percent / 100 : 0;
    const liveBreakdown: LiveBreakdown = { active, sp, songBonus, eventBonus, expectedScore: 0 };
    liveBreakdown.expectedScore = breakdown.totalPower * liveFactorOf(liveBreakdown);
    const display = computeDisplayScoreBonus(
      { leader: leaderCard, members: memberCards },
      holomenMap,
      breakdown.totalPower,
      { red: redByHolomen[leaderCard.holomenId] ?? null },
    );
    return [{ leader: leaderCard, members: memberCards, breakdown, display, live: liveBreakdown }];
  });

  return { candidates, evaluated };
}
