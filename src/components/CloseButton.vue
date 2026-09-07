<script setup lang="ts">
/**
 * モーダル共通の閉じるボタン(ヘッダ右上の 44px 正円)。
 * ✕ はハンバーガー(App.vue)が開いたときに変わる ✕ と同じ形・同じ大きさ
 * (18px × 2px の線 2 本を ±45°)に揃える(2026-09-07 ユーザー指示「前者のサイズに全て合わせて」)
 */
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <button type="button" class="close-button" aria-label="閉じる" @click="emit('close')">
    <span class="bar" aria-hidden="true"></span>
    <span class="bar" aria-hidden="true"></span>
  </button>
</template>

<style scoped>
.close-button {
  align-items: center;
  background: var(--bg);
  border: none;
  border-radius: 50%;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  height: 44px;
  justify-content: center;
  padding: 0;
  position: relative;
  width: 44px;
}

.bar {
  background: currentColor;
  border-radius: 1px;
  display: block;
  height: 2px;
  position: absolute;
  width: 18px;
}

.bar:nth-child(1) {
  transform: rotate(45deg);
}

.bar:nth-child(2) {
  transform: rotate(-45deg);
}
</style>
