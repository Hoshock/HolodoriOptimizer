import { CONNECT_EXTENTS } from "../data/connect";
import type { ConnectExtentId } from "../data/connect";

/**
 * 形のタイルの右上に重ねる数字(枚数・倍率)を、右下へ逃がす形か。
 * 札は右上の角に置くと図形のいちばん上の段(dy = 3)の中央より右にかかる(タイルの余白で 2 段目より上に収めてある)ので、
 * その位置にマスがある形だけ右下に置く(2026-10-10 ユーザー指示「上十字だけ 4/4 みたいなやつかぶってるからそれだけ右下にかく」
 * 「％表示どの図形でも被らないか注意」。いまは「上へ 3 + 2 段目の左右」だけ)。
 * アカウントの「コネクト」のタイルとボードのコネクト効果のタイルで共用する。どの形にも被らないことは `connectBadge.test.ts` が寸法で確かめる
 */
export function badgeAtBottom(extent: ConnectExtentId): boolean {
  return CONNECT_EXTENTS[extent].some(([dx, dy]) => dy >= 3 && dx >= 0);
}
