/**
 * ホロメンボード共通のグラフ操作(青・緑で共用)。マスは正方格子に並び、接続は上下左右の
 * 4 近傍のみ(斜めは繋がない — 2026-09-06 / 2026-09-07 実機確認)。初期地点(全ボードの中心の
 * コネクト)とコネクトマスは常に通れる通路で、入力対象ではない
 */

export interface BoardCell {
  id: string;
  x: number;
  y: number;
}

export interface BoardGraph {
  /** 接続線(隣接するセルの組。描画用。各組は 1 回だけ) */
  edges: readonly [string, string][];
  /** 解放済みのマスのうち、初期地点から解放済みマス(と通路)だけを通って到達できるもの */
  reachableNodes(this: void, unlocked: ReadonlySet<string>): Set<string>;
  /** マスを 1 つ解放する。初期地点からそのマスまでの経路上のマスもまとめて解放する */
  unlockNode(this: void, unlocked: ReadonlySet<string>, nodeId: string): Set<string>;
  /** マスを 1 つ解除する。それによって初期地点から切り離されるマスもまとめて解除する */
  lockNode(this: void, unlocked: ReadonlySet<string>, nodeId: string): Set<string>;
  /** 解放状態をトグルする(未解放なら経路ごと解放、解放済みなら依存ごと解除) */
  toggleNode(this: void, unlocked: ReadonlySet<string>, nodeId: string): Set<string>;
  /** 未知の ID を落として既知のマスだけにする(保存データの読み込み用) */
  knownNodeIds(this: void, ids: readonly string[]): string[];
}

const key = (x: number, y: number): string => `${String(x)},${String(y)}`;

/**
 * @param nodes 入力対象のマス
 * @param origin 初期地点(解放の起点。通路)
 * @param passages 常に通れるそのほかのセル(青のコネクトマスなど)
 */
export function createBoardGraph(
  nodes: readonly BoardCell[],
  origin: BoardCell,
  passages: readonly BoardCell[] = [],
): BoardGraph {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const passable = new Set([origin.id, ...passages.map((p) => p.id)]);
  const cells: BoardCell[] = [...nodes, origin, ...passages];
  const cellAt = new Map(cells.map((c) => [key(c.x, c.y), c.id]));
  const cellPos = new Map(cells.map((c) => [c.id, { x: c.x, y: c.y }]));

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

  const edges: [string, string][] = [];
  for (const id of cellPos.keys()) {
    for (const n of neighborsOf(id)) if (id < n) edges.push([id, n]);
  }

  const isPassable = (cellId: string, unlocked: ReadonlySet<string>): boolean =>
    passable.has(cellId) || unlocked.has(cellId);

  function reachableNodes(unlocked: ReadonlySet<string>): Set<string> {
    const seen = new Set<string>([origin.id]);
    const queue: string[] = [origin.id];
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

  function unlockNode(unlocked: ReadonlySet<string>, nodeId: string): Set<string> {
    if (!nodeIds.has(nodeId)) return new Set(unlocked);
    // 0-1 BFS: 解放済み・通路を通るコスト 0、未解放マスを通るコスト 1(未解放が最も少ない経路)
    const cost = new Map<string, number>([[origin.id, 0]]);
    const prev = new Map<string, string>();
    const deque: string[] = [origin.id];
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
    while (cur !== undefined && cur !== origin.id) {
      if (nodeIds.has(cur)) result.add(cur);
      cur = prev.get(cur);
    }
    return result;
  }

  function lockNode(unlocked: ReadonlySet<string>, nodeId: string): Set<string> {
    const next = new Set(unlocked);
    next.delete(nodeId);
    return reachableNodes(next);
  }

  function toggleNode(unlocked: ReadonlySet<string>, nodeId: string): Set<string> {
    return unlocked.has(nodeId) ? lockNode(unlocked, nodeId) : unlockNode(unlocked, nodeId);
  }

  function knownNodeIds(ids: readonly string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const id of ids) {
      if (nodeIds.has(id) && !seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }
    return result;
  }

  return { edges, reachableNodes, unlockNode, lockNode, toggleNode, knownNodeIds };
}

/**
 * ボード効果の割合の表記。ゲーム内は必ず小数第 1 位まで(「+3.0%」「+20.0%」)なので全色で揃える
 * (「小数第一位で .0% までつけること。他の色のボード効果も表記揺れしてるので直す」— 2026-09-08 ユーザー指示)
 */
export function formatBoardPercent(percent: number): string {
  return `+${percent.toFixed(1)}%`;
}
/** ‰ で持つ効果(緑の報酬・黄)の割合の表記(‰ 5 → +0.5%、‰ 50 → +5.0%) */
export function formatBoardPermil(permil: number): string {
  return formatBoardPercent(permil / 10);
}
