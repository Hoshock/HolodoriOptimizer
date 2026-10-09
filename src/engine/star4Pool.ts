import { cards } from "../data";
import type { OptimizeRunRequest } from "./request";

/** ★4 のカード ID(データセットから導出) */
const STAR4_IDS: readonly string[] = cards.filter((c) => c.rarity === 4).map((c) => c.id);

/**
 * おまかせの候補から外す ★4(2026-10-09 ユーザー指示 — ADR-022)。
 * ★4 は自分で枠に置いたとき(リーダーの指定・メンバーの固定)だけ編成に入り、おまかせでは ★5 だけから探す。
 * **リーダーをホロメンで指定したとき(`leaderCandidateIds`)は、そのホロメンの ★4 もリーダーの候補に入れる**
 * (2026-10-09 ユーザー指示)— ただしメンバーにはしないので、その ★4 はメンバーの除外にだけ足す。
 * エンジンは役割別の除外しか持たないので、それ以外の固定していない ★4 は両方の除外に足す
 */
export function autoExcludedStar4Ids(
  request: Pick<OptimizeRunRequest, "leaderId" | "fixedMemberIds" | "leaderCandidateIds">,
): { both: string[]; members: string[] } {
  const kept = new Set([request.leaderId, ...request.fixedMemberIds]);
  const leaderOnly = new Set(request.leaderCandidateIds ?? []);
  const both: string[] = [];
  const members: string[] = [];
  for (const id of STAR4_IDS) {
    if (kept.has(id)) continue;
    if (leaderOnly.has(id)) members.push(id);
    else both.push(id);
  }
  return { both, members };
}
