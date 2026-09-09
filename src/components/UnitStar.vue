<script setup lang="ts">
import { computed } from "vue";

/**
 * お気に入りユニットの星（自作 SVG。公式アセットは使わない — ADR-002）。
 * 登録済みは金色の面、未登録は輪郭だけで、中央に登録番号を入れる。
 * 結果パネルのお気に入りボタンと、番号を選ぶモーダルの 2 行 5 列で同じ形を使う
 */
const props = defineProps<{
  /** 星の中に出す登録番号（省略 = 数字を出さない） */
  slotNumber?: number | null;
  /** 登録済み（金色の面）か */
  registered: boolean;
  /** 星の一辺（px） */
  size: number;
}>();

/** 中心 (12,12)・外径 11・内径 5.2 の 5 稜星。数字が入るぶん内径を大きめに取っている */
const STAR_PATH =
  "M12 1 15.06 7.79 22.46 8.6 16.95 13.61 18.47 20.9 12 17.2 5.53 20.9 7.05 13.61 1.54 8.6 8.94 7.79Z";

/** 2 桁(10)は星の中の幅に収まらないので一段小さくする */
const style = computed(() => {
  const digits =
    props.slotNumber === null || props.slotNumber === undefined
      ? 1
      : String(props.slotNumber).length;
  return {
    height: `${String(props.size)}px`,
    width: `${String(props.size)}px`,
    fontSize: `${String(Math.round(props.size * (digits > 1 ? 0.25 : 0.32)))}px`,
  };
});
</script>

<template>
  <span class="unit-star" :class="{ registered: props.registered }" :style="style">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path :d="STAR_PATH" stroke-width="1.2" stroke-linejoin="round" />
    </svg>
    <span v-if="props.slotNumber !== null && props.slotNumber !== undefined" class="num">{{
      props.slotNumber
    }}</span>
  </span>
</template>

<style scoped>
.unit-star {
  align-items: center;
  display: inline-flex;
  flex-shrink: 0;
  justify-content: center;
  position: relative;
}

.unit-star svg {
  fill: var(--surface);
  height: 100%;
  left: 0;
  position: absolute;
  stroke: var(--ink-2);
  top: 0;
  width: 100%;
}

/* 登録済みは金色の面 + 白抜きの数字(2026-09-09 ユーザー指示「黄色に白字のほうがいいかも」) */
.unit-star.registered svg {
  fill: var(--gold);
  stroke: var(--gold);
}

.num {
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 1;
  position: relative;
}

.unit-star.registered .num {
  color: #fff;
}
</style>
