import { onMounted, onUnmounted } from "vue";

/**
 * モーダル共通のふるまい: 背景スクロールロック(iOS Safari 対応で body を
 * position:fixed にして退避/復元)+ Escape キーで閉じる。
 */
export function useModalChrome(onClose: () => void): void {
  let savedScrollY = 0;

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") onClose();
  }

  onMounted(() => {
    document.addEventListener("keydown", onKeydown);
    savedScrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${String(savedScrollY)}px`;
    document.body.style.width = "100%";
  });

  onUnmounted(() => {
    document.removeEventListener("keydown", onKeydown);
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    window.scrollTo(0, savedScrollY);
  });
}
