<script setup lang="ts">
import { computed } from "vue";

import ConnectFigure from "./ConnectFigure.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { CONNECT_EXTENT_LABELS, CONNECT_EXTENTS, connectPermilCandidates } from "../data/connect";
import type { ConnectExtentId } from "../data/connect";
import { inventoryCount } from "../storage/connectInventory";
import type { ConnectInventoryEntry } from "../storage/connectInventory";

/**
 * 持っているコネクトを ％ ごとの枚数で見るダイアログ(アカウントの「コネクト」の形のタイルから開く。2026-10-02 ユーザー指示の形のまま、
 * 2026-10-09 に**見るだけ**にした — 枚数は所持カードと開花段階から導く(ADR-023)ので ＋ / － は置かない)。
 * その形で取りうる倍率(`connectPermilCandidates`)ごとに「持っている枚数」を出す(持っていなければ 0)。出口は「閉じる」・外側タップ・Escape
 */
const props = defineProps<{
  extent: ConnectExtentId;
  entries: readonly ConnectInventoryEntry[];
}>();

const emit = defineEmits<{ close: [] }>();

// 背景が見えるダイアログなのでスクロールロックはかけない(ConfirmDialog と同じ)
useModalChrome(() => emit("close"), { lockScroll: false });

const rows = computed(() => {
  const permils = [...connectPermilCandidates(props.extent)];
  for (const e of props.entries) {
    if (e.extent === props.extent && !permils.includes(e.permil)) permils.push(e.permil);
  }
  return permils.map((permil) => ({
    permil,
    count: inventoryCount(props.entries, props.extent, permil),
  }));
});
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="`${CONNECT_EXTENT_LABELS[props.extent]}のコネクト`"
    >
      <!-- 形の名前（「右へ 3」など）は文字で出さない。図形が形を示す（名前は aria-label へ — 2026-10-02 ユーザー指示） -->
      <div class="head"><ConnectFigure :cells="CONNECT_EXTENTS[props.extent]" /></div>
      <ul class="rows">
        <li v-for="r in rows" :key="r.permil" class="row">
          <span class="percent">+{{ r.permil / 10 }}%</span>
          <!-- 枚数は見るだけ(所持カードから決まる)。持っていない ％ は淡色 -->
          <span class="count" :class="{ none: r.count === 0 }">×{{ r.count }}</span>
        </li>
      </ul>
      <button type="button" class="close" @click="emit('close')">閉じる</button>
    </div>
  </div>
</template>

<style scoped>
/* アカウントのコネクトのシート(z-index: 10)の上に重ねる */
.overlay {
  align-items: center;
  background: rgba(35, 48, 61, 0.4);
  display: flex;
  inset: 0;
  justify-content: center;
  overscroll-behavior: contain;
  padding: 24px;
  position: fixed;
  touch-action: pinch-zoom;
  z-index: 12;
}

.dialog {
  background: var(--surface);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-sheet);
  max-width: 20rem;
  padding: 16px;
  width: 100%;
}

/* 図形だけを中央に(色は文字の淡色。形の確認用の見本) */
.head {
  --board: var(--ink-2);
  margin: 0 auto 12px;
  width: 88px;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
}

.row {
  align-items: center;
  background: var(--bg);
  border-radius: var(--r-s);
  display: flex;
  justify-content: space-between;
  min-height: 44px;
  padding: 6px 14px;
}

.percent {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.count {
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  min-width: 36px;
  text-align: right;
}

.count.none {
  color: var(--ink-2);
  font-weight: 600;
}

.close {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  width: 100%;
}
</style>
