<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef } from "vue";

import CloseButton from "./CloseButton.vue";
import { useModalChrome } from "../composables/useModalChrome";
import {
  BLUE_BOARD_CONNECT,
  BLUE_BOARD_EDGES,
  BLUE_BOARD_NODE_IDS,
  BLUE_BOARD_NODES,
  BLUE_BOARD_ORIGIN,
  blueBoardEffects,
  nodeGlyph,
  toggleNode,
} from "../data/blueBoard";
import { holomenById } from "../data";
import type { ParamKind } from "../data/types";
import { holomenName } from "../ui/labels";

/**
 * ホロメンボードの入力(ホロメン単位)。ゲーム内のボードと同じ配置でマスを並べ、
 * 自分のボードを見ながら同じマスをタップして写す。連結の制約はツール側が引き受ける:
 * 未解放のマスをタップすると初期地点からの経路もまとめて解放し、解放済みを解除すると
 * その先も解除する。コネクトマス(人物アイコン)は表示するが入力しない。
 * ボードは赤・青・黄・緑の 4 色(ゲーム内の全体配置の順。赤は上・緑は下・青と黄が左右)で、
 * 今あるのは青だけ — 他の 3 色はタブを disabled で置く(2026-09-07 ユーザー指示)
 */
const props = defineProps<{
  holomenId: string;
  nodes: string[];
}>();

const emit = defineEmits<{
  update: [holomenId: string, nodes: string[]];
  close: [];
}>();

type BoardColor = "red" | "blue" | "yellow" | "green";
const BOARD_COLORS: { id: BoardColor; label: string; ready: boolean }[] = [
  { id: "red", label: "赤", ready: false },
  { id: "blue", label: "青", ready: true },
  { id: "yellow", label: "黄", ready: false },
  { id: "green", label: "緑", ready: false },
];
const color = ref<BoardColor>("blue");
/** 選んだ色でボード(解放マス・接続線)を描く(トークンは src/style.css。黄は文字を濃色に) */
const boardStyle = computed(() => ({
  "--board": `var(--board-${color.value})`,
  "--board-ink": color.value === "yellow" ? "var(--board-yellow-ink)" : "#fff",
}));

/**
 * 左右はホロメンごとの固定データ(holomen.json の board.blueSide — 2026-09-07 ユーザー共有)。
 * 青ボードが全体配置の左にあるホロメンは左型、右にあるホロメンは左右反転で描く
 */
const mirrored = computed(() => holomenById.get(props.holomenId)?.board.blueSide === "right");

/* マス同士を繋ぐ線は縦横とも同じ長さ(正方格子 — 2026-09-06 ユーザー指定)。11 列で 374px(シート幅 390 − 左右 8) */
const CELL_W = 34;
const CELL_H = 34;
const COLS = 11;
const ROWS = 7;
const RADIUS = 11; /* 大マス(1.5 倍)と隣り合っても繋ぐ線が見える太さを残す */
/** 実機で大きいマス(B-007・5 マス塊の両端)は 1.5 倍 */
const LARGE_RADIUS = RADIUS * 1.5;
const WIDTH = CELL_W * COLS;
const HEIGHT = CELL_H * ROWS;

const unlocked = computed(() => new Set(props.nodes));
const unlockedCount = computed(() => unlocked.value.size);
const effects = computed(() => blueBoardEffects(unlocked.value));

/** 左型の x(-10〜0)を列へ。右型は左右反転(初期地点が左端に来る) */
function cx(x: number): number {
  const col = mirrored.value ? -x : x + (COLS - 1);
  return col * CELL_W + CELL_W / 2;
}
/** y は上が正(実機と照合 — 2026-09-06)。行 0 が y=+3 */
function cy(y: number): number {
  return (3 - y) * CELL_H + CELL_H / 2;
}

interface Cell {
  id: string;
  x: number;
  y: number;
}
const cells = new Map<string, Cell>([
  ...BLUE_BOARD_NODES.map((n) => [n.id, { id: n.id, x: n.x, y: n.y }] as const),
  [BLUE_BOARD_ORIGIN.id, { ...BLUE_BOARD_ORIGIN }],
  [BLUE_BOARD_CONNECT.id, { ...BLUE_BOARD_CONNECT }],
]);

function passable(id: string): boolean {
  return id === BLUE_BOARD_ORIGIN.id || id === BLUE_BOARD_CONNECT.id || unlocked.value.has(id);
}

const edges = computed(() =>
  BLUE_BOARD_EDGES.map(([a, b]) => {
    const ca = cells.get(a);
    const cb = cells.get(b);
    if (!ca || !cb) return null;
    return {
      key: `${a}-${b}`,
      x1: cx(ca.x),
      y1: cy(ca.y),
      x2: cx(cb.x),
      y2: cy(cb.y),
      active: passable(a) && passable(b) && (unlocked.value.has(a) || unlocked.value.has(b)),
    };
  }).filter((e): e is NonNullable<typeof e> => e !== null),
);

function effectLabel(id: string): string {
  const node = BLUE_BOARD_NODES.find((n) => n.id === id);
  if (!node) return "";
  const e = node.effect;
  const name: Record<ParamKind, string> = {
    performance: "パフォーマンス",
    technique: "テクニック",
    sense: "センス",
  };
  switch (e.kind) {
    case "allParams":
      return `全パラメータ +${String(e.value)}`;
    case "param":
      return `${name[e.param]} +${String(e.value)}`;
    case "paramPercent":
      return `${name[e.param]} +${e.percent.toFixed(1)}%`;
    case "activeRate":
      return `アクティブスキル発動率 +${String(e.percent)}%`;
    case "activeFrequency":
      return `アクティブスキル発動頻度 +${String(e.percent)}%`;
  }
}

function onToggle(id: string): void {
  emit("update", props.holomenId, [...toggleNode(unlocked.value, id)]);
}
function unlockAll(): void {
  emit("update", props.holomenId, [...BLUE_BOARD_NODE_IDS]);
}
function lockAll(): void {
  emit("update", props.holomenId, []);
}

/** 効果表の行: 固定値(+ 割合の括弧補足) */
function paramRow(p: ParamKind): { fixed: string; percent: string | null } {
  const e = effects.value;
  const fixed = e.allParams + e.params[p];
  return {
    fixed: `+${fixed.toLocaleString("ja-JP")}`,
    percent: e.percents[p] > 0 ? `+${e.percents[p].toFixed(1)}%` : null,
  };
}

const PARAM_LABELS: Record<ParamKind, string> = {
  performance: "パフォーマンス",
  technique: "テクニック",
  sense: "センス",
};
const PARAMS: ParamKind[] = ["performance", "technique", "sense"];

const sheet = useTemplateRef("sheet");
useModalChrome(() => emit("close"));
onMounted(() => {
  void nextTick(() => sheet.value?.focus());
});
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div
      ref="sheet"
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-label="ホロメンボード"
      tabindex="-1"
    >
      <header class="sheet-head">
        <h3>ホロメンボード</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <div class="who-row">
          <span class="who">{{ holomenName(props.holomenId) }}</span>
          <!-- ボードの色。左から赤・青・黄・緑(ゲーム内の順)。用意できていない色は disabled -->
          <div class="segment" role="radiogroup" aria-label="ボードの色">
            <button
              v-for="c in BOARD_COLORS"
              :key="c.id"
              type="button"
              class="seg"
              role="radio"
              :aria-checked="color === c.id"
              :class="{ active: color === c.id }"
              :disabled="!c.ready"
              :aria-label="c.ready ? c.label : `${c.label}（準備中）`"
              @click="color = c.id"
            >
              {{ c.label }}
            </button>
          </div>
        </div>

        <div class="board-wrap" :style="boardStyle">
          <svg
            class="board"
            :viewBox="`0 0 ${String(WIDTH)} ${String(HEIGHT)}`"
            :width="WIDTH"
            :height="HEIGHT"
            role="group"
            :aria-label="`解放 ${String(unlockedCount)} / ${String(BLUE_BOARD_NODE_IDS.length)} マス`"
          >
            <line
              v-for="e in edges"
              :key="e.key"
              class="edge"
              :class="{ active: e.active }"
              :x1="e.x1"
              :y1="e.y1"
              :x2="e.x2"
              :y2="e.y2"
            />
            <!-- 初期地点とコネクトマス(丸角の四角の人物アイコン)。表示のみ -->
            <g
              v-for="c in [BLUE_BOARD_ORIGIN, BLUE_BOARD_CONNECT]"
              :key="c.id"
              class="anchor"
              :transform="`translate(${String(cx(c.x))} ${String(cy(c.y))})`"
              aria-hidden="true"
            >
              <rect :x="-RADIUS" :y="-RADIUS" :width="RADIUS * 2" :height="RADIUS * 2" rx="5" />
              <circle class="head" cy="-3" r="3.2" />
              <path class="shoulders" d="M-6.5 7.5a6.5 5.5 0 0 1 13 0z" />
            </g>
            <g
              v-for="n in BLUE_BOARD_NODES"
              :key="n.id"
              class="node"
              :class="{ unlocked: unlocked.has(n.id), large: n.large }"
              role="button"
              tabindex="0"
              :aria-pressed="unlocked.has(n.id)"
              :aria-label="effectLabel(n.id)"
              :transform="`translate(${String(cx(n.x))} ${String(cy(n.y))})`"
              @click="onToggle(n.id)"
              @keydown.enter.prevent="onToggle(n.id)"
              @keydown.space.prevent="onToggle(n.id)"
            >
              <rect
                class="hit"
                :x="-CELL_W / 2"
                :y="-CELL_H / 2"
                :width="CELL_W"
                :height="CELL_H"
              />
              <circle :r="n.large ? LARGE_RADIUS : RADIUS" />
              <text :class="{ small: nodeGlyph(n.effect).length > 1 }" dy="0.35em">
                {{ nodeGlyph(n.effect) }}
              </text>
            </g>
          </svg>
        </div>

        <div class="bulk-row">
          <button type="button" class="secondary-button" @click="unlockAll">すべて解放</button>
          <button type="button" class="secondary-button" @click="lockAll">すべて解除</button>
        </div>

        <table class="effect-table">
          <tbody>
            <tr v-for="p in PARAMS" :key="p">
              <th scope="row">{{ PARAM_LABELS[p] }}</th>
              <td class="num">
                {{ paramRow(p).fixed
                }}<span v-if="paramRow(p).percent" class="sub">（{{ paramRow(p).percent }}）</span>
              </td>
            </tr>
            <tr>
              <th scope="row">アクティブスキル発動率</th>
              <td class="num">+{{ effects.activeRatePercent }}%</td>
            </tr>
            <tr>
              <th scope="row">アクティブスキル発動頻度</th>
              <td class="num">+{{ effects.activeFrequencyPercent }}%</td>
            </tr>
          </tbody>
        </table>

        <div class="footnotes">
          <p>
            <span class="fn-num">※</span>
            <span>
              ホロメンボードの効果はマスの表記値の合計で試算します。コネクトマスによる増幅は含みません。発動率・発動頻度の反映は仮定の式です。
            </span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  background: rgba(35, 48, 61, 0.4);
  inset: 0;
  position: fixed;
  z-index: 11; /* 所持ピッカー(10)の上に重ねる */
}

.sheet {
  background: var(--surface);
  box-shadow: var(--shadow-sheet);
  display: flex;
  flex-direction: column;
  height: 100dvh;
  outline: none;
  overflow: hidden;
  width: 100%;
}

@media (min-width: 48rem) {
  .overlay {
    align-items: center;
    display: flex;
    justify-content: center;
    padding: 24px;
  }

  .sheet {
    border-radius: var(--r-m);
    height: min(85dvh, 46rem);
    max-width: 46rem;
  }
}

/* ページヘッダ・ピッカーと同寸法(77px) */
.sheet-head {
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  justify-content: space-between;
  padding: 16px;
}

.sheet-head h3 {
  font-size: 24px;
  font-weight: 900;
  line-height: 1.35;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding: 16px;
}

.who-row {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.who {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ボードの色: 排他 4 択のセグメンテッドコントロール(ピッカーと同形。選択色は意味色でなく濃色地) */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  flex-shrink: 0;
  grid-template-columns: repeat(4, 44px);
  overflow: hidden;
}

.seg {
  background: var(--surface);
  border: none;
  border-left: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 40px;
  padding: 0;
}

.seg:first-child {
  border-left: none;
}

.seg.active {
  background: var(--primary);
  color: #fff;
}

.seg:disabled {
  color: var(--ink-2);
  cursor: not-allowed;
  opacity: 0.4;
}

.board-wrap {
  display: flex;
  justify-content: center;
  margin: 0 -8px; /* 正方格子を 11 列並べるため本文の余白 16px を 8px まで使う */
}

.board {
  display: block;
  max-width: 100%;
  touch-action: manipulation;
  user-select: none;
}

.edge {
  stroke: var(--line);
  stroke-width: 2;
}

.edge.active {
  stroke: var(--board);
}

.anchor rect {
  fill: var(--surface);
  stroke: var(--ink-2);
  stroke-width: 1.5;
}

.anchor .head {
  fill: var(--ink-2);
  stroke: none;
}

.anchor .shoulders {
  fill: var(--ink-2);
}

.node {
  cursor: pointer;
  outline: none;
}

.node .hit {
  fill: transparent;
}

.node circle {
  fill: var(--surface);
  stroke: var(--line);
  stroke-width: 1.5;
}

.node text {
  fill: var(--ink-2);
  font-size: 12px;
  font-weight: 700;
  pointer-events: none;
  text-anchor: middle;
}

.node text.small {
  font-size: 9px;
}

.node.large text {
  font-size: 15px;
}

.node.large text.small {
  font-size: 12px;
}

.node.unlocked circle {
  fill: var(--board);
  stroke: var(--board);
}

.node.unlocked text {
  fill: var(--board-ink);
}

.node:active circle {
  opacity: 0.7;
}

.node:focus-visible circle {
  stroke: var(--board);
  stroke-width: 3;
}

.bulk-row {
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
}

.secondary-button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  padding: 0 16px;
}

.secondary-button:active {
  background: var(--bg);
}

.effect-table {
  border-collapse: collapse;
  width: 100%;
}

.effect-table th,
.effect-table td {
  border-top: 1px solid var(--line);
  font-size: 14px;
  padding: 8px 0;
}

.effect-table tr:first-child th,
.effect-table tr:first-child td {
  border-top: none;
}

.effect-table th {
  color: var(--ink-2);
  font-weight: 600;
  text-align: left;
}

.effect-table .num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.effect-table .sub {
  color: var(--ink-2);
  font-size: 12px;
}
</style>
