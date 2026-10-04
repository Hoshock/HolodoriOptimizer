import { blueBoardGraph } from "./blueBoard";
import { boardPointsForRank, CONNECT_UNLOCK_POINTS } from "./boardPoints";
import type { BoardGraph } from "./boardGraph";
import { greenBoardGraph } from "./greenBoard";
import { redBoardGraph } from "./redBoard";
import { yellowBoardGraph } from "./yellowBoard";
import type { BoardColor } from "../storage/boards";

/**
 * 1 人のホロメンのボード全体の状態(4 色の解放済み通常マス + 解放済みのコネクトマス)と、ボードPt の予算・操作
 * (2026-10-04 ユーザー指示。出所と前提は src/data/boardPoints.ts、グラフの規則は src/data/boardGraph.ts)。
 *
 * - **コネクトの解放はコネクトの配置(src/data/connect.ts)とは別の状態**: 解放済みで配置なし(普通にある)・直前まで解放してコネクトは未解放・
 *   解放済みで配置あり、の 3 状態があり、「未解放なのに配置あり」は作らない(配置の整合はこの層の外 = src/composables/useBoards.ts が保つ)
 * - 予算は 4 色のボード全体で 1 つ。ランク未登録(null)は制限なし。すでに予算を超えている状態も保てる(自動では何も削除しない)。
 *   超過中は新しい解放ができず、解除はできる
 * - 操作は「全体が成功するか、何も変わらないか」のどちらか(途中まで開けない)
 */

/** 解放が必要なコネクトマス(赤 = leader / 青 = card / 黄 = content)。中心(center)は常に解放済みなので持たない */
export type UnlockableAnchor = "leader" | "card" | "content";
export const UNLOCKABLE_ANCHORS: readonly UnlockableAnchor[] = ["leader", "card", "content"];
export const ANCHOR_BOARD_COLOR: Readonly<Record<UnlockableAnchor, BoardColor>> = {
  leader: "red",
  card: "blue",
  content: "yellow",
};
/** 色 → その色のコネクトマス(緑にはない) */
export const BOARD_COLOR_ANCHOR: Readonly<Partial<Record<BoardColor, UnlockableAnchor>>> = {
  red: "leader",
  blue: "card",
  yellow: "content",
};

export function isUnlockableAnchor(value: unknown): value is UnlockableAnchor {
  return value === "leader" || value === "card" || value === "content";
}

/** 1 ホロメンのボードの状態(4 色の解放済み通常マスの ID と、解放済みのコネクトマス) */
export interface HolomenBoards {
  red: readonly string[];
  blue: readonly string[];
  yellow: readonly string[];
  green: readonly string[];
  connects: readonly UnlockableAnchor[];
}

export const BOARD_STATE_COLORS: readonly BoardColor[] = ["red", "blue", "yellow", "green"];

export function emptyHolomenBoards(): HolomenBoards {
  return { red: [], blue: [], yellow: [], green: [], connects: [] };
}

const GRAPHS: Readonly<Record<BoardColor, BoardGraph>> = {
  red: redBoardGraph,
  blue: blueBoardGraph,
  yellow: yellowBoardGraph,
  green: greenBoardGraph,
};
export function boardGraphOf(color: BoardColor): BoardGraph {
  return GRAPHS[color];
}

/** 解放の集合(グラフが扱う形): 既知の通常マス + 解放済みのコネクトの ID */
export function unlockSetOf(
  color: BoardColor,
  nodes: readonly string[],
  connects: readonly UnlockableAnchor[],
): Set<string> {
  const graph = GRAPHS[color];
  const set = new Set(graph.knownNodeIds(nodes));
  const anchor = BOARD_COLOR_ANCHOR[color];
  if (anchor !== undefined && graph.connectorId !== null && connects.includes(anchor))
    set.add(graph.connectorId);
  return set;
}

/** その色の解放の集合を状態へ書き戻す(通常マスと、その色のコネクトの両方を置き換える。ほかの色は変えない) */
export function withColorSet(
  boards: HolomenBoards,
  color: BoardColor,
  set: ReadonlySet<string>,
): HolomenBoards {
  const graph = GRAPHS[color];
  const anchor = BOARD_COLOR_ANCHOR[color];
  const nodes = graph.knownNodeIds([...set]);
  const connects =
    anchor === undefined || graph.connectorId === null
      ? boards.connects
      : UNLOCKABLE_ANCHORS.filter((a) =>
          a === anchor ? set.has(graph.connectorId ?? "") : boards.connects.includes(a),
        );
  return { ...boards, [color]: nodes, connects };
}

function setOfColor(boards: HolomenBoards, color: BoardColor): Set<string> {
  return unlockSetOf(color, boards[color], boards.connects);
}

/** 使用しているボードPt(4 色の通常マスの Pt + 解放済みのコネクト 1 Pt ずつ。中心は 0) */
export function spentBoardPoints(boards: HolomenBoards): number {
  let total = 0;
  for (const color of BOARD_STATE_COLORS)
    total += GRAPHS[color].unlockedPoints(setOfColor(boards, color));
  return total;
}

/** 解放マス数(解放済みの通常マス + 解放済みのコネクト。中心は数えない)。色ごと */
export function colorUnlockedCount(
  color: BoardColor,
  nodes: readonly string[],
  connects: readonly UnlockableAnchor[],
): number {
  return GRAPHS[color].unlockedCount(unlockSetOf(color, nodes, connects));
}

/** 4 色の合計の解放マス数 */
export function totalUnlockedCells(boards: HolomenBoards): number {
  return BOARD_STATE_COLORS.reduce(
    (sum, color) => sum + colorUnlockedCount(color, boards[color], boards.connects),
    0,
  );
}

/** ボードPt の収支。ランク未登録は rank / budget / remaining が null(制限なし) */
export interface BoardBudget {
  rank: number | null;
  /** そのランクまでの累積ボードPt(未登録は null) */
  budget: number | null;
  spent: number;
  /** 残り(予算 − 使用。超過中は負)。未登録は null */
  remaining: number | null;
  /** 予算を超えている分(超過していなければ 0) */
  over: number;
}

export function boardBudgetOf(rank: number | null | undefined, spent: number): BoardBudget {
  if (rank === null || rank === undefined)
    return { rank: null, budget: null, spent, remaining: null, over: 0 };
  const budget = boardPointsForRank(rank);
  return { rank, budget, spent, remaining: budget - spent, over: Math.max(0, spent - budget) };
}

/** 解放の結果: 成功なら新しい状態と追加のPt、予算が足りなければ何も変えずに足りない量を返す */
export type UnlockResult =
  | { ok: true; boards: HolomenBoards; added: number }
  | { ok: false; need: number; remaining: number };

function sameBoards(a: HolomenBoards, b: HolomenBoards): boolean {
  return (
    BOARD_STATE_COLORS.every(
      (c) => a[c].length === b[c].length && a[c].every((id) => b[c].includes(id)),
    ) &&
    a.connects.length === b.connects.length &&
    a.connects.every((x) => b.connects.includes(x))
  );
}
export { sameBoards as sameHolomenBoards };

/**
 * 通常マスまたはコネクトを解放する(経路上の未解放のセル — コネクトを横断するならコネクトも — をまとめて)。
 * `remaining` が null なら制限なし。追加のPtが残りを超えるなら何も変えずに失敗を返す
 */
export function unlockCell(
  boards: HolomenBoards,
  color: BoardColor,
  cellId: string,
  remaining: number | null,
): UnlockResult {
  const graph = GRAPHS[color];
  const set = setOfColor(boards, color);
  const plan = graph.planUnlock(set, cellId);
  if (!plan || plan.cells.length === 0) return { ok: true, boards, added: 0 };
  if (remaining !== null && plan.points > remaining)
    return { ok: false, need: plan.points, remaining };
  return {
    ok: true,
    boards: withColorSet(boards, color, graph.unlockNode(set, cellId)),
    added: plan.points,
  };
}

/** 複数のセルをまとめて解放する(「すべて解放」)。合計が残りを超えるなら何も変えずに失敗を返す */
export function unlockCells(
  boards: HolomenBoards,
  targets: readonly { color: BoardColor; id: string }[],
  remaining: number | null,
): UnlockResult {
  let next = boards;
  let added = 0;
  for (const t of targets) {
    const r = unlockCell(next, t.color, t.id, null);
    if (!r.ok) continue;
    next = r.boards;
    added += r.added;
  }
  if (remaining !== null && added > remaining) return { ok: false, need: added, remaining };
  return { ok: true, boards: next, added };
}

/** セル(通常マスまたはコネクト)を解除する。そこを通らないと中心へ届かないセル(コネクトの先・コネクト自身)も解除する */
export function lockCell(boards: HolomenBoards, color: BoardColor, cellId: string): HolomenBoards {
  return withColorSet(boards, color, GRAPHS[color].lockNode(setOfColor(boards, color), cellId));
}

/** 指定した通常マス・コネクトをまとめて外し、切り離されるものも解除する(「すべて解除」) */
export function lockCells(
  boards: HolomenBoards,
  color: BoardColor,
  cellIds: readonly string[],
): HolomenBoards {
  const set = setOfColor(boards, color);
  for (const id of cellIds) set.delete(id);
  return withColorSet(boards, color, GRAPHS[color].reachableNodes(set));
}

/** コネクトマスの解放の可否 */
export interface ConnectUnlockStatus {
  unlocked: boolean;
  /** 解放できるか(未解放で、直前まで解放済みで、予算も足りる) */
  canUnlock: boolean;
  /** 解放できない理由: 直前まで経路が届いていない / ボードPt が足りない */
  reason: "notReached" | "budget" | null;
  points: number;
}

export function connectUnlockStatus(
  boards: HolomenBoards,
  anchor: UnlockableAnchor,
  remaining: number | null,
): ConnectUnlockStatus {
  const color = ANCHOR_BOARD_COLOR[anchor];
  const graph = GRAPHS[color];
  const points = CONNECT_UNLOCK_POINTS;
  if (boards.connects.includes(anchor))
    return { unlocked: true, canUnlock: false, reason: null, points };
  const connectorId = graph.connectorId;
  const plan =
    connectorId === null ? null : graph.planUnlock(setOfColor(boards, color), connectorId);
  // 経路の途中に未解放の通常マスがあれば「直前まで届いていない」(コネクトだけを足せない)
  if (!plan || plan.cells.length !== 1)
    return { unlocked: false, canUnlock: false, reason: "notReached", points };
  if (remaining !== null && plan.points > remaining)
    return { unlocked: false, canUnlock: false, reason: "budget", points };
  return { unlocked: false, canUnlock: true, reason: null, points };
}

/** コネクトマス(解放済み)を 1 つ解除したとき、同時に外れるもの(確認の文言用) */
export function lockConnectImpact(
  boards: HolomenBoards,
  anchor: UnlockableAnchor,
): { nodes: number } {
  const color = ANCHOR_BOARD_COLOR[anchor];
  const connectorId = GRAPHS[color].connectorId;
  if (connectorId === null) return { nodes: 0 };
  const after = lockCell(boards, color, connectorId);
  return { nodes: boards[color].length - after[color].length };
}

/** コネクトマスを解放する(直前のマスまで解放していないなら、経路上の未解放のマスも一緒に解放する。`remaining` は残りPt。null = 制限なし) */
export function unlockConnector(
  boards: HolomenBoards,
  anchor: UnlockableAnchor,
  remaining: number | null,
): UnlockResult {
  const color = ANCHOR_BOARD_COLOR[anchor];
  const connectorId = GRAPHS[color].connectorId;
  if (connectorId === null) return { ok: true, boards, added: 0 };
  return unlockCell(boards, color, connectorId, remaining);
}

/** コネクトマスの解放を外す(先の通常マスも解除される。置いている効果の整理は呼び出し側) */
export function lockConnector(boards: HolomenBoards, anchor: UnlockableAnchor): HolomenBoards {
  const color = ANCHOR_BOARD_COLOR[anchor];
  const connectorId = GRAPHS[color].connectorId;
  return connectorId === null ? boards : lockCell(boards, color, connectorId);
}
