<script setup lang="ts">
/**
 * 見出しの行の右端に置く ⓘ のボタン(押すと違いの表 `InfoTableDialog` を開く。2026-10-08 ユーザー指示)。何の説明かは aria-label に寄せ、
 * 画面には文字を出さない。押せる範囲は 40px だが、負のマージンで図の 20px ぶんしか場所を取らない — 見出しの行の高さを変えず、
 * 図の右端が本文の右端にそろう(セグメントの横に置いたら「タブが真ん中からズレる」「空間をとりすぎ」で見出しの行へ移した)
 */
defineProps<{ label: string }>();
defineEmits<{ click: [] }>();
</script>

<template>
  <button
    type="button"
    class="info"
    :aria-label="label"
    aria-haspopup="dialog"
    @click="$emit('click')"
  >
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v6" />
      <circle cx="12" cy="7.6" r="0.4" fill="currentColor" stroke-width="1.6" />
    </svg>
  </button>
</template>

<style scoped>
.info {
  align-items: center;
  background: none;
  border: none;
  border-radius: 50%;
  color: var(--ink-2);
  cursor: pointer;
  display: flex;
  flex: none;
  height: 40px;
  justify-content: center;
  margin: -10px;
  padding: 0;
  width: 40px;
}
</style>
