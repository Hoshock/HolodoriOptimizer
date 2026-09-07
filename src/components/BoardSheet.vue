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
import {
  affiliationEffectOf,
  GREEN_AFFILIATION_CAP,
  GREEN_BOARD_EDGES,
  GREEN_BOARD_NODE_IDS,
  GREEN_BOARD_NODES,
  GREEN_BOARD_ORIGIN,
  greenBoardEffects,
  greenNodeGlyph,
  greenToggleNode,
} from "../data/greenBoard";
import type { GreenBoardEffect } from "../data/greenBoard";
import { holomenById } from "../data";
import type { ParamKind } from "../data/types";
import type { BoardColor } from "../storage/boards";
import { affiliationName, holomenName } from "../ui/labels";

/**
 * ホロメンボードの入力(ホロメン単位)。ゲーム内のボードと同じ配置でマスを並べ、
 * 自分のボードを見ながら同じマスをタップして写す。連結の制約はツール側が引き受ける:
 * 未解放のマスをタップすると初期地点からの経路もまとめて解放し、解放済みを解除すると
 * その先も解除する。コネクト(人物アイコン)は表示するが入力しない。
 * ボードは赤・青・黄・緑の 4 色(ゲーム内の全体配置の順。赤は上・緑は下・青と黄が左右)で、
 * 今あるのは青と緑 — 赤・黄はタブを disabled で置く(2026-09-07 ユーザー指示)。
 * 青は左右型があり(holomen.json の board.blueSide)、緑は全ホロメン同じ配置
 */
const props = defineProps<{
  holomenId: string;
  /** 解放した青マス */
  nodes: string[];
  /** 解放した緑マス */
  greenNodes: string[];
}>();

const emit = defineEmits<{
  update: [holomenId: string, color: BoardColor, nodes: string[]];
  close: [];
}>();

type BoardTab = "red" | "blue" | "yellow" | "green";
const BOARD_COLORS: { id: BoardTab; label: string; ready: boolean }[] = [
  { id: "red", label: "赤", ready: false },
  { id: "blue", label: "青", ready: true },
  { id: "yellow", label: "黄", ready: false },
  { id: "green", label: "緑", ready: true },
];
const color = ref<BoardColor>("blue");
/** 選んだ色でボード(解放マス・接続線)を描く(トークンは src/style.css。黄は文字を濃色に) */
const boardStyle = computed(() => ({
  "--board": `var(--board-${color.value})`,
  "--board-ink": "#fff",
}));
function selectColor(id: BoardTab): void {
  if (id === "blue" || id === "green") color.value = id;
}

/**
 * 操作モード(2026-09-07 ユーザー指定): 解放 = タップで解放・解除(既定)、説明 = タップしても状態は変えず、
 * そのマスの効果を「すべて解放 / 解除」の行と同じ高さのボックスに出す。説明モードに入った直後は何も選ばず、
 * 直前に選んだマスは色ごとに覚えておく。保存はしない(シートを閉じると消える)
 */
type BoardMode = "unlock" | "describe";
const MODES: { id: BoardMode; label: string }[] = [
  { id: "unlock", label: "解放" },
  { id: "describe", label: "説明" },
];
const mode = ref<BoardMode>("unlock");
const describedNode = ref<Record<BoardColor, string | null>>({ blue: null, green: null });
const describedId = computed(() => describedNode.value[color.value]);
const description = computed(() => (describedId.value ? effectLabel(describedId.value) : ""));

/**
 * 青の左右はホロメンごとの固定データ(holomen.json の board.blueSide — 2026-09-07 ユーザー共有)。
 * 青ボードが全体配置の左にあるホロメンは左型、右にあるホロメンは左右反転で描く。緑は反転しない
 */
const mirrored = computed(
  () => color.value === "blue" && holomenById.get(props.holomenId)?.board.blueSide === "right",
);

/* マス同士を繋ぐ線は縦横とも同じ長さ(正方格子 — 2026-09-06 ユーザー指定)。青は 11 列で 374px(シート幅 390 − 左右 8) */
const CELL = 34;
const RADIUS = 11; /* 大マス(1.5 倍)と隣り合っても繋ぐ線が見える太さを残す */
/** 実機で大きいマスは 1.5 倍 */
const LARGE_RADIUS = RADIUS * 1.5;

interface Cell {
  id: string;
  x: number;
  y: number;
}
/** 色ごとの盤面の定義(マス・通路・接続線・格子の大きさ・座標から行列への写像) */
interface BoardView {
  nodes: readonly { id: string; x: number; y: number; large?: true }[];
  nodeIds: readonly string[];
  anchors: readonly Cell[];
  edges: readonly [string, string][];
  cols: number;
  rows: number;
  col(x: number): number;
  row(y: number): number;
}
const BLUE_VIEW: BoardView = {
  nodes: BLUE_BOARD_NODES,
  nodeIds: BLUE_BOARD_NODE_IDS,
  anchors: [BLUE_BOARD_ORIGIN, BLUE_BOARD_CONNECT],
  edges: BLUE_BOARD_EDGES,
  cols: 11,
  rows: 7,
  /** 左型の x(-10〜0)を列へ。右型は左右反転(初期地点が左端に来る) */
  col: (x) => (mirrored.value ? -x : x + 10),
  /** y は上が正(実機と照合 — 2026-09-06)。行 0 が y=+3 */
  row: (y) => 3 - y,
};
const GREEN_VIEW: BoardView = {
  nodes: GREEN_BOARD_NODES,
  nodeIds: GREEN_BOARD_NODE_IDS,
  anchors: [GREEN_BOARD_ORIGIN],
  edges: GREEN_BOARD_EDGES,
  cols: 7,
  rows: 11,
  /** x は -3〜3 */
  col: (x) => x + 3,
  /** 行 0 が y=0(中心のコネクト)、下へ y=-10 まで */
  row: (y) => -y,
};
const view = computed(() => (color.value === "blue" ? BLUE_VIEW : GREEN_VIEW));
/** 端の大マス(半径 16.5)の輪(線幅 3)が格子の外へ 1〜2px はみ出すので、描画領域に余白を取る(2026-09-07 ユーザー指摘) */
const PAD = 4;
const WIDTH = computed(() => CELL * view.value.cols + PAD * 2);
const HEIGHT = computed(() => CELL * view.value.rows + PAD * 2);

const unlocked = computed(() => new Set(color.value === "blue" ? props.nodes : props.greenNodes));
const unlockedCount = computed(() => unlocked.value.size);
const blueEffects = computed(() => blueBoardEffects(new Set(props.nodes)));
const greenEffects = computed(() => greenBoardEffects(props.holomenId, new Set(props.greenNodes)));

function cx(x: number): number {
  return view.value.col(x) * CELL + CELL / 2;
}
function cy(y: number): number {
  return view.value.row(y) * CELL + CELL / 2;
}

const cells = computed(
  () =>
    new Map<string, Cell>([
      ...view.value.nodes.map((n) => [n.id, { id: n.id, x: n.x, y: n.y }] as const),
      ...view.value.anchors.map((a) => [a.id, a] as const),
    ]),
);

function passable(id: string): boolean {
  return view.value.anchors.some((a) => a.id === id) || unlocked.value.has(id);
}

const edges = computed(() =>
  view.value.edges
    .map(([a, b]) => {
      const ca = cells.value.get(a);
      const cb = cells.value.get(b);
      if (!ca || !cb) return null;
      return {
        key: `${a}-${b}`,
        x1: cx(ca.x),
        y1: cy(ca.y),
        x2: cx(cb.x),
        y2: cy(cb.y),
        active: passable(a) && passable(b) && (unlocked.value.has(a) || unlocked.value.has(b)),
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null),
);

const PARAM_LABELS: Record<ParamKind, string> = {
  performance: "パフォーマンス",
  technique: "テクニック",
  sense: "センス",
};
const PARAMS: ParamKind[] = ["performance", "technique", "sense"];

function greenEffectLabel(e: GreenBoardEffect): string {
  switch (e.kind) {
    case "allParams":
      return `全員の全パラメータ +${String(e.value)}`;
    case "param":
      return `全員の${PARAM_LABELS[e.param]} +${String(e.value)}`;
    case "affiliation": {
      const a = affiliationEffectOf(props.holomenId, e.slot);
      return a
        ? `${affiliationName(a.affiliation)}の全パラメータ +${String(a.value)}`
        : "所属の全パラメータ UP";
    }
    case "reward":
      return `${e.label} +${(e.permil / 10).toFixed(1)}%`;
  }
}

function effectLabel(id: string): string {
  if (color.value === "green") {
    const node = GREEN_BOARD_NODES.find((n) => n.id === id);
    return node ? greenEffectLabel(node.effect) : "";
  }
  const node = BLUE_BOARD_NODES.find((n) => n.id === id);
  if (!node) return "";
  const e = node.effect;
  switch (e.kind) {
    case "allParams":
      return `全パラメータ +${String(e.value)}`;
    case "param":
      return `${PARAM_LABELS[e.param]} +${String(e.value)}`;
    case "paramPercent":
      return `${PARAM_LABELS[e.param]} +${e.percent.toFixed(1)}%`;
    case "activeRate":
      return `アクティブスキル発動率 +${String(e.percent)}%`;
    case "activeFrequency":
      return `アクティブスキル発動頻度 +${String(e.percent)}%`;
  }
}

/** マス内の記号(青: A/P/T/S/率/頻、緑: A/P/T/S/グ/酬) */
function glyph(id: string): string {
  if (color.value === "green") {
    const node = GREEN_BOARD_NODES.find((n) => n.id === id);
    return node ? greenNodeGlyph(node.effect) : "";
  }
  const node = BLUE_BOARD_NODES.find((n) => n.id === id);
  return node ? nodeGlyph(node.effect) : "";
}

function onNode(id: string): void {
  if (mode.value === "describe") {
    describedNode.value[color.value] = id;
    return;
  }
  const next =
    color.value === "blue" ? toggleNode(unlocked.value, id) : greenToggleNode(unlocked.value, id);
  emit("update", props.holomenId, color.value, [...next]);
}
function unlockAll(): void {
  emit("update", props.holomenId, color.value, [...view.value.nodeIds]);
}
function lockAll(): void {
  emit("update", props.holomenId, color.value, []);
}

/** 青の効果表の行: 固定値(+ 割合の括弧補足) */
function blueParamRow(p: ParamKind): { fixed: string; percent: string | null } {
  const e = blueEffects.value;
  const fixed = e.allParams + e.params[p];
  return {
    fixed: `+${fixed.toLocaleString("ja-JP")}`,
    percent: e.percents[p] > 0 ? `+${e.percents[p].toFixed(1)}%` : null,
  };
}
/** 緑の効果表: 全員の P/T/S(全パラ + 個別) */
function greenParamRow(p: ParamKind): string {
  const e = greenEffects.value;
  return `+${(e.allParams + e.params[p]).toLocaleString("ja-JP")}`;
}
/** 緑の効果表: 所属向け(このホロメンのボードが効く所属ごと、マスの順で固定。フブキは 2 行) */
const greenAffiliationRows = computed(() => {
  const seen = new Map<string, number>();
  for (const slot of [0, 1, 2] as const) {
    const a = affiliationEffectOf(props.holomenId, slot);
    if (a && !seen.has(a.affiliation))
      seen.set(a.affiliation, greenEffects.value.byAffiliation[a.affiliation] ?? 0);
  }
  return [...seen.entries()].map(([affiliation, value]) => ({
    label: `${affiliationName(affiliation)}の全パラメータ`,
    value: `+${value.toLocaleString("ja-JP")}`,
  }));
});
/** 緑の効果表: 報酬・獲得量 UP。行はマスの順で固定し、未解放でも +0.0% で常に出す(解放順で並びが変わらない — 2026-09-07 ユーザー指摘) */
const greenRewardRows = computed(() =>
  GREEN_BOARD_NODES.flatMap((n) =>
    n.effect.kind === "reward"
      ? [
          {
            label: n.effect.label,
            value: `+${((greenEffects.value.rewards[n.effect.label] ?? 0) / 10).toFixed(1)}%`,
          },
        ]
      : [],
  ),
);

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
        <!-- 名前は 1 行を使う(長い名前が省略されないように — 2026-09-07 ユーザー指示)。色と操作モードはその下の行 -->
        <p class="who">{{ holomenName(props.holomenId) }}</p>
        <div class="controls-row">
          <!-- 左: ボードの色。左から赤・青・黄・緑(ゲーム内の順)。用意できていない色は disabled -->
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
              @click="selectColor(c.id)"
            >
              {{ c.label }}
            </button>
          </div>
          <!-- 右: 操作モード(解放 / 説明) -->
          <div class="segment mode-segment" role="radiogroup" aria-label="操作">
            <button
              v-for="m in MODES"
              :key="m.id"
              type="button"
              class="seg"
              role="radio"
              :aria-checked="mode === m.id"
              :class="{ active: mode === m.id }"
              @click="mode = m.id"
            >
              {{ m.label }}
            </button>
          </div>
        </div>

        <div class="board-wrap" :style="boardStyle">
          <svg
            class="board"
            :viewBox="`${String(-PAD)} ${String(-PAD)} ${String(WIDTH)} ${String(HEIGHT)}`"
            :width="WIDTH"
            :height="HEIGHT"
            role="group"
            :aria-label="`解放 ${String(unlockedCount)} / ${String(view.nodeIds.length)} マス`"
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
            <!-- 中心のコネクトと青のコネクトマス(丸角の四角の人物アイコン)。表示のみ -->
            <g
              v-for="c in view.anchors"
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
              v-for="n in view.nodes"
              :key="n.id"
              class="node"
              :class="{
                unlocked: unlocked.has(n.id),
                large: n.large,
                selected: mode === 'describe' && describedId === n.id,
              }"
              role="button"
              tabindex="0"
              :aria-pressed="unlocked.has(n.id)"
              :aria-label="effectLabel(n.id)"
              :transform="`translate(${String(cx(n.x))} ${String(cy(n.y))})`"
              @click="onNode(n.id)"
              @keydown.enter.prevent="onNode(n.id)"
              @keydown.space.prevent="onNode(n.id)"
            >
              <rect class="hit" :x="-CELL / 2" :y="-CELL / 2" :width="CELL" :height="CELL" />
              <circle :r="n.large ? LARGE_RADIUS : RADIUS" />
              <text :class="{ small: glyph(n.id).length > 1 }" dy="0.35em">
                {{ glyph(n.id) }}
              </text>
            </g>
          </svg>
        </div>

        <!-- 解放モード: すべて解放 / 解除。説明モード: 同じ高さのボックスに選んだマスの効果(他の位置がずれない) -->
        <div v-if="mode === 'unlock'" class="bulk-row">
          <button type="button" class="secondary-button" @click="unlockAll">すべて解放</button>
          <button type="button" class="secondary-button" @click="lockAll">すべて解除</button>
        </div>
        <p v-else class="describe-box" :class="{ empty: description === '' }" aria-live="polite">
          {{ description }}
        </p>

        <table v-if="color === 'blue'" class="effect-table">
          <tbody>
            <tr v-for="p in PARAMS" :key="p">
              <th scope="row">{{ PARAM_LABELS[p] }}</th>
              <td class="num">
                {{ blueParamRow(p).fixed
                }}<span v-if="blueParamRow(p).percent" class="sub"
                  >（{{ blueParamRow(p).percent }}）</span
                >
              </td>
            </tr>
            <tr>
              <th scope="row">アクティブスキル発動率</th>
              <td class="num">+{{ blueEffects.activeRatePercent }}%</td>
            </tr>
            <tr>
              <th scope="row">アクティブスキル発動頻度</th>
              <td class="num">+{{ blueEffects.activeFrequencyPercent }}%</td>
            </tr>
          </tbody>
        </table>
        <table v-else class="effect-table">
          <tbody>
            <tr v-for="p in PARAMS" :key="p">
              <th scope="row">全員の{{ PARAM_LABELS[p] }}</th>
              <td class="num">{{ greenParamRow(p) }}</td>
            </tr>
            <tr v-for="r in greenAffiliationRows" :key="r.label">
              <th scope="row">{{ r.label }}</th>
              <td class="num">{{ r.value }}</td>
            </tr>
            <tr v-for="r in greenRewardRows" :key="r.label">
              <th scope="row">{{ r.label }}</th>
              <td class="num">{{ r.value }}</td>
            </tr>
          </tbody>
        </table>

        <div class="footnotes">
          <p>
            <span class="fn-num">※</span>
            <span>
              ホロメンボードの効果はマスの表記値の合計で試算します。コネクトマスによる増幅は含みません。青の発動率・発動頻度の反映は仮定の式です。緑は登録した全ホロメン分の合計が全カードに効き、所属向けの効果は
              1 枚あたり +{{ GREEN_AFFILIATION_CAP.toLocaleString("ja-JP") }} が上限です。
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

/* body は縦 flex + overflow auto なので、overflow hidden の子は縮んで高さ 0 になる — 縮ませない */
.who {
  flex-shrink: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 左に色の 4 択、右に操作モードの 2 択(同じ行、間を開ける) */
.controls-row {
  align-items: center;
  display: flex;
  flex-shrink: 0;
  gap: 16px;
  justify-content: space-between;
  margin-top: -6px; /* 名前との間隔を詰める(body の gap 16px → 10px) */
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

.mode-segment {
  grid-template-columns: repeat(2, 56px);
}

.seg:disabled {
  color: var(--ink-2);
  cursor: not-allowed;
  opacity: 0.4;
}

.board-wrap {
  display: flex;
  justify-content: center;
  margin: 0 -12px; /* 正方格子 11 列(374px)+ 余白 4px × 2 を並べるため本文の余白 16px を 4px まで使う */
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

/* 説明モードで選んだマスの輪。未解放・解放済みで同じ色(2026-09-07 ユーザー指摘) */
.node:focus-visible circle,
.node.selected circle {
  stroke: var(--ink);
  stroke-width: 3;
}

.bulk-row {
  display: grid;
  flex-shrink: 0;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
}

/* 説明モードのボックス。すべて解放 / 解除のボタンと同じ高さ(44px)で、切り替えても下が動かない */
.describe-box {
  align-items: center;
  flex-shrink: 0;
  justify-content: center;
  text-align: center;
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  display: flex;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  margin: 0;
  overflow: hidden;
  padding: 0 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.describe-box.empty {
  border-style: dashed;
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
