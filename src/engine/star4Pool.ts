import { cards } from "../data";
import type { OptimizeRunRequest } from "./request";

/** ★4 のカード ID(データセットから導出) */
const STAR4_IDS: readonly string[] = cards.filter((c) => c.rarity === 4).map((c) => c.id);
/** ホロメン ID → そのホロメンの ★5 のカード ID */
const STAR5_BY_HOLOMEN = new Map<string, string[]>();
for (const c of cards)
  if (c.rarity === 5)
    STAR5_BY_HOLOMEN.set(c.holomenId, [...(STAR5_BY_HOLOMEN.get(c.holomenId) ?? []), c.id]);
const holomenOf = new Map(cards.map((c) => [c.id, c.holomenId]));

/**
 * ★5 を 1 枚も使えないホロメンの ★4(おまかせのリーダーの候補に入れる — 2026-10-09 ユーザー指示「星5のないタレントは星4もリーダーの探索に入れる」)。
 * 「使えない」は `excludedCardIds`(所持カードから探すときの持っていないカード)で決める。リーダーだけの除外・選択は見ない
 * (★4 を足したあとに、ほかのカードと同じくその除外がかかる)。全カードから探すときはどのホロメンにも ★5 があるので何も足さない。
 * ★5 のあるホロメンの ★4 は入れない: 衣装スキルは基本 ★5 が強く、候補が増えるぶん遅くなるだけ(同日の計測で、★4 を全部入れても上位 30 件に ★4 のリーダーは入らなかった)
 */
export function star4LeaderFallbackIds(excludedCardIds: readonly string[]): Set<string> {
  const excluded = new Set(excludedCardIds);
  return new Set(
    STAR4_IDS.filter((id) => {
      const star5 = STAR5_BY_HOLOMEN.get(holomenOf.get(id) ?? "") ?? [];
      return star5.every((c) => excluded.has(c));
    }),
  );
}

/**
 * おまかせの候補から外す ★4(2026-10-09 ユーザー指示 — ADR-022)。
 * ★4 は自分で枠に置いたとき(リーダーの指定・メンバーの固定)だけ編成に入り、メンバーのおまかせは ★5 だけから探す。
 * リーダーのおまかせには次の ★4 も入れる — ただしメンバーにはしないので、メンバーの除外にだけ足す:
 * - **リーダーをホロメンで指定したとき(`leaderCandidateIds`)の、そのホロメンの ★4**(2026-10-09 ユーザー指示)
 * - **★5 を 1 枚も使えないホロメンの ★4**(`star4LeaderFallbackIds`。同日ユーザー指示)
 * エンジンは役割別の除外しか持たないので、それ以外の固定していない ★4 は両方の除外に足す
 */
export function autoExcludedStar4Ids(
  request: Pick<
    OptimizeRunRequest,
    "leaderId" | "fixedMemberIds" | "leaderCandidateIds" | "excludedCardIds"
  >,
): { both: string[]; members: string[] } {
  const kept = new Set([request.leaderId, ...request.fixedMemberIds]);
  const leaderOnly = new Set([
    ...(request.leaderCandidateIds ?? []),
    ...star4LeaderFallbackIds(request.excludedCardIds),
  ]);
  const both: string[] = [];
  const members: string[] = [];
  for (const id of STAR4_IDS) {
    if (kept.has(id)) continue;
    if (leaderOnly.has(id)) members.push(id);
    else both.push(id);
  }
  return { both, members };
}
