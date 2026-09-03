import { readonly, ref } from "vue";

import { cards } from "../data";

/**
 * おかゆモード(開発者のお遊び機能 — 2026-09-02 ユーザー指定)。
 * フッター右下のおにぎりアイコンで ON / OFF。保存はしない(ページを再読み込みすると解除される)。
 * URL パラメータでの起動もしない。
 *
 * ON のあいだ: リーダーは猫又おかゆのカードに限り、メンバーにもおかゆんが 1 枚入る
 * (メンバー同士は同一ホロメン不可なのでちょうど 1 枚)。除外もできない。
 * 持っているカードモードでは、おかゆんを 1 枚以上登録するまでリーダー・メンバー・実行を止める。
 * 見た目はページ全体をおかゆんのイメージカラー(紫)に寄せる(:root.okayu-mode — src/style.css)
 */
export const OKAYU_HOLOMEN_ID = "nekomata-okayu";

/** おかゆんのカード ID(データセットから導出) */
export const okayuCardIds: readonly string[] = cards
  .filter((c) => c.holomenId === OKAYU_HOLOMEN_ID)
  .map((c) => c.id);

const active = ref(false);

export function useOkayuMode() {
  return {
    active: readonly(active),
    toggle(): void {
      active.value = !active.value;
    },
  };
}
