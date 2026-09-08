import { knownNodeIds } from "../data/blueBoard";
import { greenKnownNodeIds } from "../data/greenBoard";
import { redKnownNodeIds } from "../data/redBoard";
import { yellowKnownNodeIds } from "../data/yellowBoard";

/**
 * ホロメンボードの登録(ホロメンごとの解放マス)の保存。localStorage のみ。色ごとに別キー
 * (青 = blue-boards、緑 = green-boards — 2026-09-07 追加、黄 = yellow-boards・赤 = red-boards — 2026-09-08 追加)で、封筒の形は同じ。
 * 後方互換の約束は src/storage/owned.ts と同じ: 版番号つき封筒、壊れていれば空扱い、
 * 現在のデータにないホロメン ID も捨てずに書き戻す。マス ID は既知のものだけ使う
 * (未知のマス ID も配列に残して書き戻す)。
 * 旧データの mirrored(左右型)は 2026-09-07 に廃止 — 左右はホロメンの固定データ(holomen.json の board)から
 * 引くので読み飛ばす(封筒の版は 1 のまま。読めなくなる変更ではない)
 */

export type BoardColor = "red" | "blue" | "yellow" | "green";
export const RED_BOARDS_STORAGE_KEY = "holodori-optimizer:red-boards";
export const BOARDS_STORAGE_KEY = "holodori-optimizer:blue-boards";
export const YELLOW_BOARDS_STORAGE_KEY = "holodori-optimizer:yellow-boards";
export const GREEN_BOARDS_STORAGE_KEY = "holodori-optimizer:green-boards";
const STORAGE_KEYS: Record<BoardColor, string> = {
  red: RED_BOARDS_STORAGE_KEY,
  blue: BOARDS_STORAGE_KEY,
  yellow: YELLOW_BOARDS_STORAGE_KEY,
  green: GREEN_BOARDS_STORAGE_KEY,
};
const KNOWN_NODE_IDS: Record<BoardColor, (ids: readonly string[]) => string[]> = {
  red: redKnownNodeIds,
  blue: knownNodeIds,
  yellow: yellowKnownNodeIds,
  green: greenKnownNodeIds,
};
export const BOARDS_SCHEMA_VERSION = 1;

export interface BoardEntry {
  holomenId: string;
  /** 解放済みマスの ID(赤は R-001、青は B-001、黄は Y-001、緑は G-001 など) */
  nodes: string[];
}

interface BoardsEnvelope {
  version: number;
  boards: BoardEntry[];
}

function toEntry(entry: unknown): BoardEntry | null {
  if (typeof entry !== "object" || entry === null) return null;
  if (!("holomenId" in entry) || typeof entry.holomenId !== "string" || entry.holomenId === "")
    return null;
  const nodes =
    "nodes" in entry && Array.isArray(entry.nodes)
      ? entry.nodes.filter((n): n is string => typeof n === "string" && n !== "")
      : [];
  return { holomenId: entry.holomenId, nodes: [...new Set(nodes)] };
}

export function parseBoards(raw: string | null): BoardEntry[] {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("boards" in parsed) ||
    !Array.isArray(parsed.boards)
  )
    return [];
  const seen = new Set<string>();
  return parsed.boards
    .map(toEntry)
    .filter((e): e is BoardEntry => e !== null)
    .filter((e) => {
      if (seen.has(e.holomenId)) return false;
      seen.add(e.holomenId);
      return true;
    });
}

export function serializeBoards(entries: BoardEntry[]): string {
  const envelope: BoardsEnvelope = {
    version: BOARDS_SCHEMA_VERSION,
    boards: entries.map((e) => ({
      holomenId: e.holomenId,
      nodes: [...e.nodes],
    })),
  };
  return JSON.stringify(envelope);
}

export function loadBoards(color: BoardColor): BoardEntry[] {
  try {
    return parseBoards(localStorage.getItem(STORAGE_KEYS[color]));
  } catch {
    return [];
  }
}

export function saveBoards(color: BoardColor, entries: BoardEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS[color], serializeBoards(entries));
  } catch {
    // 保存できない環境でも動作は継続する
  }
}

/** ホロメン ID → 既知の解放マス ID(計算に渡す形。未登録・空は含めない) */
export type BoardMap = Record<string, string[]>;

export function toBoardMap(color: BoardColor, entries: readonly BoardEntry[]): BoardMap {
  const map: BoardMap = {};
  for (const e of entries) {
    const nodes = KNOWN_NODE_IDS[color](e.nodes);
    if (nodes.length > 0) map[e.holomenId] = nodes;
  }
  return map;
}
