import { onMounted, onUnmounted } from "vue";

/**
 * モーダル共通のふるまい: 背景スクロールロック(iOS Safari 対応で body を
 * position:fixed にして退避/復元)+ Escape キーで閉じる。
 *
 * モーダルの入れ子(例: ガチャ → カードピッカー)に対応するため、開いている
 * モーダルをモジュールレベルのスタックで管理する: ロックは最初の 1 枚が
 * かけ最後の 1 枚が解除し、Escape は最前面のモーダルだけが処理する。
 */

const stack: symbol[] = [];
let savedScrollY = 0;

export function useModalChrome(onClose: () => void): void {
  const token = Symbol("modal");

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && stack[stack.length - 1] === token) onClose();
  }

  onMounted(() => {
    document.addEventListener("keydown", onKeydown);
    if (stack.length === 0) {
      savedScrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${String(savedScrollY)}px`;
      document.body.style.width = "100%";
    }
    stack.push(token);
  });

  onUnmounted(() => {
    document.removeEventListener("keydown", onKeydown);
    const index = stack.indexOf(token);
    if (index >= 0) stack.splice(index, 1);
    if (stack.length === 0) {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, savedScrollY);
    }
  });
}
