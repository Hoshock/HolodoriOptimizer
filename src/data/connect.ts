import { BLUE_BOARD_NODES } from "./blueBoard";
import { GREEN_BOARD_NODES } from "./greenBoard";
import { holomenById } from "./index";
import { RED_BOARD_NODES } from "./redBoard";
import type { BoardSide, HolomenBoardLayout } from "./types";
import { YELLOW_BOARD_NODES } from "./yellowBoard";
import type { BoardColor } from "../storage/boards";

/**
 * コネクト効果【暫定仕様・実装仮説。実機確認済みではない】。
 *
 * ホロメンボードのコネクトマス(中心 / 赤 / 青 / 黄の 4 か所の人物アイコン)にカードを置くと、そのカード固有の
 * 「コネクト効果」が、置いたコネクトマスを原点にした相対座標の範囲(extent)にあるマスの効果を増幅する。
 * 「範囲内のホロメンボード効果を 150% UP」は、範囲内の**解放済み**のマスの効果を 元値 × (1 + 1.5) にする —
 * 2026-09-11 の実機観測(docs/ai/tmp/status.md「ホロメン別の青ホロメンボード」: 猫又おかゆの 発動率 +35.1% =
 * 素 30 + (+2 のマス 3 個) × 0.85、さくらみこの +36.0% = 素 30 + (+2 のマス 2 個) × 1.5)と一致する読み方で、
 * 「元値の 150%(× 1.5)」と読むと おかゆが 29.1%、みこが 32.0% になり合わない(README / 引き継ぎ資料の
 * 「permil/1000 をそのまま倍率にする」案はこの観測で棄却した)。
 *
 * 範囲の座標と倍率の値は外部の公開データベースのスナップショット【外部情報】から引き継いだもので、ゲーム画面には
 * 数値として出ない(ADR-002 の「確定仕様の一次情報にはしない」は変わらず、ユーザーが「仮定でよい」と明示したので
 * 一般モデルとして実装する — ADR-008)。入力はカードの指定ではなく、置いたコネクトマスごとに**範囲の形と倍率**を
 * ゲーム内のカード詳細の文言・光る範囲から写す(2026-09-11 ユーザー指示)。CONNECT_EFFECTS はその手がかり(形ごとに
 * 知られている ‰)としてだけ持つ。
 *
 * 一般規則(ケース別の定数は置かない):
 * - 倍率 = 1 + Σ permil_i / 1000(同じマスが複数の範囲に入るときは増分を**加算**。× 1.5 × 1.4 = 2.1 でなく 1.9 —
 *   重複の合成は未確認なので combineConnectPermils に分離して差し替えやすくしてある)
 * - 固定値(+50 / +100 など整数)はマスごとに切り上げ(おかゆの P/T +528 = 400 + ceil(150 × 1.85) = 278 と整合。
 *   四捨五入でも同じ値になる 1 点なので、既存の「割合は切り上げ」の慣例に合わせた)。割合・‰ は丸めない
 * - 対象は解放済みのマスだけ(未解放は 0 のまま)。コネクトマスそのものは増幅しない
 * - レベル: 開花 5凸で Lv2、0〜4凸は Lv1(公開データの「5凸 = コネクト効果 Lv UP」の読み。暫定)
 * - 範囲の向き: 中心のコネクトは物理座標をそのまま(右 = +x、上 = +y)。青 / 黄 / 赤のコネクトは、そのボードが
 *   基準(青が左・ライフ系が左)と反対側にあるホロメンでは dx を反転する(おかゆ(青が右)の実測は、中心に置いた
 *   3 マス直線が物理 +x = 青側へ伸び、青のコネクトの範囲は外向きに伸びる形で一致した)
 */

/** カードを置けるコネクトマス。center = 全ボードの中心 (0, 0)、leader = 赤 (0, 7)、card = 青 (∓7, 0)、content = 黄(青の反対) */
export type ConnectAnchor = "center" | "leader" | "card" | "content";
export const CONNECT_ANCHORS: readonly ConnectAnchor[] = ["center", "leader", "card", "content"];
export const CONNECT_ANCHOR_LABELS: Readonly<Record<ConnectAnchor, string>> = {
  center: "中心のコネクト",
  leader: "赤ボードのコネクト",
  card: "青ボードのコネクト",
  content: "黄ボードのコネクト",
};

/** 範囲の相対座標(コネクトマスを原点。x は右が正、y は上が正。基準の向きは青が左・ライフ系が左のホロメン) */
export const CONNECT_EXTENTS = {
  "center-1": [
    [-1, 2],
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
  ],
  "center-2": [
    [1, 0],
    [2, -1],
    [2, 0],
    [2, 1],
    [3, 0],
  ],
  "center-3": [
    [-1, 0],
    [-2, -1],
    [-2, 0],
    [-2, 1],
    [-3, 0],
  ],
  "center-4": [
    [-1, 0],
    [-2, 0],
    [0, -1],
    [0, -2],
  ],
  "center-5": [
    [-1, -2],
    [0, -1],
    [0, -2],
    [0, -3],
    [1, -2],
  ],
  "general-1": [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
    [-2, 0],
    [0, -2],
    [0, 2],
    [2, 0],
  ],
  "leader-1": [
    [0, -1],
    [0, -2],
    [0, 1],
    [0, 2],
  ],
  "leader-2": [
    [0, -1],
    [0, -2],
    [0, -3],
  ],
  "leader-3": [
    [0, 1],
    [0, 2],
    [1, 0],
    [2, 0],
  ],
  "card-1": [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, 0],
  ],
  "card-2": [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [-2, 0],
    [0, -1],
    [0, -2],
    [0, 1],
    [0, 2],
  ],
  "card-3": [
    [1, 0],
    [2, 0],
    [3, 0],
  ],
  "card-4": [
    [-1, 0],
    [-2, 0],
    [0, 1],
    [0, 2],
  ],
  "content-1": [
    [-1, 0],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ],
  "content-2": [
    [0, -1],
    [0, -2],
    [0, 1],
    [0, 2],
    [1, -1],
    [1, 0],
    [1, 1],
    [2, 0],
  ],
  "content-3": [
    [-1, 0],
    [-2, 0],
    [-3, 0],
  ],
  "content-4": [
    [0, -1],
    [0, -2],
    [1, 0],
    [2, 0],
  ],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;
export type ConnectExtentId = keyof typeof CONNECT_EXTENTS;
/** 形の短い名前(図形一覧の補助。基準の向きでの説明) */
export const CONNECT_EXTENT_LABELS: Readonly<Record<ConnectExtentId, string>> = {
  "center-1": "上へ 3 + 2 段目の左右",
  "center-2": "右へ 3 + 2 マス目の上下",
  "center-3": "左へ 3 + 2 マス目の上下",
  "center-4": "左 2 + 下 2",
  "center-5": "下へ 3 + 2 段目の左右",
  "general-1": "周囲 8 + 上下左右の 2 マス目",
  "leader-1": "上下 2 ずつ",
  "leader-2": "下へ 3",
  "leader-3": "上 2 + 右 2",
  "card-1": "外側 3 + 上下 + 内側 1",
  "card-2": "外側 4 + 上下 2 ずつ",
  "card-3": "内側へ 3",
  "card-4": "外側 2 + 上 2",
  "content-1": "外側 3 + 上下 + 内側 1",
  "content-2": "外側 4 + 上下 2 ずつ",
  "content-3": "内側へ 3",
  "content-4": "下 2 + 外側 2",
};

/** コネクト効果 1 種(範囲 + レベル 1 / 2 の増幅 ‰)。ID の末尾はカードのレアリティ(r4 = ★4、r5 = ★5) */
export interface ConnectEffectDef {
  extent: ConnectExtentId;
  /** [Lv1, Lv2] の増幅(‰。1500 = 「150% UP」= 元値 × 2.5) */
  permil: readonly [number, number];
}
export const CONNECT_EFFECTS = {
  "center-1-r5": { extent: "center-1", permil: [1400, 1900] },
  "center-2-r5": { extent: "center-2", permil: [1400, 1900] },
  "center-3-r5": { extent: "center-3", permil: [1400, 1900] },
  "center-4-r4": { extent: "center-4", permil: [1150, 1650] },
  "center-5-r5": { extent: "center-5", permil: [1500, 2000] },
  "general-1-r5": { extent: "general-1", permil: [550, 1050] },
  "leader-1-r5": { extent: "leader-1", permil: [1500, 2000] },
  "leader-2-r4": { extent: "leader-2", permil: [1650, 2150] },
  "leader-2-r5": { extent: "leader-2", permil: [2200, 2700] },
  "leader-3-r5": { extent: "leader-3", permil: [1500, 2000] },
  "card-1-r5": { extent: "card-1", permil: [1100, 1600] },
  "card-2-r5": { extent: "card-2", permil: [850, 1350] },
  "card-3-r4": { extent: "card-3", permil: [1600, 2100] },
  "card-3-r5": { extent: "card-3", permil: [2100, 2600] },
  "card-4-r5": { extent: "card-4", permil: [1500, 2000] },
  "content-1-r5": { extent: "content-1", permil: [1100, 1600] },
  "content-2-r5": { extent: "content-2", permil: [850, 1350] },
  "content-3-r4": { extent: "content-3", permil: [1500, 2000] },
  "content-3-r5": { extent: "content-3", permil: [2000, 2500] },
  "content-4-r4": { extent: "content-4", permil: [1150, 1650] },
} as const satisfies Record<string, ConnectEffectDef>;
export type ConnectEffectId = keyof typeof CONNECT_EFFECTS;
export const CONNECT_EFFECT_IDS: readonly ConnectEffectId[] = Object.keys(
  CONNECT_EFFECTS,
) as ConnectEffectId[];
export function isConnectEffectId(id: string): id is ConnectEffectId {
  return Object.hasOwn(CONNECT_EFFECTS, id);
}

/** コネクト効果のレベル: 開花 5凸で Lv2、それ以外は Lv1【暫定】 */
export type ConnectLevel = 1 | 2;
export function connectLevel(bloom: number): ConnectLevel {
  return bloom >= 5 ? 2 : 1;
}
export function connectPermil(effectId: ConnectEffectId, level: ConnectLevel): number {
  return CONNECT_EFFECTS[effectId].permil[level - 1];
}
/** 効果文言(ゲーム内の「範囲内のホロメンボード効果を 150% UP」の形) */
export function connectEffectLabel(effectId: ConnectEffectId, level: ConnectLevel): string {
  return `範囲内のホロメンボード効果を ${String(connectPermil(effectId, level) / 10)}% UP`;
}

/**
 * 同じマスに掛かる増幅 ‰ の合成 → 倍率。増分を加算する(1 + Σ ‰/1000)。
 * 重複時の規則は未確認なので、乗算(Π(1 + ‰/1000))へ変えるならこの 1 関数だけを差し替える
 */
export function combineConnectPermils(permils: readonly number[]): number {
  let sum = 0;
  for (const p of permils) sum += p;
  return 1 + sum / 1000;
}
/** 固定値(整数)の増幅: マスごとに切り上げ(150 × 1.85 = 277.5 → 278。おかゆの実測と整合) */
export function amplifyFixed(value: number, factor: number): number {
  return factor === 1 ? value : Math.ceil(value * factor - 1e-9);
}
/** 割合・‰ の増幅: 丸めない(2 × 1.85 = 3.7) */
export function amplifyRatio(value: number, factor: number): number {
  return value * factor;
}

/** 物理座標(右が +x・上が +y)上のマス。ホロメンの左右型(青 / ライフ系)を反映したもの */
interface PhysicalCell {
  color: BoardColor;
  nodeId: string;
}
interface PhysicalGrid {
  cellAt: ReadonlyMap<string, PhysicalCell>;
  anchors: Readonly<Record<ConnectAnchor, readonly [number, number]>>;
  /** そのアンカーに置いた範囲の dx を反転するか(基準の向きと反対側にあるボード) */
  mirrorAt: Readonly<Record<ConnectAnchor, boolean>>;
}
const key = (x: number, y: number): string => `${String(x)},${String(y)}`;
const grids = new Map<string, PhysicalGrid>();

/** ホロメンの配置(青の左右・ライフ系の左右)から物理座標の格子を作る(4 通りしかないので配置ごとに 1 回) */
function physicalGrid(layout: HolomenBoardLayout): PhysicalGrid {
  const cacheKey = `${layout.blueSide}/${layout.lifeSide}`;
  const cached = grids.get(cacheKey);
  if (cached) return cached;
  const cellAt = new Map<string, PhysicalCell>();
  const flipIf = (side: BoardSide, x: number): number => (side === "right" ? -x : x);
  // 赤: 基準はライフ系が左。右なら全体を x 反転(src/data/redBoard.ts)
  for (const n of RED_BOARD_NODES)
    cellAt.set(key(flipIf(layout.lifeSide, n.x), n.y), { color: "red", nodeId: n.id });
  // 緑: 反転なし(y ≤ -1)
  for (const n of GREEN_BOARD_NODES) cellAt.set(key(n.x, n.y), { color: "green", nodeId: n.id });
  // 青: 左型の座標(x ≤ -1)で定義。青が右のホロメンは x 反転
  for (const n of BLUE_BOARD_NODES)
    cellAt.set(key(flipIf(layout.blueSide, n.x), n.y), { color: "blue", nodeId: n.id });
  // 黄: 右型の座標(x ≥ 1)で定義(青が左のホロメン)。青が右なら黄は左で x 反転
  for (const n of YELLOW_BOARD_NODES)
    cellAt.set(key(flipIf(layout.blueSide, n.x), n.y), { color: "yellow", nodeId: n.id });
  const cardX = layout.blueSide === "right" ? 7 : -7;
  const grid: PhysicalGrid = {
    cellAt,
    anchors: {
      center: [0, 0],
      leader: [0, 7],
      card: [cardX, 0],
      content: [-cardX, 0],
    },
    mirrorAt: {
      center: false,
      leader: layout.lifeSide === "right",
      card: layout.blueSide === "right",
      content: layout.blueSide === "right",
    },
  };
  grids.set(cacheKey, grid);
  return grid;
}

export interface ConnectTarget {
  color: BoardColor;
  nodeId: string;
}

/**
 * そのホロメンのボードで、アンカーに置いた範囲が掛かるマス(色とマス ID)。解放状態は見ない(呼び出し側で解放済みだけ使う)。
 * コネクトマス・中心・範囲の外にマスがない座標は含まれない
 */
export function connectTargets(
  layout: HolomenBoardLayout,
  anchor: ConnectAnchor,
  extentId: ConnectExtentId,
): ConnectTarget[] {
  const grid = physicalGrid(layout);
  const [ax, ay] = grid.anchors[anchor];
  const mirror = grid.mirrorAt[anchor];
  const out: ConnectTarget[] = [];
  for (const [dx, dy] of CONNECT_EXTENTS[extentId]) {
    const cell = grid.cellAt.get(key(ax + (mirror ? -dx : dx), ay + dy));
    if (cell) out.push(cell);
  }
  return out;
}

/**
 * コネクトマス 1 か所の入力: 範囲の形と増幅 ‰(ゲーム内のカード詳細の「範囲内のホロメンボード効果を X% UP」の X × 10)。
 * カードを指定するのではなく、形と倍率を直接入れる(2026-09-11 ユーザー指示「ホロメンカードを指定するよりそちらの方が楽」)
 */
export interface ConnectPlacement {
  extent: ConnectExtentId;
  permil: number;
}
/** コネクトマスごとの入力。置いていないアンカーは省く */
export type ConnectPlacements = Partial<Record<ConnectAnchor, ConnectPlacement>>;
/** 色ごとの マス ID → 倍率(1 は含めない)。postMessage で複製できるプレーンな形 */
export type ConnectFactors = Partial<Record<BoardColor, Record<string, number>>>;
/** ホロメン ID → ConnectFactors */
export type ConnectFactorMap = Record<string, ConnectFactors>;

/** 1 ホロメンのボードのコネクトの入力から、色ごとのマスの倍率を出す */
export function connectFactorsOf(holomenId: string, placements: ConnectPlacements): ConnectFactors {
  const layout = holomenById.get(holomenId)?.board;
  if (!layout) return {};
  const permils: Partial<Record<BoardColor, Record<string, number[]>>> = {};
  for (const anchor of CONNECT_ANCHORS) {
    const placed = placements[anchor];
    if (!placed || !(placed.permil > 0)) continue;
    for (const t of connectTargets(layout, anchor, placed.extent)) {
      const byColor = (permils[t.color] ??= {});
      (byColor[t.nodeId] ??= []).push(placed.permil);
    }
  }
  const factors: ConnectFactors = {};
  for (const [color, nodes] of Object.entries(permils) as [
    BoardColor,
    Record<string, number[]>,
  ][]) {
    factors[color] = Object.fromEntries(
      Object.entries(nodes).map(([nodeId, list]) => [nodeId, combineConnectPermils(list)]),
    );
  }
  return factors;
}

/**
 * 登録した入力(ホロメン ID → アンカー → 形と ‰)から、全ホロメンの倍率表を作る。
 * 探索(src/engine/request.ts)と画面(OptimizerPanel / BoardSheet)が同じ 1 本を通る
 */
export function connectFactorMapOf(
  placements: Readonly<Record<string, ConnectPlacements>>,
): ConnectFactorMap {
  const map: ConnectFactorMap = {};
  for (const [holomenId, p] of Object.entries(placements)) {
    const factors = connectFactorsOf(holomenId, p);
    if (Object.keys(factors).length > 0) map[holomenId] = factors;
  }
  return map;
}

/** 倍率表から 1 色ぶんを取り出す(ホロメン ID → マス ID → 倍率。accountGreenEffects などに渡す形) */
export function factorsForColor(
  map: Readonly<ConnectFactorMap>,
  color: BoardColor,
): Record<string, Record<string, number> | undefined> {
  return Object.fromEntries(Object.entries(map).map(([holomenId, f]) => [holomenId, f[color]]));
}

/**
 * 図形一覧の並び(2026-09-11 ユーザー指示「対称性を考慮」「効果のあるマスの数が少ない順」):
 * マスの数が少ない順を第一に、2 列で見たときに対称な形が左右に並ぶように組む —
 * 3 マス: 直線の右 / 左、直線の下(+ 4 マスの上下 2 ずつ)、4 マス: L 字の点対称の対 × 2、5 マス: 十字の右 / 左、上 / 下、
 * 6 マス: 外側 3 + 内側 1 の左右対、8 マス: 外側 4 + 上下の左右対、12 マス: 周囲 8 + 2 マス目
 */
export const CONNECT_EXTENT_DISPLAY_ORDER: readonly ConnectExtentId[] = [
  "card-3",
  "content-3",
  "leader-2",
  "leader-1",
  "card-4",
  "content-4",
  "center-4",
  "leader-3",
  "center-2",
  "center-3",
  "center-1",
  "center-5",
  "card-1",
  "content-1",
  "card-2",
  "content-2",
  "general-1",
];
export function isConnectExtentId(id: string): id is ConnectExtentId {
  return Object.hasOwn(CONNECT_EXTENTS, id);
}
export const CONNECT_EXTENT_IDS: readonly ConnectExtentId[] = Object.keys(
  CONNECT_EXTENTS,
) as ConnectExtentId[];

/**
 * 図形の表示用: アンカーに置いたときに画面上(物理座標)で塗るセルの相対座標。青 / 黄 / 赤のコネクトは
 * そのボードが基準と反対側にあるホロメンでは dx を反転して見せる(盤面の見た目と同じ向きになる)
 */
export function extentCellsOnScreen(
  layout: HolomenBoardLayout,
  anchor: ConnectAnchor,
  extentId: ConnectExtentId,
): [number, number][] {
  const mirror = physicalGrid(layout).mirrorAt[anchor];
  return CONNECT_EXTENTS[extentId].map(([dx, dy]) => [mirror ? -dx : dx, dy]);
}

/** 倍率表からマスの倍率を引く(なければ 1) */
export function factorOf(
  factors: Readonly<Record<string, number>> | undefined,
  nodeId: string,
): number {
  return factors?.[nodeId] ?? 1;
}
