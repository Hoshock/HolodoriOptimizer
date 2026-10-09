import { cards } from "../data";
import type { OptimizeRunRequest } from "./request";

/** ★4 のカード ID(データセットから導出) */
const STAR4_IDS: readonly string[] = cards.filter((c) => c.rarity === 4).map((c) => c.id);

/**
 * おまかせの候補から外す ★4(2026-10-09 ユーザー指示 — ADR-022)。
 * ★4 は自分で枠に置いたとき(リーダーの指定・メンバーの固定)だけ編成に入り、おまかせでは ★5 だけから探す。
 * エンジンは役割別の除外しか持たないので、固定していない ★4 を両方の除外に足して渡す
 */
export function autoExcludedStar4Ids(
  request: Pick<OptimizeRunRequest, "leaderId" | "fixedMemberIds">,
): string[] {
  const kept = new Set([request.leaderId, ...request.fixedMemberIds]);
  return STAR4_IDS.filter((id) => !kept.has(id));
}
