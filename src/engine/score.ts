import type {
  BuffTarget,
  Card,
  Holomen,
  ParamKind,
  SkillCondition,
  StatBlock,
} from "../data/types";

/**
 * ユニットスコアの計算(コミュニティ解析モデル、ADR-003)。
 *
 * - 基礎値はメンバー 5 人のパラメータ合計のみ。リーダーのパラメータ・パッシブは寄与しない。
 * - メンバーのパッシブ(paramUp)を各メンバーの実効値に加算合成した後、5 人分を合算する。
 * - リーダーの衣装スキルは、条件をメンバー 5 人に対して判定し、満たせば合算値へ乗算する。
 * - structured が null のスキルは計算に反映されない(試算値の限界として UI で明示する)。
 *
 * 簡略化(要実測検証): 対象人数つきパッシブ(例「1期生2人の」)は、条件に合致する
 * メンバー全員に適用する。人数上限の厳密な扱いはモデル検証後に見直す。
 */

export const PARAM_KINDS: ParamKind[] = ["performance", "technique", "sense"];

export interface ScoreBreakdown {
  /** パッシブ適用後・衣装スキル適用前の合算値 */
  baseTotals: StatBlock;
  /** 衣装スキル適用後の合算値 */
  finalTotals: StatBlock;
  /** 衣装スキルが発動したか */
  costumeSkillActive: boolean;
  /** 最終ユニットスコア(finalTotals の合計) */
  unitScore: number;
}

/** カード ID ではなくカード実体で構成されたユニット */
export interface Unit {
  leader: Card;
  members: Card[];
}

export type HolomenMap = ReadonlyMap<string, Holomen>;

export function buildHolomenMap(holomen: Holomen[]): HolomenMap {
  return new Map(holomen.map((h) => [h.id, h]));
}

function affiliationsOf(card: Card, holomenMap: HolomenMap): string[] {
  return holomenMap.get(card.holomenId)?.affiliations ?? [];
}

/** メンバー 5 人に対して発動条件を判定する */
export function isConditionMet(
  condition: SkillCondition,
  members: Card[],
  holomenMap: HolomenMap,
): boolean {
  switch (condition.kind) {
    case "always":
      return true;
    case "typeCount":
      return members.filter((m) => m.type === condition.type).length >= condition.min;
    case "affiliationCount":
      return (
        members.filter((m) => affiliationsOf(m, holomenMap).includes(condition.affiliation))
          .length >= condition.min
      );
  }
}

function matchesTarget(
  target: BuffTarget,
  card: Card,
  source: Card,
  holomenMap: HolomenMap,
): boolean {
  switch (target.kind) {
    case "all":
      return true;
    case "self":
      return card === source;
    case "type":
      return card.type === target.type;
    case "affiliation":
      return affiliationsOf(card, holomenMap).includes(target.affiliation);
  }
}

/** ユニットスコアを内訳つきで計算する */
export function computeUnitScore(unit: Unit, holomenMap: HolomenMap): ScoreBreakdown {
  const { leader, members } = unit;

  // 各メンバーごとの paramUp 加算率(%)を集計する
  const bonusPercent: Record<ParamKind, number>[] = members.map(() => ({
    performance: 0,
    technique: 0,
    sense: 0,
  }));

  for (const source of members) {
    const structured = source.passiveSkill.structured;
    if (!structured) continue;
    if (!isConditionMet(structured.condition, members, holomenMap)) continue;
    for (const effect of structured.effects) {
      if (effect.kind !== "paramUp") continue; // scoreSupport は基礎スコア外
      members.forEach((member, i) => {
        if (!matchesTarget(effect.target, member, source, holomenMap)) return;
        const bonus = bonusPercent[i];
        if (!bonus) return;
        if (effect.param === "all") {
          for (const p of PARAM_KINDS) bonus[p] += effect.percent;
        } else {
          bonus[effect.param] += effect.percent;
        }
      });
    }
  }

  const baseTotals: StatBlock = { performance: 0, technique: 0, sense: 0 };
  members.forEach((member, i) => {
    const bonus = bonusPercent[i];
    for (const p of PARAM_KINDS) {
      baseTotals[p] += member.stats[p] * (1 + (bonus ? bonus[p] : 0) / 100);
    }
  });

  // リーダーの衣装スキル(合算値への乗算)
  const finalTotals: StatBlock = { ...baseTotals };
  let costumeSkillActive = false;
  const costume = leader.costumeSkill.structured;
  if (costume && isConditionMet(costume.condition, members, holomenMap)) {
    costumeSkillActive = true;
    for (const effect of costume.effects) {
      if (effect.kind !== "paramUp") continue; // scoreSupport は基礎スコア外
      const factor = 1 + effect.percent / 100;
      if (effect.param === "all") {
        for (const p of PARAM_KINDS) finalTotals[p] *= factor;
      } else {
        finalTotals[effect.param] *= factor;
      }
    }
  }

  const unitScore = finalTotals.performance + finalTotals.technique + finalTotals.sense;
  return { baseTotals, finalTotals, costumeSkillActive, unitScore };
}
