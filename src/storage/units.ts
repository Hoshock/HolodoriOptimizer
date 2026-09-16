/**
 * お気に入りユニット(リーダー + メンバー 5 人の編成)の保存。このブラウザ内(localStorage)のみ。
 *
 * 登録番号は 1〜UNIT_SLOT_COUNT の 10 個(2 行 5 列で選ばせる — 2026-09-09 ユーザー指定)で、
 * **番号は 1 から連続していなければならない**(2026-09-16 ユーザー指示「1 が登録されてたら 1 か 2 のみ、と
 * 隣接するところにしか置けないように」「1, 2, 3 と登録していて 2 を消したら 1, 3 は 1, 2 となるように」)。
 * 不変条件は `compactUnits` が保ち、読み込み・登録・解除・書き出しのすべてを通す —
 * 歯抜けで保存されていた過去のデータ(1, 3, 7)も**読み込んだ時点で 1, 2, 3 へ詰まる**。
 * 詰め直しで動くのは番号だけで、編成も名前もそのまま持って上がる(登録は 1 件も消さない)。
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
/** ユニット名の長さの上限(2026-09-15 ユーザー指示) */
export const UNIT_NAME_MAX_LENGTH = 10;

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
  /**
   * 付けた名前(最大 UNIT_NAME_MAX_LENGTH 文字)。付けていなければ省略 —
   * 名前がないユニットは「ユニット{番号}」で表示する(unitDisplayName)
   */
  name?: string;
}

/** 入力されたユニット名を保存できる形に整える(前後の空白を落とし、上限で切る。空なら null = 名前なし) */
export function normalizeUnitName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, UNIT_NAME_MAX_LENGTH);
  return trimmed === "" ? null : trimmed;
}

/** 画面に出す名前。付けていなければ「ユニット{番号}」 */
export function unitDisplayName(slot: number, name?: string | null): string {
  return name !== undefined && name !== null && name !== "" ? name : `ユニット${String(slot)}`;
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
  const name = "name" in entry ? normalizeUnitName(entry.name) : null;
  return { slot: entry.slot, leaderId, memberIds, ...(name === null ? {} : { name }) };
}

/** 番号の昇順にそろえ、同じ番号は先に現れたものを残す */
function normalize(units: SavedUnit[]): SavedUnit[] {
  const bySlot = new Map<number, SavedUnit>();
  for (const unit of units) {
    if (!bySlot.has(unit.slot)) bySlot.set(unit.slot, unit);
  }
  return [...bySlot.values()].sort((a, b) => a.slot - b.slot);
}

/**
 * 番号を 1 から連続に詰め直す(並びは元の番号の昇順のまま)。編成と名前はそのまま移し、登録は消さない。
 * 保存できる数を超えたぶん(あり得ないが壊れたデータ由来)は後ろから落とす
 */
export function compactUnits(units: SavedUnit[]): SavedUnit[] {
  return normalize(units)
    .slice(0, UNIT_SLOT_COUNT)
    .map((unit, i) => ({ ...unit, slot: i + 1 }));
}

/** 次に使える空き番号(いっぱいなら null)。番号は連続なので「登録数 + 1」 */
export function nextFreeSlot(units: SavedUnit[]): number | null {
  const next = units.length + 1;
  return next <= UNIT_SLOT_COUNT ? next : null;
}

/**
 * その番号へ登録できるか。登録済みの番号(上書き)と、先頭の空き 1 つだけを許す —
 * 1, 2, 3 が埋まっていれば 1〜4 が使え、5 以降は使えない
 */
export function canUseSlot(units: SavedUnit[], slot: number): boolean {
  if (!isSlot(slot)) return false;
  return slot <= units.length || slot === nextFreeSlot(units);
}

/** 保存文字列を解釈する。壊れていれば登録なし扱い。未知のカード ID も残す。番号は 1 から詰め直す */
export function parseUnits(raw: string | null): SavedUnit[] {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) {
    return compactUnits(parsed.map(toSavedUnit).filter((u): u is SavedUnit => u !== null));
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "units" in parsed &&
    Array.isArray(parsed.units)
  ) {
    return compactUnits(parsed.units.map(toSavedUnit).filter((u): u is SavedUnit => u !== null));
  }
  return [];
}

/** 現在の形式(v1)で文字列化する */
export function serializeUnits(units: SavedUnit[]): string {
  const envelope: UnitsEnvelope = {
    version: UNITS_SCHEMA_VERSION,
    units: compactUnits(units).map((u) => ({
      slot: u.slot,
      leaderId: u.leaderId,
      memberIds: [...u.memberIds],
      ...(u.name === undefined || u.name === "" ? {} : { name: u.name }),
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

/**
 * 指定の番号へ登録する(その番号の既存の登録は置き換える。上書きすると別の編成になるので名前は残さない)。
 * 番号が飛ぶ登録は受け付けない(`canUseSlot`)— UI 側でも押せないようにしてあるが、ここでも守る
 */
export function putUnit(units: SavedUnit[], slot: number, unit: UnitComposition): SavedUnit[] {
  if (!canUseSlot(units, slot)) return units;
  return compactUnits([
    { slot, leaderId: unit.leaderId, memberIds: [...unit.memberIds] },
    ...units.filter((u) => u.slot !== slot),
  ]);
}

/** 指定の番号に名前を付ける(空にすると名前なしへ戻す)。登録がない番号は何もしない */
export function renameUnit(units: SavedUnit[], slot: number, name: string): SavedUnit[] {
  const normalized = normalizeUnitName(name);
  return units.map((u) =>
    u.slot === slot
      ? {
          slot: u.slot,
          leaderId: u.leaderId,
          memberIds: [...u.memberIds],
          ...(normalized === null ? {} : { name: normalized }),
        }
      : u,
  );
}

/** 指定の番号の登録を解除し、後ろの番号を 1 つずつ前へ詰める(1, 2, 3 の 2 を解除すると 3 が 2 になる) */
export function removeUnit(units: SavedUnit[], slot: number): SavedUnit[] {
  return compactUnits(units.filter((u) => u.slot !== slot));
}
