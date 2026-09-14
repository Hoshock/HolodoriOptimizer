/**
 * さがすときの入力(リーダー・固定メンバー・曲・除外)の保存。さがすのオプションと同じく、閉じて開き直しても
 * 前回の続きから始められるようにする(2026-09-14 ユーザー指示「さがすオプションはローカルストレージに
 * 保存する方針ね。リーダー、メンバー、曲も」/「保存するようにする。既存ユーザのが消えないことが大事」)。
 *
 * 後方互換の約束は src/storage/owned.ts と同じ: 版番号つき封筒、壊れていれば既定値(すべて未選択)、
 * 未知のフィールドは読み飛ばす。ID が現在のカード・曲データにあるかはここでは見ない
 * (UI 側で解決できるものだけ使う — src/storage/units.ts と同じ分担)。
 */

export const SELECTION_STORAGE_KEY = "holodori-optimizer:selection";
export const SELECTION_SCHEMA_VERSION = 1;

export interface Selection {
  leaderId: string | null;
  /** メンバー枠。長さは枠数にそろえ、選択は前から詰める(空きは後ろ) */
  memberIds: (string | null)[];
  songId: string | null;
  /** リーダーおまかせの候補から外すカード。現在のデータにない ID も捨てずに持ち回る */
  excludedLeaderIds: string[];
  /** メンバーおまかせの候補から外すカード。同上 */
  excludedMemberIds: string[];
}

interface SelectionEnvelope {
  version: number;
  leaderId: string | null;
  memberIds: (string | null)[];
  songId: string | null;
  excludedLeaderIds: string[];
  excludedMemberIds: string[];
}

/** 空文字・文字列でない値は「未選択」 */
function toId(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** 選択を前から詰めて枠数ぶんの配列にする(重複は 1 枚目だけ残す) */
export function packSlots(ids: readonly (string | null)[], slots: number): (string | null)[] {
  const kept: string[] = [];
  for (const id of ids) {
    if (id !== null && !kept.includes(id)) kept.push(id);
  }
  return Array.from({ length: slots }, (_, i) => kept[i] ?? null);
}

/** ID の配列(除外)。文字列でない値・空文字は落とし、重複は 1 つにする。未知の ID も残す */
function toIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    const id = toId(entry);
    if (id !== null && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function emptySelection(slots: number): Selection {
  return {
    leaderId: null,
    memberIds: packSlots([], slots),
    songId: null,
    excludedLeaderIds: [],
    excludedMemberIds: [],
  };
}

export function parseSelection(raw: string | null, slots: number): Selection {
  if (raw === null) return emptySelection(slots);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptySelection(slots);
  }
  if (typeof parsed !== "object" || parsed === null) return emptySelection(slots);
  const members = "memberIds" in parsed && Array.isArray(parsed.memberIds) ? parsed.memberIds : [];
  return {
    leaderId: toId("leaderId" in parsed ? parsed.leaderId : null),
    memberIds: packSlots(members.map(toId), slots),
    songId: toId("songId" in parsed ? parsed.songId : null),
    excludedLeaderIds: toIdList("excludedLeaderIds" in parsed ? parsed.excludedLeaderIds : null),
    excludedMemberIds: toIdList("excludedMemberIds" in parsed ? parsed.excludedMemberIds : null),
  };
}

export function serializeSelection(selection: Selection): string {
  const envelope: SelectionEnvelope = {
    version: SELECTION_SCHEMA_VERSION,
    leaderId: selection.leaderId,
    memberIds: [...selection.memberIds],
    songId: selection.songId,
    excludedLeaderIds: [...selection.excludedLeaderIds],
    excludedMemberIds: [...selection.excludedMemberIds],
  };
  return JSON.stringify(envelope);
}

export function loadSelection(slots: number): Selection {
  try {
    return parseSelection(localStorage.getItem(SELECTION_STORAGE_KEY), slots);
  } catch {
    return emptySelection(slots);
  }
}

export function saveSelection(selection: Selection): void {
  try {
    localStorage.setItem(SELECTION_STORAGE_KEY, serializeSelection(selection));
  } catch {
    // 保存できない環境でも動作は継続する
  }
}
