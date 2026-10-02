<script setup lang="ts">
import { ref } from "vue";

import CloseButton from "./CloseButton.vue";
import ConnectFigure from "./ConnectFigure.vue";
import ConnectInventoryDialog from "./ConnectInventoryDialog.vue";
import { setConnectCount, useConnectInventory } from "../composables/useConnectInventory";
import { useModalChrome } from "../composables/useModalChrome";
import {
  CONNECT_EXTENT_DISPLAY_ORDER,
  CONNECT_EXTENT_LABELS,
  CONNECT_EXTENTS,
} from "../data/connect";
import type { ConnectExtentId } from "../data/connect";
import { inventoryTotal } from "../storage/connectInventory";

/**
 * アカウントの「コネクト」(2026-10-02 ユーザー指示「コネクトは自分がどの形の何％のコネクトを持ってるか登録するところ」)。
 * 範囲の形 17 種を図形のタイルで 2 列に並べ(並びと図形は `ConnectSheet` と同じ)、持っている形には枚数の合計を右上に出す。
 * タップすると、その形の倍率ごとの枚数を ＋ / － で入れるダイアログが開く。ここに登録した所持は**コネクトの最適化だけ**が使い、
 * ボードで置いているコネクトとは別管理(探索・お気に入り・発動頻度の最適化には効かない)
 */
const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const entries = useConnectInventory();
const editing = ref<ConnectExtentId | null>(null);
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="コネクト">
      <header class="sheet-head">
        <h3>コネクト</h3>
        <CloseButton @close="emit('close')" />
      </header>
      <ul class="shapes">
        <li v-for="id in CONNECT_EXTENT_DISPLAY_ORDER" :key="id">
          <button
            type="button"
            class="shape"
            :class="{ owned: inventoryTotal(entries, id) > 0 }"
            :aria-label="CONNECT_EXTENT_LABELS[id]"
            @click="editing = id"
          >
            <ConnectFigure :cells="CONNECT_EXTENTS[id]" />
            <span v-if="inventoryTotal(entries, id) > 0" class="count">
              ×{{ inventoryTotal(entries, id) }}
            </span>
          </button>
        </li>
      </ul>
    </div>

    <ConnectInventoryDialog
      v-if="editing !== null"
      :extent="editing"
      :entries="entries"
      @set="(permil, count) => setConnectCount(editing as ConnectExtentId, permil, count)"
      @close="editing = null"
    />
  </div>
</template>

<style scoped>
.overlay {
  background: rgba(35, 48, 61, 0.4);
  inset: 0;
  position: fixed;
  z-index: 10;
}

/* モバイルはフルスクリーンシート、広い画面では中央のダイアログ(ResultDetail と同型) */
.sheet {
  background: var(--surface);
  box-shadow: var(--shadow-sheet);
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  width: 100%;
}

@media (min-width: 48rem) {
  .overlay {
    align-items: center;
    display: flex;
    justify-content: center;
    padding: 24px;
  }

  .sheet {
    border-radius: var(--r-m);
    height: min(85dvh, 46rem);
    max-width: 46rem;
  }
}

/* ページヘッダ・ピッカーと同寸法(77px)・同文字サイズ(24px/900) */
.sheet-head {
  align-items: center;
  background: var(--chrome-head);
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  justify-content: space-between;
  padding: 16px;
}

.sheet-head h3 {
  font-size: 24px;
  font-weight: 900;
  line-height: 1.35;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 図形のタイル(ConnectSheet と同じ器): 全部同じ大きさの正方形。持っている形は濃色の輪と図形の濃色 */
.shapes {
  display: grid;
  flex: 1;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
  list-style: none;
  margin: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.shape {
  --board: var(--ink-2);
  align-items: center;
  aspect-ratio: 1 / 1;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 10px;
  position: relative;
  width: 100%;
}

.shape.owned {
  --board: var(--ink);
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}

/* 持っている枚数の合計: タイルの右上(図形の使わない角)。選択スタイルと同じ地 */
.count {
  background: var(--selected);
  border-radius: var(--r-pill);
  color: var(--selected-ink);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 16px;
  padding: 0 7px;
  position: absolute;
  right: 5px;
  top: 5px;
}
</style>
