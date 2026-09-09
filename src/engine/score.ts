import type { BuffTarget, Card, Holomen, ParamKind, SkillCondition } from "../data/types";

/**
 * ユニット計算の共通部品(条件判定・対象判定・ホロメン索引)。
 *
 * 総合力(ゲームのユニット編成画面の値の再現)は src/engine/power.ts、表示のスコアボーナスとユニットスコアは
 * src/engine/displayScore.ts、探索は src/engine/optimize.ts。以前ここにあった連鎖乗算のモデル(赤 → パッシブ → 衣装を順に掛ける)は
 * 2026-09-08 の実機内訳(各効果を素値基準で別々に求めて加算する)と合わず、power.ts に置き換えた。
 */

export const PARAM_KINDS: ParamKind[] = ["performance", "technique", "sense"];

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

/** メンバー 5 人に対して発動条件を判定する(リーダー枠は数えない — ゲーム仕様) */
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

/** バフの対象にそのカードが含まれるか(count による人数の絞り込みは power.ts の passiveParamBonus が行う) */
export function matchesTarget(
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
