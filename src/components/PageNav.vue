<script setup lang="ts">
/**
 * ページ送りの操作部（前後の三角と「n / N」）。端の三角は disabled で隠さない。
 * `PageCarousel` がトラックの下に置くほか、詳細シートでは本文の外（下端の固定エリア）に置いて、
 * 縦に長い本文をスクロールしても操作が残るようにする（2026-09-09 ユーザー指示「一番下に固定エリア」）
 */
const props = defineProps<{
  /** ページ数 */
  count: number;
}>();

/** 現在のページ（0 始まり） */
const index = defineModel<number>({ default: 0 });

function goTo(i: number): void {
  index.value = Math.min(Math.max(0, props.count - 1), Math.max(0, i));
}
</script>

<template>
  <div class="nav">
    <button
      type="button"
      class="arrow"
      :disabled="index <= 0"
      aria-label="前へ"
      @click="goTo(index - 1)"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 2 4 8l7 6z" /></svg>
    </button>
    <span class="counter" aria-live="polite">{{ index + 1 }} / {{ props.count }}</span>
    <button
      type="button"
      class="arrow"
      :disabled="index >= props.count - 1"
      aria-label="次へ"
      @click="goTo(index + 1)"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2l7 6-7 6z" /></svg>
    </button>
  </div>
</template>

<style scoped>
.nav {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: center;
}

.arrow {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  height: 40px;
  justify-content: center;
  padding: 0;
  width: 56px;
}

.arrow svg {
  fill: currentColor;
  height: 16px;
  width: 16px;
}

.arrow:disabled {
  color: var(--ink-2);
  cursor: not-allowed;
  opacity: 0.35;
}

.counter {
  color: var(--ink-2);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  min-width: 56px;
  text-align: center;
}
</style>
