import { BOARD_STATE_COLORS } from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import { CONNECT_ANCHORS } from "../data/connect";
import type { ConnectAnchor, ConnectPlacement, ConnectPlacements } from "../data/connect";
import type { BoardColor } from "../storage/boards";

/**
 * 組み直しプランの一覧で、ホロメン名の下に出す「色ごとのマスの変化数」(2026-10-10 ユーザー指示
 * 「赤青黄緑それぞれのマスの変化数を概要としてホロメン名の下の行に」)。
 * 開けるマスと外すマスを分けて数える(足し引きすると、3 つ開けて 3 つ外す組み直しが 0 に見える)。
 * **コネクトマスは色に数えず、別の「コネクト」で数える**(2026-10-11 ユーザー指示「赤のコネクトは赤に差分を含める、みたいなことはしない」。
 * それまではその色のボードのマスとして数えていた)
 */
export interface BoardColorChange {
  color: BoardColor;
  added: number;
  removed: number;
}

/** 色ごとの開けるマス・外すマスの数(通常のマスだけ。赤 → 青 → 黄 → 緑の固定順で、変化のない色も ±0 で出す) */
export function boardColorChanges(before: HolomenBoards, after: HolomenBoards): BoardColorChange[] {
  return BOARD_STATE_COLORS.map((color) => {
    const was = new Set(before[color]);
    const now = new Set(after[color]);
    return {
      color,
      added: [...now].filter((cell) => !was.has(cell)).length,
      removed: [...was].filter((cell) => !now.has(cell)).length,
    };
  });
}

/** コネクトマスの変化の数(色の数と同じ形の +・−) */
export interface ConnectChange {
  added: number;
  removed: number;
}

const samePlacement = (a: ConnectPlacement | undefined, b: ConnectPlacement | undefined): boolean =>
  a?.extent === b?.extent && a?.permil === b?.permil;

/**
 * コネクトマスの変化(2026-10-11 ユーザー指示「コネクトの差分は + と − で数字を書く」)。コネクトマスごとに、
 * 新しく置く・置き換える・(置かずに)解放するなら +1、置いていたものを外す・置き換える・(置いていないまま)解除するなら −1。
 * 置き換えは +1 −1、解放して置くのは +1、外して解除するのは −1。解除したコネクトマスの配置は効かないので無いものとして比べる。
 * 中心はいつも解放済み
 */
export function connectChange(
  before: { boards: HolomenBoards; placements: ConnectPlacements },
  after: { boards: HolomenBoards; placements: ConnectPlacements },
): ConnectChange {
  const unlocked = (b: HolomenBoards, anchor: ConnectAnchor): boolean =>
    anchor === "center" || b.connects.includes(anchor);
  let added = 0;
  let removed = 0;
  for (const anchor of CONNECT_ANCHORS) {
    const wasOpen = unlocked(before.boards, anchor);
    const isOpen = unlocked(after.boards, anchor);
    const was = wasOpen ? before.placements[anchor] : undefined;
    const now = isOpen ? after.placements[anchor] : undefined;
    const changed = !samePlacement(was, now);
    if ((now !== undefined && changed) || (now === undefined && isOpen && !wasOpen)) added += 1;
    if ((was !== undefined && changed) || (was === undefined && wasOpen && !isOpen)) removed += 1;
  }
  return { added, removed };
}

/** 数の表記: 「+2」「−1」「+2 −1」、変化がなければ「±0」(2026-10-10 ユーザー指示。マイナスはリソースの不足と同じ記号 −) */
export function boardChangeLabel(change: BoardColorChange | ConnectChange): string {
  const parts = [
    ...(change.added > 0 ? [`+${String(change.added)}`] : []),
    ...(change.removed > 0 ? [`−${String(change.removed)}`] : []),
  ];
  return parts.length > 0 ? parts.join(" ") : "±0";
}
