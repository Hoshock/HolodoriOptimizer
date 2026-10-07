<script setup lang="ts">
import { useModalChrome } from "../composables/useModalChrome";

/**
 * 知らせるだけの中央のダイアログ(出口は「閉じる」1 つ・外側タップ・Escape)。ボードの操作で開けられないとき(必要 Pt が足りないなど)の知らせに使う。
 * 見た目と寸法は `ConfirmDialog` と同じ(2 択のボタンが 1 つになっただけ)
 */
const props = defineProps<{
  message: string;
}>();

const emit = defineEmits<{ close: [] }>();

// 背景が見えるダイアログなのでスクロールロックはかけない(ConfirmDialog と同じ)
useModalChrome(() => emit("close"), { lockScroll: false });
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog" role="alertdialog" aria-modal="true" :aria-label="props.message">
      <p class="message">{{ props.message }}</p>
      <div class="actions">
        <button type="button" class="close" @click="emit('close')">閉じる</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 結果詳細・ユニット詳細(z-index: 10〜12)の上に重ねる */
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

.message {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.6;
  margin: 0 0 16px;
}

.actions {
  display: flex;
}

.close {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
}
</style>
