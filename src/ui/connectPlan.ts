import { CONNECT_ANCHORS } from "../data/connect";
import type { ConnectAnchor, ConnectPlacement } from "../data/connect";
import type { ConnectPlacementMap } from "../storage/connect";
import { planSectionOf, sortPlanHolomen, unitHolomenIds } from "./planSections";
import type { PlanSection, PlanUnit } from "./planSections";

/**
 * コネクトの最適化シートの表(「現在 / 推奨」)の行(2026-10-02)。
 * 現在(ボードに置いている配置)と推奨(所持から選んだ配置)で**違う置き場所**だけを行にする —
 * 同じ形・同じ ％ の置き場所は変わらないので出さない。どちらかが空なら「なし」(外す / 新しく置く)
 */
export interface ConnectPlanRow {
  holomenId: string;
  /** リーダー・メンバー / 所属グループ / その他 */
  section: PlanSection;
  anchor: ConnectAnchor;
  current: ConnectPlacement | null;
  recommended: ConnectPlacement | null;
}

const same = (a: ConnectPlacement | null, b: ConnectPlacement | null): boolean =>
  a === b || (a !== null && b !== null && a.extent === b.extent && a.permil === b.permil);

/**
 * 並びは **リーダー → メンバー(その結果のメンバーの順)→ 所属グループ → その他(どちらもホロメン順)**(`planSections.ts`。
 * 2026-10-09 ユーザー指示。それまでのユニット外は五十音順)。同じホロメンの中はコネクトマスの固定順(中心 → 赤 → 青 → 黄)(2026-10-02 ユーザー指示)。
 * ユニット外のホロメンは、最小限で組み直すでは「ユニットがそのコネクトを必要とするため外す必要のあるホロメン」と「曲に効く黄を持つホロメン」、
 * すべて変更では「置き方が変わるそれ以外のホロメン」。行には区分(`section`)を添える(タブの中のタブで分けて出す)
 */
export function connectPlanRows(
  current: ConnectPlacementMap,
  recommended: ConnectPlacementMap,
  unit: PlanUnit,
): ConnectPlanRow[] {
  const ids = sortPlanHolomen(
    [...unitHolomenIds(unit), ...Object.keys(current), ...Object.keys(recommended)],
    unit,
  );
  const rows: ConnectPlanRow[] = [];
  for (const holomenId of ids) {
    const section = planSectionOf(holomenId, unit);
    for (const anchor of CONNECT_ANCHORS) {
      const now = current[holomenId]?.[anchor] ?? null;
      const next = recommended[holomenId]?.[anchor] ?? null;
      if (!same(now, next))
        rows.push({ holomenId, section, anchor, current: now, recommended: next });
    }
  }
  return rows;
}
