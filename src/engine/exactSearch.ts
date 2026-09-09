import type { Card } from "../data/types";
import { computeDisplayScoreBonus } from "./displayScore";
import type { OptimizeRequest, OptimizeResult, ScoreModifierBreakdown } from "./optimize";
import { combinationCount, scoreModifierFactor } from "./optimize";
import { computeStaticPower, MEMBER_SLOTS, NO_ACCOUNT_BONUS } from "./power";
import type { HolomenMap } from "./score";
import { isConditionMet } from "./score";

/**
 * 検証用の厳密探索（exact search）。
 *
 * 本番の `optimize`（src/engine/optimize.ts）は、上限値で候補を shortlist に絞ってから正確に評価する**近似**で、
 * 真の上位が絞り込みの段で落ちる可能性は 0 ではない（ADR-005）。ここは同じ入力に対して**全候組合せ**を
 * `computeStaticPower` + `computeDisplayScoreBonus` で評価し、真の上位を返す。近似の品質を測るための参照実装で、
 * UI・Worker からは呼ばない（葉ごとにタイムラインを回すので 73 枚の全探索には耐えない）。
 *
 * 使い方は `exactSearch.test.ts`（小規模フィクスチャで Top1 / TopN を近似と突き合わせる）。
 * 将来、安全な branch-and-bound か十分速い厳密評価に移るときも、この関数を正解として比べる。
 */

/** 事故防止の上限。(組合せ数 × リーダー候補数) がこれを超えるとエラーにする */
export const EXACT_SEARCH_MAX_EVALUATIONS = 200_000;

export interface ExactSearchOptions {
  maxEvaluations?: number;
}

export function optimizeExact(
  request: OptimizeRequest,
  allCards: Card[],
  holomenMap: HolomenMap,
  options: ExactSearchOptions = {},
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
  } = request;
  const maxEvaluations = options.maxEvaluations ?? EXACT_SEARCH_MAX_EVALUATIONS;

  if (fixedMembers.length > MEMBER_SLOTS) {
    throw new Error(`固定メンバーは最大 ${String(MEMBER_SLOTS)} 枚`);
  }
  const openSlots = MEMBER_SLOTS - fixedMembers.length;
  const fixedHolomen = new Set(fixedMembers.map((c) => c.holomenId));
  const fixedCardIds = new Set(fixedMembers.map((c) => c.id));
  const excludedFromMembers = new Set([...excludedCardIds, ...excludedMemberCardIds]);
  const excludedFromLeaders = new Set([...excludedCardIds, ...excludedLeaderCardIds]);
  const eventTargets = new Set(eventScore?.cardIds ?? []);
  const requiredHolomen = new Set(requiredMemberHolomenIds);

  const pool = allCards.filter(
    (c) =>
      !excludedFromMembers.has(c.id) && !fixedCardIds.has(c.id) && !fixedHolomen.has(c.holomenId),
  );
  const leaderAllowed = leaderCandidateIds ? new Set(leaderCandidateIds) : null;
  const leaderCandidates = leader
    ? [leader]
    : allCards.filter(
        (c) =>
          !excludedFromLeaders.has(c.id) && (leaderAllowed === null || leaderAllowed.has(c.id)),
      );
  const upperBound = combinationCount(pool.length, openSlots) * leaderCandidates.length;
  if (upperBound > maxEvaluations) {
    throw new Error(
      `厳密探索は小規模専用: ${String(upperBound)} 通りは上限 ${String(maxEvaluations)} を超える`,
    );
  }

  const candidates: OptimizeResult["candidates"] = [];
  let evaluated = 0;
  const members: Card[] = [...fixedMembers];

  const evaluateLeaf = (): void => {
    for (const h of requiredHolomen) {
      if (!members.some((m) => m.holomenId === h)) return;
    }
    if (requireAllPassives) {
      for (const m of members) {
        const passive = m.passiveSkill.structured;
        if (passive && !isConditionMet(passive.condition, members, holomenMap)) return;
      }
    }
    const memberCards = [...members];
    for (const leaderCard of leaderCandidates) {
      evaluated++;
      const costume = leaderCard.costumeSkill.structured;
      const costumeMet = costume
        ? isConditionMet(costume.condition, memberCards, holomenMap)
        : true;
      if (requireCostumeSkill && costume && !costumeMet) continue;
      const red = redByHolomen[leaderCard.holomenId] ?? null;
      const breakdown = computeStaticPower(
        { leader: leaderCard, members: memberCards },
        holomenMap,
        { red, account },
      );
      const display = computeDisplayScoreBonus(
        { leader: leaderCard, members: memberCards },
        holomenMap,
        breakdown.totalPower,
        { red },
      );
      const eventBonus =
        eventScore && memberCards.some((m) => eventTargets.has(m.id))
          ? eventScore.percent / 100
          : 0;
      const modifiers: ScoreModifierBreakdown = {
        songBonus,
        eventBonus,
        adjustedUnitScore: display.unitScore * scoreModifierFactor({ songBonus, eventBonus }),
      };
      candidates.push({ leader: leaderCard, members: memberCards, breakdown, display, modifiers });
    }
  };

  const recurse = (startIndex: number, remaining: number): void => {
    if (remaining === 0) {
      evaluateLeaf();
      return;
    }
    for (let i = startIndex; i <= pool.length - remaining; i++) {
      const card = pool[i];
      if (!card) continue;
      if (members.some((m) => m.holomenId === card.holomenId)) continue;
      members.push(card);
      recurse(i + 1, remaining - 1);
      members.pop();
    }
  };
  recurse(0, openSlots);

  candidates.sort((a, b) => b.modifiers.adjustedUnitScore - a.modifiers.adjustedUnitScore);
  return { candidates: candidates.slice(0, topN), evaluated };
}
