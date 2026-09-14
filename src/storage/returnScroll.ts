/**
 * 解説ページから戻ってきたときに、出ていったときの位置へ戻すための退避（2026-09-14 ユーザー指示
 * 「使い方ページについて、ヘッダで戻った時、前のページの位置は記憶しておいてそこに戻ろう」）。
 *
 * 解説ページはアプリの外の静的ページなので、戻るのは通常のリンク（＝新しい読み込み）になり、
 * ブラウザのスクロール復元は効かない。そこで出ていく直前の位置を sessionStorage へ置き、
 * トップページが起動したときに 1 度だけ読んで消す。
 *
 * タブを閉じれば消える一時的な値で、ユーザーが登録したデータではない（localStorage には置かない）
 */
export const RETURN_SCROLL_STORAGE_KEY = "holodori-optimizer:return-scroll";

/** 解説ページへ出ていく直前の縦位置を覚える */
export function rememberReturnScroll(y: number): void {
  try {
    sessionStorage.setItem(RETURN_SCROLL_STORAGE_KEY, String(Math.max(0, Math.round(y))));
  } catch {
    // 使えない環境では覚えないだけ（戻ると先頭から）
  }
}

/** 覚えていた位置を 1 度だけ返す（読んだら消す）。無い・壊れているときは null */
export function takeReturnScroll(): number | null {
  try {
    const raw = sessionStorage.getItem(RETURN_SCROLL_STORAGE_KEY);
    sessionStorage.removeItem(RETURN_SCROLL_STORAGE_KEY);
    if (raw === null) return null;
    const y = Number(raw);
    return Number.isFinite(y) && y >= 0 ? y : null;
  } catch {
    return null;
  }
}
