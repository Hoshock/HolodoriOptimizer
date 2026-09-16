/**
 * さがすときの除外(リーダーから除外 / メンバーから除外)の保存。さがすのオプションと同じ扱いで、
 * 「オプションの保持」が ON のあいだだけ保存する(2026-09-16 ユーザー指示)。
 *
 * **枠の選択(リーダー・固定メンバー・曲)はもう保存しない**(2026-09-16 ユーザー指示
 * 「やっぱりリーダー、メンバー、曲はページ更新されても保持するのやめよう。探すオプションだけはデフォルト維持」)。
 * 2026-09-14 から 2026-09-16 までの保存データには `leaderId` / `memberIds` / `songId` が入っているが、
 * 読み込みでは**読み飛ばす**(未知のフィールドと同じ扱い)。保存キーと封筒の版はそのまま — 除外の読み込みは変わらない。
 *
 * 後方互換の約束は src/storage/owned.ts と同じ: 版番号つき封筒、壊れていれば既定値(除外なし)、
 * 未知のフィールドは読み飛ばす。ID が現在のカードデータにあるかはここでは見ない(候補から外すだけなので
 * 未知の ID が残っても害がなく、データの入れ替えで登録が消えないほうを採る)。
 */

export const SELECTION_STORAGE_KEY = "holodori-optimizer:selection";
export const SELECTION_SCHEMA_VERSION = 1;

export interface Selection {
  /** リーダーおまかせの候補から外すカード。現在のデータにない ID も捨てずに持ち回る */
  excludedLeaderIds: string[];
  /** メンバーおまかせの候補から外すカード。同上 */
  excludedMemberIds: string[];
}

interface SelectionEnvelope {
  version: number;
  excludedLeaderIds: string[];
  excludedMemberIds: string[];
}

/** 空文字・文字列でない値は「未選択」 */
function toId(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * 選択を前から詰めて枠数ぶんの配列にする(重複は 1 枚目だけ残す)。
 * 保存はしないが、メンバー枠の詰め直しは UI 側でそのまま使う
 */
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

export function emptySelection(): Selection {
  return { excludedLeaderIds: [], excludedMemberIds: [] };
}

export function parseSelection(raw: string | null): Selection {
  if (raw === null) return emptySelection();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptySelection();
  }
  if (typeof parsed !== "object" || parsed === null) return emptySelection();
  return {
    excludedLeaderIds: toIdList("excludedLeaderIds" in parsed ? parsed.excludedLeaderIds : null),
    excludedMemberIds: toIdList("excludedMemberIds" in parsed ? parsed.excludedMemberIds : null),
  };
}

export function serializeSelection(selection: Selection): string {
  const envelope: SelectionEnvelope = {
    version: SELECTION_SCHEMA_VERSION,
    excludedLeaderIds: [...selection.excludedLeaderIds],
    excludedMemberIds: [...selection.excludedMemberIds],
  };
  return JSON.stringify(envelope);
}

export function loadSelection(): Selection {
  try {
    return parseSelection(localStorage.getItem(SELECTION_STORAGE_KEY));
  } catch {
    return emptySelection();
  }
}

export function saveSelection(selection: Selection): void {
  try {
    localStorage.setItem(SELECTION_STORAGE_KEY, serializeSelection(selection));
  } catch {
    // 保存できない環境でも動作は継続する
  }
}
