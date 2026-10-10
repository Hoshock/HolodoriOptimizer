<script setup lang="ts">
import { computed } from "vue";

import { useModalChrome } from "../composables/useModalChrome";
import { connectPermilCandidates } from "../data/connect";
import type { ConnectExtentId } from "../data/connect";

/**
 * コネクトの倍率を選ぶダイアログ（2026-10-02 ユーザー指示「テンキーの自由入力をやめて、ありえる候補からの選択制に」）。
 * 範囲の形ごとに取りうる倍率（`connectPermilCandidates`。ゲーム内の「範囲内のホロメンボード効果を X% UP」の X）を
 * セグメンテッドコントロールで出し、選んだらそのまま閉じる（出口は外側タップ・Escape）。
 * **保存済みの値が候補にないとき**（自由入力だった過去の値）は、候補の末尾へその値も出して選択中にする —
 * 開いただけで値を失わせず、別の候補を選んで初めて置き換わる。
 * 各候補の下に「残り n」（持っている枚数 − ほかのコネクトマスに置いている数。0 未満は 0）を出す（2026-10-10 ユーザー指示）。
 * 残り 0 を選んだときの警告は呼び出し側（`ConnectSheet`）が出す
 */
const props = defineProps<{
  extent: ConnectExtentId;
  /** いまの倍率（‰）。同じ形を入れてあるときだけ渡す */
  value: number | null;
  /** ‰ → 残りの枚数 */
  remaining: Readonly<Record<number, number>>;
}>();

const emit = defineEmits<{ pick: [permil: number]; close: [] }>();

// 背景が見えるダイアログなのでスクロールロックはかけない（ConfirmDialog と同じ）
useModalChrome(() => emit("close"), { lockScroll: false });

const choices = computed<number[]>(() => {
  const list = [...connectPermilCandidates(props.extent)];
  if (props.value !== null && !list.includes(props.value)) list.push(props.value);
  return list;
});
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-label="範囲内のホロメンボード効果を UP"
    >
      <h3 class="title">範囲内のホロメンボード効果を UP</h3>
      <div class="segment" role="radiogroup" aria-label="倍率">
        <button
          v-for="p in choices"
          :key="p"
          type="button"
          class="seg"
          role="radio"
          :aria-checked="props.value === p"
          :class="{ 'seg-active': props.value === p }"
          @click="emit('pick', p)"
        >
          <span class="seg-percent">+{{ p / 10 }}%</span>
          <span class="seg-rest" :class="{ none: (props.remaining[p] ?? 0) === 0 }">
            残り {{ props.remaining[p] ?? 0 }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* コネクト効果のモーダル（z-index: 12）の上に重ねる */
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

/* 候補は等幅で 1 行（多くても 3 つ + 候補にない保存値 1 つ）。選択スタイルはほかのセグメントと同じ */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-auto-columns: 1fr;
  grid-auto-flow: column;
  overflow: hidden;
}

/* 2 行（倍率 / 残り）なので 56px */
.seg {
  align-items: center;
  background: var(--surface);
  border: none;
  border-left: 1px solid var(--line);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font-variant-numeric: tabular-nums;
  height: 56px;
  justify-content: center;
  line-height: 1.3;
  padding: 0 2px;
  white-space: nowrap;
}

.seg-percent {
  font-size: 13px;
  font-weight: 600;
}

.seg-rest {
  font-size: 11px;
  font-weight: 600;
}

.seg-rest.none {
  color: var(--ink-2);
}

.seg:first-child {
  border-left: none;
}

.seg-active {
  background: var(--selected);
  color: var(--selected-ink);
}

.seg-active .seg-rest.none {
  color: var(--selected-ink);
}

.seg-active .seg-percent {
  font-weight: 700;
}
</style>
