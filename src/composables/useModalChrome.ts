import { onMounted, onUnmounted } from "vue";

/**
 * モーダル共通のふるまい: 背景スクロールロック(iOS Safari 対応で body を
 * position:fixed にして退避/復元)+ Escape キーで閉じる。
 *
 * モーダルの入れ子(例: ガチャ → カードピッカー)に対応するため、開いている
 * モーダルをモジュールレベルのスタックで管理する: ロックは最初の 1 枚が
 * かけ最後の 1 枚が解除し、Escape は最前面のモーダルだけが処理する。
 *
 * iOS Safari はロック中に検索欄へフォーカスしてキーボードが出ると、body が
 * fixed でもレイアウトビューポートを押し上げて文書の下に空白を足すことがあり、
 * 閉じたあとページ最下部の余白として残る(2026-09-02 / 09-05 報告)。対策として
 * (1) ロック中は html/body の overflow も hidden にし、(2) 入力欄からフォーカスが
 * 外れたら window のスクロールを 0 に戻し、(3) 解除時はフォーカスを外してから
 * 復元し、再描画後にもう一度スクロール位置を復元する。
 */

const stack: symbol[] = [];
let savedScrollY = 0;

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

// ロック中に入力欄のキーボードが閉じたら、Safari が押し上げたぶんを戻す
function onFocusOut(event: FocusEvent): void {
  if (!isTextField(event.target)) return;
  requestAnimationFrame(() => {
    if (stack.length > 0) window.scrollTo(0, 0);
  });
}

function lock(): void {
  savedScrollY = window.scrollY;
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.top = `-${String(savedScrollY)}px`;
  document.body.style.width = "100%";
  document.addEventListener("focusout", onFocusOut);
}

function unlock(): void {
  document.removeEventListener("focusout", onFocusOut);
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.width = "";
  const y = savedScrollY;
  window.scrollTo(0, y);
  requestAnimationFrame(() => window.scrollTo(0, y));
}

export function useModalChrome(onClose: () => void): void {
  const token = Symbol("modal");

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && stack[stack.length - 1] === token) onClose();
  }

  onMounted(() => {
    document.addEventListener("keydown", onKeydown);
    if (stack.length === 0) lock();
    stack.push(token);
  });

  onUnmounted(() => {
    document.removeEventListener("keydown", onKeydown);
    const index = stack.indexOf(token);
    if (index >= 0) stack.splice(index, 1);
    if (stack.length === 0) unlock();
  });
}
