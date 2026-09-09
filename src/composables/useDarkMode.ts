import { readonly, ref } from "vue";

/**
 * ダークモード(2026-09-09 ユーザー指示)。サイドメニューの最下部、絶対おかゆんモードの上の 1 行で
 * 切り替える。ラベルは切り替え先の名前(ライトのときは「ダークモード」、ダークのときは「ライトモード」)。
 * 既定はライトで、おかゆモードと違い**保存する**(「更新しても記憶する」)。
 * 見た目はページ全体のトークンを差し替える(:root.dark-mode — src/style.css)
 */
export const THEME_STORAGE_KEY = "holodori-optimizer:theme";

/** 保存値が "dark" のときだけダーク。壊れていれば既定のライト */
function loadDark(): boolean {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark";
  } catch {
    return false;
  }
}

const active = ref(loadDark());

export function useDarkMode() {
  return {
    active: readonly(active),
    toggle(): void {
      active.value = !active.value;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, active.value ? "dark" : "light");
      } catch {
        // 保存できない環境でも動作は継続する(そのセッションだけ切り替わる)
      }
    },
  };
}
