import { CONNECT_ANCHORS } from "../data/connect";
import type { ConnectAnchor, ConnectPlacement } from "../data/connect";
import type { ConnectPlacementMap } from "../storage/connect";

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

/**
 * 並びは**コネクトマスの固定順(中心 → 赤 → 青 → 黄)が先**で、同じコネクトマスの中は holomenOrder
 * (編成のホロメンが先、残りは呼び出し側が決める順。holomenOrder にないホロメンは最後に ID 順)
 * (2026-10-02 ユーザー指示「中心、赤、青、黄の順」)
 */
export function connectPlanRows(
  current: ConnectPlacementMap,
  recommended: ConnectPlacementMap,
  holomenOrder: readonly string[],
): ConnectPlanRow[] {
  const ids = new Set([...Object.keys(current), ...Object.keys(recommended)]);
  const rank = (id: string): number => {
    const i = holomenOrder.indexOf(id);
    return i < 0 ? holomenOrder.length : i;
  };
  const rows: ConnectPlanRow[] = [];
  const holomenIds = [...ids].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  for (const anchor of CONNECT_ANCHORS) {
    for (const holomenId of holomenIds) {
      const now = current[holomenId]?.[anchor] ?? null;
      const next = recommended[holomenId]?.[anchor] ?? null;
      if (!same(now, next)) rows.push({ holomenId, anchor, current: now, recommended: next });
    }
  }
  return rows;
}
