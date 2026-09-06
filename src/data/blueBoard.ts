import type { Card, ParamKind, StatBlock } from "./types";

/**
 * 青ホロメンボード(全ホロメン共通のノード構成 — 2026-09-06 ユーザー実機確認。
 * 座標・効果の正典は .claude/skills/parameter-calculation/references/blue-board.md)。
 *
 * - メンバー編成時に、そのホロメン自身の P/T/S(固定値・割合)とアクティブスキルの
 *   発動率・発動頻度に効く。ボードはホロメンに属し、同じホロメンのカード全部に共通
 * - 左型の座標で定義する(x は初期地点 0 から負の方向へ、y は上が正)。右型は x を反転した表示
 *   (効果・ID は同じ)。2026-09-06 に実機と照合して上下の向きと 5 マス塊の左右を訂正
 * - マスは初期地点 (0,0) から隣接連結でのみ解放できる。コネクトマス C は存在するが入力しない
 *   (通路としては常に通れる扱い)。増幅の倍率は未確認のため試算に含めない
 * - 割合補正の端数は切り上げ(実測と整合 — parameter-calculation スキル)
 */

export type BlueBoardEffect =
  | { kind: "allParams"; value: number }
  | { kind: "param"; param: ParamKind; value: number }
  | { kind: "paramPercent"; param: ParamKind; percent: number }
  | { kind: "activeRate"; percent: number }
  | { kind: "activeFrequency"; percent: number };

export interface BlueBoardNode {
  id: string;
  /** 左型の座標(x は 0 が初期地点側、負の方向へ伸びる。y は上が正) */
  x: number;
  y: number;
  effect: BlueBoardEffect;
  /** 実機で大きく描かれるマス(初期地点側から最初の発動率と、5 マス塊の両端)。描画は 1.5 倍 */
  large?: true;
}

const all = (value: number): BlueBoardEffect => ({ kind: "allParams", value });
const param = (p: ParamKind, value: number): BlueBoardEffect => ({
  kind: "param",
  param: p,
  value,
});
const pct = (p: ParamKind, percent: number): BlueBoardEffect => ({
  kind: "paramPercent",
  param: p,
  percent,
});
const rate = (percent: number): BlueBoardEffect => ({ kind: "activeRate", percent });
const freq = (percent: number): BlueBoardEffect => ({ kind: "activeFrequency", percent });

export const BLUE_BOARD_NODES: readonly BlueBoardNode[] = [
  { id: "B-001", x: -1, y: 0, effect: all(50) },
  { id: "B-002", x: -2, y: 0, effect: param("sense", 100) },
  { id: "B-003", x: -2, y: -1, effect: param("technique", 100) },
  { id: "B-004", x: -2, y: 1, effect: param("performance", 100) },
  { id: "B-005", x: -3, y: 0, effect: all(50) },
  { id: "B-006", x: -4, y: 0, effect: all(50) },
  { id: "B-007", x: -5, y: 0, effect: rate(6), large: true },
  { id: "B-008", x: -6, y: 0, effect: all(50) },
  { id: "B-009", x: -7, y: -1, effect: param("technique", 150) },
  { id: "B-010", x: -7, y: -2, effect: rate(2) },
  { id: "B-011", x: -7, y: -3, effect: param("technique", 150) },
  { id: "B-012", x: -8, y: -3, effect: rate(3) },
  { id: "B-013", x: -9, y: -3, effect: freq(4), large: true },
  { id: "B-014", x: -6, y: -3, effect: rate(3) },
  { id: "B-015", x: -5, y: -3, effect: pct("technique", 5), large: true },
  { id: "B-016", x: -7, y: 1, effect: param("sense", 150) },
  { id: "B-017", x: -7, y: 2, effect: rate(2) },
  { id: "B-018", x: -7, y: 3, effect: param("sense", 150) },
  { id: "B-019", x: -8, y: 3, effect: rate(3) },
  { id: "B-020", x: -9, y: 3, effect: freq(4), large: true },
  { id: "B-021", x: -6, y: 3, effect: rate(3) },
  { id: "B-022", x: -5, y: 3, effect: pct("sense", 5), large: true },
  { id: "B-023", x: -8, y: 0, effect: param("performance", 150) },
  { id: "B-024", x: -8, y: -1, effect: all(50) },
  { id: "B-025", x: -8, y: 1, effect: all(50) },
  { id: "B-026", x: -9, y: 0, effect: rate(2) },
  { id: "B-027", x: -10, y: 0, effect: param("performance", 150) },
  { id: "B-028", x: -10, y: -1, effect: rate(3) },
  { id: "B-029", x: -10, y: -2, effect: pct("performance", 5), large: true },
  { id: "B-030", x: -10, y: 1, effect: rate(3) },
  { id: "B-031", x: -10, y: 2, effect: freq(4), large: true },
];

/** 初期地点(人物アイコンの接続点)。解放の起点で、入力対象ではない */
export const BLUE_BOARD_ORIGIN = { id: "R", x: 0, y: 0 } as const;
/** コネクトマス(人物アイコン)。存在するが入力しない。通路としては常に通れる */
export const BLUE_BOARD_CONNECT = { id: "C", x: -7, y: 0 } as const;

export const BLUE_BOARD_NODE_IDS: readonly string[] = BLUE_BOARD_NODES.map((n) => n.id);
const nodeById = new Map(BLUE_BOARD_NODES.map((n) => [n.id, n]));
export const BLUE_BOARD_X_RANGE = { min: -10, max: 0 } as const;
export const BLUE_BOARD_Y_RANGE = { min: -3, max: 3 } as const;

const key = (x: number, y: number): string => `${String(x)},${String(y)}`;
/** 座標 → セル ID(マス + R + C)。隣接判定は上下左右の 4 近傍のみ(斜めは接続しない) */
const cellAt = new Map<string, string>([
  ...BLUE_BOARD_NODES.map((n) => [key(n.x, n.y), n.id] as const),
  [key(BLUE_BOARD_ORIGIN.x, BLUE_BOARD_ORIGIN.y), BLUE_BOARD_ORIGIN.id],
  [key(BLUE_BOARD_CONNECT.x, BLUE_BOARD_CONNECT.y), BLUE_BOARD_CONNECT.id],
]);
const cellPos = new Map<string, { x: number; y: number }>([
  ...BLUE_BOARD_NODES.map((n) => [n.id, { x: n.x, y: n.y }] as const),
  [BLUE_BOARD_ORIGIN.id, { x: BLUE_BOARD_ORIGIN.x, y: BLUE_BOARD_ORIGIN.y }],
  [BLUE_BOARD_CONNECT.id, { x: BLUE_BOARD_CONNECT.x, y: BLUE_BOARD_CONNECT.y }],
]);

function neighborsOf(cellId: string): string[] {
  const pos = cellPos.get(cellId);
  if (!pos) return [];
  const result: string[] = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const n = cellAt.get(key(pos.x + dx, pos.y + dy));
    if (n) result.push(n);
  }
  return result;
}

/** 接続線(隣接するセルの組。描画用。各組は 1 回だけ) */
export const BLUE_BOARD_EDGES: readonly [string, string][] = (() => {
  const edges: [string, string][] = [];
  for (const id of cellPos.keys()) {
    for (const n of neighborsOf(id)) if (id < n) edges.push([id, n]);
  }
  return edges;
})();

function isPassable(cellId: string, unlocked: ReadonlySet<string>): boolean {
  return (
    cellId === BLUE_BOARD_ORIGIN.id || cellId === BLUE_BOARD_CONNECT.id || unlocked.has(cellId)
  );
}

/** 解放済みのマスのうち、初期地点から解放済みマス(と C)だけを通って到達できるもの */
export function reachableNodes(unlocked: ReadonlySet<string>): Set<string> {
  const seen = new Set<string>([BLUE_BOARD_ORIGIN.id]);
  const queue: string[] = [BLUE_BOARD_ORIGIN.id];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === undefined) break;
    for (const n of neighborsOf(cur)) {
      if (seen.has(n) || !isPassable(n, unlocked)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  const result = new Set<string>();
  for (const id of unlocked) if (seen.has(id)) result.add(id);
  return result;
}

/**
 * マスを 1 つ解放する。初期地点からそのマスまで、未解放のマスが最も少ない経路上のマスも
 * まとめて解放する(連結の制約をユーザーに 1 マスずつ辿らせない)
 */
export function unlockNode(unlocked: ReadonlySet<string>, nodeId: string): Set<string> {
  if (!nodeById.has(nodeId)) return new Set(unlocked);
  // 0-1 BFS: 解放済み・R・C を通るコスト 0、未解放マスを通るコスト 1
  const cost = new Map<string, number>([[BLUE_BOARD_ORIGIN.id, 0]]);
  const prev = new Map<string, string>();
  const deque: string[] = [BLUE_BOARD_ORIGIN.id];
  while (deque.length > 0) {
    const cur = deque.shift();
    if (cur === undefined) break;
    const c = cost.get(cur) ?? 0;
    for (const n of neighborsOf(cur)) {
      const step = isPassable(n, unlocked) ? 0 : 1;
      const next = c + step;
      if (next < (cost.get(n) ?? Number.POSITIVE_INFINITY)) {
        cost.set(n, next);
        prev.set(n, cur);
        if (step === 0) deque.unshift(n);
        else deque.push(n);
      }
    }
  }
  const result = new Set(unlocked);
  let cur: string | undefined = nodeId;
  while (cur !== undefined && cur !== BLUE_BOARD_ORIGIN.id) {
    if (nodeById.has(cur)) result.add(cur);
    cur = prev.get(cur);
  }
  return result;
}

/** マスを 1 つ解除する。それによって初期地点から切り離されるマスもまとめて解除する */
export function lockNode(unlocked: ReadonlySet<string>, nodeId: string): Set<string> {
  const next = new Set(unlocked);
  next.delete(nodeId);
  return reachableNodes(next);
}

/** 解放状態をトグルする(未解放なら経路ごと解放、解放済みなら依存ごと解除) */
export function toggleNode(unlocked: ReadonlySet<string>, nodeId: string): Set<string> {
  return unlocked.has(nodeId) ? lockNode(unlocked, nodeId) : unlockNode(unlocked, nodeId);
}

/** 未知の ID を落として既知のマスだけにする(保存データの読み込み用) */
export function knownNodeIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (nodeById.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

/** 解放したマスの効果の合計(マスの表記値。コネクト増幅は含まない) */
export interface BlueBoardEffects {
  allParams: number;
  params: StatBlock;
  percents: StatBlock;
  activeRatePercent: number;
  activeFrequencyPercent: number;
}

export function blueBoardEffects(nodeIds: Iterable<string>): BlueBoardEffects {
  const e: BlueBoardEffects = {
    allParams: 0,
    params: { performance: 0, technique: 0, sense: 0 },
    percents: { performance: 0, technique: 0, sense: 0 },
    activeRatePercent: 0,
    activeFrequencyPercent: 0,
  };
  for (const id of nodeIds) {
    const node = nodeById.get(id);
    if (!node) continue;
    const eff = node.effect;
    switch (eff.kind) {
      case "allParams":
        e.allParams += eff.value;
        break;
      case "param":
        e.params[eff.param] += eff.value;
        break;
      case "paramPercent":
        e.percents[eff.param] += eff.percent;
        break;
      case "activeRate":
        e.activeRatePercent += eff.percent;
        break;
      case "activeFrequency":
        e.activeFrequencyPercent += eff.percent;
        break;
    }
  }
  return e;
}

/**
 * マス 1 つの効果の短い表記(ボード UI のマス内ラベル)。全パラ = A、P/T/S は固定値も割合も
 * 同じ 1 文字(割合のマスは大きさで区別する — 2026-09-06 ユーザー指定)
 */
export function nodeGlyph(effect: BlueBoardEffect): string {
  const letter: Record<ParamKind, string> = { performance: "P", technique: "T", sense: "S" };
  switch (effect.kind) {
    case "allParams":
      return "A";
    case "param":
      return letter[effect.param];
    case "paramPercent":
      return letter[effect.param];
    case "activeRate":
      return "率";
    case "activeFrequency":
      return "頻";
  }
}

/**
 * 青ボードの効果をカードに適用した Card を返す(id は変わらない)。
 * P/T/S = 本体 + 全パラ固定 + 個別固定 + ceil(本体 × 割合)。
 * 発動率・頻度は boardLive に載せ、ライブ期待値(src/engine/live.ts)で使う。マスが空なら元のまま
 */
export function applyBlueBoard(card: Card, nodeIds: readonly string[]): Card {
  if (nodeIds.length === 0) return card;
  const e = blueBoardEffects(nodeIds);
  const stats: StatBlock = { ...card.stats };
  for (const p of ["performance", "technique", "sense"] as const) {
    const base = card.stats[p];
    stats[p] = base + e.allParams + e.params[p] + Math.ceil((base * e.percents[p]) / 100);
  }
  return {
    ...card,
    stats,
    boardLive: {
      activeRatePercent: e.activeRatePercent,
      activeFrequencyPercent: e.activeFrequencyPercent,
    },
  };
}
