<script setup lang="ts">
/**
 * お気に入りから外すゴミ箱（自作 SVG。公式アセットは使わない — ADR-002）。
 *
 * 星（`UnitStar`）と入れ替えで使うので、**枠の一辺は星と同じ `size`** にする
 * （結果一覧 28px / 結果詳細・ユニット詳細 42px。2026-09-16 ユーザー指示「大きさ揃えることね」）。
 * 線画で、色はピッカー・サイドメニューのアイコンと同じ輪郭の色に合わせる
 * （未登録の星の輪郭と同じ重さにして、同じ列に並んだときに片方だけ浮かないようにする）
 */
const props = defineProps<{
  /** 一辺（px）。入れ替える星と同じ値を渡す */
  size: number;
}>();
</script>

<template>
  <span
    class="trash-icon"
    :style="{ height: `${String(props.size)}px`, width: `${String(props.size)}px` }"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <!-- ふた → 取っ手 → 本体 → 中の 2 本線 -->
      <path d="M4 6.5h16" />
      <path d="M9.5 6.5V4.5h5v2" />
      <path d="M6.5 6.5l.9 13a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-13" />
      <path d="M10.3 10.5v7" />
      <path d="M13.7 10.5v7" />
    </svg>
  </span>
</template>

<style scoped>
.trash-icon {
  align-items: center;
  color: var(--ink-2);
  display: inline-flex;
  flex-shrink: 0;
  justify-content: center;
}

.trash-icon svg {
  height: 100%;
  width: 100%;
}
</style>
