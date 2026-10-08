<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, useTemplateRef } from "vue";

import CloseButton from "./CloseButton.vue";
import InfoButton from "./InfoButton.vue";
import InfoDialog from "./InfoDialog.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import NoticeDialog from "./NoticeDialog.vue";
import { useModalChrome } from "../composables/useModalChrome";
import {
  BLUE_BOARD_CONNECT,
  BLUE_BOARD_EDGES,
  BLUE_BOARD_NODE_IDS,
  BLUE_BOARD_NODES,
  BLUE_BOARD_ORIGIN,
  blueBoardEffects,
  nodeGlyph,
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
} from "../data/yellowBoard";
import { holomenById } from "../data";
import { BOARD_CELL_COUNTS, boardUnlockedCount } from "../data/boardCount";
import { nodeBoardPoints } from "../data/boardPoints";
import {
  BOARD_COLOR_ANCHOR,
  boardBudgetOf,
  emptyHolomenBoards,
  lockCell,
  lockCells,
  sameHolomenBoards,
  spentBoardPoints,
  totalUnlockedCells,
  unlockCell,
  unlockCells,
  unlockSetOf,
} from "../data/boardState";
import type { HolomenBoards, UnlockableAnchor } from "../data/boardState";
import { formatBoardPercent, formatBoardPermil } from "../data/boardGraph";
import { amplifyFixed, amplifyRatio, CONNECT_ANCHOR_LABELS } from "../data/connect";
import type { ConnectAnchor, ConnectFactors, ConnectPlacements } from "../data/connect";
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
  RED_AREA_EXITS,
  redNodeById,
  redNodeGlyph,
} from "../data/redBoard";
import type { RedBoardArea } from "../data/redBoard";
import type { ParamKind } from "../data/types";
import type { BoardColor } from "../storage/boards";
import { BOARD_INFO } from "../ui/infoContent";
import { affiliationName, holomenName } from "../ui/labels";

/**
 * ホロメンボードの入力(ホロメン単位)。ゲーム内のボードと同じ配置でマスを並べ、
 * 自分のボードを見ながら同じマスをタップして写す。連結の制約はツール側が引き受ける:
 * 未解放のマスをタップすると初期地点からの経路もまとめて解放し、解放済みを解除すると
 * その先も解除する。コネクト(人物アイコン)は表示するが入力しない。
 * ボードは赤・青・黄・緑の 4 色(ゲーム内の全体配置の順。赤は上・緑は下・青と黄が左右 — 2026-09-08 に 4 色そろった)。
 * 青は左右型があり(holomen.json の board.blueSide)、黄はその反対側(青が右なら左型)、緑は全ホロメン同じ配置。
 * 赤は 63 マスで横幅も広いので、下 / 左 / 上 / 右の 4 エリア(下 = 中心から C を経て R-049 までの幹と C の周り 2 マスずつ、
 * 上 = 最上部の格子(R-050 から)、左右 = ライフ系(命 の R-023 から)とステータス系(R-033 から)。どちらが左かは board.lifeSide)に
 * 分けて描く。エリアの切替に別のトグルやスワイプは置かず、枝が画面の外へ続く位置に「◀左 / ▲上 / 右▶ / ▼下」の出口を描いて
 * それをタップする(接続線も出口まで引く — 2026-09-08 ユーザー指示「別トグルを用意したくない。スワイプは嫌。名前は左上右」。
 * 2026-09-11 に幹と格子を分けて「下」を追加し、同日に下エリアを C の周りまで広げ、戻りの出口の名前を「中」にした)。解放のグラフは 1 つで、エリアは表示の分類。
 * 既定のタブは「全」(2026-09-11 ユーザー指示): 4 色をゲーム内の全体配置(赤上・緑下・青黄左右。中心のコネクトが原点)のまま
 * 1 枚に繋げて描き、最初は中心を中央に等倍(11 マス幅)で見せる。ピンチで拡大縮小、ドラッグで移動(PC はホイールで拡大縮小)。
 * 効果表は 4 色ぶんを縦に並べる(色の見出しは付けない)。
 * 中央のコネクトマスは全色に跨るので、入力済みの地はボードの色でなく選択コントロールと同じ濃色(--primary)
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
  /** 解放済みのコネクトマス(赤 = leader / 青 = card / 黄 = content。中心は常に解放済みなので含めない)。省略なら解放なし */
  connects?: UnlockableAnchor[];
  /** ホロメンランク(1〜50)。null / 省略 = 未登録(ボードPt の制限なし) */
  rank?: number | null;
  /**
   * 見るだけの表示(組み直しプランの「推奨のボード」を図で確かめる — 2026-10-04 ユーザー指示)。操作は説明モードだけで、
   * 解放・解除・すべて解放・戻る / 進むは出さない。`baseline`(いまの登録)と比べて、**追加するマスはそのマスの色が点滅、
   * 解除するマスは丸の右上から左下への斜線**を付ける
   */
  preview?: boolean;
  baseline?: HolomenBoards;
  /** コネクトマス(中心 / 赤 / 青 / 黄)の入力(アンカー → 範囲の形と増幅 ‰)。省略なら未配置 */
  placements?: ConnectPlacements;
  /** コネクト効果による 色 → マス ID → 倍率(効果表と増幅マスの印に使う。省略なら増幅なし) */
  factors?: ConnectFactors;
}>();

const emit = defineEmits<{
  /** ボード全体の状態を置き換える(4 色の解放マス + 解放済みのコネクト。解放・解除・すべて解放・戻る / 進む)。保存と、外れたコネクトの配置の整理は受け側 */
  change: [holomenId: string, boards: HolomenBoards];
  /** コネクトマスをタップ(解放モード): 範囲の形と倍率を入れるサイドバーを開かせる */
  connect: [holomenId: string, anchor: ConnectAnchor, color: BoardColor];
  close: [];
}>();

/** 盤面のタブ: 全(4 色を全体配置のまま繋げて 1 枚に描く。既定 — 2026-09-11 ユーザー指示)+ 色ごと(ゲーム内の順) */
type BoardTab = BoardColor | "all";
const BOARD_TABS: { id: BoardTab; label: string }[] = [
  { id: "all", label: "全" },
  { id: "red", label: "赤" },
  { id: "blue", label: "青" },
  { id: "yellow", label: "黄" },
  { id: "green", label: "緑" },
];
const ALL_COLORS: readonly BoardColor[] = ["red", "blue", "yellow", "green"];
const tab = ref<BoardTab>("all");
const full = computed(() => tab.value === "all");
/** 色ごとの表示で選んでいる色(全では場面ごとにマス自身の色を使うので、ここは赤を仮に置く) */
const color = computed<BoardColor>(() => (tab.value === "all" ? "red" : tab.value));
const boardVar = (c: BoardColor): string => `var(--board-${c})`;
/** 帯の色(全では選んだマスの色。トークンは src/style.css。解放マスの中の文字はどの色でも白 — 2026-09-09 ユーザー指示) */
const boardStyle = computed(() => ({
  "--board": boardVar(described.value?.color ?? color.value),
  "--board-ink": "#fff",
}));
function selectTab(id: BoardTab): void {
  tab.value = id;
}
/** 赤の表示エリア(下 = 幹 / 上 = 格子 / ライフ系 / ステータス系)。最初は下(幹)。シートを開いている間だけ覚える */
const area = ref<RedBoardArea>("lower");

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
const mode = ref<BoardMode>(props.preview ? "describe" : "unlock");
const describedNode = ref<Record<BoardColor, string | null>>({
  red: null,
  blue: null,
  yellow: null,
  green: null,
});
interface Described {
  color: BoardColor;
  id: string;
}
/** 全での選択(色 + マス)。色ごとの表示の選択とは別に覚える */
const describedFull = ref<Described | null>(null);
const described = computed<Described | null>(() => {
  if (full.value) return describedFull.value;
  const id = describedNode.value[color.value];
  return id === null ? null : { color: color.value, id };
});
const describedConnect = computed<ConnectAnchor | null>(() => {
  const id = described.value?.id;
  return id !== undefined && id.startsWith(CONNECT_PREFIX)
    ? (id.slice(CONNECT_PREFIX.length) as ConnectAnchor)
    : null;
});
/**
 * 説明モードの文言。コネクトの範囲に入っているマスは増幅後の値だけを出す(表記値との対比や倍率は書かない —
 * 2026-09-11 ユーザー指示「説明モードの時コネクト効果込みの効果表示にして」「効果分上がった数字で書けばいいだけ。変化とかいらない」)
 */
const description = computed(() => {
  const d = described.value;
  if (!d) return "";
  if (describedConnect.value !== null) return placedLabel(describedConnect.value);
  const pts = nodeBoardPoints(d.id);
  const label = effectLabel(d.id, props.factors?.[d.color]?.[d.id] ?? 1, d.color);
  return pts === null ? label : `${label}（${String(pts)} Pt）`;
});
function isDescribed(c: BoardColor, id: string): boolean {
  const d = described.value;
  return mode.value === "describe" && d !== null && d.color === c && d.id === id;
}
function setDescribed(c: BoardColor, id: string | null): void {
  if (full.value) describedFull.value = id === null ? null : { color: c, id };
  else describedNode.value[c] = id;
}
/** 盤面のマス・コネクト以外(背景・線)をタップしたら選択を外す */
function onBoardBackground(event: MouseEvent): void {
  if (mode.value !== "describe") return;
  if ((event.target as Element | null)?.closest(".node, .anchor")) return;
  setDescribed(color.value, null);
}

/**
 * 青の左右はホロメンごとの固定データ(holomen.json の board.blueSide — 2026-09-07 ユーザー共有)。
 * 青ボードが全体配置の左にあるホロメンは左型、右にあるホロメンは左右反転で描く。
 * 黄は青の反対側なので、青が右のホロメンは黄が左型(右型の座標を x 反転)。緑は反転しない
 */
const blueMirrored = computed(() => holomenById.get(props.holomenId)?.board.blueSide === "right");
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
  !full.value && color.value === "red" && area.value === "stats" ? RED_STATS_CELL : BASE_CELL,
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
  /** 中へ戻る出口の出発点。矢印は中心のある向き(左からは →、右からは ←、上からは ↓ — 2026-09-11 ユーザー指示) */
  from?: "life" | "stats" | "upper";
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
  col: (x) => (blueMirrored.value ? -x : x + 10),
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
 * 赤の 4 エリア。マスはそのエリアのものだけ描き、接続線は両端が描かれているものだけ(出口を含む)。
 * 解放・「すべて解放」の対象(nodeIds)は 63 マス全部。座標は lifeSide = left 基準で、ライフ系が右のホロメンは col で x 反転する
 */
const redAreaNodes = (a: RedBoardArea) => RED_BOARD_NODES.filter((n) => n.area === a);
/**
 * 出口: 下エリアからは 左 = 命 の R-023 (-2, 8)、右 = R-033 (2, 8)、上 = R-050 (0, 10)。中心のある下エリアへ戻る出口は
 * 名前を「▼中」にし、上の格子からは R-049 (0, 9)、左からは 命 の真下 R-010 (-2, 7)、右からは R-033 の真下 R-020 (2, 7)
 * (いずれも下エリアの端のマス。2026-09-11「命の下に何もないように見えるから命の下で中。右も同様」)
 */
const exitsOf = (from: RedBoardArea): AreaExit[] =>
  RED_AREA_EXITS[from].map((e) => {
    // 座標は実マスから引く(ここで書き直すと本体とずれる)
    const n = redNodeById(e.nodeId);
    if (!n) throw new Error(`${e.nodeId} がない`);
    return {
      id: n.id,
      x: n.x,
      y: n.y,
      area: e.to,
      ...(from === "life" || from === "stats" || from === "upper" ? { from } : {}),
    };
  });
const RED_VIEWS: Record<RedBoardArea, BoardView> = {
  lower: {
    nodes: redAreaNodes("lower"),
    nodeIds: RED_BOARD_NODE_IDS,
    anchors: [RED_BOARD_ORIGIN, RED_BOARD_CONNECT],
    exits: exitsOf("lower"),
    edges: RED_BOARD_EDGES,
    cols: 5,
    rows: 11,
    /** x は -2〜2 */
    col: (x) => (redMirrored.value ? 2 - x : x + 2),
    /** 行 0 が y=10(上への出口)、行 10 が y=0(中心) */
    row: (y) => 10 - y,
  },
  upper: {
    nodes: redAreaNodes("upper"),
    nodeIds: RED_BOARD_NODE_IDS,
    anchors: [],
    exits: exitsOf("upper"),
    edges: RED_BOARD_EDGES,
    cols: 5,
    rows: 6,
    /** x は -2〜2 */
    col: (x) => (redMirrored.value ? 2 - x : x + 2),
    /** 行 0 が y=14(最上部)、行 5 が y=9(下への出口) */
    row: (y) => 14 - y,
  },
  life: {
    nodes: redAreaNodes("life"),
    nodeIds: RED_BOARD_NODE_IDS,
    anchors: [],
    exits: exitsOf("life"),
    edges: RED_BOARD_EDGES,
    cols: 5,
    rows: 6,
    /** 基準(ライフ系が左)では x = -6〜-2 で 命 が右端(中への出口はその真下) */
    col: (x) => (redMirrored.value ? -2 - x : x + 6),
    row: (y) => 10 - y,
  },
  stats: {
    nodes: redAreaNodes("stats"),
    nodeIds: RED_BOARD_NODE_IDS,
    anchors: [],
    exits: exitsOf("stats"),
    edges: RED_BOARD_EDGES,
    cols: 8,
    rows: 5,
    /** 基準では x = 2〜9 で R-033 が左端(中への出口はその真下) */
    col: (x) => (redMirrored.value ? 9 - x : x - 2),
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
/** 全の描画領域は青と同じ幅の正方形(11 マス)。中の盤面は transform で動かす */
const FULL_SIZE = BASE_CELL * 11 + PAD * 2;
const WIDTH = computed(() => (full.value ? FULL_SIZE : CELL.value * view.value.cols + PAD * 2));
const HEIGHT = computed(() => (full.value ? FULL_SIZE : CELL.value * view.value.rows + PAD * 2));
const viewBox = computed(() =>
  full.value
    ? `0 0 ${String(FULL_SIZE)} ${String(FULL_SIZE)}`
    : `${String(-PAD)} ${String(-PAD)} ${String(WIDTH.value)} ${String(HEIGHT.value)}`,
);

/** ボード全体の状態(4 色の解放済みの通常マス + 解放済みのコネクトマス) */
const boardsState = computed<HolomenBoards>(() => ({
  red: props.redNodes,
  blue: props.nodes,
  yellow: props.yellowNodes,
  green: props.greenNodes,
  connects: props.connects ?? [],
}));
/** 色ごとの解放の集合(通常マス + 解放済みのコネクトの ID) */
const unlockedSets = computed<Record<BoardColor, ReadonlySet<string>>>(() => ({
  red: unlockSetOf("red", props.redNodes, props.connects ?? []),
  blue: unlockSetOf("blue", props.nodes, props.connects ?? []),
  yellow: unlockSetOf("yellow", props.yellowNodes, props.connects ?? []),
  green: unlockSetOf("green", props.greenNodes, props.connects ?? []),
}));
function isUnlocked(c: BoardColor, id: string): boolean {
  return unlockedSets.value[c].has(id);
}
/** 使用しているボードPt と、ホロメンランクからの予算(未登録は制限なし。超過中は 新しい解放ができず、解除はできる) */
const spent = computed(() => spentBoardPoints(boardsState.value));
const budget = computed(() => boardBudgetOf(props.rank ?? null, spent.value));
/** 解放マス数: 明示的に解放した通常マス + 解放済みのコネクトマス(中心は数えない — src/data/boardCount.ts)。全は 4 色の合計 */
const unlockedCount = computed(() =>
  full.value
    ? totalUnlockedCells(boardsState.value)
    : boardUnlockedCount(color.value, boardsState.value[color.value], boardsState.value.connects),
);
const cellCount = computed(() =>
  full.value
    ? ALL_COLORS.reduce((sum, c) => sum + BOARD_CELL_COUNTS[c], 0)
    : BOARD_CELL_COUNTS[color.value],
);
// 効果表はコネクト増幅込み(props.factors。暫定仕様 — src/data/connect.ts)
const redEffects = computed(() => redBoardEffects(new Set(props.redNodes), props.factors?.red));
const blueEffects = computed(() => blueBoardEffects(new Set(props.nodes), props.factors?.blue));
const yellowEffects = computed(() =>
  yellowBoardEffects(new Set(props.yellowNodes), props.factors?.yellow),
);
const greenEffects = computed(() =>
  greenBoardEffects(props.holomenId, new Set(props.greenNodes), props.factors?.green),
);
/**
 * コネクト効果の範囲に入っているマス(解放の有無を問わない — 2026-09-11 ユーザー指示「特定のマスを解放していなくても、
 * コネクトマスを設定した時、どのマスが影響を受けるのか可視化されて欲しい」)。虹色の輪で示し、未解放なら点滅させる
 */
/** 見るだけの表示での差分: 追加 = 推奨にあっていまの登録にない / 解除 = いまの登録にあって推奨にない */
function diffOf(c: BoardColor, id: string): "added" | "removed" | null {
  const base = props.baseline;
  if (!props.preview || !base) return null;
  const was = base[c].includes(id);
  const now = isUnlocked(c, id);
  if (now && !was) return "added";
  if (was && !now) return "removed";
  return null;
}
function inConnectRange(c: BoardColor, id: string): boolean {
  return (props.factors?.[c]?.[id] ?? 1) !== 1;
}
/** 虹色の輪のグラデーション(SVG の id はページ内で一意にする — 埋め込みとシートが同時に出ることがある) */
const rainbowId = `connect-rainbow-${useId()}`;
const RAINBOW_STOPS = ["#ff5f6d", "#ffb347", "#f9e04b", "#5ad07a", "#4facfe", "#b48cf2"];

/**
 * コネクトマス(人物アイコン)は解放の対象ではなく、**範囲の形と倍率を入れる場所**。(0, 0) は 4 色共通の中心、それ以外の C は
 * その色のボードのコネクト(青 = card、黄 = content、赤 = leader)
 */
function anchorOfIn(cell: Cell, c: BoardColor): ConnectAnchor {
  if (cell.x === 0 && cell.y === 0) return "center";
  if (c === "blue") return "card";
  if (c === "yellow") return "content";
  return "leader";
}
const CONNECT_PREFIX = "connect:";
function isPlaced(anchor: ConnectAnchor): boolean {
  return props.placements?.[anchor] !== undefined;
}
/** コネクトマスの解放状態(中心は常に解放済み。赤 / 青 / 黄は明示的に解放したときだけ) */
function isConnectorUnlocked(anchor: ConnectAnchor): boolean {
  return anchor === "center" || (props.connects ?? []).includes(anchor);
}
/** 見た目の 3 状態: 未解放 / 解放済み(配置なし)/ 解放済み・配置あり。配置の有無は解放状態の代わりにしない */
type AnchorState = "locked" | "unlocked" | "placed";
function anchorStateOf(anchor: ConnectAnchor): AnchorState {
  if (!isConnectorUnlocked(anchor)) return "locked";
  return isPlaced(anchor) ? "placed" : "unlocked";
}
/**
 * コネクトの説明: 配置済みなら「範囲内のマス +X%」だけ(2026-09-11 ユーザー指示「範囲内のマス +100% みたいな感じだけ」)。
 * 解放済みで配置なしは空、未解放は「未解放(解放に 1 Pt)」(2026-10-04 — コネクトは通常マスと同じく解放が必要)
 */
function placedLabel(anchor: ConnectAnchor): string {
  const placed = props.placements?.[anchor];
  if (placed) return `範囲内のマス +${String(placed.permil / 10)}%`;
  return isConnectorUnlocked(anchor) ? "" : "未解放（解放に 1 Pt）";
}
function onAnchor(a: RenderAnchor): void {
  if (mode.value === "describe") {
    setDescribed(a.color, `${CONNECT_PREFIX}${a.anchor}`);
    return;
  }
  emit("connect", props.holomenId, a.anchor, a.color);
}

function cx(x: number): number {
  return view.value.col(x) * CELL.value + CELL.value / 2;
}
function cy(y: number): number {
  return view.value.row(y) * CELL.value + CELL.value / 2;
}

/**
 * 出口の表記(物理的な方向で 左 / 上 / 右 / 下 — 2026-09-08 ユーザー指定、下は 2026-09-11)。ライフ系が右のホロメンでは
 * 左右が入れ替わる。三角は出口の向き
 */
type ExitArrow = "left" | "right" | "up" | "down";
function exitLabel(e: AreaExit): { arrow: ExitArrow; text: string } {
  if (e.area === "upper") return { arrow: "up", text: "上" };
  // 中心のある下エリアへ戻る出口は「中」。矢印は中心のある向き(左のエリアからは →、右からは ←、上の格子からは ↓ — 2026-09-11)
  if (e.area === "lower") {
    if (e.from !== "life" && e.from !== "stats") return { arrow: "down", text: "中" };
    const fromLeft = (e.from === "life") !== redMirrored.value;
    return { arrow: fromLeft ? "right" : "left", text: "中" };
  }
  const left = (e.area === "life") !== redMirrored.value;
  return left ? { arrow: "left", text: "左" } : { arrow: "right", text: "右" };
}
/** 出口の箱の幅(名前は 1 文字) */
function exitWidth(): number {
  return 32;
}
const EXIT_ARROWS: Record<ExitArrow, string> = {
  left: "M-3 0l5-4v8z",
  right: "M3 0l-5-4v8z",
  up: "M0-3l-4 5h8z",
  down: "M0 3l-4-5h8z",
};

/** 描くもの(色ごとの表示と全で共通の形。座標は描画領域の px) */
interface RenderNode {
  key: string;
  id: string;
  color: BoardColor;
  x: number;
  y: number;
  large?: true;
}
interface RenderAnchor {
  key: string;
  color: BoardColor;
  anchor: ConnectAnchor;
  x: number;
  y: number;
}
interface RenderExit {
  key: string;
  /** 出口の位置にある実マス。解放状態を箱に反映する */
  id: string;
  area: RedBoardArea;
  x: number;
  y: number;
  arrow: ExitArrow;
  text: string;
  unlocked: boolean;
}
interface RenderEdge {
  key: string;
  color: BoardColor;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
}
interface Scene {
  nodes: RenderNode[];
  anchors: RenderAnchor[];
  exits: RenderExit[];
  edges: RenderEdge[];
}
interface ColorBoard {
  nodes: readonly { id: string; x: number; y: number; large?: true }[];
  nodeIds: readonly string[];
  anchors: readonly Cell[];
  edges: readonly [string, string][];
}
const COLOR_BOARDS: Record<BoardColor, ColorBoard> = {
  red: {
    nodes: RED_BOARD_NODES,
    nodeIds: RED_BOARD_NODE_IDS,
    anchors: [RED_BOARD_ORIGIN, RED_BOARD_CONNECT],
    edges: RED_BOARD_EDGES,
  },
  blue: {
    nodes: BLUE_BOARD_NODES,
    nodeIds: BLUE_BOARD_NODE_IDS,
    anchors: [BLUE_BOARD_ORIGIN, BLUE_BOARD_CONNECT],
    edges: BLUE_BOARD_EDGES,
  },
  yellow: {
    nodes: YELLOW_BOARD_NODES,
    nodeIds: YELLOW_BOARD_NODE_IDS,
    anchors: [YELLOW_BOARD_ORIGIN, YELLOW_BOARD_CONNECT],
    edges: YELLOW_BOARD_EDGES,
  },
  green: {
    nodes: GREEN_BOARD_NODES,
    nodeIds: GREEN_BOARD_NODE_IDS,
    anchors: [GREEN_BOARD_ORIGIN],
    edges: GREEN_BOARD_EDGES,
  },
};
/**
 * 全: 4 色をゲーム内の全体配置の座標に写す(右 = +x、上 = +y。中心のコネクトが原点。赤上・緑下・青黄左右)。
 * 赤は lifeSide、青は blueSide が右のホロメンで x 反転、黄は青の反対側。緑は反転しない
 */
function fullPoint(c: BoardColor, x: number, y: number): { x: number; y: number } {
  const flip =
    c === "red"
      ? redMirrored.value
      : c === "blue"
        ? blueMirrored.value
        : c === "yellow"
          ? yellowLeft.value
          : false;
  // 赤のステータス系(基準で x ≥ 3)は色ごとの表示と同じく横の間隔を 40px にし、大マス同士(R-043–R-044 など)が重ならないようにする
  const px = c === "red" && x > 2 ? 2 * BASE_CELL + (x - 2) * RED_STATS_CELL : x * BASE_CELL;
  return { x: flip ? -px : px, y: -y * BASE_CELL };
}
/**
 * セルが通れるか: 中心(初期地点。常に解放済み)と、解放済みの通常マス・コネクトだけ。**解放していないコネクトは通れない** —
 * その先まで線が有効色になってはいけない(2026-10-04 ユーザー指示)
 */
function passableCell(c: BoardColor, id: string): boolean {
  return id === COLOR_BOARDS[c].anchors[0]?.id || isUnlocked(c, id);
}
function edgeActive(c: BoardColor, a: string, b: string): boolean {
  return passableCell(c, a) && passableCell(c, b) && (isUnlocked(c, a) || isUnlocked(c, b));
}
const scene = computed<Scene>(() => {
  const out: Scene = { nodes: [], anchors: [], exits: [], edges: [] };
  if (!full.value) {
    const c = color.value;
    const v = view.value;
    const pos = new Map<string, { x: number; y: number }>();
    for (const n of v.nodes) pos.set(n.id, { x: cx(n.x), y: cy(n.y) });
    for (const a of v.anchors) pos.set(a.id, { x: cx(a.x), y: cy(a.y) });
    for (const e of v.exits ?? []) pos.set(e.id, { x: cx(e.x), y: cy(e.y) });
    out.nodes = v.nodes.map((n) => ({
      key: n.id,
      id: n.id,
      color: c,
      x: cx(n.x),
      y: cy(n.y),
      ...(n.large ? { large: true as const } : {}),
    }));
    out.anchors = v.anchors.map((a) => ({
      key: a.id,
      color: c,
      anchor: anchorOfIn(a, c),
      x: cx(a.x),
      y: cy(a.y),
    }));
    out.exits = (v.exits ?? []).map((e) => ({
      key: `exit-${e.id}`,
      id: e.id,
      area: e.area,
      x: cx(e.x),
      y: cy(e.y),
      unlocked: isUnlocked(c, e.id),
      ...exitLabel(e),
    }));
    for (const [a, b] of v.edges) {
      const pa = pos.get(a);
      const pb = pos.get(b);
      if (!pa || !pb) continue;
      out.edges.push({
        key: `${a}-${b}`,
        color: c,
        x1: pa.x,
        y1: pa.y,
        x2: pb.x,
        y2: pb.y,
        active: edgeActive(c, a, b),
      });
    }
    return out;
  }
  for (const c of ALL_COLORS) {
    const b = COLOR_BOARDS[c];
    const pos = new Map<string, { x: number; y: number }>();
    for (const n of b.nodes) pos.set(n.id, fullPoint(c, n.x, n.y));
    for (const a of b.anchors) pos.set(a.id, fullPoint(c, a.x, a.y));
    for (const n of b.nodes) {
      const p = pos.get(n.id);
      if (!p) continue;
      out.nodes.push({
        key: `${c}:${n.id}`,
        id: n.id,
        color: c,
        x: p.x,
        y: p.y,
        ...(n.large ? { large: true as const } : {}),
      });
    }
    // 中心のコネクトは 4 色共通なので赤の分だけ描く
    for (const a of b.anchors) {
      if (a.x === 0 && a.y === 0 && c !== "red") continue;
      const p = pos.get(a.id);
      if (!p) continue;
      out.anchors.push({ key: `${c}:${a.id}`, color: c, anchor: anchorOfIn(a, c), x: p.x, y: p.y });
    }
    for (const [p, q] of b.edges) {
      const pa = pos.get(p);
      const pb = pos.get(q);
      if (!pa || !pb) continue;
      out.edges.push({
        key: `${c}:${p}-${q}`,
        color: c,
        x1: pa.x,
        y1: pa.y,
        x2: pb.x,
        y2: pb.y,
        active: edgeActive(c, p, q),
      });
    }
  }
  return out;
});

/*
 * 全のピンチ・ドラッグ(2026-09-11 ユーザー指示「ピンチによる拡大縮小、エリア外のドラッグで移動」→「2 本指で動かす。
 * 1 本指のドラッグではボードは動かないように」)。指は 2 本のときだけ動かす(1 本はページのスクロールに渡す —
 * touch-action: pan-y。2 本のときはブラウザに取られないよう touchmove を止める)。PC はマウスのドラッグとホイール。
 * 最初は中心のコネクトを中央に等倍(11 マス幅)。動かしたジェスチャの click はマスへ届かせない(PageCarousel と同じ)。
 * 移動は全体配置の広がりの中に留め、拡大率は 0.5〜3 倍
 */
const zoom = ref(1);
const pan = ref({ x: 0, y: 0 });
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
/** 全体配置の広がり(中心からのマス数。青黄 ±10、赤 14(横は 40px 間隔のステータス系で 11 マス相当)、緑 10 に半マスの余白) */
const FULL_EXTENT = { left: 11, right: 11, up: 14.5, down: 10.5 };
const fullTransform = computed(
  () =>
    `translate(${String(FULL_SIZE / 2 + pan.value.x)} ${String(FULL_SIZE / 2 + pan.value.y)}) scale(${String(zoom.value)})`,
);
function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}
function clampPan(p: { x: number; y: number }, z: number): { x: number; y: number } {
  return {
    x: Math.min(
      FULL_EXTENT.left * BASE_CELL * z,
      Math.max(-FULL_EXTENT.right * BASE_CELL * z, p.x),
    ),
    y: Math.min(FULL_EXTENT.up * BASE_CELL * z, Math.max(-FULL_EXTENT.down * BASE_CELL * z, p.y)),
  };
}
const boardSvg = useTemplateRef<SVGSVGElement>("boardSvg");
interface TrackedPointer {
  x: number;
  y: number;
  startX: number;
  startY: number;
}
const pointers = new Map<number, TrackedPointer>();
interface Pinch {
  dist: number;
  mid: { x: number; y: number };
  zoom: number;
  pan: { x: number; y: number };
}
let pinch: Pinch | null = null;
let gestureMoved = false;
let gestureEndedAt = 0;
/** このジェスチャで一度でも 2 本指になったか。なった後は 1 本指になっても離すまで動かし続ける(2026-09-11 ユーザー指示) */
let twoFingerArmed = false;
/** これ以上動いたらタップでなくドラッグ(描画領域の単位) */
const DRAG_SLOP = 6;
/** クライアント座標 → 描画領域の座標 */
function toView(clientX: number, clientY: number): { x: number; y: number } {
  const rect = boardSvg.value?.getBoundingClientRect();
  if (!rect || rect.width === 0) return { x: 0, y: 0 };
  const k = FULL_SIZE / rect.width;
  return { x: (clientX - rect.left) * k, y: (clientY - rect.top) * k };
}
function startPinch(): Pinch | null {
  const [a, b] = [...pointers.values()];
  if (!a || !b) return null;
  return {
    dist: Math.hypot(b.x - a.x, b.y - a.y),
    mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    zoom: zoom.value,
    pan: { ...pan.value },
  };
}
/** 描画領域の点 p の下にある盤面の点を固定したまま拡大率を z にする */
function zoomAround(p: { x: number; y: number }, z: number, from: Pinch): void {
  const c = FULL_SIZE / 2;
  const wx = (from.mid.x - c - from.pan.x) / from.zoom;
  const wy = (from.mid.y - c - from.pan.y) / from.zoom;
  pan.value = clampPan({ x: p.x - c - z * wx, y: p.y - c - z * wy }, z);
  zoom.value = z;
}
function onPointerDown(event: PointerEvent): void {
  if (!full.value) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  try {
    boardSvg.value?.setPointerCapture(event.pointerId);
  } catch {
    // 合成イベントなど capture できないポインタでも位置の追跡は続ける
  }
  const p = toView(event.clientX, event.clientY);
  pointers.set(event.pointerId, { ...p, startX: p.x, startY: p.y });
  if (pointers.size === 1) {
    gestureMoved = false;
    twoFingerArmed = false;
  }
  if (pointers.size === 2) {
    pinch = startPinch();
    twoFingerArmed = true;
  }
}
/**
 * 2 本指のあいだ(と、2 本指で動かし始めてから 1 本を離した後の残りの 1 本)はブラウザのスクロール・ズームを止める。
 * 最初から 1 本指のときは touch-action: pan-y でページのスクロールへ渡す
 */
function onTouchGuard(event: TouchEvent): void {
  if (!full.value) return;
  if (event.touches.length >= 2 || (twoFingerArmed && event.touches.length === 1)) {
    event.preventDefault();
  }
}
function onPointerMove(event: PointerEvent): void {
  if (!full.value) return;
  const prev = pointers.get(event.pointerId);
  if (!prev) return;
  const cur = toView(event.clientX, event.clientY);
  pointers.set(event.pointerId, { ...prev, x: cur.x, y: cur.y });
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    zoomAround(mid, clampZoom((pinch.zoom * dist) / pinch.dist), pinch);
    gestureMoved = true;
    return;
  }
  // 最初から 1 本指ではボードを動かさない(ページのスクロールに渡す)。マウスのドラッグと、2 本指の後に 1 本残した指は動かす
  if (event.pointerType !== "mouse" && !twoFingerArmed) return;
  pan.value = clampPan(
    { x: pan.value.x + cur.x - prev.x, y: pan.value.y + cur.y - prev.y },
    zoom.value,
  );
  if (Math.hypot(cur.x - prev.startX, cur.y - prev.startY) > DRAG_SLOP) gestureMoved = true;
}
function onPointerUp(event: PointerEvent): void {
  if (!pointers.delete(event.pointerId)) return;
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) {
    if (gestureMoved) gestureEndedAt = event.timeStamp;
    twoFingerArmed = false;
  }
}
/** 動かしたジェスチャの click はマス・コネクト・背景へ届かせない */
function onClickCapture(event: MouseEvent): void {
  if (gestureEndedAt === 0) return;
  const recent = event.timeStamp - gestureEndedAt < 300;
  gestureEndedAt = 0;
  if (!recent) return;
  event.stopPropagation();
  event.preventDefault();
}
/** PC: ホイールでカーソルの位置を中心に拡大縮小 */
function onWheel(event: WheelEvent): void {
  if (!full.value) return;
  event.preventDefault();
  const p = toView(event.clientX, event.clientY);
  const from: Pinch = { dist: 1, mid: p, zoom: zoom.value, pan: { ...pan.value } };
  zoomAround(p, clampZoom(zoom.value * Math.exp(-event.deltaY * 0.0015)), from);
}

const PARAM_LABELS: Record<ParamKind, string> = {
  performance: "パフォーマンス",
  technique: "テクニック",
  sense: "センス",
};
const PARAMS: ParamKind[] = ["performance", "technique", "sense"];

/** 緑の 1 マスの文言(所属向けは値をホロメンと何個目かで引く。f はコネクト倍率 — 固定値は切り上げ、‰ は丸めない) */
function greenEffectLabel(e: GreenBoardEffect, f = 1): string {
  switch (e.kind) {
    case "allParams":
      return `全員の全パラメータ +${String(amplifyFixed(e.value, f))}`;
    case "param":
      return `全員の${PARAM_LABELS[e.param]} +${String(amplifyFixed(e.value, f))}`;
    case "affiliation": {
      const a = affiliationEffectOf(props.holomenId, e.slot);
      return a
        ? `${affiliationName(a.affiliation)}の全パラメータ +${String(amplifyFixed(a.value, f))}`
        : "所属の全パラメータ UP";
    }
    case "reward":
      return `${e.label} ${formatBoardPermil(amplifyRatio(e.permil, f))}`;
  }
}

/**
 * マスの効果の数値をコネクト倍率で増幅した効果に写す(value = 固定値は切り上げ、percent / permil = 割合は丸めない。
 * ホロメンスキルのように数値のない効果はそのまま)。各色の文言関数にそのまま渡せる
 */
function scaleEffect<E extends object>(e: E, f: number): E {
  if (f === 1) return e;
  const out: Record<string, unknown> = { ...(e as Record<string, unknown>) };
  if ("value" in e && typeof e.value === "number") out.value = amplifyFixed(e.value, f);
  if ("percent" in e && typeof e.percent === "number") out.percent = amplifyRatio(e.percent, f);
  if ("permil" in e && typeof e.permil === "number") out.permil = amplifyRatio(e.permil, f);
  return out as E;
}

/** マス 1 つの文言(f はコネクト倍率。1 なら表記値のまま。c はそのマスの色 — 全では色ごとのマスが混ざる) */
function effectLabel(id: string, f = 1, c: BoardColor = color.value): string {
  if (c === "red") {
    const node = redNodeById(id);
    return node ? redEffectLabel(scaleEffect(node.effect, f)) : "";
  }
  if (c === "green") {
    const node = GREEN_BOARD_NODES.find((n) => n.id === id);
    return node ? greenEffectLabel(node.effect, f) : "";
  }
  if (c === "yellow") {
    const node = YELLOW_BOARD_NODES.find((n) => n.id === id);
    return node ? yellowEffectLabel(props.holomenId, scaleEffect(node.effect, f)) : "";
  }
  const node = BLUE_BOARD_NODES.find((n) => n.id === id);
  if (!node) return "";
  const e = scaleEffect(node.effect, f);
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
function glyph(id: string, c: BoardColor = color.value): string {
  if (c === "red") {
    const node = redNodeById(id);
    return node ? redNodeGlyph(node.effect) : "";
  }
  if (c === "green") {
    const node = GREEN_BOARD_NODES.find((n) => n.id === id);
    return node ? greenNodeGlyph(node.effect) : "";
  }
  if (c === "yellow") {
    const node = YELLOW_BOARD_NODES.find((n) => n.id === id);
    return node ? yellowNodeGlyph(node.effect) : "";
  }
  const node = BLUE_BOARD_NODES.find((n) => n.id === id);
  return node ? nodeGlyph(node.effect) : "";
}

/*
 * 解放の履歴(1 つ前に戻る / 1 つ先に進む — 2026-09-11 ユーザー指示「すべて解放、すべて解除の横にアイコンボタン。進めない時は disable」)。
 * 解放を変えるたびに ボード全体の状態(4 色の解放マス + 解放済みのコネクト)の写しを積み、戻る / 進むはその写しへ change を出す。
 * コネクトの効果の配置は履歴に含めない(解放が外れたコネクトの配置は受け側が外す)。シートを開いている間だけ覚える(保存しない)
 */
const past = ref<HolomenBoards[]>([]);
const future = ref<HolomenBoards[]>([]);
function snapshot(): HolomenBoards {
  const b = boardsState.value;
  return {
    red: [...b.red],
    blue: [...b.blue],
    yellow: [...b.yellow],
    green: [...b.green],
    connects: [...b.connects],
  };
}
/** 解放を変える。直前の状態を履歴に積み、先の履歴は捨てる */
function commit(next: HolomenBoards): void {
  if (sameHolomenBoards(next, boardsState.value)) return;
  past.value.push(snapshot());
  future.value = [];
  emit("change", props.holomenId, next);
}
function undo(): void {
  const target = past.value.pop();
  if (!target) return;
  future.value.push(snapshot());
  emit("change", props.holomenId, target);
}
function redo(): void {
  const target = future.value.pop();
  if (!target) return;
  past.value.push(snapshot());
  emit("change", props.holomenId, target);
}

/**
 * ボードPt が足りないときの知らせ(2026-10-04 ユーザー指示。操作全体が成功するか何も変わらないかのどちらか — 途中までは開けない)。
 * 予算を超えている状態では新しい解放ができない(解除はできる)ので、そのときは超過を伝える
 */
const notice = ref<string | null>(null);
/** 見出しの ⓘ(ランクの予算とコネクトマスの使い方 — `BOARD_INFO`) */
const infoOpen = ref(false);
function shortageMessage(need: number, remaining: number): string {
  if (remaining < 0)
    return `ボードPt が ${String(-remaining)} Pt 超過しています。マスを解除してから解放してください。`;
  return `ボードPt が足りません（あと ${String(need - remaining)} Pt 必要）。`;
}
/** 解除でコネクトの解放が外れ、置いているコネクト効果も外れるときの確認(null = 確認なし) */
const pendingLock = ref<{ next: HolomenBoards; anchors: UnlockableAnchor[] } | null>(null);
const pendingLockMessage = computed(() => {
  const anchors = pendingLock.value?.anchors ?? [];
  const names = anchors.map((a) => CONNECT_ANCHOR_LABELS[a]).join("・");
  return `${names}の解放が外れ、置いているコネクト効果も外れます。解除しますか？`;
});
/** 解除後の状態で、解放が外れる(= 配置も外れる)コネクトのうち配置のあるもの */
function placedConnectsLost(next: HolomenBoards): UnlockableAnchor[] {
  return boardsState.value.connects.filter(
    (a) => !next.connects.includes(a) && props.placements?.[a] !== undefined,
  );
}
function commitLock(next: HolomenBoards): void {
  const lost = placedConnectsLost(next);
  if (lost.length > 0) {
    pendingLock.value = { next, anchors: lost };
    return;
  }
  commit(next);
}
function onLockConfirm(): void {
  const pending = pendingLock.value;
  pendingLock.value = null;
  if (pending) commit(pending.next);
}

function onNode(n: RenderNode): void {
  if (mode.value === "describe") {
    setDescribed(n.color, n.id);
    return;
  }
  const state = boardsState.value;
  if (isUnlocked(n.color, n.id)) {
    commitLock(lockCell(state, n.color, n.id));
    return;
  }
  const result = unlockCell(state, n.color, n.id, budget.value.remaining);
  if (result.ok) commit(result.boards);
  else notice.value = shortageMessage(result.need, result.remaining);
}

/** 色のコネクトマスの ID(緑は null) */
const connectorIdOf = (c: BoardColor): string | null =>
  BOARD_COLOR_ANCHOR[c] === undefined ? null : (COLOR_BOARDS[c].anchors[1]?.id ?? null);
/** すべて解放の対象: その色の通常マス(`nodeIds`)と、その色のコネクト(あれば) */
function bulkTargets(c: BoardColor, nodeIds: readonly string[], withConnector: boolean) {
  const ids = [...nodeIds];
  const connector = connectorIdOf(c);
  if (withConnector && connector !== null) ids.push(connector);
  return ids.map((id) => ({ color: c, id }));
}
/**
 * すべて解放 / 解除。赤(色ごとの表示)は表示中のエリアのマスだけが対象(2026-09-08 ユーザー指示)— 解放は中心からの経路(幹)も
 * まとめて解放し、解除はそのエリアを外して切り離されるマスも解除する(下エリアの幹を外せば上・左右も切れる)。
 * 全は表示している 4 色すべてが対象(表示中の部分に掛ける規則のまま)。**対象に入る赤 / 青 / 黄のコネクトマスも解放・解除する**
 * (コネクトも通常マスと同じく解放が必要 — 2026-10-04)。ホロメンランクを登録していて必要なボードPt が残りを超えるときは、
 * 途中まで開けずに何も変えない
 */
function unlockAll(): void {
  let targets: { color: BoardColor; id: string }[];
  if (full.value) {
    targets = ALL_COLORS.flatMap((c) => bulkTargets(c, COLOR_BOARDS[c].nodeIds, true));
  } else if (color.value === "red") {
    targets = bulkTargets(
      "red",
      RED_BOARD_NODES.filter((n) => n.area === area.value).map((n) => n.id),
      area.value === "lower",
    );
  } else {
    targets = bulkTargets(color.value, view.value.nodeIds, true);
  }
  const result = unlockCells(boardsState.value, targets, budget.value.remaining);
  if (result.ok) commit(result.boards);
  else notice.value = shortageMessage(result.need, result.remaining);
}
function lockAll(): void {
  if (full.value) {
    commitLock(emptyHolomenBoards());
    return;
  }
  const state = boardsState.value;
  if (color.value === "red") {
    const ids = RED_BOARD_NODES.filter((n) => n.area === area.value).map((n) => n.id);
    const connector = connectorIdOf("red");
    if (area.value === "lower" && connector !== null) ids.push(connector);
    commitLock(lockCells(state, "red", ids));
    return;
  }
  const c = color.value;
  commitLock(
    lockCells(
      state,
      c,
      bulkTargets(c, view.value.nodeIds, true).map((t) => t.id),
    ),
  );
}

/** ランクとボードPt の行(Rank 27 / 使用 94 / 135 Pt・残り 41 Pt。未登録は Rank 未登録 / ボードPt 制限なし) */
const rankText = computed(() =>
  budget.value.rank === null ? "Rank 未登録" : `Rank ${String(budget.value.rank)}`,
);
const pointsText = computed(() => {
  const b = budget.value;
  // 単純に「20 / 100 Pt」(残り・超過の文は出さない。超過は警告色で示す)。未登録は使用Pt だけ
  if (b.budget === null) return `${String(b.spent)} Pt`;
  return `${String(b.spent)} / ${String(b.budget)} Pt`;
});
/** 効果表を出す色(全は 4 色を縦に並べ、色の名前の小見出しを付ける) */
const shownColors = computed<readonly BoardColor[]>(() =>
  full.value ? ALL_COLORS : [color.value],
);

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
        <!-- 見出しのすぐ右の ⓘ はランクの予算とコネクトマスの使い方を開く(2026-10-08 ユーザー指示で脚注から移した)。推奨の図(preview)には Pt の表示がないので出さない -->
        <div class="head-title">
          <h3>ホロメンボード</h3>
          <InfoButton v-if="!props.preview" label="ホロメンボードの説明" @click="infoOpen = true" />
        </div>
        <CloseButton @close="emit('close')" />
      </header>

      <div ref="body" class="body">
        <!-- 名前は 1 行を使う(長い名前が省略されないように — 2026-09-07 ユーザー指示)。色と操作モードはその下の行 -->
        <!--
          名前の行の右端に使用ボードPt だけを書く(「20 / 100 Pt」。ランク未登録は使用Pt だけ)。枠・Rank・残りの文言は出さない
          (2026-10-04 ユーザー指示)。**押してもランクは変えられない**(2026-10-06 ユーザー指示。ランクの入力はホロメンのピッカーの行だけ)。
          予算を超えているときは警告色
        -->
        <div class="who-row">
          <p class="who">{{ holomenName(props.holomenId) }}</p>
          <p
            v-if="!props.preview"
            class="pts"
            :class="{ over: budget.over > 0 }"
            :aria-label="`${rankText}。使用ボードPt ${pointsText}`"
          >
            {{ pointsText }}
          </p>
        </div>
        <div class="controls-row">
          <!-- 左: 盤面。全(4 色を繋げた 1 枚。既定)と 赤・青・黄・緑(ゲーム内の順) -->
          <div class="segment" role="radiogroup" aria-label="ボード">
            <button
              v-for="t in BOARD_TABS"
              :key="t.id"
              type="button"
              class="seg"
              role="radio"
              :aria-checked="tab === t.id"
              :class="{ active: tab === t.id }"
              @click="selectTab(t.id)"
            >
              {{ t.label }}
            </button>
          </div>
          <!-- 右: 操作モード(解放 / 説明) -->
          <div
            v-if="!props.preview"
            class="segment mode-segment"
            role="radiogroup"
            aria-label="操作"
          >
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

        <div class="board-wrap" :style="{ ...boardStyle, '--rainbow': `url(#${rainbowId})` }">
          <!--
            全では 2 本指で拡大縮小・移動(1 本指はページのスクロール。PC はマウスのドラッグとホイール)。
            動かしたジェスチャの click は capture で止めてマスへ届かせない
          -->
          <svg
            ref="boardSvg"
            class="board"
            :class="{ full }"
            :viewBox="viewBox"
            :width="WIDTH"
            :height="HEIGHT"
            role="group"
            :aria-label="`解放 ${String(unlockedCount)} / ${String(cellCount)} マス`"
            @click="onBoardBackground"
            @click.capture="onClickCapture"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @touchstart="onTouchGuard"
            @touchmove="onTouchGuard"
            @wheel="onWheel"
          >
            <defs>
              <!-- コネクト効果の範囲に入っているマスの虹色の輪 -->
              <linearGradient :id="rainbowId" x1="0" y1="0" x2="1" y2="1">
                <stop
                  v-for="(stop, i) in RAINBOW_STOPS"
                  :key="stop"
                  :offset="`${String((i / (RAINBOW_STOPS.length - 1)) * 100)}%`"
                  :stop-color="stop"
                />
              </linearGradient>
            </defs>
            <!-- 全では盤面全体を transform で動かす。色ごとの表示では動かさない -->
            <g :transform="full ? fullTransform : undefined">
              <line
                v-for="e in scene.edges"
                :key="e.key"
                class="edge"
                :class="{ active: e.active }"
                :style="{ '--board': boardVar(e.color) }"
                :x1="e.x1"
                :y1="e.y1"
                :x2="e.x2"
                :y2="e.y2"
              />
              <!--
                中心のコネクトと各色のコネクトマス(丸角の四角の人物アイコン)。解放の対象ではなく、タップで範囲の形と倍率を
                入れる(解放モード)/ 入れた内容の説明を出す(説明モード)。入力済みのアイコンは地をそのボードの色にする。
                中心は全色に跨るので選択コントロールと同じ濃色(2026-09-11 ユーザー指示)
              -->
              <g
                v-for="a in scene.anchors"
                :key="a.key"
                class="anchor"
                :class="{
                  placed: anchorStateOf(a.anchor) === 'placed',
                  unlocked: anchorStateOf(a.anchor) === 'unlocked',
                  locked: anchorStateOf(a.anchor) === 'locked',
                  center: a.anchor === 'center',
                  selected: isDescribed(a.color, `${CONNECT_PREFIX}${a.anchor}`),
                }"
                :style="{ '--board': boardVar(a.color) }"
                role="button"
                tabindex="0"
                :aria-label="`${CONNECT_ANCHOR_LABELS[a.anchor]}${placedLabel(a.anchor) ? `: ${placedLabel(a.anchor)}` : ''}`"
                :transform="`translate(${String(a.x)} ${String(a.y)})`"
                @click="onAnchor(a)"
                @keydown.enter.prevent="onAnchor(a)"
                @keydown.space.prevent="onAnchor(a)"
              >
                <rect class="hit" :x="-CELL / 2" :y="-CELL / 2" :width="CELL" :height="CELL" />
                <!-- 不透明の下地: 薄い地の解放済み・未解放でも、下を通る接続線が透けない(線は枠から出る — 2026-10-04 ユーザー指示) -->
                <rect
                  class="plate"
                  :x="-RADIUS"
                  :y="-RADIUS"
                  :width="RADIUS * 2"
                  :height="RADIUS * 2"
                  rx="5"
                />
                <rect :x="-RADIUS" :y="-RADIUS" :width="RADIUS * 2" :height="RADIUS * 2" rx="5" />
                <circle class="head" cy="-3" r="3.2" />
                <path class="shoulders" d="M-6.5 7.5a6.5 5.5 0 0 1 13 0z" />
              </g>
              <!-- 赤: ほかのエリアへの出口(枝が画面の外へ続く位置。左 / 上 / 右 / 下)。タップでそのエリアへ -->
              <g
                v-for="e in scene.exits"
                :key="e.key"
                class="exit"
                :class="{ unlocked: e.unlocked }"
                role="button"
                tabindex="0"
                :style="{ '--board': boardVar('red') }"
                :aria-label="`${e.text}のエリアへ（${effectLabel(e.id, 1, 'red')}${
                  e.unlocked ? '・解放済み' : ''
                }）`"
                :transform="`translate(${String(e.x)} ${String(e.y)})`"
                @click="goToArea(e.area)"
                @keydown.enter.prevent="goToArea(e.area)"
                @keydown.space.prevent="goToArea(e.area)"
              >
                <rect :x="-exitWidth() / 2" y="-12" :width="exitWidth()" height="24" rx="6" />
                <path
                  :d="EXIT_ARROWS[e.arrow]"
                  :transform="
                    e.arrow === 'right'
                      ? `translate(${String(exitWidth() / 2 - 9)} 0)`
                      : `translate(${String(-(exitWidth() / 2 - 9))} 0)`
                  "
                />
                <text :x="e.arrow === 'right' ? -5 : 5" dy="0.35em">
                  {{ e.text }}
                </text>
              </g>
              <g
                v-for="n in scene.nodes"
                :key="n.key"
                class="node"
                :data-node="`${n.color}:${n.id}`"
                :class="{
                  unlocked: isUnlocked(n.color, n.id),
                  large: n.large,
                  selected: isDescribed(n.color, n.id),
                  'diff-added': diffOf(n.color, n.id) === 'added',
                  'diff-removed': diffOf(n.color, n.id) === 'removed',
                }"
                :style="{ '--board': boardVar(n.color) }"
                role="button"
                tabindex="0"
                :aria-pressed="isUnlocked(n.color, n.id)"
                :aria-label="effectLabel(n.id, 1, n.color)"
                :transform="`translate(${String(n.x)} ${String(n.y)})`"
                @click="onNode(n)"
                @keydown.enter.prevent="onNode(n)"
                @keydown.space.prevent="onNode(n)"
              >
                <rect class="hit" :x="-CELL / 2" :y="-CELL / 2" :width="CELL" :height="CELL" />
                <circle :r="n.large ? LARGE_RADIUS : RADIUS" />
                <!--
                  コネクト効果の範囲: 虹色の輪(解放済みは点灯、未解放は点滅)。選択の黒い輪と同じ半径・太さで円周の上に載せ、
                  マスの外径を変えず文字にも掛からない。選択すると同じ幾何の黒線がちょうど上に重なって隠す(2026-09-11 ユーザー指示)
                -->
                <circle
                  v-if="inConnectRange(n.color, n.id)"
                  class="range-ring"
                  :class="{ blink: !isUnlocked(n.color, n.id) }"
                  :r="n.large ? LARGE_RADIUS : RADIUS"
                />
                <line
                  v-if="diffOf(n.color, n.id) === 'removed'"
                  class="diff-slash"
                  :x1="(n.large ? LARGE_RADIUS : RADIUS) * 0.72"
                  :y1="-(n.large ? LARGE_RADIUS : RADIUS) * 0.72"
                  :x2="-(n.large ? LARGE_RADIUS : RADIUS) * 0.72"
                  :y2="(n.large ? LARGE_RADIUS : RADIUS) * 0.72"
                />
                <text :class="{ small: glyph(n.id, n.color).length > 1 }" dy="0.35em">
                  {{ glyph(n.id, n.color) }}
                </text>
              </g>
            </g>
          </svg>
        </div>

        <!-- 解放モード: すべて解放 / 解除。説明モード: 同じ高さのボックスに選んだマスの効果(他の位置がずれない) -->
        <div v-if="mode === 'unlock'" class="bulk-row">
          <button type="button" class="secondary-button" @click="unlockAll">すべて解放</button>
          <button type="button" class="secondary-button" @click="lockAll">すべて解除</button>
          <!-- 解放の履歴: 1 つ前に戻る / 1 つ先に進む(正方形のアイコンボタン。進めないときは disabled) -->
          <button
            type="button"
            class="secondary-button icon-button"
            :disabled="past.length === 0"
            aria-label="1 つ前に戻る"
            @click="undo"
          >
            <!-- 一般的な「元に戻す」: 左向きの矢じりから右へ回り込む弧(24 の箱の中心に揃える) -->
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path class="head" d="M3.5 9.5 9 4v11z" />
              <path d="M8 9.5h7.5a4.75 4.75 0 0 1 0 9.5H10.5" />
            </svg>
          </button>
          <button
            type="button"
            class="secondary-button icon-button"
            :disabled="future.length === 0"
            aria-label="1 つ先に進む"
            @click="redo"
          >
            <!-- 「やり直す」は元に戻すの鏡像 -->
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <g transform="translate(24 0) scale(-1 1)">
                <path class="head" d="M3.5 9.5 9 4v11z" />
                <path d="M8 9.5h7.5a4.75 4.75 0 0 1 0 9.5H10.5" />
              </g>
            </svg>
          </button>
        </div>
        <!--
          ボタンに見えないよう枠線なしの淡色の帯にし、選んだマスと同じ見た目の縮小を文言の前に置く: 通常マスは記号つきの丸、
          コネクトマスは人物アイコンの丸角四角(入力済みならボードの色 — 2026-09-11「コネクトマスの時だけアイコン出てないね」)
        -->
        <p v-else class="describe-box" :style="boardStyle" aria-live="polite">
          <template v-if="described">
            <span
              v-if="describedConnect !== null"
              class="describe-anchor"
              :class="{
                placed: anchorStateOf(describedConnect) === 'placed',
                unlocked: anchorStateOf(describedConnect) === 'unlocked',
                locked: anchorStateOf(describedConnect) === 'locked',
                center: describedConnect === 'center',
              }"
              aria-hidden="true"
            >
              <svg viewBox="-11 -11 22 22">
                <circle cy="-3" r="3.2" />
                <path d="M-6.5 7.5a6.5 5.5 0 0 1 13 0z" />
              </svg>
            </span>
            <span
              v-else
              class="describe-node"
              :class="{ unlocked: isUnlocked(described.color, described.id) }"
              >{{ glyph(described.id, described.color) }}</span
            >
            <span>{{ description }}</span>
          </template>
        </p>

        <!-- 効果表(コネクト増幅込み)。全では 4 色を縦に並べる(色の見出しは付けない — 2026-09-11 ユーザー指示「不要」) -->
        <section
          v-for="c in shownColors"
          :key="c"
          class="effects"
          :style="{ '--board': boardVar(c) }"
        >
          <table v-if="c === 'red'" class="effect-table">
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
          <table v-else-if="c === 'blue'" class="effect-table">
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
          <table v-else-if="c === 'yellow'" class="effect-table">
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
        </section>

        <div class="footnotes">
          <p>
            <span class="fn-num">※</span>
            <span>
              効果はマスの表記値の合計で試算し、コネクトマス（人物アイコン）に入れた範囲の解放済みマスは
              元値 ×（1 + 倍率）にします。青の発動率は 発動確率 ×（1 + r/100、上限 1）、発動頻度は
              周期 ÷（1 +
              f/100）としてスコアボーナスへ反映します（仮定のモデルです）。緑は登録した全ホロメン分の合計が全カードに効き、所属向けの効果は
              1 枚あたり +{{ GREEN_AFFILIATION_CAP.toLocaleString("ja-JP") }}
              が上限です。黄の楽曲スコアボーナスは、曲を指定したときに、全ホロメンの黄ボードのうちその曲に合うマスの合計（上限
              10.0%）がスコアボーナスに入ります。赤はそのホロメンをリーダーにした編成のメンバー 5
              人に効きます（歌唱者条件は、曲を指定してリーダーのホロメンがその曲の歌唱者に含まれるとき）。ライフ・ホロメンスキル・報酬の効果は表示のみです。ボードPt
              の値は実機で確認できていません。
            </span>
          </p>
        </div>
      </div>
    </div>
    <InfoDialog v-if="infoOpen" :text="BOARD_INFO" @close="infoOpen = false" />
    <NoticeDialog v-if="notice !== null" :message="notice" @close="notice = null" />
    <ConfirmDialog
      v-if="pendingLock !== null"
      :message="pendingLockMessage"
      confirm-label="解除する"
      @confirm="onLockConfirm"
      @cancel="pendingLock = null"
    />
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
  background: var(--chrome-head);
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  justify-content: space-between;
  padding: 16px;
}

/* 見出しと ⓘ(見出しのすぐ右。右端は閉じるボタン) */
.head-title {
  align-items: center;
  display: flex;
  gap: 8px;
  min-width: 0;
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

/* 名前の行: 左に名前、右端に使用ボードPt(表示だけ)。名前が長いときは名前だけを省略し、Pt は必ず収める */
.who-row {
  align-items: baseline;
  display: flex;
  flex-shrink: 0;
  gap: 12px;
  justify-content: space-between;
  min-width: 0;
}

.who-row .who {
  flex: 1;
}

.pts {
  color: var(--ink-2);
  flex-shrink: 0;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  margin: 0;
  white-space: nowrap;
}

.pts.over {
  color: var(--error);
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

/* 盤面: 排他 5 択(全 + 4 色)のセグメンテッドコントロール(ピッカーと同形。選択色は意味色でなく濃色地) */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  flex-shrink: 0;
  grid-template-columns: repeat(5, 40px);
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

/* 全: 1 本指の縦の動きはページのスクロールに渡し(pan-y)、2 本指(ピンチ・移動)だけ盤面が受け取る。PC はマウスでドラッグ */
.board.full {
  cursor: grab;
  touch-action: pan-y;
}

/* ほかのエリアへの出口(赤): コネクトの人物アイコンと同じ描き方(淡い枠の丸角四角)に三角と 左 / 上 / 右 / 下 */
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

/* 出口の位置にも本物のマスがある。そのマスが解放済みなら解放色にする — 箱が常に淡いままだと「マスがない」ように
   見え、隣のマスが開けられないと誤解される(2026-09-13 ユーザー報告)。タップの意味(そのエリアへ移動)は変えない */
.exit.unlocked rect {
  fill: var(--board);
  stroke: var(--board);
}

.exit.unlocked path {
  fill: var(--board-ink);
}

.exit.unlocked text {
  fill: var(--board-ink);
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

.anchor {
  cursor: pointer;
  outline: none;
}

.anchor .plate {
  fill: var(--surface);
  stroke: none;
}

.anchor .hit {
  fill: transparent;
  stroke: none;
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

/* 入力済みのコネクト: 地をそのボードの色にして人物を白抜きにする(新しい素材は足さない — 2026-09-11 ユーザー指示) */
.anchor.placed rect:not(.hit):not(.plate) {
  fill: var(--board);
  stroke: var(--board);
}

/* 中心のコネクトは全色に跨るので、入力済みの地は選択コントロールと同じ濃色(2026-09-11 ユーザー指示) */
.anchor.center.placed rect:not(.hit):not(.plate) {
  fill: var(--primary);
  stroke: var(--primary);
}

.anchor.placed .head,
.anchor.placed .shoulders {
  fill: var(--surface);
}

/*
 * コネクトマスの 3 状態(2026-10-04 ユーザー指示。配置の有無と解放状態を同じ色表現にしない):
 *  未解放 = 淡い枠(実線。点線だと隙間から接続線が透ける)・淡い人物(解放するまで通れず、効果も置けない)/ 解放済み・配置なし = ボードの色の枠と薄い地 /
 *  解放済み・配置あり = 地をボードの色にして人物を白抜き(上の .placed)
 */
.anchor.locked rect:not(.hit):not(.plate) {
  stroke: var(--line);
}

.anchor.locked .head,
.anchor.locked .shoulders {
  opacity: 0.45;
}

.anchor.unlocked rect:not(.hit):not(.plate) {
  fill: var(--board);
  fill-opacity: 0.22;
  stroke: var(--board);
}

.anchor.center.unlocked rect:not(.hit):not(.plate) {
  fill: var(--primary);
  stroke: var(--primary);
}

.anchor.unlocked .head,
.anchor.unlocked .shoulders {
  fill: var(--board);
}

.anchor.center.unlocked .head,
.anchor.center.unlocked .shoulders {
  fill: var(--primary);
}

.anchor:focus-visible rect:not(.hit):not(.plate),
.anchor.selected rect:not(.hit):not(.plate) {
  stroke: var(--ink);
  stroke-width: 3;
}

/*
 * コネクト効果の範囲に入っているマス: 虹色のグラデーションの輪(点線は読みにくい — 2026-09-11 ユーザー指示
 * 「解放している時は虹色のグラデーションにして。で解放していない時はそれの点滅」)。未解放は点滅で「解放すれば効く」を示す。
 * 幾何は説明モードの選択の輪(円周上に線幅 3)と同一 — 大マスと隣のマスで輪が重ならず、文字にも掛からない
 * (「マスの外径が変わらないかつ、マスの内側の文字にかからないように」「選択したら光がちょうど黒線で隠されるように」)
 */
.node .range-ring {
  fill: none;
  stroke: var(--rainbow);
  stroke-width: 3;
}

/* 見るだけの表示の差分(組み直しプランの推奨): 追加するマスはそのマスの色が点滅、解除するマスは丸の右上から左下へ斜線(斜線も点滅 — 2026-10-04 ユーザー指示) */
/* 点滅は透明度でなく塗りの色を行き来させる(透明度だと下を通る接続線が透けて見える — 2026-10-04 ユーザー指摘)。
   塗りは常に不透明で、解放色 ↔ 地の色。文字も合わせて反転する */
.node.diff-added circle:not(.range-ring) {
  animation: diff-blink-fill 1.2s ease-in-out infinite;
}

.node.diff-added text {
  animation: diff-blink-text 1.2s ease-in-out infinite;
}

@keyframes diff-blink-fill {
  0%,
  100% {
    fill: var(--board);
  }

  50% {
    fill: var(--surface);
  }
}

@keyframes diff-blink-text {
  0%,
  100% {
    fill: var(--board-ink);
  }

  50% {
    fill: var(--board);
  }
}

.node .diff-slash {
  stroke: var(--error);
  stroke-linecap: round;
  stroke-width: 2.5;
  animation: range-blink 1.2s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .node.diff-added circle:not(.range-ring),
  .node.diff-added text,
  .node .diff-slash {
    animation: none;
  }
}

.node .range-ring.blink {
  animation: range-blink 1.2s ease-in-out infinite;
}

@keyframes range-blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.15;
  }
}

@media (prefers-reduced-motion: reduce) {
  .node .range-ring.blink {
    animation: none;
    opacity: 0.5;
  }
}

.node {
  cursor: pointer;
  outline: none;
}

.node .hit {
  fill: transparent;
}

/* マス本体の円(虹色の輪 .range-ring は別の円なので除く — 解放色の指定が輪に当たって見えなくなっていた 2026-09-11) */
.node circle:not(.range-ring) {
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

.node.unlocked circle:not(.range-ring) {
  fill: var(--board);
  stroke: var(--board);
}

.node.unlocked text {
  fill: var(--board-ink);
}

/* 説明モードで選んだマスの輪。未解放・解放済みで同じ色(2026-09-07 ユーザー指摘)。虹色の輪も同じ幾何なので黒に置き換わり点滅も止める */
.node:focus-visible circle,
.node.selected circle {
  stroke: var(--ink);
  stroke-width: 3;
}

.node:focus-visible .range-ring,
.node.selected .range-ring {
  animation: none;
  opacity: 1;
}

.bulk-row {
  display: grid;
  flex-shrink: 0;
  gap: 8px;
  grid-template-columns: 1fr 1fr 44px 44px;
}

/* 戻る / 進む: 44px の正方形。線画のアイコン、押せないときは淡く(.secondary-button の左右 padding より優先させる) */
.secondary-button.icon-button {
  align-items: center;
  display: flex;
  justify-content: center;
  padding: 0;
}

/* アイコンは 44px の箱に対して 26px(20px は「小さすぎる」— 2026-09-11 ユーザー指摘)。弧は線、矢じりは塗り */
.secondary-button.icon-button svg {
  fill: none;
  height: 26px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.4;
  width: 26px;
}

.secondary-button.icon-button svg .head {
  fill: currentColor;
  stroke: none;
}

.secondary-button.icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
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

/* 選んだコネクトマスの縮小(人物アイコンの丸角四角。入力済みならボードの色に白抜き — 盤面の .anchor と同じ描き方) */
.describe-anchor {
  align-items: center;
  border: 1.5px solid var(--ink-2);
  border-radius: 5px;
  display: inline-flex;
  flex-shrink: 0;
  height: 24px;
  justify-content: center;
  width: 24px;
}

.describe-anchor svg {
  fill: var(--ink-2);
  height: 20px;
  width: 20px;
}

.describe-anchor.placed {
  background: var(--board);
  border-color: var(--board);
}

.describe-anchor.center.placed {
  background: var(--primary);
  border-color: var(--primary);
}

.describe-anchor.placed svg {
  fill: var(--surface);
}

/* 選んだコネクトマスの縮小も 3 状態(盤面の .anchor と同じ) */
.describe-anchor.locked {
  border-color: var(--line);
}

.describe-anchor.locked svg {
  opacity: 0.45;
}

.describe-anchor.unlocked {
  border-color: var(--board);
}

.describe-anchor.unlocked svg {
  fill: var(--board);
}

.describe-anchor.center.unlocked {
  border-color: var(--primary);
}

.describe-anchor.center.unlocked svg {
  fill: var(--primary);
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

/* 効果表の区分(全では 4 色ぶん縦に並ぶ)。body は縦 flex なので縮ませない */
.effects {
  flex-shrink: 0;
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
