import { holomenById } from "../data";
import { CONNECT_ANCHORS } from "../data/connect";
import type { ConnectAnchor, ConnectPlacement } from "../data/connect";
import type { ConnectPlacementMap } from "../storage/connect";
import { compareReading } from "./labels";

/**
 * コネクトの最適化シートの表(「現在 / 推奨」)の行(2026-10-02)。
 * 現在(ボードに置いている配置)と推奨(所持から選んだ配置)で**違う置き場所**だけを行にする —
 * 同じ形・同じ ％ の置き場所は変わらないので出さない。どちらかが空なら「なし」(外す / 新しく置く)
 */
export interface ConnectPlanRow {
  holomenId: string;
  anchor: ConnectAnchor;
  current: ConnectPlacement | null;
  recommended: ConnectPlacement | null;
}

const same = (a: ConnectPlacement | null, b: ConnectPlacement | null): boolean =>
  a === b || (a !== null && b !== null && a.extent === b.extent && a.permil === b.permil);

/** 表を並べる基準にする、対象の編成のホロメン */
export interface ConnectPlanUnit {
  leaderHolomenId: string;
  /** 結果のメンバーの順 */
  memberHolomenIds: readonly string[];
}

/**
 * 並びは **リーダー → メンバー(その結果のメンバーの順)→ それ以外のホロメン(五十音順)**。同じホロメンの中は
 * コネクトマスの固定順(中心 → 赤 → 青 → 黄)(2026-10-02 ユーザー指示)。それ以外のホロメンは、最小限で組み直す(ユニットのみ)では
 * 「ユニットがそのコネクトを必要とするため外す必要のあるホロメン」、すべて変更では「置き方が変わるそれ以外のホロメン」
 */
export function connectPlanRows(
  current: ConnectPlacementMap,
  recommended: ConnectPlacementMap,
  unit: ConnectPlanUnit,
): ConnectPlanRow[] {
  const inUnit = [unit.leaderHolomenId, ...unit.memberHolomenIds].filter(
    (id, i, all) => all.indexOf(id) === i,
  );
  const readingOf = (id: string): string => holomenById.get(id)?.reading ?? id;
  const others = [...new Set([...Object.keys(current), ...Object.keys(recommended)])]
    .filter((id) => !inUnit.includes(id))
    .sort((a, b) => compareReading(readingOf(a), readingOf(b)) || a.localeCompare(b));
  const rows: ConnectPlanRow[] = [];
  for (const holomenId of [...inUnit, ...others]) {
    for (const anchor of CONNECT_ANCHORS) {
      const now = current[holomenId]?.[anchor] ?? null;
      const next = recommended[holomenId]?.[anchor] ?? null;
      if (!same(now, next)) rows.push({ holomenId, anchor, current: now, recommended: next });
    }
  }
  return rows;
}
