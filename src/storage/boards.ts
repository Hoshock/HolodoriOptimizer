import { knownNodeIds } from "../data/blueBoard";

/**
 * 青ホロメンボードの登録(ホロメンごとの解放マスと左右型)の保存。localStorage のみ。
 * 後方互換の約束は src/storage/owned.ts と同じ: 版番号つき封筒、壊れていれば空扱い、
 * 現在のデータにないホロメン ID も捨てずに書き戻す。マス ID は既知のものだけ使う
 * (未知のマス ID も配列に残して書き戻す)
 */

export const BOARDS_STORAGE_KEY = "holodori-optimizer:blue-boards";
export const BOARDS_SCHEMA_VERSION = 1;

export interface BoardEntry {
  holomenId: string;
  /** 解放済みマスの ID(B-001 など) */
  nodes: string[];
  /** 右型(左右反転)で表示するか */
  mirrored: boolean;
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
  const mirrored = "mirrored" in entry && entry.mirrored === true;
  return { holomenId: entry.holomenId, nodes: [...new Set(nodes)], mirrored };
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
      mirrored: e.mirrored,
    })),
  };
  return JSON.stringify(envelope);
}

export function loadBoards(): BoardEntry[] {
  try {
    return parseBoards(localStorage.getItem(BOARDS_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveBoards(entries: BoardEntry[]): void {
  try {
    localStorage.setItem(BOARDS_STORAGE_KEY, serializeBoards(entries));
  } catch {
    // 保存できない環境でも動作は継続する
  }
}

/** ホロメン ID → 既知の解放マス ID(計算に渡す形。未登録・空は含めない) */
export type BoardMap = Record<string, string[]>;

export function toBoardMap(entries: readonly BoardEntry[]): BoardMap {
  const map: BoardMap = {};
  for (const e of entries) {
    const nodes = knownNodeIds(e.nodes);
    if (nodes.length > 0) map[e.holomenId] = nodes;
  }
  return map;
}
