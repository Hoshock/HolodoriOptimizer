import { watch } from "vue";
import type { Ref } from "vue";

/**
 * 切替で同じ要素を使い回すスクロール領域の位置を、切替先ごとに別々に覚える(最適化シートの「ユニットのみ変更する」の ON/OFF。
 * 共有していると、片方を下までスクロールしてもう片方へ切り替えたときに同じ位置から始まる — 2026-10-04 ユーザー指示)。
 * 初めて開く切替先は先頭から。保存はしない(シートを閉じれば消える)
 */
export function useTabScroll(scroller: Ref<HTMLElement | null>, key: () => string): void {
  const saved = new Map<string, number>();
  // 描画が切り替わる前(まだ元の位置のうち)に、離れる側の位置を覚える
  watch(
    key,
    (_next, previous) => {
      if (scroller.value) saved.set(previous, scroller.value.scrollTop);
    },
    { flush: "pre" },
  );
  // 切り替わった描画のあとで、移った先の位置へ戻す
  watch(
    key,
    (next) => {
      if (scroller.value) scroller.value.scrollTop = saved.get(next) ?? 0;
    },
    { flush: "post" },
  );
}
