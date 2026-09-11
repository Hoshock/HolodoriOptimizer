import { CONNECT_ANCHORS, isConnectExtentId, unmirrorPlacements } from "../data/connect";
import type { ConnectAnchor, ConnectPlacement, ConnectPlacements } from "../data/connect";

/**
 * コネクトマスの入力(ホロメンごと・アンカーごとの 範囲の形 + 増幅 ‰)の保存。localStorage のみ。
 * ボードの解放マス(src/storage/boards.ts の 4 色のキー)には混ぜず別のキーに持つ — 古い保存データにこのキーが
 * なければ「どこにも置いていない」として読む(.claude/rules/storage-compat.md)。
 * v1(2026-09-11 の数時間だけ公開。値がカード ID の文字列)は形が分からないので読み飛ばす(未配置扱い)。
 * v2(同日)は範囲の向きを「青 / 黄のコネクトは青が右のホロメン、赤はライフ系が右のホロメンで dx を反転」して当てていた。
 * v3 で反転をやめた(形は物理座標のまま)ので、v2 の形は読み込み時に左右反転した形へ写して同じマスに掛かるようにする
 * (`unmirrorPlacements`。既存の保存データを壊さない — 2026-09-11 ユーザー指示)。
 * 後方互換の約束は他のキーと同じ: 版番号つき封筒、壊れていれば空扱い、現在のデータにないホロメン ID も捨てずに書き戻す
 */
export const CONNECT_STORAGE_KEY = "holodori-optimizer:connect-placements";
export const CONNECT_SCHEMA_VERSION = 3;

export interface ConnectEntry {
  holomenId: string;
  placements: ConnectPlacements;
}

interface ConnectEnvelope {
  version: number;
  entries: ConnectEntry[];
}

/** { extent, permil } だけを受け付ける(v1 のカード ID の文字列・知らない形・0 以下の ‰ は捨てる) */
function toPlacement(value: unknown): ConnectPlacement | null {
  if (typeof value !== "object" || value === null) return null;
  const extent = "extent" in value ? value.extent : undefined;
  const permil = "permil" in value ? value.permil : undefined;
  if (typeof extent !== "string" || !isConnectExtentId(extent)) return null;
  if (typeof permil !== "number" || !Number.isFinite(permil) || permil <= 0) return null;
  return { extent, permil: Math.round(permil) };
}

/** アンカー → { extent, permil } のオブジェクトを読む(知らないアンカー・壊れた値は捨てる。オブジェクトでなければ空)。デバッグ用ボードの JSON でも使う */
export function parseConnectPlacements(raw: unknown): ConnectPlacements {
  const placements: ConnectPlacements = {};
  if (typeof raw !== "object" || raw === null) return placements;
  for (const anchor of CONNECT_ANCHORS) {
    const placed = toPlacement((raw as Record<string, unknown>)[anchor]);
    if (placed) placements[anchor] = placed;
  }
  return placements;
}

function toEntry(entry: unknown): ConnectEntry | null {
  if (typeof entry !== "object" || entry === null) return null;
  if (!("holomenId" in entry) || typeof entry.holomenId !== "string" || entry.holomenId === "")
    return null;
  return {
    holomenId: entry.holomenId,
    placements: parseConnectPlacements("placements" in entry ? entry.placements : undefined),
  };
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
  const version = "version" in parsed && typeof parsed.version === "number" ? parsed.version : 0;
  const seen = new Set<string>();
  return parsed.entries
    .map(toEntry)
    .filter((e): e is ConnectEntry => e !== null)
    .map((e) =>
      version <= 2 ? { ...e, placements: unmirrorPlacements(e.holomenId, e.placements) } : e,
    )
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
  placement: ConnectPlacement | null,
): ConnectEntry[] {
  const next = entries.map((e) => ({ holomenId: e.holomenId, placements: { ...e.placements } }));
  let entry = next.find((e) => e.holomenId === holomenId);
  if (!entry) {
    entry = { holomenId, placements: {} };
    next.push(entry);
  }
  if (placement === null) delete entry.placements[anchor];
  else entry.placements[anchor] = { ...placement };
  return next;
}
