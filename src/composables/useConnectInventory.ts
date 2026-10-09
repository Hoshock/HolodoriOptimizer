import { computed } from "vue";
import type { ComputedRef } from "vue";

import { useOwnedCards } from "./useOwnedCards";
import { clearLegacyConnectInventory, connectInventoryOf } from "../storage/connectInventory";
import type { ConnectInventoryEntry } from "../storage/connectInventory";

/**
 * 所持しているコネクト(形 × ％ × 枚数)。所持カードと開花段階から導く値で、登録の画面はない(2026-10-09 ユーザー指示 — ADR-022。
 * 導き方は `src/storage/connectInventory.ts`)。使うのはボードの最適化のコネクト(結果詳細・ユニット詳細の下端)だけ。
 * ボードで置いている配置(`useConnectPlacements`)とは別
 */
clearLegacyConnectInventory();
const owned = useOwnedCards();
const entries = computed(() => connectInventoryOf(owned.value));

export function useConnectInventory(): ComputedRef<ConnectInventoryEntry[]> {
  return entries;
}
