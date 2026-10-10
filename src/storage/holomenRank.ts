import { isValidHolomenRank } from "../data/boardPoints";

/**
 * ホロメンランクの登録(ホロメンごと・任意)の保存。localStorage のみ(2026-10-04 ユーザー指示)。
 * ランクからそのホロメンのボードPt の予算が決まる(src/data/boardPoints.ts)。**未登録は「ボードPt の制限なし」**で、
 * 0 を未登録の代わりにしない — 登録しないホロメンは配列に載せない。
 * ボードの 4 色のキー(src/storage/boards.ts)・コネクトの配置(connect.ts)とは別のキーに持つ(旧データにこのキーがなければ
 * 「どのホロメンも未登録」として読む — .claude/skills/storage-compat/SKILL.md)。
 * 後方互換の約束は他のキーと同じ: 版番号つき封筒、壊れていれば空扱い、現在のデータにないホロメン ID も捨てずに書き戻す。
 * ランクが範囲外(1〜50 の整数でない)の行だけは読み飛ばす(予算を決められない値は登録ではない)
 */
export const HOLOMEN_RANK_STORAGE_KEY = "holodori-optimizer:holomen-ranks";
export const HOLOMEN_RANK_SCHEMA_VERSION = 1;

export interface HolomenRankEntry {
  holomenId: string;
  /** 1〜50 の整数 */
  rank: number;
}

interface HolomenRankEnvelope {
  version: number;
  ranks: HolomenRankEntry[];
}

function toEntry(entry: unknown): HolomenRankEntry | null {
  if (typeof entry !== "object" || entry === null) return null;
  if (!("holomenId" in entry) || typeof entry.holomenId !== "string" || entry.holomenId === "")
    return null;
  if (!("rank" in entry) || !isValidHolomenRank(entry.rank)) return null;
  return { holomenId: entry.holomenId, rank: entry.rank };
}

export function parseHolomenRanks(raw: string | null): HolomenRankEntry[] {
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
    !("ranks" in parsed) ||
    !Array.isArray(parsed.ranks)
  )
    return [];
  const seen = new Set<string>();
  return parsed.ranks
    .map(toEntry)
    .filter((e): e is HolomenRankEntry => e !== null)
    .filter((e) => {
      if (seen.has(e.holomenId)) return false;
      seen.add(e.holomenId);
      return true;
    });
}

export function serializeHolomenRanks(entries: readonly HolomenRankEntry[]): string {
  const envelope: HolomenRankEnvelope = {
    version: HOLOMEN_RANK_SCHEMA_VERSION,
    ranks: entries.map((e) => ({ holomenId: e.holomenId, rank: e.rank })),
  };
  return JSON.stringify(envelope);
}

export function loadHolomenRanks(): HolomenRankEntry[] {
  try {
    return parseHolomenRanks(localStorage.getItem(HOLOMEN_RANK_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveHolomenRanks(entries: readonly HolomenRankEntry[]): void {
  try {
    localStorage.setItem(HOLOMEN_RANK_STORAGE_KEY, serializeHolomenRanks(entries));
  } catch {
    // 保存できない環境でも動作は継続する
  }
}

/** ホロメン ID → ランク(登録済みのホロメンだけ。未登録は含めない) */
export type HolomenRankMap = Record<string, number>;

export function toHolomenRankMap(entries: readonly HolomenRankEntry[]): HolomenRankMap {
  const map: HolomenRankMap = {};
  for (const e of entries) map[e.holomenId] = e.rank;
  return map;
}

/** 1 ホロメンのランクを置き換える(null で未登録へ戻す)。新しい配列を返す */
export function setHolomenRank(
  entries: readonly HolomenRankEntry[],
  holomenId: string,
  rank: number | null,
): HolomenRankEntry[] {
  const rest = entries.filter((e) => e.holomenId !== holomenId);
  if (rank === null) return rest;
  if (!isValidHolomenRank(rank))
    throw new RangeError(`ホロメンランクは 1〜50 の整数: ${String(rank)}`);
  const index = entries.findIndex((e) => e.holomenId === holomenId);
  if (index < 0) return [...rest, { holomenId, rank }];
  return entries.map((e) => (e.holomenId === holomenId ? { holomenId, rank } : { ...e }));
}
