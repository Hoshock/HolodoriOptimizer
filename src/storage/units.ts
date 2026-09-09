/**
 * お気に入りユニット(リーダー + メンバー 5 人の編成)の保存。このブラウザ内(localStorage)のみ。
 *
 * 登録番号は 1〜UNIT_SLOT_COUNT の 10 個(2 行 5 列で選ばせる — 2026-09-09 ユーザー指定)。
 * 保存するのはカード ID だけで、スコアは持たない — 表示するときに現在の開花・ボード・アカウント補正で
 * 計算し直す(「数値は登録した時点ではなく表示した時点で最新の情報で計算した値にする」)。
 *
 * 後方互換の約束は src/storage/owned.ts と同じ: 版番号つき封筒、壊れていれば登録なし扱い、
 * 現在のカードデータにない ID も捨てずに保持して書き戻す(UI で使うときに解決できるものだけ選ぶ)
 */

export const UNITS_STORAGE_KEY = "holodori-optimizer:units";
export const UNITS_SCHEMA_VERSION = 1;

/** 登録できるユニットの数(番号は 1〜10) */
export const UNIT_SLOT_COUNT = 10;
/** 1 ユニットのメンバー数(メンバー枠と同じ 5 人) */
export const UNIT_MEMBER_COUNT = 5;

/** 編成そのもの(リーダー 1 枚 + メンバー 5 枚のカード ID) */
export interface UnitComposition {
  leaderId: string;
  /** メンバー 5 人のカード ID(登録したときの並び) */
  memberIds: string[];
}

/** 番号つきの登録済みユニット */
export interface SavedUnit extends UnitComposition {
  /** 登録番号(1〜UNIT_SLOT_COUNT) */
  slot: number;
}

interface UnitsEnvelope {
  version: number;
  units: SavedUnit[];
}

function isSlot(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= UNIT_SLOT_COUNT
  );
}

function toCardId(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function toSavedUnit(entry: unknown): SavedUnit | null {
  if (typeof entry !== "object" || entry === null) return null;
  if (!("slot" in entry) || !isSlot(entry.slot)) return null;
  const leaderId = "leaderId" in entry ? toCardId(entry.leaderId) : null;
  if (leaderId === null) return null;
  if (!("memberIds" in entry) || !Array.isArray(entry.memberIds)) return null;
  const memberIds = entry.memberIds.map(toCardId).filter((id): id is string => id !== null);
  if (memberIds.length !== UNIT_MEMBER_COUNT) return null;
  return { slot: entry.slot, leaderId, memberIds };
}

/** 番号の昇順にそろえ、同じ番号は先に現れたものを残す */
function normalize(units: SavedUnit[]): SavedUnit[] {
  const bySlot = new Map<number, SavedUnit>();
  for (const unit of units) {
    if (!bySlot.has(unit.slot)) bySlot.set(unit.slot, unit);
  }
  return [...bySlot.values()].sort((a, b) => a.slot - b.slot);
}

/** 保存文字列を解釈する。壊れていれば登録なし扱い。未知のカード ID も残す */
export function parseUnits(raw: string | null): SavedUnit[] {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) {
    return normalize(parsed.map(toSavedUnit).filter((u): u is SavedUnit => u !== null));
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "units" in parsed &&
    Array.isArray(parsed.units)
  ) {
    return normalize(parsed.units.map(toSavedUnit).filter((u): u is SavedUnit => u !== null));
  }
  return [];
}

/** 現在の形式(v1)で文字列化する */
export function serializeUnits(units: SavedUnit[]): string {
  const envelope: UnitsEnvelope = {
    version: UNITS_SCHEMA_VERSION,
    units: normalize(units).map((u) => ({
      slot: u.slot,
      leaderId: u.leaderId,
      memberIds: [...u.memberIds],
    })),
  };
  return JSON.stringify(envelope);
}

export function loadUnits(storage: Pick<Storage, "getItem"> = localStorage): SavedUnit[] {
  try {
    return parseUnits(storage.getItem(UNITS_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveUnits(
  units: SavedUnit[],
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(UNITS_STORAGE_KEY, serializeUnits(units));
  } catch {
    // 保存できない環境(プライベートブラウズ等)でも動作は継続する
  }
}

/** 同じ編成か。リーダーが同じで、メンバー 5 人の集合が同じなら同じ編成とみなす(並びは問わない) */
export function sameUnit(a: UnitComposition, b: UnitComposition): boolean {
  if (a.leaderId !== b.leaderId) return false;
  if (a.memberIds.length !== b.memberIds.length) return false;
  const left = [...a.memberIds].sort();
  const right = [...b.memberIds].sort();
  return left.every((id, i) => id === right[i]);
}

/** その編成が登録されている番号(登録されていなければ null) */
export function unitSlotOf(units: SavedUnit[], unit: UnitComposition): number | null {
  return units.find((u) => sameUnit(u, unit))?.slot ?? null;
}

/** 指定の番号へ登録する(その番号の既存の登録は置き換える) */
export function putUnit(units: SavedUnit[], slot: number, unit: UnitComposition): SavedUnit[] {
  if (!isSlot(slot)) return units;
  return normalize([
    { slot, leaderId: unit.leaderId, memberIds: [...unit.memberIds] },
    ...units.filter((u) => u.slot !== slot),
  ]);
}

/** 指定の番号の登録を解除する */
export function removeUnit(units: SavedUnit[], slot: number): SavedUnit[] {
  return units.filter((u) => u.slot !== slot);
}
