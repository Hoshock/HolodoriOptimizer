import { boardGraphOf, isUnlockableAnchor, UNLOCKABLE_ANCHORS } from "../data/boardState";
import type { UnlockableAnchor } from "../data/boardState";
import type { BoardColor, BoardEntry } from "./boards";
import type { ConnectEntry } from "./connect";

/**
 * コネクトマス(赤 / 青 / 黄のコネクト)そのものが**解放済みか**の保存。localStorage のみ(2026-10-04 ユーザー指示)。
 * コネクトの効果の配置(src/storage/connect.ts の `connect-placements`)とは意味が違う別の状態なので、別のキーに持つ —
 * 配置の有無を解放状態の代わりにしない(解放済みで配置なしは普通にある。「未解放で配置あり」は作らない)。
 * 中心のコネクト(center)は常に解放済みなので保存しない。
 *
 * **旧データの移行**: このキーがない保存データ(2026-10-04 より前)にはコネクトの解放状態がなかった(旧実装は常に通れる通路として
 * 扱っていた)ので、読み込み時に**一度だけ**次の規則で推定し、そのまま明示的に保存する(以後は推定しない):
 *  A. そのコネクトを通らないと中心へ届かない解放済みマスがある → 解放済み
 *  B. そのコネクトに配置がある → 解放済み
 *  C. 直前までしか開けておらず配置もない → 未解放(解放済みだったかは旧データから分からない。勝手に 1 Pt 消費した状態にしない)
 * 後方互換の約束は他のキーと同じ: 版番号つき封筒、現在のデータにないホロメン ID も捨てずに書き戻す
 */
export const BOARD_CONNECT_STORAGE_KEY = "holodori-optimizer:board-connects";
export const BOARD_CONNECT_SCHEMA_VERSION = 1;

export interface BoardConnectEntry {
  holomenId: string;
  /** 解放済みのコネクトマス(赤 = leader / 青 = card / 黄 = content)。UNLOCKABLE_ANCHORS の順 */
  unlocked: UnlockableAnchor[];
}

interface BoardConnectEnvelope {
  version: number;
  entries: BoardConnectEntry[];
}

const ordered = (anchors: Iterable<UnlockableAnchor>): UnlockableAnchor[] => {
  const set = new Set(anchors);
  return UNLOCKABLE_ANCHORS.filter((a) => set.has(a));
};

function toEntry(entry: unknown): BoardConnectEntry | null {
  if (typeof entry !== "object" || entry === null) return null;
  if (!("holomenId" in entry) || typeof entry.holomenId !== "string" || entry.holomenId === "")
    return null;
  const unlocked =
    "unlocked" in entry && Array.isArray(entry.unlocked)
      ? entry.unlocked.filter(isUnlockableAnchor)
      : [];
  return { holomenId: entry.holomenId, unlocked: ordered(unlocked) };
}

/**
 * 保存されている文字列を読む。**キーがない / 壊れている / 封筒でない**ときは null(= まだ保存されていない。呼び出し側が旧データから推定する)。
 * 空配列の封筒は「全員未解放」という有効な保存
 */
export function parseBoardConnects(raw: string | null): BoardConnectEntry[] | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("entries" in parsed) ||
    !Array.isArray(parsed.entries)
  )
    return null;
  const seen = new Set<string>();
  return parsed.entries
    .map(toEntry)
    .filter((e): e is BoardConnectEntry => e !== null)
    .filter((e) => {
      if (seen.has(e.holomenId)) return false;
      seen.add(e.holomenId);
      return true;
    });
}

export function serializeBoardConnects(entries: readonly BoardConnectEntry[]): string {
  const envelope: BoardConnectEnvelope = {
    version: BOARD_CONNECT_SCHEMA_VERSION,
    entries: entries.map((e) => ({ holomenId: e.holomenId, unlocked: ordered(e.unlocked) })),
  };
  return JSON.stringify(envelope);
}

/**
 * 旧データ(コネクトの解放状態がない)からコネクトの解放状態を推定する(上の A / B。C は未解放のまま)。
 * 対象は解放済みのマスか配置のどちらかがあるホロメン。空の行は作らない
 */
export function inferBoardConnects(
  boards: Readonly<Record<BoardColor, readonly BoardEntry[]>>,
  placements: readonly ConnectEntry[],
): BoardConnectEntry[] {
  const holomenIds = new Set<string>();
  for (const color of ["red", "blue", "yellow"] as const)
    for (const e of boards[color]) holomenIds.add(e.holomenId);
  for (const e of placements) holomenIds.add(e.holomenId);
  const nodesOf = (color: BoardColor, holomenId: string): ReadonlySet<string> =>
    new Set(
      boardGraphOf(color).knownNodeIds(
        boards[color].find((e) => e.holomenId === holomenId)?.nodes ?? [],
      ),
    );
  const colorOf = { leader: "red", card: "blue", content: "yellow" } as const;
  const entries: BoardConnectEntry[] = [];
  for (const holomenId of holomenIds) {
    const placed = placements.find((e) => e.holomenId === holomenId)?.placements ?? {};
    const unlocked = UNLOCKABLE_ANCHORS.filter(
      (anchor) =>
        placed[anchor] !== undefined ||
        boardGraphOf(colorOf[anchor]).connectorRequired(nodesOf(colorOf[anchor], holomenId)),
    );
    if (unlocked.length > 0) entries.push({ holomenId, unlocked });
  }
  return entries;
}

/**
 * 保存されているコネクトの解放状態を読む。まだ保存がなければ `infer`(旧データからの推定)を呼び、**その結果をすぐ保存して**返す
 * (毎回推定しない)。localStorage が使えない環境では推定結果をそのまま返す
 */
export function loadBoardConnects(infer: () => BoardConnectEntry[]): BoardConnectEntry[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(BOARD_CONNECT_STORAGE_KEY);
  } catch {
    return infer();
  }
  const saved = parseBoardConnects(raw);
  if (saved !== null) return saved;
  const inferred = infer();
  saveBoardConnects(inferred);
  return inferred;
}

export function saveBoardConnects(entries: readonly BoardConnectEntry[]): void {
  try {
    localStorage.setItem(BOARD_CONNECT_STORAGE_KEY, serializeBoardConnects(entries));
  } catch {
    // 保存できない環境でも動作は継続する
  }
}

/** ホロメン ID → 解放済みのコネクトマス(計算に渡す形。解放なしのホロメンは含めない) */
export type BoardConnectMap = Record<string, UnlockableAnchor[]>;

export function toBoardConnectMap(entries: readonly BoardConnectEntry[]): BoardConnectMap {
  const map: BoardConnectMap = {};
  for (const e of entries) if (e.unlocked.length > 0) map[e.holomenId] = ordered(e.unlocked);
  return map;
}

/** 1 ホロメンの解放済みのコネクトを置き換える。新しい配列を返す(空配列は行ごと外す) */
export function setBoardConnects(
  entries: readonly BoardConnectEntry[],
  holomenId: string,
  unlocked: readonly UnlockableAnchor[],
): BoardConnectEntry[] {
  const next = ordered(unlocked);
  const rest = entries.filter((e) => e.holomenId !== holomenId);
  const index = entries.findIndex((e) => e.holomenId === holomenId);
  if (next.length === 0) return rest.map((e) => ({ ...e, unlocked: [...e.unlocked] }));
  if (index < 0)
    return [
      ...rest.map((e) => ({ ...e, unlocked: [...e.unlocked] })),
      { holomenId, unlocked: next },
    ];
  return entries.map((e) =>
    e.holomenId === holomenId ? { holomenId, unlocked: next } : { ...e, unlocked: [...e.unlocked] },
  );
}
