<script setup lang="ts">
import { computed, ref } from "vue";

import NumberPad from "./NumberPad.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { holomenById } from "../data";
import {
  CONNECT_ANCHOR_LABELS,
  CONNECT_EXTENT_IDS,
  extentCellsOnScreen,
  knownPermilsOf,
} from "../data/connect";
import type { ConnectAnchor, ConnectExtentId, ConnectPlacement } from "../data/connect";
import type { BoardColor } from "../storage/boards";

/**
 * コネクトマスの入力（2026-09-11 ユーザー指示「コネクトマスをタッチしたらサイドバーが出てきて、効果マスの形一覧が図形で
 * 出てくる。クリックすると倍率を入力するテンキーが出て、確定するとコネクトマスの色がそのボードの色になる。
 * ホロメンカードを指定するよりそちらの方が楽」）。
 * 右から出るサイドバー（SideMenu と同じ器）に範囲の形 17 種を図形で並べる。図形は盤面の見た目と同じ向き
 * （青が右のホロメンでは青のコネクトの形を反転して見せる — `extentCellsOnScreen`）。形をタップすると NumberPad で
 * 倍率（%。ゲーム内の「範囲内のホロメンボード効果を X% UP」の X）を入れ、決定で確定して閉じる。
 * 置いてあるときは形と倍率を選択状態で示し、下に「外す」を置く
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
  known: string;
}
const shapes = computed<Shape[]>(() =>
  CONNECT_EXTENT_IDS.map((id) => ({
    id,
    cells: extentCellsOnScreen(layout.value, props.anchor, id),
    known: knownPermilsOf(id)
      .map((p) => `${String(p / 10)}%`)
      .join(" / "),
  })),
);
const cx = (dx: number): number => (dx + (GRID - 1) / 2) * CELL;
const cy = (dy: number): number => ((GRID - 1) / 2 - dy) * CELL;

/** テンキーで倍率を入れている形（null = 閉じている） */
const editing = ref<ConnectExtentId | null>(null);
const editingValue = computed(() => {
  if (editing.value === null) return 0;
  const current = props.placement;
  if (current && current.extent === editing.value) return current.permil / 10;
  // 同じ形で知られている値が 1 つならそれを初期値にする（複数なら空から）
  const known = knownPermilsOf(editing.value);
  return known.length === 1 ? (known[0] ?? 0) / 10 : 0;
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
        <p class="subtitle">{{ CONNECT_ANCHOR_LABELS[props.anchor] }}</p>
      </header>
      <!-- 範囲の形の一覧（2 列）。選んである形は枠を濃くし、倍率を右下に出す -->
      <ul class="shapes">
        <li v-for="s in shapes" :key="s.id">
          <button
            type="button"
            class="shape"
            :class="{ selected: props.placement?.extent === s.id }"
            :aria-label="`${s.id}: ${s.known}`"
            @click="editing = s.id"
          >
            <svg
              :viewBox="`0 0 ${String(SIZE)} ${String(SIZE)}`"
              :width="SIZE"
              :height="SIZE"
              aria-hidden="true"
            >
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
            <span class="known">{{ s.known }}</span>
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

.subtitle {
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
  margin: 4px 0 0;
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

/* 図形のタイル: 器のある押せる面（枡 + 罫線）。選択中は濃色の輪 */
.shape {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 6px;
  position: relative;
  width: 100%;
}

.shape.selected {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}

.shape svg {
  display: block;
}

.cell {
  fill: var(--board);
}

.anchor {
  fill: var(--surface);
  stroke: var(--ink-2);
  stroke-width: 1.5;
}

.known {
  color: var(--ink-2);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.value {
  background: var(--board);
  border-radius: var(--r-pill);
  color: #fff;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  padding: 1px 6px;
  position: absolute;
  right: 6px;
  top: 6px;
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
