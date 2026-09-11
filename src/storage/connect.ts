import { CONNECT_ANCHORS } from "../data/connect";
import type { ConnectAnchor, ConnectPlacements } from "../data/connect";

/**
 * コネクトマスに置いたカードの保存(ホロメンごと・アンカーごとのカード ID)。localStorage のみ。
 * ボードの解放マス(src/storage/boards.ts の 4 色のキー)には混ぜず別のキーに持つ — 古い保存データにこのキーが
 * なければ「どこにも置いていない」として読む(.claude/rules/storage-compat.md)。
 * 後方互換の約束は他のキーと同じ: 版番号つき封筒、壊れていれば空扱い、現在のデータにないホロメン ID・カード ID も
 * 捨てずに書き戻す(UI で使うときに既知のものだけ選ぶ)
 */
export const CONNECT_STORAGE_KEY = "holodori-optimizer:connect-placements";
export const CONNECT_SCHEMA_VERSION = 1;

export interface ConnectEntry {
  holomenId: string;
  placements: ConnectPlacements;
}

interface ConnectEnvelope {
  version: number;
  entries: ConnectEntry[];
}

function toEntry(entry: unknown): ConnectEntry | null {
  if (typeof entry !== "object" || entry === null) return null;
  if (!("holomenId" in entry) || typeof entry.holomenId !== "string" || entry.holomenId === "")
    return null;
  const placements: ConnectPlacements = {};
  const raw = "placements" in entry ? entry.placements : undefined;
  if (typeof raw === "object" && raw !== null) {
    for (const anchor of CONNECT_ANCHORS) {
      const cardId = (raw as Record<string, unknown>)[anchor];
      if (typeof cardId === "string" && cardId !== "") placements[anchor] = cardId;
    }
  }
  return { holomenId: entry.holomenId, placements };
}

export function parseConnect(raw: string | null): ConnectEntry[] {
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
    !("entries" in parsed) ||
    !Array.isArray(parsed.entries)
  )
    return [];
  const seen = new Set<string>();
  return parsed.entries
    .map(toEntry)
    .filter((e): e is ConnectEntry => e !== null)
    .filter((e) => {
      if (seen.has(e.holomenId)) return false;
      seen.add(e.holomenId);
      return true;
    });
}

export function serializeConnect(entries: readonly ConnectEntry[]): string {
  const envelope: ConnectEnvelope = {
    version: CONNECT_SCHEMA_VERSION,
    entries: entries.map((e) => ({ holomenId: e.holomenId, placements: { ...e.placements } })),
  };
  return JSON.stringify(envelope);
}

export function loadConnect(): ConnectEntry[] {
  try {
    return parseConnect(localStorage.getItem(CONNECT_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveConnect(entries: readonly ConnectEntry[]): void {
  try {
    localStorage.setItem(CONNECT_STORAGE_KEY, serializeConnect(entries));
  } catch {
    // 保存できない環境でも動作は継続する
  }
}

/** ホロメン ID → コネクトの配置(計算に渡す形。置いていないホロメンは含めない) */
export type ConnectPlacementMap = Record<string, ConnectPlacements>;

export function toConnectPlacementMap(entries: readonly ConnectEntry[]): ConnectPlacementMap {
  const map: ConnectPlacementMap = {};
  for (const e of entries) {
    if (Object.keys(e.placements).length > 0) map[e.holomenId] = { ...e.placements };
  }
  return map;
}

/** 1 ホロメン・1 アンカーの配置を置き換える(null で外す)。新しい配列を返す */
export function setConnectPlacement(
  entries: readonly ConnectEntry[],
  holomenId: string,
  anchor: ConnectAnchor,
  cardId: string | null,
): ConnectEntry[] {
  const next = entries.map((e) => ({ holomenId: e.holomenId, placements: { ...e.placements } }));
  let entry = next.find((e) => e.holomenId === holomenId);
  if (!entry) {
    entry = { holomenId, placements: {} };
    next.push(entry);
  }
  if (cardId === null) delete entry.placements[anchor];
  else entry.placements[anchor] = cardId;
  return next;
}
