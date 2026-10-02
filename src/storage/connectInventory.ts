import { isConnectExtentId } from "../data/connect";
import type { ConnectExtentId, ConnectPlacement } from "../data/connect";

/**
 * 所持しているコネクト(形 × ％ × 枚数)の登録。localStorage のみ。アカウントの「コネクト」で登録し、
 * **コネクトの最適化**(`src/engine/connectOptimize.ts`)だけが使う(2026-10-02 ユーザー指示)。
 * ボードで置いているコネクト(`src/storage/connect.ts`。ホロメンごと・コネクトマスごと)とは**別管理**で、
 * 探索・お気に入り・発動頻度の最適化は置いている配置のほうを使う。
 *
 * 後方互換の約束は他のキーと同じ: 版番号つき封筒、壊れていれば空扱い、読み込みで値を捨てすぎない
 * (知らない形・正でない ‰・正の整数でない枚数だけを捨てる。同じ 形 × ‰ は枚数を合算する)。
 * キーがない旧データは「何も持っていない」として読む。
 */
export const CONNECT_INVENTORY_STORAGE_KEY = "holodori-optimizer:connect-inventory";
export const CONNECT_INVENTORY_SCHEMA_VERSION = 1;
/** 1 種の枚数の上限(誤入力で膨らませない) */
export const CONNECT_INVENTORY_MAX_COUNT = 99;

export interface ConnectInventoryEntry {
  extent: ConnectExtentId;
  /** 増幅 ‰(1500 = 「150% UP」) */
  permil: number;
  /** 持っている枚数(1 以上) */
  count: number;
}

interface InventoryEnvelope {
  version: number;
  entries: ConnectInventoryEntry[];
}

function toEntry(value: unknown): ConnectInventoryEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const extent = "extent" in value ? value.extent : undefined;
  const permil = "permil" in value ? value.permil : undefined;
  const count = "count" in value ? value.count : undefined;
  if (typeof extent !== "string" || !isConnectExtentId(extent)) return null;
  if (typeof permil !== "number" || !Number.isFinite(permil) || permil <= 0) return null;
  if (typeof count !== "number" || !Number.isFinite(count)) return null;
  const n = Math.min(CONNECT_INVENTORY_MAX_COUNT, Math.floor(count));
  if (n < 1) return null;
  return { extent, permil: Math.round(permil), count: n };
}

/** 同じ 形 × ‰ は枚数を合算する(上限を超えない)。並びは最初に出てきた順 */
function merge(entries: readonly ConnectInventoryEntry[]): ConnectInventoryEntry[] {
  const out: ConnectInventoryEntry[] = [];
  for (const e of entries) {
    const same = out.find((o) => o.extent === e.extent && o.permil === e.permil);
    if (same) same.count = Math.min(CONNECT_INVENTORY_MAX_COUNT, same.count + e.count);
    else out.push({ ...e });
  }
  return out;
}

export function parseConnectInventory(raw: string | null): ConnectInventoryEntry[] {
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
  return merge(parsed.entries.map(toEntry).filter((e): e is ConnectInventoryEntry => e !== null));
}

export function serializeConnectInventory(entries: readonly ConnectInventoryEntry[]): string {
  const envelope: InventoryEnvelope = {
    version: CONNECT_INVENTORY_SCHEMA_VERSION,
    entries: entries.map((e) => ({ extent: e.extent, permil: e.permil, count: e.count })),
  };
  return JSON.stringify(envelope);
}

export function loadConnectInventory(): ConnectInventoryEntry[] {
  try {
    return parseConnectInventory(localStorage.getItem(CONNECT_INVENTORY_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveConnectInventory(entries: readonly ConnectInventoryEntry[]): void {
  try {
    localStorage.setItem(CONNECT_INVENTORY_STORAGE_KEY, serializeConnectInventory(entries));
  } catch {
    // 保存できない環境でも動作は継続する
  }
}

/** その 形 × ‰ の枚数(持っていなければ 0) */
export function inventoryCount(
  entries: readonly ConnectInventoryEntry[],
  extent: ConnectExtentId,
  permil: number,
): number {
  return entries.find((e) => e.extent === extent && e.permil === permil)?.count ?? 0;
}

/** その形の枚数の合計(％が違うものも合わせる) */
export function inventoryTotal(
  entries: readonly ConnectInventoryEntry[],
  extent: ConnectExtentId,
): number {
  return entries.filter((e) => e.extent === extent).reduce((sum, e) => sum + e.count, 0);
}

/** その 形 × ‰ の枚数を置き換える(0 以下で外す。上限は `CONNECT_INVENTORY_MAX_COUNT`)。新しい配列を返す */
export function setInventoryCount(
  entries: readonly ConnectInventoryEntry[],
  extent: ConnectExtentId,
  permil: number,
  count: number,
): ConnectInventoryEntry[] {
  const n = Math.min(CONNECT_INVENTORY_MAX_COUNT, Math.max(0, Math.floor(count)));
  const rest = entries
    .filter((e) => !(e.extent === extent && e.permil === permil))
    .map((e) => ({ ...e }));
  if (n === 0) return rest;
  const at = entries.findIndex((e) => e.extent === extent && e.permil === permil);
  const next = { extent, permil, count: n };
  // 既にあれば元の位置のまま、なければ末尾に足す
  if (at >= 0) {
    const list = entries.map((e) => ({ ...e }));
    list[at] = next;
    return list;
  }
  return [...rest, next];
}

/** 最適化に渡す形(形 × ‰ × 枚数) */
export function inventoryItems(
  entries: readonly ConnectInventoryEntry[],
): { placement: ConnectPlacement; count: number }[] {
  return entries.map((e) => ({
    placement: { extent: e.extent, permil: e.permil },
    count: e.count,
  }));
}

/** 持っているコネクトがあるか(コネクトの最適化を使えるか) */
export function hasInventory(entries: readonly ConnectInventoryEntry[]): boolean {
  return entries.some((e) => e.count > 0);
}
