<script setup lang="ts">
/**
 * 結果・ユニットの共有ボタン（主数値の行の右端、お気に入りの星の左）。
 * 結果詳細とお気に入りのユニット詳細で同じ形にするための共通部品。
 *
 * アイコンは**箱から上へ出る矢印**（よく見かける形 — 2026-09-15 ユーザー指示。3 点を線でつないだ形は「違う」）。
 * 箱は正方形に近い縦長で、矢印は箱の上辺から少し離す。大きさは隣の星（42px）に近づけてある（26px は「小さい」— 2026-09-15）。
 * コピーへ落ちたときだけチェックへ 2 秒だけ変える（CopyButton と同じ）
 */
const props = defineProps<{ copied: boolean }>();
const emit = defineEmits<{ share: [] }>();
</script>

<template>
  <button
    type="button"
    class="share"
    :aria-label="props.copied ? 'コピーしました' : '結果を共有'"
    @click="emit('share')"
  >
    <svg
      viewBox="0 0 24 24"
      width="40"
      height="40"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <template v-if="!props.copied">
        <!-- 矢印は箱の上辺に触れさせず、2 ぶんだけ離す（重なると橋が架かって見える — 2026-09-15 ユーザー指示） -->
        <path d="M12 8V2" />
        <path d="M7.8 6.2L12 2l4.2 4.2" />
        <path
          d="M9.5 10H8.5A2.5 2.5 0 0 0 6 12.5V20A2.5 2.5 0 0 0 8.5 22.5h7a2.5 2.5 0 0 0 2.5-2.5v-7.5A2.5 2.5 0 0 0 15.5 10h-1"
        />
      </template>
      <path v-else d="M4.5 12.5l5 5 10-11" />
    </svg>
  </button>
</template>

<style scoped>
/* 星の左に置く。星より控えめな線のアイコンだけにして、結果の主数値を圧迫しない(2026-09-14) */
.share {
  align-items: center;
  background: none;
  border: none;
  color: var(--ink-2);
  cursor: pointer;
  display: flex;
  height: 42px;
  justify-content: center;
  padding: 0;
  /* 星と同じだけ持ち上げて、数字の中心線に揃える */
  transform: translateY(-4px);
  width: 42px;
}
</style>
