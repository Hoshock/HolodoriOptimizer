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
import {
  isYellowLeft,
  YELLOW_BOARD_CONNECT,
  YELLOW_BOARD_EDGES,
  YELLOW_BOARD_NODE_IDS,
  YELLOW_BOARD_NODES,
  YELLOW_BOARD_ORIGIN,
  YELLOW_SONG_SCOPES,
  YELLOW_WORK_LABELS,
  YELLOW_WORK_REWARDS,
  yellowBoardEffects,
  yellowEffectLabel,
  yellowNodeGlyph,
  yellowSongScopeLabel,
  yellowToggleNode,
} from "../data/yellowBoard";
import { holomenById } from "../data";
import { formatBoardPercent, formatBoardPermil } from "../data/boardGraph";
import {
  isRedMirrored,
  RED_BOARD_CONNECT,
  RED_BOARD_EDGES,
  RED_BOARD_NODE_IDS,
  RED_BOARD_NODES,
  RED_BOARD_ORIGIN,
  RED_REWARD_LABELS,
  redBoardEffects,
  redEffectLabel,
  redNodeById,
  redNodeGlyph,
  redReachableNodes,
  redToggleNode,
  redUnlockNode,
} from "../data/redBoard";
import type { RedBoardArea } from "../data/redBoard";
import type { ParamKind } from "../data/types";
import type { BoardColor } from "../storage/boards";
import { affiliationName, holomenName } from "../ui/labels";

/**
 * ホロメンボードの入力(ホロメン単位)。ゲーム内のボードと同じ配置でマスを並べ、
 * 自分のボードを見ながら同じマスをタップして写す。連結の制約はツール側が引き受ける:
 * 未解放のマスをタップすると初期地点からの経路もまとめて解放し、解放済みを解除すると
 * その先も解除する。コネクト(人物アイコン)は表示するが入力しない。
 * ボードは赤・青・黄・緑の 4 色(ゲーム内の全体配置の順。赤は上・緑は下・青と黄が左右 — 2026-09-08 に 4 色そろった)。
 * 青は左右型があり(holomen.json の board.blueSide)、黄はその反対側(青が右なら左型)、緑は全ホロメン同じ配置。
 * 赤は 63 マスで横幅も広いので、左 / 上 / 右の 3 エリア(上 = 幹と最上部の格子、左右 = ライフ系とステータス系。どちらが
 * 左かは board.lifeSide)に分けて描く。エリアの切替に別のトグルやスワイプは置かず、枝が画面の外へ続く位置に「◀左 / ▲上 / 右▶」の
 * 出口を描いてそれをタップする(接続線も出口まで引く — 2026-09-08 ユーザー指示「別トグルを用意したくない。スワイプは嫌。名前は左上右」)。
 * 解放のグラフは 1 つで、エリアは表示の分類
 */
const props = defineProps<{
  holomenId: string;
  /** 解放した赤マス */
  redNodes: string[];
  /** 解放した青マス */
  nodes: string[];
  /** 解放した黄マス */
  yellowNodes: string[];
  /** 解放した緑マス */
  greenNodes: string[];
}>();

const emit = defineEmits<{
  update: [holomenId: string, color: BoardColor, nodes: string[]];
  close: [];
}>();

const BOARD_COLORS: { id: BoardColor; label: string }[] = [
  { id: "red", label: "赤" },
  { id: "blue", label: "青" },
  { id: "yellow", label: "黄" },
  { id: "green", label: "緑" },
];
const color = ref<BoardColor>("blue");
/** 選んだ色でボード(解放マス・接続線)を描く(トークンは src/style.css。黄は文字を濃色に) */
const boardStyle = computed(() => ({
  "--board": `var(--board-${color.value})`,
  "--board-ink": color.value === "yellow" ? "var(--board-yellow-ink)" : "#fff",
}));
function selectColor(id: BoardColor): void {
  color.value = id;
}
/** 赤の表示エリア(上 / ライフ系 / ステータス系)。シートを開いている間だけ覚える */
const area = ref<RedBoardArea>("upper");

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
const describedNode = ref<Record<BoardColor, string | null>>({
  red: null,
  blue: null,
  yellow: null,
  green: null,
});
const describedId = computed(() => describedNode.value[color.value]);
const description = computed(() => (describedId.value ? effectLabel(describedId.value) : ""));
/** 盤面のマス以外(背景・線・コネクト)をタップしたら選択を外す */
function onBoardBackground(event: MouseEvent): void {
  if (mode.value !== "describe") return;
  if ((event.target as Element | null)?.closest(".node")) return;
  describedNode.value[color.value] = null;
}

/**
 * 青の左右はホロメンごとの固定データ(holomen.json の board.blueSide — 2026-09-07 ユーザー共有)。
 * 青ボードが全体配置の左にあるホロメンは左型、右にあるホロメンは左右反転で描く。
 * 黄は青の反対側なので、青が右のホロメンは黄が左型(右型の座標を x 反転)。緑は反転しない
 */
const mirrored = computed(
  () => color.value === "blue" && holomenById.get(props.holomenId)?.board.blueSide === "right",
);
const yellowLeft = computed(() => isYellowLeft(props.holomenId));
/** 赤はライフ系エリアが右のホロメンで全体を x 反転(基準はライフ系が左) */
const redMirrored = computed(() => isRedMirrored(props.holomenId));

/* マス同士を繋ぐ線は縦横とも同じ長さ(正方格子 — 2026-09-06 ユーザー指定)。青は 11 列で 374px(シート幅 390 − 左右 8) */
const BASE_CELL = 34;
/**
 * 赤のステータス系エリアだけ 40px: 大マス(半径 16.5)同士が隣り合う組(R-043–R-044、R-048–R-062、R-039–R-063)がここにだけあり、
 * 34px では繋ぐ線が 1px しか見えない(2026-09-08 ユーザー指摘「大マスが隣り合う時接続線が狭すぎる」。ほかのエリアは他の色と同じ)。
 * 11 列 440px は SVG ごと幅に合わせて縮む(max-width: 100% + height: auto)
 */
const RED_STATS_CELL = 40;
const CELL = computed(() =>
  color.value === "red" && area.value === "stats" ? RED_STATS_CELL : BASE_CELL,
);
const RADIUS = 11; /* 大マス(1.5 倍)と隣り合っても繋ぐ線が見える太さを残す */
/** 実機で大きいマスは 1.5 倍 */
const LARGE_RADIUS = RADIUS * 1.5;

interface Cell {
  id: string;
  x: number;
  y: number;
}
/**
 * ほかのエリアへの出口(赤)。枝が画面の外へ続く位置に置き、id は画面の外の最初のマス(接続線がそこまで引かれ、
 * そのマスが解放済みなら線に色がつく)
 */
interface AreaExit extends Cell {
  area: RedBoardArea;
}
/** 色ごとの盤面の定義(マス・通路・接続線・格子の大きさ・座標から行列への写像) */
interface BoardView {
  nodes: readonly { id: string; x: number; y: number; large?: true }[];
  nodeIds: readonly string[];
  anchors: readonly Cell[];
  exits?: readonly AreaExit[];
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
const YELLOW_VIEW: BoardView = {
  nodes: YELLOW_BOARD_NODES,
  nodeIds: YELLOW_BOARD_NODE_IDS,
  anchors: [YELLOW_BOARD_ORIGIN, YELLOW_BOARD_CONNECT],
  edges: YELLOW_BOARD_EDGES,
  cols: 11,
  rows: 7,
  /** 右型の x(0〜10)を列へ(中心が左端)。左型は左右反転(中心が右端に来る) */
  col: (x) => (yellowLeft.value ? 10 - x : x),
  row: (y) => 3 - y,
};
/**
 * 赤の 3 エリア。マスはそのエリアのものだけ描き、C の真上の R-021(上エリア)はライフ系・ステータス系の y = 8 の列の起点なので
 * その 2 つにも描く。接続線は両端が描かれているものだけ(出口を含む)。解放・「すべて解放」の対象(nodeIds)は 63 マス全部。
 * 座標は lifeSide = left 基準で、ライフ系が右のホロメンは col で x 反転する
 */
const redAreaNodes = (a: RedBoardArea) =>
  RED_BOARD_NODES.filter((n) => n.area === a || (a !== "upper" && n.id === "R-021"));
/** 出口: ライフ系の枝の最初のマス R-009 (-1, 7)、ステータス系の R-019 (1, 7)、上の格子の R-049 (0, 9) */
const EXIT_LIFE: AreaExit = { id: "R-009", x: -1, y: 7, area: "life" };
const EXIT_STATS: AreaExit = { id: "R-019", x: 1, y: 7, area: "stats" };
const EXIT_UPPER: AreaExit = { id: "R-049", x: 0, y: 9, area: "upper" };
const RED_VIEWS: Record<RedBoardArea, BoardView> = {
  upper: {
    nodes: redAreaNodes("upper"),
    nodeIds: RED_BOARD_NODE_IDS,
    anchors: [RED_BOARD_ORIGIN, RED_BOARD_CONNECT],
    exits: [EXIT_LIFE, EXIT_STATS],
    edges: RED_BOARD_EDGES,
    cols: 5,
    rows: 15,
    /** x は -2〜2 */
    col: (x) => (redMirrored.value ? 2 - x : x + 2),
    /** 行 0 が y=14(最上部)、行 14 が y=0(中心) */
    row: (y) => 14 - y,
  },
  life: {
    nodes: redAreaNodes("life"),
    nodeIds: RED_BOARD_NODE_IDS,
    anchors: [RED_BOARD_CONNECT],
    exits: [EXIT_UPPER, EXIT_STATS],
    edges: RED_BOARD_EDGES,
    cols: 8,
    rows: 6,
    /** 基準(ライフ系が左)では x = -6〜1(右端の 1 列は右への出口)で C が右から 2 列目 */
    col: (x) => (redMirrored.value ? 1 - x : x + 6),
    row: (y) => 10 - y,
  },
  stats: {
    nodes: redAreaNodes("stats"),
    nodeIds: RED_BOARD_NODE_IDS,
    anchors: [RED_BOARD_CONNECT],
    exits: [EXIT_UPPER, EXIT_LIFE],
    edges: RED_BOARD_EDGES,
    cols: 11,
    rows: 5,
    /** 基準では x = -1〜9(左端の 1 列は左への出口)で C が左から 2 列目 */
    col: (x) => (redMirrored.value ? 9 - x : x + 1),
    row: (y) => 10 - y,
  },
};
const VIEWS: Record<Exclude<BoardColor, "red">, BoardView> = {
  blue: BLUE_VIEW,
  yellow: YELLOW_VIEW,
  green: GREEN_VIEW,
};
const view = computed(() => (color.value === "red" ? RED_VIEWS[area.value] : VIEWS[color.value]));
/** 端の大マス(半径 16.5)の輪(線幅 3)が格子の外へ 1〜2px はみ出すので、描画領域に余白を取る(2026-09-07 ユーザー指摘) */
const PAD = 4;
const WIDTH = computed(() => CELL.value * view.value.cols + PAD * 2);
const HEIGHT = computed(() => CELL.value * view.value.rows + PAD * 2);

const nodesByColor = computed<Record<BoardColor, string[]>>(() => ({
  red: props.redNodes,
  blue: props.nodes,
  yellow: props.yellowNodes,
  green: props.greenNodes,
}));
const unlocked = computed(() => new Set(nodesByColor.value[color.value]));
const unlockedCount = computed(() => unlocked.value.size);
const redEffects = computed(() => redBoardEffects(new Set(props.redNodes)));
const blueEffects = computed(() => blueBoardEffects(new Set(props.nodes)));
const yellowEffects = computed(() => yellowBoardEffects(new Set(props.yellowNodes)));
const greenEffects = computed(() => greenBoardEffects(props.holomenId, new Set(props.greenNodes)));

function cx(x: number): number {
  return view.value.col(x) * CELL.value + CELL.value / 2;
}
function cy(y: number): number {
  return view.value.row(y) * CELL.value + CELL.value / 2;
}

const cells = computed(
  () =>
    new Map<string, Cell>([
      ...view.value.nodes.map((n) => [n.id, { id: n.id, x: n.x, y: n.y }] as const),
      ...view.value.anchors.map((a) => [a.id, a] as const),
      ...(view.value.exits ?? []).map((e) => [e.id, e] as const),
    ]),
);
/**
 * 出口の表記(物理的な方向で 左 / 上 / 右 — 2026-09-08 ユーザー指定)。ライフ系が右のホロメンでは左右が入れ替わる。
 * 三角は出口の向き
 */
function exitLabel(e: AreaExit): { arrow: "left" | "right" | "up"; text: string } {
  if (e.area === "upper") return { arrow: "up", text: "上" };
  const left = (e.area === "life") !== redMirrored.value;
  return left ? { arrow: "left", text: "左" } : { arrow: "right", text: "右" };
}
const EXIT_ARROWS: Record<"left" | "right" | "up", string> = {
  left: "M-3 0l5-4v8z",
  right: "M3 0l-5-4v8z",
  up: "M0-3l-4 5h8z",
};

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
      return `${e.label} ${formatBoardPermil(e.permil)}`;
  }
}

function effectLabel(id: string): string {
  if (color.value === "red") {
    const node = redNodeById(id);
    return node ? redEffectLabel(node.effect) : "";
  }
  if (color.value === "green") {
    const node = GREEN_BOARD_NODES.find((n) => n.id === id);
    return node ? greenEffectLabel(node.effect) : "";
  }
  if (color.value === "yellow") {
    const node = YELLOW_BOARD_NODES.find((n) => n.id === id);
    return node ? yellowEffectLabel(props.holomenId, node.effect) : "";
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
      return `${PARAM_LABELS[e.param]} ${formatBoardPercent(e.percent)}`;
    case "activeRate":
      return `アクティブスキル発動率 ${formatBoardPercent(e.percent)}`;
    case "activeFrequency":
      return `アクティブスキル発動頻度 ${formatBoardPercent(e.percent)}`;
  }
}

/** マス内の記号(赤: A/P/T/S/支/命/判/回/経/金、青: A/P/T/S/率/頻、黄: ソ/ユ/全/レ/キ/特、緑: A/P/T/S/ユ/酬) */
function glyph(id: string): string {
  if (color.value === "red") {
    const node = redNodeById(id);
    return node ? redNodeGlyph(node.effect) : "";
  }
  if (color.value === "green") {
    const node = GREEN_BOARD_NODES.find((n) => n.id === id);
    return node ? greenNodeGlyph(node.effect) : "";
  }
  if (color.value === "yellow") {
    const node = YELLOW_BOARD_NODES.find((n) => n.id === id);
    return node ? yellowNodeGlyph(node.effect) : "";
  }
  const node = BLUE_BOARD_NODES.find((n) => n.id === id);
  return node ? nodeGlyph(node.effect) : "";
}

function onNode(id: string): void {
  if (mode.value === "describe") {
    describedNode.value[color.value] = id;
    return;
  }
  const toggles: Record<BoardColor, typeof toggleNode> = {
    red: redToggleNode,
    blue: toggleNode,
    yellow: yellowToggleNode,
    green: greenToggleNode,
  };
  const next = toggles[color.value](unlocked.value, id);
  emit("update", props.holomenId, color.value, [...next]);
}
/**
 * すべて解放 / 解除。赤は表示中のエリアのマスだけが対象(2026-09-08 ユーザー指示)— 解放は中心からの経路(幹)もまとめて
 * 解放し、解除はそのエリアを外して切り離されるマスも解除する(上エリアの幹を外せば左右も切れる)
 */
function unlockAll(): void {
  if (color.value === "red") {
    let next: ReadonlySet<string> = unlocked.value;
    for (const n of RED_BOARD_NODES) if (n.area === area.value) next = redUnlockNode(next, n.id);
    emit("update", props.holomenId, color.value, [...next]);
    return;
  }
  emit("update", props.holomenId, color.value, [...view.value.nodeIds]);
}
function lockAll(): void {
  if (color.value === "red") {
    const next = new Set(unlocked.value);
    for (const n of RED_BOARD_NODES) if (n.area === area.value) next.delete(n.id);
    emit("update", props.holomenId, color.value, [...redReachableNodes(next)]);
    return;
  }
  emit("update", props.holomenId, color.value, []);
}

/** 青の効果表の行: 固定値(+ 割合の括弧補足)。割合は全色ともゲーム内どおり小数第 1 位まで(formatBoardPercent) */
function blueParamRow(p: ParamKind): { fixed: string; percent: string | null } {
  const e = blueEffects.value;
  const fixed = e.allParams + e.params[p];
  return {
    fixed: `+${fixed.toLocaleString("ja-JP")}`,
    percent: e.percents[p] > 0 ? formatBoardPercent(e.percents[p]) : null,
  };
}
/**
 * 赤の効果表: 全員(メンバー 5 人)の P/T/S は固定値(+ 割合の括弧補足)、歌唱者条件の割合、スコアサポート、ライフ、
 * ホロメンスキル、ライブ報酬を固定順で常に出す(解放順で並びが変わらない)
 */
const redParamRow = (p: ParamKind): { fixed: string; percent: string | null } => {
  const e = redEffects.value;
  const percent = e.allPercent + e.percents[p];
  return {
    fixed: `+${(e.allParams + e.params[p]).toLocaleString("ja-JP")}`,
    percent: percent > 0 ? formatBoardPercent(percent) : null,
  };
};
const redRows = computed(() => {
  const e = redEffects.value;
  const skillLabel = (stage: "none" | "learned" | "upgraded" | boolean): string => {
    if (stage === "upgraded") return "強化";
    if (stage === "learned" || stage === true) return "習得";
    return "なし";
  };
  return [
    ...PARAMS.map((p) => ({
      label: `歌唱者条件の${PARAM_LABELS[p]}`,
      value: formatBoardPercent(e.singerPercents[p]),
    })),
    { label: "全員のスコアサポート効果", value: formatBoardPercent(e.scoreSupportPercent) },
    {
      label: "歌唱者条件のスコアサポート効果",
      value: formatBoardPercent(e.singerScoreSupportPercent),
    },
    { label: "ライフ", value: `+${e.life.toLocaleString("ja-JP")}` },
    { label: "判定強化のホロメンスキル", value: skillLabel(e.judgement) },
    { label: "ライフ回復のホロメンスキル", value: skillLabel(e.lifeRecovery) },
    { label: RED_REWARD_LABELS.memberExp, value: formatBoardPercent(e.rewards.memberExp) },
    { label: RED_REWARD_LABELS.gold, value: formatBoardPercent(e.rewards.gold) },
  ];
});
/** 黄の効果表: 楽曲のスコアボーナス 3 行 + ホロワーク 3 行を固定順で常に出す(ソロの見出しはフワワ・モココで変わる) */
const yellowRows = computed(() => [
  ...YELLOW_SONG_SCOPES.map((scope) => ({
    label: `${yellowSongScopeLabel(props.holomenId, scope)}のスコアボーナス`,
    value: formatBoardPermil(yellowEffects.value.song[scope]),
  })),
  ...YELLOW_WORK_REWARDS.map((reward) => ({
    label: `ホロワークの${YELLOW_WORK_LABELS[reward]}`,
    value: formatBoardPermil(yellowEffects.value.work[reward]),
  })),
]);
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
            value: formatBoardPermil(greenEffects.value.rewards[n.effect.label] ?? 0),
          },
        ]
      : [],
  ),
);

const sheet = useTemplateRef("sheet");
const body = useTemplateRef<HTMLDivElement>("body");
/** 出口でエリアを移ったらスクロールを一番上に戻す(2026-09-08 ユーザー指示) */
function goToArea(a: RedBoardArea): void {
  area.value = a;
  body.value?.scrollTo({ top: 0 });
}
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

      <div ref="body" class="body">
        <!-- 名前は 1 行を使う(長い名前が省略されないように — 2026-09-07 ユーザー指示)。色と操作モードはその下の行 -->
        <p class="who">{{ holomenName(props.holomenId) }}</p>
        <div class="controls-row">
          <!-- 左: ボードの色。左から赤・青・黄・緑(ゲーム内の順) -->
          <div class="segment" role="radiogroup" aria-label="ボードの色">
            <button
              v-for="c in BOARD_COLORS"
              :key="c.id"
              type="button"
              class="seg"
              role="radio"
              :aria-checked="color === c.id"
              :class="{ active: color === c.id }"
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
            @click="onBoardBackground"
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
            <!-- 中心のコネクトと青・黄のコネクトマス(丸角の四角の人物アイコン)。表示のみ -->
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
            <!-- 赤: ほかのエリアへの出口(枝が画面の外へ続く位置。左 / 上 / 右)。タップでそのエリアへ -->
            <g
              v-for="e in view.exits ?? []"
              :key="`exit-${e.id}`"
              class="exit"
              role="button"
              tabindex="0"
              :aria-label="`${exitLabel(e).text}のエリアへ`"
              :transform="`translate(${String(cx(e.x))} ${String(cy(e.y))})`"
              @click="goToArea(e.area)"
              @keydown.enter.prevent="goToArea(e.area)"
              @keydown.space.prevent="goToArea(e.area)"
            >
              <rect x="-16" y="-12" width="32" height="24" rx="6" />
              <path
                :d="EXIT_ARROWS[exitLabel(e).arrow]"
                :transform="
                  exitLabel(e).arrow === 'left'
                    ? 'translate(-7 0)'
                    : exitLabel(e).arrow === 'right'
                      ? 'translate(7 0)'
                      : 'translate(-7 0)'
                "
              />
              <text
                :x="exitLabel(e).arrow === 'left' ? 5 : exitLabel(e).arrow === 'right' ? -5 : 5"
                dy="0.35em"
              >
                {{ exitLabel(e).text }}
              </text>
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
        <!-- ボタンに見えないよう枠線なしの淡色の帯にし、選んだマスと同じ見た目の小さな丸(記号つき)を文言の前に置く -->
        <p v-else class="describe-box" :style="boardStyle" aria-live="polite">
          <template v-if="describedId">
            <span class="describe-node" :class="{ unlocked: unlocked.has(describedId) }">{{
              glyph(describedId)
            }}</span>
            <span>{{ description }}</span>
          </template>
        </p>

        <table v-if="color === 'red'" class="effect-table">
          <tbody>
            <tr v-for="p in PARAMS" :key="p">
              <th scope="row">全員の{{ PARAM_LABELS[p] }}</th>
              <td class="num">
                {{ redParamRow(p).fixed
                }}<span v-if="redParamRow(p).percent" class="sub"
                  >（{{ redParamRow(p).percent }}）</span
                >
              </td>
            </tr>
            <tr v-for="r in redRows" :key="r.label">
              <th scope="row">{{ r.label }}</th>
              <td class="num">{{ r.value }}</td>
            </tr>
          </tbody>
        </table>
        <table v-else-if="color === 'blue'" class="effect-table">
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
              <td class="num">{{ formatBoardPercent(blueEffects.activeRatePercent) }}</td>
            </tr>
            <tr>
              <th scope="row">アクティブスキル発動頻度</th>
              <td class="num">{{ formatBoardPercent(blueEffects.activeFrequencyPercent) }}</td>
            </tr>
          </tbody>
        </table>
        <table v-else-if="color === 'yellow'" class="effect-table">
          <tbody>
            <tr v-for="r in yellowRows" :key="r.label">
              <th scope="row">{{ r.label }}</th>
              <td class="num">{{ r.value }}</td>
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
              1 枚あたり +{{ GREEN_AFFILIATION_CAP.toLocaleString("ja-JP") }}
              が上限です。黄の楽曲スコアボーナスは曲を指定したときに全ホロメン分の合計（上限
              10.0%）が総合期待スコアに掛かり、ホロワークの報酬は表示のみです。赤はそのホロメンをリーダーにした編成のメンバー
              5 人に効き、全員の P/T/S
              の固定値と割合を試算に足します（歌唱者条件は曲を指定し、リーダーのホロメンがその曲の歌唱者に含まれるとき）。スコアサポート効果・ライフ・ホロメンスキル・ライブ報酬は表示のみです。
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

.board-wrap {
  display: flex;
  justify-content: center;
  margin: 0 -12px; /* 正方格子 11 列(374px)+ 余白 4px × 2 を並べるため本文の余白 16px を 4px まで使う */
}

.board {
  display: block;
  height: auto; /* 幅に合わせて縮むとき縦横比を保つ(赤の右側のエリアは 11 列で幅を超える) */
  max-width: 100%;
  touch-action: manipulation;
  user-select: none;
}

/* ほかのエリアへの出口(赤): コネクトの人物アイコンと同じ描き方(淡い枠の丸角四角)に三角と 左 / 上 / 右 */
.exit {
  cursor: pointer;
  outline: none;
}

.exit rect {
  fill: var(--surface);
  stroke: var(--ink-2);
  stroke-width: 1.5;
}

.exit path {
  fill: var(--ink-2);
}

.exit text {
  fill: var(--ink-2);
  font-size: 11px;
  font-weight: 700;
  pointer-events: none;
  text-anchor: middle;
}

.exit:focus-visible rect {
  stroke: var(--ink);
  stroke-width: 3;
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

/* 説明モードの帯。すべて解放 / 解除のボタンと同じ高さ(44px)で、切り替えても下が動かない。枠線なしの淡色地でボタンと区別する。
   黄の文言(「FUWAMOCO のみの楽曲のスコアボーナス +2.0%」など)は 1 行に収まらないので 13px で 2 行まで折り返す */
.describe-box {
  align-items: center;
  background: var(--bg);
  border-radius: var(--r-m);
  display: flex;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  gap: 10px;
  height: 44px;
  justify-content: center;
  line-height: 1.25;
  margin: 0;
  overflow: hidden;
  padding: 0 12px;
  text-align: center;
}

/* 選んだマスの縮小(記号入りの丸。解放済みならボードの色) */
.describe-node {
  align-items: center;
  border: 1.5px solid var(--line);
  border-radius: 50%;
  color: var(--ink-2);
  display: inline-flex;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  height: 24px;
  justify-content: center;
  width: 24px;
}

.describe-node.unlocked {
  background: var(--board);
  border-color: var(--board);
  color: var(--board-ink);
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
  white-space: nowrap; /* 「+1,110（+8.0%）」が値の途中で折れないように(赤 — 2026-09-08) */
}

.effect-table .sub {
  color: var(--ink-2);
  font-size: 12px;
}
</style>
