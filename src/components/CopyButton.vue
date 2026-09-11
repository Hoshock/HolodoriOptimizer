<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";

/**
 * 枠のヘッダ右上に置くコピーボタン(32px の正方形のアイコンボタン)。文字のラベルは持たず、コピーのアイコンを出し、
 * コピーできたらチェックのアイコンに 2 秒だけ替えて元に戻す(2026-09-11 ユーザー指示「コピーボタン幅広い。文章ではなく
 * コピーアイコンにしよう。コピーできたらチェックアイコンが表示されるように。少し経ったらコピーアイコンに戻る」)。
 * ラベルは aria-label に退避する(ui-design.md)。text はコピーする文字列(押した時点の値を取る)
 */
const props = defineProps<{ text: string; label?: string }>();

const copied = ref(false);
let timer: number | null = null;
async function onCopy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.text);
    copied.value = true;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      copied.value = false;
      timer = null;
    }, 2000);
  } catch {
    // クリップボードが使えない環境では、中身を直接選択してコピーしてもらう
  }
}
onBeforeUnmount(() => {
  if (timer !== null) window.clearTimeout(timer);
});
</script>

<template>
  <button
    type="button"
    class="copy-button"
    :class="{ copied }"
    :aria-label="copied ? 'コピーしました' : (label ?? 'コピー')"
    @click="void onCopy()"
  >
    <svg
      v-if="!copied"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </svg>
    <svg
      v-else
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  </button>
</template>

<style scoped>
/* 枠のヘッダの文字ボタン(.box-button)と同じ地・枠線・高さで、幅も同じ 32px の正方形 */
.copy-button {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  height: 32px;
  justify-content: center;
  padding: 0;
  width: 32px;
}

.copy-button.copied {
  color: var(--primary);
}
</style>
