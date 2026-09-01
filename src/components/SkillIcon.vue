<script setup lang="ts">
/**
 * スキル種別・役割のアイコン(自作。公式アセットは使わない — ADR-002)。
 * スキル種別は文字アイコン(SP / A / P — 2026-09-01 ユーザー指定)、
 * 衣装は服(Tシャツ)、役割はメタファーが確立した図(リーダー=王冠 / 固定=ピン)、
 * 開花(凸)は花びらの輪郭+段階の数字(2026-09-01 ユーザー指定)にする。
 * 並び順は常に 衣装 / SP → アクティブ → パッシブ で固定されており、
 * 詳細モーダルではテキスト併記(凡例を兼ねる)で意味を学習できる。
 */
const props = defineProps<{
  kind: "costume" | "sp" | "active" | "passive" | "leader" | "fixed" | "bloom";
  /**
   * スクリーンリーダー向けの名称(衣装・SP・アクティブ・パッシブ・リーダー・固定・開花n)。
   * 隣にテキストを併記する文脈では省略し、アイコンを装飾扱いにする
   */
  label?: string;
  /** bloom のみ: 開花段階(0〜5)。花の中央に表示する */
  count?: number;
}>();
</script>

<template>
  <span
    class="skill-icon"
    :class="{ 'is-bloom': props.kind === 'bloom' }"
    :role="props.label ? 'img' : undefined"
    :aria-label="props.label"
    :aria-hidden="props.label ? undefined : 'true'"
  >
    <span v-if="props.kind === 'sp'" class="glyph" aria-hidden="true">SP</span>
    <span v-else-if="props.kind === 'active'" class="glyph" aria-hidden="true">A</span>
    <span v-else-if="props.kind === 'passive'" class="glyph" aria-hidden="true">P</span>
    <!-- 開花: 正円の代わりに花びらの輪郭で囲み、中央に段階の数字を置く -->
    <template v-else-if="props.kind === 'bloom'">
      <svg viewBox="0 0 26 26" width="26" height="26" fill="none" aria-hidden="true">
        <path
          d="M13 3.5Q22.41 .06 22.03 10.06Q28.22 17.94 18.59 20.69Q13 29 7.41 20.69Q-2.22 17.94 3.97 10.06Q3.59 .06 13 3.5Z"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linejoin="round"
        />
      </svg>
      <span class="glyph bloom-count" aria-hidden="true">{{ props.count ?? 0 }}</span>
    </template>
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
/* すべて正円で囲む(2026-09-01 ユーザー指定)。開花のみ花びらの輪郭が枠を兼ねる */
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

.skill-icon.is-bloom {
  border: none;
  position: relative;
}

.glyph {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
}

.bloom-count {
  font-variant-numeric: tabular-nums;
  inset: 0;
  line-height: 26px;
  position: absolute;
  text-align: center;
}
</style>
