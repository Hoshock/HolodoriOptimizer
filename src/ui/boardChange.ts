import { BOARD_STATE_COLORS } from "../data/boardState";
import type { HolomenBoards, UnlockableAnchor } from "../data/boardState";
import type { BoardColor } from "../storage/boards";

/**
 * 組み直しプランのボードのタブで、ホロメン名の下に出す「色ごとのマスの変化数」(2026-10-10 ユーザー指示
 * 「赤青黄緑それぞれのマスの変化数を概要としてホロメン名の下の行に」)。
 * 開けるマスと外すマスを分けて数える(足し引きすると、3 つ開けて 3 つ外す組み直しが 0 に見える)。
 * コネクトマスはその色のボードのマスとして数える(赤 = リーダー、青 = カード、黄 = コンテンツ)
 */
export interface BoardColorChange {
  color: BoardColor;
  added: number;
  removed: number;
}

const ANCHOR_COLOR: Readonly<Record<UnlockableAnchor, BoardColor>> = {
  leader: "red",
  card: "blue",
  content: "yellow",
};

const cellsOf = (b: HolomenBoards, color: BoardColor): Set<string> =>
  new Set([
    ...b[color],
    ...b.connects.filter((a) => ANCHOR_COLOR[a] === color).map((a) => `connect:${a}`),
  ]);

/** 色ごとの開けるマス・外すマスの数(赤 → 青 → 黄 → 緑の固定順で、変化のない色も 0 で出す) */
export function boardColorChanges(before: HolomenBoards, after: HolomenBoards): BoardColorChange[] {
  return BOARD_STATE_COLORS.map((color) => {
    const was = cellsOf(before, color);
    const now = cellsOf(after, color);
    return {
      color,
      added: [...now].filter((cell) => !was.has(cell)).length,
      removed: [...was].filter((cell) => !now.has(cell)).length,
    };
  });
}

/** 数の表記: 「+2」「−1」「+2 −1」、変化がなければ「0」(マイナスはリソースの不足と同じ記号 −) */
export function boardChangeLabel(change: BoardColorChange): string {
  const parts = [
    ...(change.added > 0 ? [`+${String(change.added)}`] : []),
    ...(change.removed > 0 ? [`−${String(change.removed)}`] : []),
  ];
  return parts.length > 0 ? parts.join(" ") : "0";
}
