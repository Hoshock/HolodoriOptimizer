/**
 * さがすときのカードの絞り込み(リーダー / メンバーの「除外」または「選択」)の保存。さがすのオプションと同じ扱いで、
 * 「オプションの保持」が ON のあいだだけ保存する(2026-09-16 ユーザー指示)。
 *
 * **枠の選択(リーダー・固定メンバー・曲)はもう保存しない**(2026-09-16 ユーザー指示
 * 「やっぱりリーダー、メンバー、曲はページ更新されても保持するのやめよう。探すオプションだけはデフォルト維持」)。
 * 2026-09-14 から 2026-09-16 までの保存データには `leaderId` / `memberIds` / `songId` が入っているが、
 * 読み込みでは**読み飛ばす**(未知のフィールドと同じ扱い)。保存キーと封筒の版はそのまま — 除外の読み込みは変わらない。
 * 2026-09-30 に「選択」(`poolMode` と `selected*Ids`)を足した。後から足した任意の項目なので版は上げず、
 * ない保存は「除外・選択リストなし」として読める(除外リストの中身は従来のまま)。
 *
 * 後方互換の約束は src/storage/owned.ts と同じ: 版番号つき封筒、壊れていれば既定値(除外なし)、
 * 未知のフィールドは読み飛ばす。ID が現在のカードデータにあるかはここでは見ない(候補から外すだけなので
 * 未知の ID が残っても害がなく、データの入れ替えで登録が消えないほうを採る)。
 */

export const SELECTION_STORAGE_KEY = "holodori-optimizer:selection";
export const SELECTION_SCHEMA_VERSION = 1;

/**
 * 絞り込みの種類(2026-09-30 ユーザー指示)。exclude = 選んだカードをおまかせの候補から外す(従来どおり)/
 * select = 選んだカードの中だけからおまかせで探す。どちらのリストも持ち回り、効くのは現在の種類のほうだけ
 */
export type PoolMode = "exclude" | "select";

export interface Selection {
  /** 絞り込みの種類。既定は除外 */
  poolMode: PoolMode;
  /** リーダーおまかせの候補から外すカード。現在のデータにない ID も捨てずに持ち回る */
  excludedLeaderIds: string[];
  /** メンバーおまかせの候補から外すカード。同上 */
  excludedMemberIds: string[];
  /** リーダーおまかせをこの中だけから探す(選択)。空 = 絞らない */
  selectedLeaderIds: string[];
  /** メンバーおまかせをこの中だけから探す(選択)。空 = 絞らない */
  selectedMemberIds: string[];
}

interface SelectionEnvelope extends Selection {
  version: number;
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
  return {
    poolMode: "exclude",
    excludedLeaderIds: [],
    excludedMemberIds: [],
    selectedLeaderIds: [],
    selectedMemberIds: [],
  };
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
  const field = (key: string): unknown =>
    key in parsed ? (parsed as Record<string, unknown>)[key] : null;
  return {
    // 「select」と明示されているときだけ選択。知らない値・欠けた値は従来どおりの除外
    poolMode: field("poolMode") === "select" ? "select" : "exclude",
    excludedLeaderIds: toIdList(field("excludedLeaderIds")),
    excludedMemberIds: toIdList(field("excludedMemberIds")),
    selectedLeaderIds: toIdList(field("selectedLeaderIds")),
    selectedMemberIds: toIdList(field("selectedMemberIds")),
  };
}

export function serializeSelection(selection: Selection): string {
  const envelope: SelectionEnvelope = {
    version: SELECTION_SCHEMA_VERSION,
    poolMode: selection.poolMode,
    excludedLeaderIds: [...selection.excludedLeaderIds],
    excludedMemberIds: [...selection.excludedMemberIds],
    selectedLeaderIds: [...selection.selectedLeaderIds],
    selectedMemberIds: [...selection.selectedMemberIds],
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
