<script setup lang="ts">
import { computed } from "vue";

import ConnectFigure from "./ConnectFigure.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { CONNECT_EXTENT_LABELS, CONNECT_EXTENTS, connectPermilCandidates } from "../data/connect";
import type { ConnectExtentId } from "../data/connect";
import { CONNECT_INVENTORY_MAX_COUNT, inventoryCount } from "../storage/connectInventory";
import type { ConnectInventoryEntry } from "../storage/connectInventory";

/**
 * 持っているコネクトの枚数を入れるダイアログ(アカウントの「コネクト」の形のタイルから開く。2026-10-02 ユーザー指示)。
 * その形で取りうる倍率(`connectPermilCandidates`)ごとに「持っている枚数」を ＋ / － で増減する(変えるとすぐ保存される)。
 * 保存済みの倍率が候補にないとき(過去の自由入力)は末尾に添えて残す。出口は「閉じる」・外側タップ・Escape
 */
const props = defineProps<{
  extent: ConnectExtentId;
  entries: readonly ConnectInventoryEntry[];
}>();

const emit = defineEmits<{ set: [permil: number, count: number]; close: [] }>();

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
          <span class="stepper">
            <button
              type="button"
              class="step"
              :aria-label="`+${String(r.permil / 10)}% を 1 枚減らす`"
              :disabled="r.count <= 0"
              @click="emit('set', r.permil, r.count - 1)"
            >
              −
            </button>
            <span class="count" aria-live="polite">{{ r.count }}</span>
            <button
              type="button"
              class="step"
              :aria-label="`+${String(r.permil / 10)}% を 1 枚増やす`"
              :disabled="r.count >= CONNECT_INVENTORY_MAX_COUNT"
              @click="emit('set', r.permil, r.count + 1)"
            >
              ＋
            </button>
          </span>
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
  padding: 6px 6px 6px 14px;
}

.percent {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.stepper {
  align-items: center;
  display: flex;
  gap: 4px;
}

.step {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink);
  cursor: pointer;
  font-size: 20px;
  font-weight: 700;
  height: 44px;
  line-height: 1;
  padding: 0;
  width: 44px;
}

.step:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.count {
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  min-width: 36px;
  text-align: center;
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
