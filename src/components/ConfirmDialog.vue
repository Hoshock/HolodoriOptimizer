<script setup lang="ts">
import { useModalChrome } from "../composables/useModalChrome";

/**
 * 取り消せない操作（お気に入りユニットの上書き・解除）の直前に挟む 2 択の確認。
 * 全画面シート（ピッカー・詳細）ではなく中央の小さなカードにする — 2 択の確認に画面遷移は重い。
 * 出口は「キャンセル」・外側タップ・Escape で、シートの ✕ の規則（明示的な脱出手段）は満たす
 */
const props = defineProps<{
  message: string;
  /** 実行側のボタンのラベル（「上書きする」「解除する」） */
  confirmLabel: string;
}>();

const emit = defineEmits<{ confirm: []; cancel: [] }>();

// 背景が見えるダイアログなのでスクロールロックはかけない(body の再レイアウトで背後がちらつく
// — 2026-09-09 ユーザー報告)。背景のスクロールはオーバーレイ側で止める
useModalChrome(() => emit("cancel"), { lockScroll: false });
</script>

<template>
  <div class="overlay" @click.self="emit('cancel')">
    <div class="dialog" role="dialog" aria-modal="true" :aria-label="props.message">
      <p class="message">{{ props.message }}</p>
      <div class="actions">
        <button type="button" class="cancel" @click="emit('cancel')">キャンセル</button>
        <button type="button" class="confirm" @click="emit('confirm')">
          {{ props.confirmLabel }}
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
  /* 背景をスクロールさせない（body を fixed にするロックの代わり） */
  touch-action: none;
  /* シート（z-index: 10）の上に重ねる */
  z-index: 11;
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
  margin: 0 0 16px;
}

.actions {
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
}

.actions button {
  border-radius: var(--r-m);
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  height: 44px;
  padding: 0 8px;
}

.cancel {
  background: var(--surface);
  border: 1px solid var(--line);
}

.confirm {
  background: var(--action);
  border: none;
  color: #fff;
}
</style>
