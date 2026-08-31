import type { Card, ParamKind } from "../data/types";
import type { HolomenMap, ScoreBreakdown } from "./score";
import { computeUnitScore, PARAM_KINDS } from "./score";

/**
 * 編成最適化: リーダー(と任意の固定メンバー)を与え、残り枠の全組合せを探索して
 * ユニットスコア上位 topN 件を返す(ADR-003)。
 *
 * 制約: リーダー含め同一ホロメンのカードは 1 枚まで。
 *
 * 探索中はアロケーションを避けた数値ベースの評価器でスコアのみを計算し、
 * 上位候補にだけ computeUnitScore で内訳を付け直す(両者はモデルが同一で、
 * 乖離はテストで検出する)。組合せ生成は再帰インデックス方式で、将来の
 * Web Worker 分割(先頭インデックスでのチャンク化)を想定している。
 */

export interface OptimizeRequest {
  leader: Card;
  /** 固定するメンバー(0〜4 枚)。残り枠が探索対象になる */
  fixedMembers?: Card[];
  /** 探索から除外するカード ID */
  excludedCardIds?: string[];
  /** 返す候補数(既定 10) */
  topN?: number;
  /** 進捗コールバック(評価済み組合せ数 / 総組合せ数)。約 progressInterval 件ごと */
  onProgress?: (done: number, total: number) => void;
  progressInterval?: number;
}

export interface OptimizeResult {
  /** スコア降順の候補 */
  candidates: { members: Card[]; breakdown: ScoreBreakdown }[];
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
  /** 0=all, 1=type, 2=affiliation */
  targetKind: 0 | 1 | 2;
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
}

const TYPE_INDEX = { cute: 0, happy: 1, pure: 2 } as const;

function paramIndexOf(param: ParamKind | "all"): number {
  return param === "all" ? -1 : PARAM_KINDS.indexOf(param);
}

function compileCard(
  card: Card,
  holomenMap: HolomenMap,
  affIndex: Map<string, number>,
): CompiledCard {
  const affiliations = holomenMap.get(card.holomenId)?.affiliations ?? [];
  const passive = card.passiveSkill.structured;
  const passiveEffects: CompiledEffect[] = [];
  let passiveCondition: CompiledCondition | null = null;
  if (passive) {
    passiveCondition = compileCondition(passive.condition, affIndex);
    for (const e of passive.effects) {
      if (e.kind !== "paramUp") continue; // scoreSupport は基礎スコア外
      passiveEffects.push({
        targetKind: e.target.kind === "all" ? 0 : e.target.kind === "type" ? 1 : 2,
        targetIndex:
          e.target.kind === "all"
            ? -1
            : e.target.kind === "type"
              ? TYPE_INDEX[e.target.type]
              : (affIndex.get(e.target.affiliation) ?? -1),
        paramIndex: paramIndexOf(e.param),
        percent: e.percent,
      });
    }
  }
  return {
    card,
    stats: [card.stats.performance, card.stats.technique, card.stats.sense],
    typeIndex: TYPE_INDEX[card.type],
    affIndices: affiliations.map((a) => affIndex.get(a) ?? -1).filter((i) => i >= 0),
    passiveCondition,
    passiveEffects,
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
    topN = 10,
    onProgress,
    progressInterval = 200_000,
  } = request;

  if (fixedMembers.length > MEMBER_SLOTS) {
    throw new Error(`固定メンバーは最大 ${String(MEMBER_SLOTS)} 枚`);
  }
  const openSlots = MEMBER_SLOTS - fixedMembers.length;

  const usedHolomen = new Set<string>([leader.holomenId, ...fixedMembers.map((c) => c.holomenId)]);
  if (usedHolomen.size !== fixedMembers.length + 1) {
    throw new Error("リーダー・固定メンバーに同一ホロメンが重複している");
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

  // 候補プール: 除外・使用済みホロメン・リーダー/固定と同カードを外す。
  // 同一ホロメンの別カード同士は組合せ側で排他する(プールには残す)。
  const pool = allCards
    .filter(
      (c) =>
        !excluded.has(c.id) &&
        !fixedCardIds.has(c.id) &&
        c.id !== leader.id &&
        !usedHolomen.has(c.holomenId),
    )
    .map((c) => compileCard(c, holomenMap, affIndex));
  const fixed = fixedMembers.map((c) => compileCard(c, holomenMap, affIndex));

  // リーダーの衣装スキルをコンパイル(合算値への乗算)
  const costume = leader.costumeSkill.structured;
  const costumeCondition = costume ? compileCondition(costume.condition, affIndex) : null;
  const costumeFactors: [number, number, number] = [1, 1, 1];
  if (costume) {
    for (const e of costume.effects) {
      const factor = 1 + e.percent / 100;
      const p = paramIndexOf(e.param);
      if (p === -1) {
        for (let i = 0; i < PARAM_COUNT; i++) {
          const current = costumeFactors[i] ?? 1;
          costumeFactors[i] = current * factor;
        }
      } else {
        const current = costumeFactors[p] ?? 1;
        costumeFactors[p] = current * factor;
      }
    }
  }

  // 探索状態(再帰中のアロケーションなし。push/pop は確保済み容量を再利用する)
  const typeCounts = new Int32Array(3);
  const affCounts = new Int32Array(affIndex.size);
  const members: CompiledCard[] = [];
  const bonus = new Float64Array(MEMBER_SLOTS * PARAM_COUNT);

  const addMember = (c: CompiledCard): void => {
    members.push(c);
    typeCounts[c.typeIndex] = (typeCounts[c.typeIndex] ?? 0) + 1;
    for (const a of c.affIndices) affCounts[a] = (affCounts[a] ?? 0) + 1;
  };
  const removeMember = (): void => {
    const c = members.pop();
    if (!c) return;
    typeCounts[c.typeIndex] = (typeCounts[c.typeIndex] ?? 0) - 1;
    for (const a of c.affIndices) affCounts[a] = (affCounts[a] ?? 0) - 1;
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

  const total = combinationCount(pool.length, openSlots);
  const topScores: number[] = [];
  const topMembers: Card[][] = [];
  let evaluated = 0;
  let sinceProgress = 0;

  const evaluate = (): void => {
    const score = scoreCurrent();
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
    if (topScores.length > topN) {
      topScores.length = topN;
      topMembers.length = topN;
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

  recurse(0, openSlots);
  onProgress?.(evaluated, total);

  // 上位候補にだけ内訳を付け直す
  const candidates = topMembers.map((memberCards) => ({
    members: memberCards,
    breakdown: computeUnitScore({ leader, members: memberCards }, holomenMap),
  }));

  return { candidates, evaluated };
}
