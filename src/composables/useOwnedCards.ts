import { ref, watch } from "vue";

import { loadOwned, saveOwned } from "../storage/owned";
import type { OwnedCard } from "../storage/owned";

/**
 * 所持カードの登録（アプリ全体で 1 つの状態）。保存形式と後方互換は `src/storage/owned.ts`。
 *
 * 触る場所が 2 つある（Step 0 のメンバーピッカーと、サイドメニューの「データの取り込み」）ので、
 * コンポーネントごとに `loadOwned()` せずモジュールレベルで 1 つ持つ — 別々に持つと、
 * 片方が保存したあとにもう片方が古い配列で上書きしてしまう。
 * 現在のデータにない ID も配列に残して書き戻す（登録を消さない）。
 */
const cards = ref<OwnedCard[]>(loadOwned());
watch(cards, (value) => saveOwned(value), { deep: true });

export function useOwnedCards() {
  return cards;
}
