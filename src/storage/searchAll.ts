/**
 * さがすのオプション「所持カードから探す」の保存。true = 所持リストを使わず全カードからさがす
 * (UI のチップは反転した表示)。壊れたデータは「まだ選んでいない」に倒す。
 *
 * 既定値を定数で持たず所持カードの枚数から決めるのは、初めて来た人には所持カードが無く、
 * 所持カードから探しても 0 件にしかならないため(2026-09-14 ユーザー指示「初めて訪れるユーザは
 * 所持カードないので所持カードから探すはデフォルトオフにしたい。ただ既に使ってるユーザの
 * オプションは変えないで」)。保存済みの選択はそのまま使うので、既に使っている人の見え方は変わらない。
 */

export const SEARCH_ALL_STORAGE_KEY = "holodori-optimizer:search-all";

/** 保存済みの選択。未保存・真偽値でない・壊れたデータは null(= まだ選んでいない) */
export function parseSearchAll(raw: string | null): boolean | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "boolean" ? parsed : null;
  } catch {
    return null;
  }
}

/** 実際に使う値。選んでいれば保存値、選んでいなければ所持カードが 1 枚も無いときだけ全カード */
export function resolveSearchAll(stored: boolean | null, ownedCount: number): boolean {
  return stored ?? ownedCount === 0;
}

export function loadSearchAll(): boolean | null {
  try {
    return parseSearchAll(localStorage.getItem(SEARCH_ALL_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveSearchAll(value: boolean): void {
  try {
    localStorage.setItem(SEARCH_ALL_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 保存できない環境でも動作は継続する
  }
}
