/**
 * ピッカーの並び順(キーと、キーごとの向き)の保存。ページを再読み込みしても保持する
 * (「ソートオプションは記憶したい」— 2026-09-06 ユーザー指示)。
 * 壊れていれば既定値に戻す読み込みで足りる設定キー(storage-compat.md)
 */

export const SORT_PREFS_STORAGE_KEY = "holodori-optimizer:sort-prefs";

export type SortDirection = "desc" | "asc";

export interface SortPref<K extends string> {
  key: K;
  direction: Record<K, SortDirection>;
}

function isDirection(value: unknown): value is SortDirection {
  return value === "desc" || value === "asc";
}

/** picker ごとの設定を読む。未保存・壊れている・未知のキーは既定値で埋める */
export function loadSortPref<K extends string>(
  picker: string,
  defaults: SortPref<K>,
  raw: string | null = readRaw(),
): SortPref<K> {
  const result: SortPref<K> = { key: defaults.key, direction: { ...defaults.direction } };
  if (raw === null) return result;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return result;
  }
  if (typeof parsed !== "object" || parsed === null) return result;
  const entry: unknown = (parsed as Record<string, unknown>)[picker];
  if (typeof entry !== "object" || entry === null) return result;
  const e = entry as Record<string, unknown>;
  if (typeof e.key === "string" && e.key in defaults.direction) result.key = e.key as K;
  if (typeof e.direction === "object" && e.direction !== null) {
    for (const k of Object.keys(defaults.direction) as K[]) {
      const d = (e.direction as Record<string, unknown>)[k];
      if (isDirection(d)) result.direction[k] = d;
    }
  }
  return result;
}

/** picker の設定だけを書き換えて保存する(他のピッカーの設定は保つ) */
export function saveSortPref<K extends string>(picker: string, pref: SortPref<K>): void {
  try {
    let all: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(SORT_PREFS_STORAGE_KEY) ?? "{}");
      if (typeof parsed === "object" && parsed !== null) all = parsed as Record<string, unknown>;
    } catch {
      all = {};
    }
    all[picker] = { key: pref.key, direction: { ...pref.direction } };
    localStorage.setItem(SORT_PREFS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // 保存できない環境でも動作は継続する
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(SORT_PREFS_STORAGE_KEY);
  } catch {
    return null;
  }
}
