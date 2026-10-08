<script setup lang="ts">
import { ref } from "vue";

import InfoButton from "./InfoButton.vue";
import InfoDialog from "./InfoDialog.vue";
import { useModalChrome } from "../composables/useModalChrome";
import type { PoolMode } from "../storage/selection";
import { POOL_FILTER_INFO } from "../ui/infoContent";

/**
 * さがすの「絞り込み」(2026-10-08 ユーザー指示で、オプションの枠から中央のダイアログへ移した)。
 * 上に 除外 / 選択 のセグメント、下に「リーダー n枚」「メンバー n枚」(それぞれピッカーを開く)、最後に「閉じる」。
 * ピッカーを開いているあいだは親が隠し、閉じると戻ってくる(`OptimizerPanel`)。説明文は置かない
 */
const props = defineProps<{
  mode: PoolMode;
  /** 「リーダー」「メンバー」の右に出す値(除外は枚数、選択は枚数か「すべて」) */
  leaderCount: string;
  memberCount: string;
}>();

const emit = defineEmits<{ mode: [PoolMode]; leader: []; member: []; close: [] }>();

const MODES: { key: PoolMode; label: string }[] = [
  { key: "exclude", label: "除外" },
  { key: "select", label: "選択" },
];

/** 見出しの ⓘ(除外 / 選択 の意味 — `POOL_FILTER_INFO`) */
const infoOpen = ref(false);

// 背景が見えるダイアログなのでスクロールロックはかけない(ConfirmDialog と同じ)
useModalChrome(() => emit("close"), { lockScroll: false });
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="pool-filter-title">
      <!-- 見出しの行の右端の ⓘ は 除外 / 選択 の意味を開く(2026-10-08 ユーザー指示) -->
      <div class="head">
        <h3 id="pool-filter-title">絞り込み</h3>
        <InfoButton label="絞り込みの説明" @click="infoOpen = true" />
      </div>
      <div class="segment" role="radiogroup" aria-label="除外か選択か（1つ選択）">
        <button
          v-for="m in MODES"
          :key="m.key"
          type="button"
          class="seg"
          role="radio"
          :aria-checked="props.mode === m.key"
          :class="{ 'seg-active': props.mode === m.key }"
          @click="emit('mode', m.key)"
        >
          {{ m.label }}
        </button>
      </div>
      <button type="button" class="row" aria-haspopup="dialog" @click="emit('leader')">
        <span>リーダー</span>
        <span class="count">{{ props.leaderCount }}</span>
      </button>
      <button type="button" class="row" aria-haspopup="dialog" @click="emit('member')">
        <span>メンバー</span>
        <span class="count">{{ props.memberCount }}</span>
      </button>
      <button type="button" class="close" @click="emit('close')">閉じる</button>
    </div>
    <!-- このオーバーレイの子として出すので、ダイアログの上に載る -->
    <InfoDialog v-if="infoOpen" :terms="POOL_FILTER_INFO" @close="infoOpen = false" />
  </div>
</template>

<style scoped>
.overlay {
  align-items: center;
  background: rgba(35, 48, 61, 0.4);
  display: flex;
  inset: 0;
  justify-content: center;
  overscroll-behavior: contain;
  padding: 24px;
  position: fixed;
  /* 背景のスクロールは止めるが、ピンチ(拡大の戻し)はブラウザへ譲る(ConfirmDialog と同じ) */
  touch-action: pinch-zoom;
  z-index: 11;
}

.dialog {
  background: var(--surface);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-sheet);
  display: grid;
  gap: 8px;
  max-width: 20rem;
  padding: 16px;
  width: 100%;
}

.head {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin: 0 0 4px;
}

h3 {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
}

/* 除外 / 選択: 排他 2 択なので境界線でつながったセグメント(さがすの 3 択と同形) */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-template-columns: 1fr 1fr;
  height: 40px;
  overflow: hidden;
}

.seg {
  background: var(--surface);
  border: none;
  border-left: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}

.seg:first-child {
  border-left: none;
}

.seg-active {
  background: var(--selected);
  color: var(--selected-ink);
  font-weight: 700;
}

/* ピッカーを開くボタン: ラベル左・値右の設定行(アカウントのイベントメモリーと同じ器) */
.row {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  justify-content: space-between;
  padding: 0 12px;
}

.count {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
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
  margin-top: 8px;
}
</style>
