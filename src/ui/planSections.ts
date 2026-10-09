import { holomen, holomenById } from "../data";

/**
 * 組み直しプランの結果(ボード・コネクトのタブ)と反映の確認で、ホロメンを 3 つに分けて並べる(2026-10-09 ユーザー指示
 * 「リーダー/メンバー、所属グループ、その他というヘッダごとに分けて書く。リーダーメンバーは対象編成の順、グループとその他はホロメン順」)。
 * - リーダー・メンバー: 対象の編成の順(リーダー → メンバー。リーダーとメンバーが同じホロメンなら 1 回だけ、リーダーの位置)
 * - 所属グループ: ユニット外で、リーダーかメンバーと所属を 1 つでも共有するホロメン(ホロメン順 = `holomen.json` の並び)
 * - その他: 残りのホロメン(ホロメン順)
 */
export type PlanSection = "unit" | "group" | "other";

export const PLAN_SECTIONS: readonly { key: PlanSection; label: string }[] = [
  { key: "unit", label: "リーダー・メンバー" },
  { key: "group", label: "所属グループ" },
  { key: "other", label: "その他" },
];

/** 並べる基準にする、対象の編成のホロメン */
export interface PlanUnit {
  leaderHolomenId: string;
  /** 結果のメンバーの順 */
  memberHolomenIds: readonly string[];
}

const HOLOMEN_ORDER = new Map(holomen.map((h, i) => [h.id, i]));

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
  const shared = new Set(ids.flatMap((id) => holomenById.get(id)?.affiliations ?? []));
  const own = holomenById.get(holomenId)?.affiliations ?? [];
  return own.some((a) => shared.has(a)) ? "group" : "other";
}

/** 区分の順(リーダー・メンバー → 所属グループ → その他)に並べる。区分の中は 編成の順 / ホロメン順 */
export function sortPlanHolomen(ids: Iterable<string>, unit: PlanUnit): string[] {
  const inUnit = unitHolomenIds(unit);
  const rank = (id: string): number => {
    const i = inUnit.indexOf(id);
    if (i >= 0) return i;
    const base = planSectionOf(id, unit) === "group" ? 1_000 : 2_000;
    return base + (HOLOMEN_ORDER.get(id) ?? 999);
  };
  return [...new Set(ids)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
