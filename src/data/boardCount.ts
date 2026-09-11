import { BLUE_BOARD_CELL_COUNT, blueUnlockedCount } from "./blueBoard";
import { GREEN_BOARD_CELL_COUNT, greenUnlockedCount } from "./greenBoard";
import { RED_BOARD_CELL_COUNT, redUnlockedCount } from "./redBoard";
import { YELLOW_BOARD_CELL_COUNT, yellowUnlockedCount } from "./yellowBoard";
import type { BoardColor } from "../storage/boards";

/**
 * ホロメンボードの解放マス数(色ごと・合計)。ゲーム内の数え方に合わせ、中心以外のコネクトマス(赤 / 青 / 黄の C)も
 * 経路がそこを通って先のマスへ届いていれば 1 マスとして数える(2026-09-11 ユーザー指示)。保存しているのは通常のマスだけで、
 * C の解放扱いは解放済みマスの配置から導く(src/data/boardGraph.ts の unlockedPassages)
 */
const COUNTERS: Record<BoardColor, (unlocked: ReadonlySet<string>) => number> = {
  red: redUnlockedCount,
  blue: blueUnlockedCount,
  yellow: yellowUnlockedCount,
  green: greenUnlockedCount,
};
export const BOARD_CELL_COUNTS: Readonly<Record<BoardColor, number>> = {
  red: RED_BOARD_CELL_COUNT,
  blue: BLUE_BOARD_CELL_COUNT,
  yellow: YELLOW_BOARD_CELL_COUNT,
  green: GREEN_BOARD_CELL_COUNT,
};

export function boardUnlockedCount(color: BoardColor, nodes: readonly string[]): number {
  return COUNTERS[color](new Set(nodes));
}

/** 4 色の合計(ホロメン一覧の「解放 N マス」) */
export function totalUnlockedCount(
  boards: Readonly<Record<BoardColor, readonly string[]>>,
): number {
  let total = 0;
  for (const color of Object.keys(COUNTERS) as BoardColor[])
    total += boardUnlockedCount(color, boards[color]);
  return total;
}
