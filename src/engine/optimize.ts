import type { Card, ParamKind } from "../data/types";
import type { LiveParams } from "./live";
import type { HolomenMap, ScoreBreakdown } from "./score";
import { liveBonusOf } from "./live";
import { computeUnitScore, PARAM_KINDS } from "./score";

/**
 * 編成最適化: リーダー(と任意の固定メンバー)を与え、残り枠の全組合せを探索して
 * ユニットスコア上位 topN 件を返す(ADR-003)。
 *
 * 制約: メンバー 5 人同士は同一ホロメン 1 枚まで。リーダーはメンバーとは別枠で、
 * メンバーと同一ホロメン・同一カードでもよい(2026-08-31 ユーザー確認のゲーム仕様)。
 *
 * 探索中はアロケーションを避けた数値ベースの評価器でスコアのみを計算し、
 * 上位候補にだけ computeUnitScore で内訳を付け直す(両者はモデルが同一で、
 * 乖離はテストで検出する)。組合せ生成は再帰インデックス方式で、将来の
 * Web Worker 分割(先頭インデックスでのチャンク化)を想定している。
 */

export interface OptimizeRequest {
  /** リーダー。null なら除外カードを除く全カードをリーダー候補として探索する */
  leader: Card | null;
  /** 固定するメンバー(0〜4 枚)。残り枠が探索対象になる */
  fixedMembers?: Card[];
  /** 探索から除外するカード ID */
  excludedCardIds?: string[];
  /**
   * ライブ条件。指定するとアクティブ・SP の期待寄与を含む総合期待スコアで
   * 順位づけする(src/engine/live.ts)。省略時はユニットスコアのみ(寄与 0)
   */
  live?: LiveParams;
  /** 返す候補数(既定 10) */
  topN?: number;
  /** 進捗コールバック(評価済み組合せ数 / 総組合せ数)。約 progressInterval 件ごと */
  onProgress?: (done: number, total: number) => void;
  progressInterval?: number;
}

/** ライブ中スキルの期待寄与と総合期待スコア(候補ごと) */
export interface LiveBreakdown {
  /** アクティブスキルの期待寄与(ユニットスコア比) */
  active: number;
  /** SP スキルの期待寄与(ユニットスコア比) */
  sp: number;
  /** unitScore × (1 + active + sp)。順位づけに使う値 */
  expectedScore: number;
}

export interface OptimizeResult {
  /** 総合期待スコア降順の候補(リーダー探索時は候補ごとにリーダーが異なりうる) */
  candidates: { leader: Card; members: Card[]; breakdown: ScoreBreakdown; live: LiveBreakdown }[];
  /** 評価した組合せ数 */
  evaluated: number;
}

const MEMBER_SLOTS = 5;
const PARAM_COUNT = 3;

/** nCk(進捗表示用) */
export function combinationCount(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = (result * (n - k + i)) / i;
  }
  return Math.round(result);
}

/** 条件・対象の数値表現(-1 は「なし/全員」) */
interface CompiledCondition {
  /** 0=always, 1=typeCount, 2=affiliationCount */
  kind: 0 | 1 | 2;
  index: number;
  min: number;
}

interface CompiledEffect {
  /** 0=all, 1=type, 2=affiliation, 3=self(スキル持ち自身) */
  targetKind: 0 | 1 | 2 | 3;
  targetIndex: number;
  /** 0..2 = 単一パラメータ、-1 = 全パラメータ */
  paramIndex: number;
  percent: number;
}

interface CompiledCard {
  card: Card;
  stats: [number, number, number];
  typeIndex: number;
  affIndices: number[];
  passiveCondition: CompiledCondition | null;
  passiveEffects: CompiledEffect[];
  /** ライブ中スキルの期待寄与(active + sp、編成非依存の前計算値)。live 未指定なら 0 */
  liveBonus: number;
}

const TYPE_INDEX = { cute: 0, happy: 1, pure: 2 } as const;

function paramIndexOf(param: ParamKind | "all"): number {
  return param === "all" ? -1 : PARAM_KINDS.indexOf(param);
}

function compileCard(
  card: Card,
  holomenMap: HolomenMap,
  affIndex: Map<string, number>,
  live: LiveParams | null,
): CompiledCard {
  const affiliations = holomenMap.get(card.holomenId)?.affiliations ?? [];
  const passive = card.passiveSkill.structured;
  const passiveEffects: CompiledEffect[] = [];
  let passiveCondition: CompiledCondition | null = null;
  if (passive) {
    passiveCondition = compileCondition(passive.condition, affIndex);
    for (const e of passive.effects) {
      if (e.kind !== "paramUp") continue; // scoreSupport は基礎スコア外
      const target = e.target;
      passiveEffects.push({
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
        paramIndex: paramIndexOf(e.param),
        percent: e.percent,
      });
    }
  }
  let liveBonus = 0;
  if (live) {
    const bonus = liveBonusOf(card, live);
    liveBonus = bonus.active + bonus.sp;
  }
  return {
    card,
    stats: [card.stats.performance, card.stats.technique, card.stats.sense],
    typeIndex: TYPE_INDEX[card.type],
    affIndices: affiliations.map((a) => affIndex.get(a) ?? -1).filter((i) => i >= 0),
    passiveCondition,
    passiveEffects,
    liveBonus,
  };
}

function compileCondition(
  condition: NonNullable<Card["passiveSkill"]["structured"]>["condition"],
  affIndex: Map<string, number>,
): CompiledCondition {
  switch (condition.kind) {
    case "always":
      return { kind: 0, index: -1, min: 0 };
    case "typeCount":
      return { kind: 1, index: TYPE_INDEX[condition.type], min: condition.min };
    case "affiliationCount":
      return {
        kind: 2,
        index: affIndex.get(condition.affiliation) ?? -1,
        min: condition.min,
      };
  }
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
    live = null,
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
  const excluded = new Set(excludedCardIds);
  const fixedCardIds = new Set(fixedMembers.map((c) => c.id));

  // 所属 ID → 連番インデックス
  const affIndex = new Map<string, number>();
  for (const h of holomenMap.values()) {
    for (const a of h.affiliations) {
      if (!affIndex.has(a)) affIndex.set(a, affIndex.size);
    }
  }

  // 候補プール: 除外カードと、固定メンバーのカード・ホロメンを外す。
  // リーダーのカード・ホロメンは外さない(リーダーはメンバーを兼ねられる)。
  // プール内の同一ホロメン別カード同士は組合せ側で排他する。
  const pool = allCards
    .filter((c) => !excluded.has(c.id) && !fixedCardIds.has(c.id) && !fixedHolomen.has(c.holomenId))
    .map((c) => compileCard(c, holomenMap, affIndex, live));
  const fixed = fixedMembers.map((c) => compileCard(c, holomenMap, affIndex, live));

  // リーダー候補: 指定があればその 1 枚。null なら除外カードを除く全カードを探索する
  const leaderCandidates = leader ? [leader] : allCards.filter((c) => !excluded.has(c.id));

  // リーダーの衣装スキルをコンパイル(合算値への乗算)。リーダー探索のため候補ごとに差し替える
  const compileCostume = (
    leaderCard: Card,
  ): { condition: CompiledCondition | null; factors: [number, number, number] } => {
    const costume = leaderCard.costumeSkill.structured;
    const condition = costume ? compileCondition(costume.condition, affIndex) : null;
    const factors: [number, number, number] = [1, 1, 1];
    if (costume) {
      for (const e of costume.effects) {
        if (e.kind !== "paramUp") continue; // scoreSupport は基礎スコア外
        const factor = 1 + e.percent / 100;
        const p = paramIndexOf(e.param);
        if (p === -1) {
          for (let i = 0; i < PARAM_COUNT; i++) {
            const current = factors[i] ?? 1;
            factors[i] = current * factor;
          }
        } else {
          const current = factors[p] ?? 1;
          factors[p] = current * factor;
        }
      }
    }
    return { condition, factors };
  };

  // 探索中のリーダー(scoreCurrent / evaluate が参照する)
  let currentLeader: Card | null = null;
  let costumeCondition: CompiledCondition | null = null;
  let costumeFactors: [number, number, number] = [1, 1, 1];

  // 探索状態(再帰中のアロケーションなし。push/pop は確保済み容量を再利用する)
  const typeCounts = new Int32Array(3);
  const affCounts = new Int32Array(affIndex.size);
  const members: CompiledCard[] = [];
  const bonus = new Float64Array(MEMBER_SLOTS * PARAM_COUNT);
  /** 現在のメンバー 5 枠のライブ期待寄与の合計(前計算値の加減算で維持する) */
  let liveSum = 0;

  const addMember = (c: CompiledCard): void => {
    members.push(c);
    typeCounts[c.typeIndex] = (typeCounts[c.typeIndex] ?? 0) + 1;
    for (const a of c.affIndices) affCounts[a] = (affCounts[a] ?? 0) + 1;
    liveSum += c.liveBonus;
  };
  const removeMember = (): void => {
    const c = members.pop();
    if (!c) return;
    typeCounts[c.typeIndex] = (typeCounts[c.typeIndex] ?? 0) - 1;
    for (const a of c.affIndices) affCounts[a] = (affCounts[a] ?? 0) - 1;
    liveSum -= c.liveBonus;
  };
  for (const c of fixed) addMember(c);

  const conditionMet = (cond: CompiledCondition): boolean => {
    if (cond.kind === 0) return true;
    if (cond.index < 0) return false;
    const count = cond.kind === 1 ? (typeCounts[cond.index] ?? 0) : (affCounts[cond.index] ?? 0);
    return count >= cond.min;
  };

  const scoreCurrent = (): number => {
    bonus.fill(0);
    for (let s = 0; s < MEMBER_SLOTS; s++) {
      const source = members[s];
      if (!source || source.passiveEffects.length === 0) continue;
      if (source.passiveCondition && !conditionMet(source.passiveCondition)) {
        continue;
      }
      for (const e of source.passiveEffects) {
        for (let m = 0; m < MEMBER_SLOTS; m++) {
          const target = members[m];
          if (!target) continue;
          if (e.targetKind === 1 && target.typeIndex !== e.targetIndex) continue;
          if (e.targetKind === 2 && !target.affIndices.includes(e.targetIndex)) {
            continue;
          }
          if (e.targetKind === 3 && m !== s) continue; // self はスキル持ちの枠のみ
          if (e.paramIndex === -1) {
            for (let p = 0; p < PARAM_COUNT; p++) {
              bonus[m * PARAM_COUNT + p] = (bonus[m * PARAM_COUNT + p] ?? 0) + e.percent;
            }
          } else {
            bonus[m * PARAM_COUNT + e.paramIndex] =
              (bonus[m * PARAM_COUNT + e.paramIndex] ?? 0) + e.percent;
          }
        }
      }
    }
    const costumeActive = costumeCondition ? conditionMet(costumeCondition) : false;
    let score = 0;
    for (let p = 0; p < PARAM_COUNT; p++) {
      let total = 0;
      for (let m = 0; m < MEMBER_SLOTS; m++) {
        const card = members[m];
        if (!card) continue;
        total += (card.stats[p] ?? 0) * (1 + (bonus[m * PARAM_COUNT + p] ?? 0) / 100);
      }
      score += costumeActive ? total * (costumeFactors[p] ?? 1) : total;
    }
    return score;
  };

  const total = combinationCount(pool.length, openSlots) * leaderCandidates.length;
  const topScores: number[] = [];
  const topMembers: Card[][] = [];
  const topLeaders: Card[] = [];
  let evaluated = 0;
  let sinceProgress = 0;

  const evaluate = (): void => {
    if (currentLeader === null) return;
    const score = scoreCurrent() * (1 + liveSum);
    evaluated++;
    sinceProgress++;
    if (onProgress && sinceProgress >= progressInterval) {
      sinceProgress = 0;
      onProgress(evaluated, total);
    }
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
    topLeaders.splice(lo, 0, currentLeader);
    if (topScores.length > topN) {
      topScores.length = topN;
      topMembers.length = topN;
      topLeaders.length = topN;
    }
  };

  const recurse = (startIndex: number, remaining: number): void => {
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

  for (const leaderCard of leaderCandidates) {
    currentLeader = leaderCard;
    const compiled = compileCostume(leaderCard);
    costumeCondition = compiled.condition;
    costumeFactors = compiled.factors;
    recurse(0, openSlots);
  }
  onProgress?.(evaluated, total);

  // 上位候補にだけ内訳を付け直す
  const candidates = topMembers.flatMap((memberCards, i) => {
    const leaderCard = topLeaders[i];
    if (!leaderCard) return [];
    const breakdown = computeUnitScore({ leader: leaderCard, members: memberCards }, holomenMap);
    let active = 0;
    let sp = 0;
    if (live) {
      for (const m of memberCards) {
        const b = liveBonusOf(m, live);
        active += b.active;
        sp += b.sp;
      }
    }
    return [
      {
        leader: leaderCard,
        members: memberCards,
        breakdown,
        live: { active, sp, expectedScore: breakdown.unitScore * (1 + active + sp) },
      },
    ];
  });

  return { candidates, evaluated };
}
