import { naturalStatsOf } from "../data/resolve";
import type { Card } from "../data/types";

/**
 * 素値合計が同値のメンバーの並びを試して、最良の並びを選ぶ(2026-09-30 ユーザー指示「同値のときは最良にして」)。
 *
 * 「◯◯2人の」のような人数つきの効果は、対象のうち素値合計の上位 count 人に掛かる。**同値のときの選び方は実機で未確認**で、
 * 実装は編成順の先を選ぶので、同じ 5 人でも並べる順でユニットスコアが変わっていた(固定メンバーありの探索とおまかせで
 * 同じ編成が違う値で出た — `docs/ai/tmp/pending.md` 16)。
 * - 総合力(パラメータ UP): 効果ごとに加算量が大きい方を選ぶ(`power.ts` の `passiveParamBonus`。並びに依らない)
 * - 表示スコアボーナス(スコアサポート): 並びで変わるので、同値のメンバーどうしの並べ替えをすべて試して最良を採る(ここ)
 *
 * **これは実機の規則ではなく、最良を採る方針**。実機の選び方が分かったら、この方針ごと見直す。
 */

/** 試す並びの上限(同値が 5 人全員でも 5! = 120) */
const MAX_ORDERS = 120;

const sumOf = (card: Card): number => {
  const n = naturalStatsOf(card);
  return n.performance + n.technique + n.sense;
};

/** 人数つきのスコアサポート(パッシブ・リーダー衣装)があるか。なければ並びで表示スコアボーナスは変わらない */
function hasCountedSupport(members: readonly Card[], leader: Card): boolean {
  const skills = [...members.map((m) => m.passiveSkill.structured), leader.costumeSkill.structured];
  return skills.some((s) =>
    s?.effects.some(
      (e) =>
        e.kind === "scoreSupport" &&
        (e.target.kind === "type" || e.target.kind === "affiliation") &&
        (e.target.count ?? 0) > 0,
    ),
  );
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const result: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) result.push([item, ...p]);
  });
  return result;
}

/** 同値のメンバーが同じ枠の集合の中で入れ替わる並びを列挙する(元の並びが先頭。上限 MAX_ORDERS) */
export function tieOrders(members: readonly Card[], leader: Card): Card[][] {
  const base = [...members];
  if (!hasCountedSupport(members, leader)) return [base];
  const groups = new Map<number, number[]>();
  members.forEach((m, index) => {
    const key = sumOf(m);
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  let orders: Card[][] = [base];
  for (const positions of groups.values()) {
    if (positions.length < 2) continue;
    const cards = positions.map((i) => members[i] as Card);
    const next: Card[][] = [];
    for (const order of orders) {
      for (const perm of permutations(cards)) {
        const copy = [...order];
        positions.forEach((position, k) => {
          copy[position] = perm[k] as Card;
        });
        next.push(copy);
        if (next.length >= MAX_ORDERS) break;
      }
      if (next.length >= MAX_ORDERS) break;
    }
    orders = next;
  }
  return orders;
}

/**
 * 並びごとに評価して、最良の並びと評価結果を返す。同点なら元の並びに近い方(先に試した方)を残す。
 * 並びを試す必要がなければ元の並びを 1 回だけ評価する
 */
export function bestTieOrder<T>(
  members: readonly Card[],
  leader: Card,
  evaluate: (order: Card[]) => T,
  scoreOf: (result: T) => number,
): { order: Card[]; result: T } {
  let best: { order: Card[]; result: T } | null = null;
  for (const order of tieOrders(members, leader)) {
    const result = evaluate(order);
    if (best === null || scoreOf(result) > scoreOf(best.result)) best = { order, result };
  }
  // tieOrders は必ず 1 件以上返す
  return best ?? { order: [...members], result: evaluate([...members]) };
}
