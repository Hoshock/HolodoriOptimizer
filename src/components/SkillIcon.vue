<script setup lang="ts">
/**
 * スキル種別・役割のアイコン(自作。公式アセットは使わない — ADR-002)。
 * スキル種別は文字アイコン(SP / A / P — 2026-09-01 ユーザー指定)、
 * 衣装は服(Tシャツ)、役割はメタファーが確立した図(リーダー=王冠 / 固定=ピン)にする。
 * 並び順は常に 衣装 / SP → アクティブ → パッシブ で固定されており、
 * 詳細モーダルではテキスト併記(凡例を兼ねる)で意味を学習できる。
 */
const props = defineProps<{
  kind: "costume" | "sp" | "active" | "passive" | "leader" | "fixed";
  /**
   * スクリーンリーダー向けの名称(衣装・SP・アクティブ・パッシブ・リーダー・固定)。
   * 隣にテキストを併記する文脈では省略し、アイコンを装飾扱いにする
   */
  label?: string;
}>();
</script>

<template>
  <span
    class="skill-icon"
    :role="props.label ? 'img' : undefined"
    :aria-label="props.label"
    :aria-hidden="props.label ? undefined : 'true'"
  >
    <span v-if="props.kind === 'sp'" class="glyph" aria-hidden="true">SP</span>
    <span v-else-if="props.kind === 'active'" class="glyph" aria-hidden="true">A</span>
    <span v-else-if="props.kind === 'passive'" class="glyph" aria-hidden="true">P</span>
    <svg
      v-else
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <!-- 衣装: Tシャツ(服のアイコン — 2026-09-01 ユーザー指定) -->
      <path
        v-if="props.kind === 'costume'"
        d="M8 3a4 3 0 0 0 8 0l4 3-2 3.5-2-1V21H8V8.5l-2 1L4 6z"
      />
      <!-- リーダー: 王冠 -->
      <path v-else-if="props.kind === 'leader'" d="M4 7l4 4 4-6 4 6 4-4-1.5 10h-13z" />
      <!-- 固定: ピン -->
      <template v-else>
        <path d="M9 3h6v1l-1.5 5 3.5 3v1.5H7V12l3.5-3L9 4z" />
        <path d="M12 13.5V20" />
      </template>
    </svg>
  </span>
</template>

<style scoped>
/* すべて正円で囲む(2026-09-01 ユーザー指定) */
.skill-icon {
  align-items: center;
  border: 1px solid currentColor;
  border-radius: 50%;
  color: var(--ink-2);
  display: inline-flex;
  flex-shrink: 0;
  height: 26px;
  justify-content: center;
  width: 26px;
}

.glyph {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
}
</style>
