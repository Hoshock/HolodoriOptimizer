import { BLUE_BOARD_CELL_COUNT } from "./blueBoard";
import { GREEN_BOARD_CELL_COUNT } from "./greenBoard";
import { RED_BOARD_CELL_COUNT } from "./redBoard";
import { YELLOW_BOARD_CELL_COUNT } from "./yellowBoard";
import { colorUnlockedCount, totalUnlockedCells } from "./boardState";
import type { UnlockableAnchor } from "./boardState";
import type { BoardColor } from "../storage/boards";

/**
 * ホロメンボードの解放マス数(色ごと・合計)。**明示的に解放した通常マス + 解放済みのコネクトマス(赤 / 青 / 黄の C)**で、
 * 中心は数えない(2026-10-04 ユーザー指示。それまでは「先のマスが解放されていればコネクトも解放扱い」と推定して数えていた)。
 * コネクトに効果を置いているかどうかは数に影響しない。最大は通常マス 150 + コネクト 3 = 153
 */
export const BOARD_CELL_COUNTS: Readonly<Record<BoardColor, number>> = {
  red: RED_BOARD_CELL_COUNT,
  blue: BLUE_BOARD_CELL_COUNT,
  yellow: YELLOW_BOARD_CELL_COUNT,
  green: GREEN_BOARD_CELL_COUNT,
};

/** 1 色の解放マス数(`connects` はそのホロメンの解放済みのコネクト。省略は 0 個) */
export function boardUnlockedCount(
  color: BoardColor,
  nodes: readonly string[],
  connects: readonly UnlockableAnchor[] = [],
): number {
  return colorUnlockedCount(color, nodes, connects);
}

/** 4 色の合計(ホロメン一覧の「解放 N マス」) */
export function totalUnlockedCount(
  boards: Readonly<Record<BoardColor, readonly string[]>>,
  connects: readonly UnlockableAnchor[] = [],
): number {
  return totalUnlockedCells({ ...boards, connects });
}
