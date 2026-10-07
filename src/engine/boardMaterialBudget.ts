import { BOARD_MATERIAL_COLORS } from "../data/boardMaterials";
import type { BoardMaterials } from "../data/boardMaterials";
import { BOARD_RESOURCE_KINDS } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";

/**
 * ホロメンボードの最適化が守る**共有の資材予算**(色ごとのキューブ・コアキューブ。アカウント全体で共有)の計算。
 *
 * 「リソース」で登録している値は、**いまのホロメンボードをすでに開けた上で手元に余っている個数**で、総所持量ではない
 * (2026-10-07 ユーザー指示)。したがって再配分できる総量は 投入済み + 余り:
 *   総利用可能量 = いまのボードに投入済みの資材 + 登録している余り
 * 余りが未登録(null)の項目は**制限なし**(∞。0 は「余りが 0 個」という別の値で、未登録の代わりにしない)。
 * 色をまたいだ変換はない。ボードPt はホロメンごとの別の制約で、ここでは扱わない。
 */

/** 色ごとのキューブ・コアキューブの上限(制限なしは Infinity) */
export type MaterialLimits = Record<keyof BoardMaterials, { cube: number; core: number }>;

/** 制限なし(登録がない) */
export function unlimitedMaterials(): MaterialLimits {
  return {
    red: { cube: Infinity, core: Infinity },
    blue: { cube: Infinity, core: Infinity },
    yellow: { cube: Infinity, core: Infinity },
    green: { cube: Infinity, core: Infinity },
  };
}

/** 総利用可能量 = 投入済み + 登録している余り(余りが未登録の項目は Infinity) */
export function totalAvailableMaterials(
  spent: BoardMaterials,
  remaining: BoardResources,
): MaterialLimits {
  const out = unlimitedMaterials();
  for (const color of BOARD_MATERIAL_COLORS) {
    for (const kind of BOARD_RESOURCE_KINDS) {
      const left = remaining[color][kind];
      out[color][kind] = left === null ? Infinity : spent[color][kind] + left;
    }
  }
  return out;
}

/** 総利用可能量から使用量を引いた余り(登録の形)。制限なし(Infinity)の項目は未登録(null)のまま。負にはしない */
export function remainingAfterMaterials(
  total: MaterialLimits,
  spentAfter: BoardMaterials,
): BoardResources {
  const out: BoardResources = {
    red: { cube: null, core: null },
    blue: { cube: null, core: null },
    yellow: { cube: null, core: null },
    green: { cube: null, core: null },
  };
  for (const color of BOARD_MATERIAL_COLORS) {
    for (const kind of BOARD_RESOURCE_KINDS) {
      const limit = total[color][kind];
      out[color][kind] = Number.isFinite(limit)
        ? Math.max(0, limit - spentAfter[color][kind])
        : null;
    }
  }
  return out;
}

/** 使用量が上限に収まっているか(1 項目でも超えれば false) */
export function withinMaterialLimits(spent: BoardMaterials, limits: MaterialLimits): boolean {
  return BOARD_MATERIAL_COLORS.every((color) =>
    BOARD_RESOURCE_KINDS.every((kind) => spent[color][kind] <= limits[color][kind]),
  );
}
