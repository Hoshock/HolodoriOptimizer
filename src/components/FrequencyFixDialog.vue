<script setup lang="ts">
import { useModalChrome } from "../composables/useModalChrome";
import { formatBoardPercent } from "../data/boardGraph";

/**
 * メンバー 1 人の発動頻度を固定して探索し直すための選択ダイアログ（最適化のシートの頻度の表から開く）。
 * 単一選択なので「おまかせ / 0% / 4% / 8% / 12%」のセグメンテッドコントロールにし、選んだらそのまま閉じる
 * （1 つだけ選ぶピッカーと同じ）。出口は外側タップ・Escape（中央の小さなダイアログなので ✕ は置かない）。
 * 選択肢の数値は表の「現在 / 推奨」と同じ実効値（コネクト増幅込み）で、固定なしは null
 */
const props = defineProps<{
  /** ホロメン名（見出し） */
  name: string;
  /** 選べる実効発動頻度 UP（%・昇順） */
  choices: readonly number[];
  /** 固定中の値。null = おまかせ */
  value: number | null;
}>();

const emit = defineEmits<{ pick: [value: number | null]; close: [] }>();

// 背景が見えるダイアログなのでスクロールロックはかけない（ConfirmDialog と同じ）
useModalChrome(() => emit("close"), { lockScroll: false });
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" :aria-label="props.name">
      <h3 class="title">{{ props.name }}</h3>
      <div class="segment" role="radiogroup" :aria-label="`${props.name}の発動頻度`">
        <button
          type="button"
          class="seg"
          role="radio"
          :aria-checked="props.value === null"
          :class="{ 'seg-active': props.value === null }"
          @click="emit('pick', null)"
        >
          おまかせ
        </button>
        <button
          v-for="c in props.choices"
          :key="c"
          type="button"
          class="seg"
          role="radio"
          :aria-checked="props.value === c"
          :class="{ 'seg-active': props.value === c }"
          @click="emit('pick', c)"
        >
          {{ formatBoardPercent(c) }}
        </button>
      </div>
    </div>
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
  touch-action: pinch-zoom;
  /* 発動頻度のシート（z-index: 12）の上に重ねる */
  z-index: 13;
}

.dialog {
  background: var(--surface);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-sheet);
  max-width: 20rem;
  padding: 16px;
  width: 100%;
}

.title {
  font-size: 15px;
  font-weight: 700;
  margin: 0 0 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 選択肢は等幅で 1 行（おまかせ + 頻度 4 つ）。選択スタイルはほかのセグメントと同じ */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-auto-columns: 1fr;
  grid-auto-flow: column;
  overflow: hidden;
}

.seg {
  background: var(--surface);
  border: none;
  border-left: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  height: 44px;
  padding: 0 2px;
  white-space: nowrap;
}

.seg:first-child {
  border-left: none;
}

.seg-active {
  background: var(--selected);
  color: var(--selected-ink);
  font-weight: 700;
}
</style>
