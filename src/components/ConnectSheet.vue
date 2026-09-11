<script setup lang="ts">
import { computed, ref } from "vue";

import ConnectFigure from "./ConnectFigure.vue";
import ConnectListDialog from "./ConnectListDialog.vue";
import NumberPad from "./NumberPad.vue";
import { useModalChrome } from "../composables/useModalChrome";
import {
  CONNECT_ANCHOR_LABELS,
  CONNECT_EXTENT_DISPLAY_ORDER,
  CONNECT_EXTENT_LABELS,
  CONNECT_EXTENTS,
} from "../data/connect";
import type {
  ConnectAnchor,
  ConnectExtentId,
  ConnectPlacement,
  ConnectPlacements,
} from "../data/connect";
import type { BoardColor } from "../storage/boards";

/**
 * コネクトマスの入力（2026-09-11 ユーザー指示「コネクトマスをタッチしたらサイドバーが出てきて、効果マスの形一覧が図形で
 * 出てくる。クリックすると倍率を入力するテンキーが出て、確定するとコネクトマスの色がそのボードの色になる。
 * ホロメンカードを指定するよりそちらの方が楽」）。
 * 右から出るサイドバー（SideMenu と同じ器）に範囲の形 17 種を同じ大きさの正方形のタイルで並べる。並びは対称な形が左右に
 * 並ぶ固定順（`CONNECT_EXTENT_DISPLAY_ORDER`）で、入れてある形**だけ**を先頭に出す（対になる形は動かさない —
 * 2026-09-11「そのペアみたいなのも一緒に上に来るのはやめよう」）。図形は**物理座標の向きのまま**で、ホロメンの左右配置や
 * コネクトマスの色で反転しない（2026-09-11「図形の反転はやめる。純粋に形で決まる」— 反転していた時期は対の形の見た目が
 * ホロメンによって入れ替わって見えた）。形をタップすると NumberPad で
 * 倍率（%。ゲーム内の「範囲内のホロメンボード効果を X% UP」の X）を入れ、決定で確定して閉じる。倍率の候補は出さない
 * （ユーザーが自分で入れる — 2026-09-11 指示）。入れた値はタイルの右上（どの形も使わない角に置き、中心の四角はタイルの中心のまま）。下端に「外す」。
 * 見出しの右の「一覧」で、全ホロメンのコネクト効果の一覧ダイアログ（`ConnectListDialog.vue`）を開く
 */
const props = defineProps<{
  holomenId: string;
  anchor: ConnectAnchor;
  /** いまの入力（未配置なら null） */
  placement: ConnectPlacement | null;
  /** 図形の塗りに使うボードの色（開いている盤面の色） */
  color: BoardColor;
  /** 全ホロメンのコネクトの入力（一覧ダイアログ用） */
  allPlacements: Readonly<Record<string, ConnectPlacements>>;
}>();

const emit = defineEmits<{
  submit: [placement: ConnectPlacement];
  clear: [];
  close: [];
}>();

useModalChrome(() => emit("close"));

interface Shape {
  id: ConnectExtentId;
  cells: readonly (readonly [number, number])[];
}
/** 入れてある形だけを先頭に、残りは固定順のまま */
const shapes = computed<Shape[]>(() => {
  const selected = props.placement?.extent;
  const order = selected
    ? [selected, ...CONNECT_EXTENT_DISPLAY_ORDER.filter((id) => id !== selected)]
    : CONNECT_EXTENT_DISPLAY_ORDER;
  return order.map((id) => ({ id, cells: CONNECT_EXTENTS[id] }));
});

/** 一覧ダイアログ（全ホロメンのコネクト効果） */
const listOpen = ref(false);

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
        <!-- 右上: 全ホロメンのコネクト効果の一覧（アイコン + 文字で分かりやすく） -->
        <button type="button" class="list-button" @click="listOpen = true">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M3 5h2v2H3zm4 0h10v2H7zM3 9h2v2H3zm4 0h10v2H7zm-4 4h2v2H3zm4 0h10v2H7z"
              fill="currentColor"
            />
          </svg>
          <span>一覧</span>
        </button>
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
            <ConnectFigure :cells="s.cells" />
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
    <ConnectListDialog
      v-if="listOpen"
      :placements="props.allPlacements"
      @close="listOpen = false"
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
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-shrink: 0;
  justify-content: space-between;
  padding: 12px 12px 12px 20px;
}

/* 一覧を開くボタン: 器のある押せる面(枡 + 罫線)に一覧アイコンと文字 */
.list-button {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  font-size: 13px;
  font-weight: 700;
  gap: 4px;
  height: 32px;
  padding: 0 12px 0 8px;
}

.list-button svg {
  height: 18px;
  width: 18px;
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

.shape.selected {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
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
