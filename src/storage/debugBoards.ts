import type { BoardColor } from "./boards";
import { BOARD_COLOR_ORDER } from "./boardsExchange";
import { parseConnectPlacements } from "./connect";
import { CONNECT_ANCHORS } from "../data/connect";
import type { ConnectAnchor, ConnectPlacement, ConnectPlacements } from "../data/connect";

/**
 * 管理用「ホロメンボード」のデバッグ用の状態（複数ホロメン × 4 色の解放マス + コネクトマスの入力）。登録しているボード
 * （`src/storage/boards.ts`）とは別のキーに置き、画面を閉じても残す（2026-09-11 ユーザー指示「完了画面離れても保存して
 * おきたい。ただしデバッグ用途だけ」）。試算には一切使わない。
 * `previous` は直前の状態（JSON を 2 回目以降に入れたときの差分表示用。初回は null）
 */
export const DEBUG_BOARDS_STORAGE_KEY = "holodori-optimizer:debug-boards";
export const DEBUG_BOARDS_SCHEMA_VERSION = 1;

export type ColorNodes = Record<BoardColor, string[]>;
/** 1 ホロメンぶん: 4 色の解放マス + コネクトマスの入力（アンカー → 形と ‰。2026-09-11「コネクトマスの情報が入ってない」で追加） */
export type DebugHolomen = ColorNodes & { connect: ConnectPlacements };
/** ホロメン ID → 1 ホロメンぶん */
export type DebugBoards = Record<string, DebugHolomen>;

export interface DebugBoardsState {
  current: DebugBoards;
  previous: DebugBoards | null;
}

export const emptyColorNodes = (): DebugHolomen => ({
  red: [],
  blue: [],
  yellow: [],
  green: [],
  connect: {},
});

function toColorNodes(value: unknown): DebugHolomen {
  const nodes = emptyColorNodes();
  if (typeof value !== "object" || value === null) return nodes;
  const record = value as Record<string, unknown>;
  for (const color of BOARD_COLOR_ORDER) {
    const list = record[color];
    if (Array.isArray(list)) {
      nodes[color] = [
        ...new Set(list.filter((n): n is string => typeof n === "string" && n !== "")),
      ];
    }
  }
  nodes.connect = parseConnectPlacements(record.connect);
  return nodes;
}

function toDebugBoards(value: unknown): DebugBoards {
  const boards: DebugBoards = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return boards;
  for (const [holomenId, nodes] of Object.entries(value as Record<string, unknown>)) {
    if (holomenId === "") continue;
    boards[holomenId] = toColorNodes(nodes);
  }
  return boards;
}

export function parseDebugBoards(raw: string | null): DebugBoardsState {
  const empty: DebugBoardsState = { current: {}, previous: null };
  if (raw === null) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (typeof parsed !== "object" || parsed === null) return empty;
  const record = parsed as Record<string, unknown>;
  return {
    current: toDebugBoards(record.current),
    previous:
      typeof record.previous === "object" && record.previous !== null
        ? toDebugBoards(record.previous)
        : null,
  };
}

export function serializeDebugBoards(state: DebugBoardsState): string {
  return JSON.stringify({ version: DEBUG_BOARDS_SCHEMA_VERSION, ...state });
}

export function loadDebugBoards(): DebugBoardsState {
  try {
    return parseDebugBoards(localStorage.getItem(DEBUG_BOARDS_STORAGE_KEY));
  } catch {
    return { current: {}, previous: null };
  }
}

export function saveDebugBoards(state: DebugBoardsState): void {
  try {
    localStorage.setItem(DEBUG_BOARDS_STORAGE_KEY, serializeDebugBoards(state));
  } catch {
    // 保存できない環境でも動作は継続する
  }
}

/** 前回との差分（ホロメン × 色ごとに増えたマス・減ったマス。変化のない組は含めない） */
export interface DebugBoardsDiff {
  holomenId: string;
  color: BoardColor;
  added: string[];
  removed: string[];
}

export function diffDebugBoards(previous: DebugBoards, current: DebugBoards): DebugBoardsDiff[] {
  const diffs: DebugBoardsDiff[] = [];
  const ids = [...new Set([...Object.keys(previous), ...Object.keys(current)])];
  for (const holomenId of ids) {
    const before = previous[holomenId] ?? emptyColorNodes();
    const after = current[holomenId] ?? emptyColorNodes();
    for (const color of BOARD_COLOR_ORDER) {
      const b = new Set(before[color]);
      const a = new Set(after[color]);
      const added = after[color].filter((n) => !b.has(n));
      const removed = before[color].filter((n) => !a.has(n));
      if (added.length > 0 || removed.length > 0) diffs.push({ holomenId, color, added, removed });
    }
  }
  return diffs;
}

/** 前回との差分（コネクトマス）: ホロメン × アンカーごとの前後の入力（同じなら含めない。置いていなければ null） */
export interface DebugConnectDiff {
  holomenId: string;
  anchor: ConnectAnchor;
  before: ConnectPlacement | null;
  after: ConnectPlacement | null;
}

const samePlacement = (a: ConnectPlacement | null, b: ConnectPlacement | null): boolean =>
  a === b || (a !== null && b !== null && a.extent === b.extent && a.permil === b.permil);

export function diffDebugConnect(previous: DebugBoards, current: DebugBoards): DebugConnectDiff[] {
  const diffs: DebugConnectDiff[] = [];
  const ids = [...new Set([...Object.keys(previous), ...Object.keys(current)])];
  for (const holomenId of ids) {
    for (const anchor of CONNECT_ANCHORS) {
      const before = previous[holomenId]?.connect[anchor] ?? null;
      const after = current[holomenId]?.connect[anchor] ?? null;
      if (!samePlacement(before, after)) diffs.push({ holomenId, anchor, before, after });
    }
  }
  return diffs;
}
