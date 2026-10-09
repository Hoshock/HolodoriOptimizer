<script setup lang="ts">
import CloseButton from "./CloseButton.vue";
import ConnectFigure from "./ConnectFigure.vue";
import { useConnectInventory } from "../composables/useConnectInventory";
import { useModalChrome } from "../composables/useModalChrome";
import {
  CONNECT_EXTENT_DISPLAY_ORDER,
  CONNECT_EXTENT_LABELS,
  CONNECT_EXTENTS,
} from "../data/connect";
import { inventoryTotal } from "../storage/connectInventory";

/**
 * アカウントの「コネクト」: 持っているコネクト(所持カードと開花段階から導く — ADR-023)を**見るだけ**の画面
 * (2026-10-09 ユーザー指示「アカウントのコネクトを戻し、readonly で各形の所持数が見られるようにしたい」。
 * 2026-10-02〜09 の 形 × ％ × 枚数 を手で登録する画面は廃止 — 復活させない)。
 * 範囲の形 17 種を図形のタイルで 4 列に並べ(並びと図形は `ConnectSheet` と同じ)、持っている形には枚数の合計を右上に出す。
 * 枚数を変えるには所持カードを登録する。ここで見える所持は**コネクトの最適化だけ**が使い、ボードで置いているコネクトとは別
 */
const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const entries = useConnectInventory();
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="コネクト">
      <header class="sheet-head">
        <h3>コネクト</h3>
        <CloseButton @close="emit('close')" />
      </header>
      <!-- 見るだけ: タイルは押せない(枠線つきの角丸はボタンに限る規則の例外ではなく、ボタンでないので地だけで示す) -->
      <ul class="shapes" aria-label="持っているコネクト">
        <li
          v-for="id in CONNECT_EXTENT_DISPLAY_ORDER"
          :key="id"
          class="shape"
          :class="{ owned: inventoryTotal(entries, id) > 0 }"
          role="img"
          :aria-label="`${CONNECT_EXTENT_LABELS[id]} ${String(inventoryTotal(entries, id))}枚`"
        >
          <ConnectFigure :cells="CONNECT_EXTENTS[id]" />
          <span v-if="inventoryTotal(entries, id) > 0" class="count">
            ×{{ inventoryTotal(entries, id) }}
          </span>
        </li>
      </ul>
    </div>
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

/* 図形のタイル(ConnectSheet と同じ器。1 行 4 列 — 2026-10-06 ユーザー指示): 全部同じ大きさの正方形。持っている形は濃色の輪と図形の濃色 */
.shapes {
  align-content: start; /* 縦に余っても行を引き伸ばさない */
  display: grid;
  flex: 1;
  gap: 8px;
  grid-template-columns: repeat(4, 1fr);
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
  background: var(--bg);
  border: none;
  border-radius: var(--r-m);
  color: var(--ink);
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 10px;
  position: relative;
  width: 100%;
}

/* 持っている形は図形を濃色に、地を面の色にして浮かせる(押せないので枠線は使わない) */
.shape.owned {
  --board: var(--ink);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
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
