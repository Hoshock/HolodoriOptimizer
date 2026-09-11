<script setup lang="ts">
/**
 * コネクト効果の範囲の図形。7 × 7 の格子の中央がコネクトマス(人物アイコンの角丸四角)で、塗るセルは相対座標
 * (x は右が正、y は上が正)。塗りの色は親の `--board`(そのボードの色。中心のコネクトなら濃色)。
 * コネクト効果のサイドバー(`ConnectSheet.vue`)のタイルと一覧ダイアログ(`ConnectListDialog.vue`)で共用する
 */
const props = defineProps<{
  cells: readonly (readonly [number, number])[];
}>();

const GRID = 7;
const CELL = 14;
const SIZE = GRID * CELL;
const cx = (dx: number): number => (dx + (GRID - 1) / 2) * CELL;
const cy = (dy: number): number => ((GRID - 1) / 2 - dy) * CELL;
</script>

<template>
  <svg class="figure" :viewBox="`0 0 ${String(SIZE)} ${String(SIZE)}`" aria-hidden="true">
    <rect
      v-for="[dx, dy] in props.cells"
      :key="`${String(dx)},${String(dy)}`"
      class="cell"
      :x="cx(dx) + 1.5"
      :y="cy(dy) + 1.5"
      :width="CELL - 3"
      :height="CELL - 3"
      rx="3"
    />
    <rect
      class="anchor"
      :x="cx(0) + 1.5"
      :y="cy(0) + 1.5"
      :width="CELL - 3"
      :height="CELL - 3"
      rx="3"
    />
  </svg>
</template>

<style scoped>
.figure {
  display: block;
  height: auto;
  max-width: 100%;
  width: 100%;
}

.cell {
  fill: var(--board);
}

.anchor {
  fill: var(--surface);
  stroke: var(--ink-2);
  stroke-width: 1.5;
}
</style>
