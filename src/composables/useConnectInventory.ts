import { ref, watch } from "vue";
import type { Ref } from "vue";

import type { ConnectExtentId } from "../data/connect";
import {
  loadConnectInventory,
  saveConnectInventory,
  setInventoryCount,
} from "../storage/connectInventory";
import type { ConnectInventoryEntry } from "../storage/connectInventory";

/**
 * 所持しているコネクト(形 × ％ × 枚数。保存形式は `src/storage/connectInventory.ts`)。アプリ全体で 1 つの状態。
 * 使うのはアカウントの「コネクト」(登録)と、コネクトの最適化(結果詳細・ユニット詳細の下端)だけ。
 * ボードで置いている配置(`useConnectPlacements`)とは別管理
 */
const entries = ref<ConnectInventoryEntry[]>(loadConnectInventory());
watch(entries, (value) => saveConnectInventory(value), { deep: true });

export function useConnectInventory(): Ref<ConnectInventoryEntry[]> {
  return entries;
}

/** その 形 × ％ の枚数を置き換える(0 で外す) */
export function setConnectCount(extent: ConnectExtentId, permil: number, count: number): void {
  entries.value = setInventoryCount(entries.value, extent, permil, count);
}
