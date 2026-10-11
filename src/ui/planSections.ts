import { holomenById, songById } from "../data";
import { singsIn, songSingers } from "../data/songSingers";
import { compareHolomenOrder } from "./labels";

/**
 * 組み直しプランの結果の一覧と反映の確認で、ホロメンを 3 つに分けて並べる(2026-10-09 ユーザー指示
 * 「リーダー/メンバー、所属グループ、その他というヘッダごとに分けて書く。リーダーメンバーは対象編成の順、グループとその他はホロメン順」)。
 * - リーダー・メンバー: 対象の編成の順(リーダー → メンバー。リーダーとメンバーが同じホロメンなら 1 回だけ、リーダーの位置)
 * - グループ: ユニット外で、メンバーと所属を 1 つでも共有するホロメン(緑の所属マスが効く)と、計算した曲の歌唱者(ソロ・ユニット曲。
 *   黄の楽曲スコアボーナスのマスが効く。全体楽曲は全員の黄が効くので入れない)。2026-10-11 ユーザー指示「黄色の楽曲系のユニットもここにいれる。
 *   所属グループではなくグループと表現を変える」。リーダーの所属は見ない — 緑の所属マスはメンバーのカードにだけ効くので、
 *   リーダーとだけ所属が同じホロメンはこの編成に効く変更がない(2026-10-09 ユーザー指示)
 * - その他: 残りのホロメン
 * グループとその他の中はホロメン順(`labels.ts` の `HOLOMEN_ORDER`。ホロメンボードのピッカーと同じ — 2026-10-11 に `holomen.json` の並びから合わせた)
 */
export type PlanSection = "unit" | "group" | "other";

export const PLAN_SECTIONS: readonly { key: PlanSection; label: string }[] = [
  { key: "unit", label: "リーダー・メンバー" },
  { key: "group", label: "グループ" },
  { key: "other", label: "その他" },
];

/** 並べる基準にする、対象の編成のホロメン */
export interface PlanUnit {
  leaderHolomenId: string;
  /** 結果のメンバーの順 */
  memberHolomenIds: readonly string[];
  /** 計算した曲(歌唱者をグループに入れる。指定なし・省略は null) */
  songId?: string | null;
}

/** 編成のホロメン(リーダー → メンバー。重複なし) */
export function unitHolomenIds(unit: PlanUnit): string[] {
  return [unit.leaderHolomenId, ...unit.memberHolomenIds].filter(
    (id, i, all) => id !== "" && all.indexOf(id) === i,
  );
}

/** そのホロメンの区分 */
export function planSectionOf(holomenId: string, unit: PlanUnit): PlanSection {
  const ids = unitHolomenIds(unit);
  if (ids.includes(holomenId)) return "unit";
  const shared = new Set(
    unit.memberHolomenIds.flatMap((id) => holomenById.get(id)?.affiliations ?? []),
  );
  const own = holomenById.get(holomenId)?.affiliations ?? [];
  if (own.some((a) => shared.has(a))) return "group";
  const song = unit.songId ? songById.get(unit.songId) : undefined;
  return song !== undefined && singsIn(songSingers(song), holomenId) ? "group" : "other";
}

/** 区分の順(リーダー・メンバー → グループ → その他)に並べる。区分の中は 編成の順 / ホロメン順 */
export function sortPlanHolomen(ids: Iterable<string>, unit: PlanUnit): string[] {
  const inUnit = unitHolomenIds(unit);
  const rank = (id: string): number => {
    const i = inUnit.indexOf(id);
    if (i >= 0) return i;
    return planSectionOf(id, unit) === "group" ? 1_000 : 2_000;
  };
  return [...new Set(ids)].sort((a, b) => rank(a) - rank(b) || compareHolomenOrder(a, b));
}
