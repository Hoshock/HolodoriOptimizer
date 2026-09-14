import { currentScrollY } from "../composables/useModalChrome";
import { rememberReturnScroll } from "../storage/returnScroll";

/**
 * 解説ページ（アプリの外の静的ページ）へのリンクに付ける。出ていく直前の縦位置を覚えて、
 * 戻ってきたら `App.vue` がそこへ戻す（2026-09-14 ユーザー指示）。
 *
 * **解説ページへ行くリンクは全部これを通す**こと。一部だけ覚える形にすると、覚えた値が使われないまま
 * 残り、あとの関係ない読み込みで消費されて思わぬ位置へ飛ぶ（サイドメニューだけに付けていた）。
 * サイドメニューを開いている間はスクロールロック中で `window.scrollY` が 0 なので、
 * ロック前に退避された位置（`currentScrollY`）を使う
 */
export function rememberGuideReturn(): void {
  rememberReturnScroll(currentScrollY());
}
