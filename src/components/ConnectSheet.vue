<script setup lang="ts">
import { computed, ref } from "vue";

import NumberPad from "./NumberPad.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { holomenById } from "../data";
import {
  CONNECT_ANCHOR_LABELS,
  CONNECT_EXTENT_DISPLAY_ORDER,
  CONNECT_EXTENT_LABELS,
  connectExtentPartner,
  extentCellsOnScreen,
} from "../data/connect";
import type { ConnectAnchor, ConnectExtentId, ConnectPlacement } from "../data/connect";
import type { BoardColor } from "../storage/boards";

/**
 * コネクトマスの入力（2026-09-11 ユーザー指示「コネクトマスをタッチしたらサイドバーが出てきて、効果マスの形一覧が図形で
 * 出てくる。クリックすると倍率を入力するテンキーが出て、確定するとコネクトマスの色がそのボードの色になる。
 * ホロメンカードを指定するよりそちらの方が楽」）。
 * 右から出るサイドバー（SideMenu と同じ器）に範囲の形 17 種を同じ大きさの正方形のタイルで並べる。並びは対称な形が左右に
 * 並ぶ固定順（`CONNECT_EXTENT_DISPLAY_ORDER`）で、入れてある形だけを先頭に出す。図形は盤面の見た目と同じ向き
 * （青が右のホロメンでは青のコネクトの形を反転して見せる — `extentCellsOnScreen`）。形をタップすると NumberPad で
 * 倍率（%。ゲーム内の「範囲内のホロメンボード効果を X% UP」の X）を入れ、決定で確定して閉じる。倍率の候補は出さない
 * （ユーザーが自分で入れる — 2026-09-11 指示）。入れた値はタイルの右上（どの形も使わない角に置き、中心の四角はタイルの中心のまま）。下端に「外す」
 */
const props = defineProps<{
  holomenId: string;
  anchor: ConnectAnchor;
  /** いまの入力（未配置なら null） */
  placement: ConnectPlacement | null;
  /** 図形の塗りに使うボードの色（開いている盤面の色） */
  color: BoardColor;
}>();

const emit = defineEmits<{
  submit: [placement: ConnectPlacement];
  clear: [];
  close: [];
}>();

useModalChrome(() => emit("close"));

const layout = computed(
  () =>
    holomenById.get(props.holomenId)?.board ?? {
      blueSide: "left" as const,
      lifeSide: "left" as const,
    },
);

/** 図形: 7 × 7 の格子の中央がコネクトマス。塗るセルは盤面の向き */
const GRID = 7;
const CELL = 14;
const SIZE = GRID * CELL;
interface Shape {
  id: ConnectExtentId;
  cells: [number, number][];
}
/** 入れてある形を先頭に(対になる形を 2 番目に出して左右の対称を崩さない)、残りは固定順 */
const shapes = computed<Shape[]>(() => {
  const selected = props.placement?.extent;
  const partner = selected ? connectExtentPartner(selected) : null;
  const head = selected ? [selected, ...(partner ? [partner] : [])] : [];
  const order = [...head, ...CONNECT_EXTENT_DISPLAY_ORDER.filter((id) => !head.includes(id))];
  return order.map((id) => ({ id, cells: extentCellsOnScreen(layout.value, props.anchor, id) }));
});
const cx = (dx: number): number => (dx + (GRID - 1) / 2) * CELL;
const cy = (dy: number): number => ((GRID - 1) / 2 - dy) * CELL;

/** テンキーで倍率を入れている形（null = 閉じている） */
const editing = ref<ConnectExtentId | null>(null);
/** テンキーの初期値: 同じ形を入れてあればその倍率、それ以外は空 */
const editingValue = computed(() => {
  const current = props.placement;
  return current && current.extent === editing.value ? current.permil / 10 : 0;
});
function onSubmit(percent: number): void {
  const extent = editing.value;
  editing.value = null;
  if (extent === null || percent <= 0) return;
  emit("submit", { extent, permil: Math.round(percent * 10) });
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <aside
      class="drawer"
      role="dialog"
      aria-modal="true"
      :aria-label="`${CONNECT_ANCHOR_LABELS[props.anchor]}のコネクト効果`"
      :style="{ '--board': `var(--board-${props.color})` }"
    >
      <header class="head">
        <p class="title">コネクト効果</p>
      </header>
      <!-- 範囲の形の一覧（2 列・同じ大きさの正方形）。入れてある形は先頭で枠を濃くし、倍率をタイルの右上（図形の使わない角）に出す -->
      <ul class="shapes">
        <li v-for="s in shapes" :key="s.id">
          <button
            type="button"
            class="shape"
            :class="{ selected: props.placement?.extent === s.id }"
            :aria-label="CONNECT_EXTENT_LABELS[s.id]"
            @click="editing = s.id"
          >
            <svg class="figure" :viewBox="`0 0 ${String(SIZE)} ${String(SIZE)}`" aria-hidden="true">
              <rect
                v-for="[dx, dy] in s.cells"
                :key="`${String(dx)},${String(dy)}`"
                class="cell"
                :x="cx(dx) + 1.5"
                :y="cy(dy) + 1.5"
                :width="CELL - 3"
                :height="CELL - 3"
                rx="3"
              />
              <!-- コネクトマス（中央）は人物アイコンの角丸四角 -->
              <rect
                class="anchor"
                :x="cx(0) + 1.5"
                :y="cy(0) + 1.5"
                :width="CELL - 3"
                :height="CELL - 3"
                rx="3"
              />
            </svg>
            <span v-if="props.placement?.extent === s.id" class="value">
              +{{ props.placement.permil / 10 }}%
            </span>
          </button>
        </li>
      </ul>
      <div v-if="props.placement" class="foot">
        <button type="button" class="clear" @click="emit('clear')">外す</button>
      </div>
    </aside>

    <NumberPad
      v-if="editing !== null"
      label="範囲内のホロメンボード効果を UP"
      :value="editingValue"
      :decimals="1"
      :max="999"
      unit="%"
      @submit="onSubmit"
      @cancel="editing = null"
    />
  </div>
</template>

<style scoped>
/* 右から出るサイドバー（SideMenu と同じ幅・地）。ボードのシート（11）より上 */
.overlay {
  background: rgba(35, 48, 61, 0.3);
  inset: 0;
  position: fixed;
  z-index: 12;
}

.drawer {
  background: var(--surface);
  bottom: 0;
  box-shadow: -8px 0 24px rgba(35, 48, 61, 0.16);
  display: flex;
  flex-direction: column;
  position: absolute;
  right: 0;
  top: 0;
  width: min(80vw, 300px);
}

.head {
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
  padding: 16px 20px 12px;
}

.title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

.shapes {
  display: grid;
  flex: 1;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
  list-style: none;
  margin: 0;
  overflow-y: auto;
  padding: 12px;
}

/* 図形のタイル: 器のある押せる面（枡 + 罫線）。全部同じ大きさの正方形で、図形はその中に収める。選択中は濃色の輪 */
.shape {
  align-items: center;
  aspect-ratio: 1 / 1;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 10px;
  position: relative;
  width: 100%;
}

.figure {
  display: block;
  height: auto;
  max-width: 100%;
  width: 100%;
}

.shape.selected {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}

.cell {
  fill: var(--board);
}

.anchor {
  fill: var(--surface);
  stroke: var(--ink-2);
  stroke-width: 1.5;
}

/*
 * 入れた倍率: タイルの右上（2026-09-11「やっぱ % 表示右上で。図形に被らないように」）。図形は 7 × 7 の格子で、
 * どの形も角の 2 × 2 のマス（dx, dy ともに 2 以上）は使わないので、そこに収まる大きさなら図形に被らない。
 * 余白は上下左右とも同じで、中心の四角がタイルの中心に来る
 */
.value {
  background: var(--board);
  border-radius: var(--r-pill);
  color: #fff;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 16px;
  padding: 0 7px;
  position: absolute;
  right: 5px;
  top: 5px;
}

.foot {
  border-top: 1px solid var(--line);
  flex-shrink: 0;
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
}

.clear {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  width: 100%;
}
</style>
