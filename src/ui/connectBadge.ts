import { CONNECT_EXTENTS } from "../data/connect";
import type { ConnectExtentId } from "../data/connect";

/**
 * 形のタイルの右上に重ねる数字(枚数・倍率)を、右下へ逃がす形か。
 * 数字の札は右上の角(図形の格子の dx ≥ 1・dy ≥ 2 の範囲)にかかるので、その範囲にマスがある形だけ右下に置く
 * (2026-10-10 ユーザー指示「上十字だけ 4/4 みたいなやつかぶってるからそれだけ右下にかく」。いまは「上へ 3 + 2 段目の左右」だけ)。
 * アカウントの「コネクト」のタイルとボードのコネクトのサイドバーのタイルで共用する
 */
export function badgeAtBottom(extent: ConnectExtentId): boolean {
  return CONNECT_EXTENTS[extent].some(([dx, dy]) => dx >= 1 && dy >= 2);
}
