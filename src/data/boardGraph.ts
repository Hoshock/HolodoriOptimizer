/**
 * ホロメンボード共通のグラフ操作(赤・青・黄・緑で共用)。マスは正方格子に並び、接続は上下左右の
 * 4 近傍のみ(斜めは繋がない — 2026-09-06 / 2026-09-07 実機確認)。
 *
 * セルは 3 種類(2026-10-04 ユーザー指示。ゲーム内の実機仕様に合わせて整理):
 * - **初期地点(origin)** = 全ボードの中心のコネクト(S-001)。最初から解放済みで常に通れる。0 Pt・解放マス数に数えない
 * - **解放が必要なコネクトマス(connector)** = 赤 / 青 / 黄のコネクト(S-002 / S-003 / S-004)。通常マスと同じく**明示的に解放して**
 *   はじめて通れる(1 Pt・解放マス数に数える)。直前のマスまで解放してもコネクト自身は勝手には開かない。
 *   コネクトの効果の配置(src/data/connect.ts)とは別の状態で、配置なしの解放済みも、直前までだけ解放した状態もある。
 *   緑ボードにはない
 * - **通常マス(node)** = 入力対象。1〜6 Pt(src/data/boardPoints.ts)
 *
 * 解放状態は 1 つの集合で持つ: 解放済みの通常マスの ID + 解放済みのコネクトの ID(`connectorId`。例 "C")。
 * 旧実装はコネクトを常に通れる通路にして、「先のマスが解放されていればコネクトも解放扱い」と推定して数えていたが、
 * 実機と違うので撤去した(旧データは src/storage/boardConnects.ts が読み込み時に一度だけ推定して明示保存する)
 */

export interface BoardCell {
  id: string;
  x: number;
  y: number;
}

/** 解放の計画: 追加で解放するセル(通常マスと、途中を横断するコネクト)とその合計ボードPt */
export interface UnlockPlan {
  /** 追加で解放するセルの ID(初期地点に近い順) */
  cells: string[];
  /** 追加で必要なボードPt(解放済みのセルは 0) */
  points: number;
}

export interface BoardGraph {
  /** 接続線(隣接するセルの組。描画用。各組は 1 回だけ) */
  edges: readonly [string, string][];
  /** 解放が必要なコネクトマスの ID(緑は null) */
  readonly connectorId: string | null;
  /** そのセルを解放するのに必要なボードPt(通常マス = 1〜6、コネクト = 1、初期地点・未知のセル = 0) */
  cellPoints(this: void, id: string): number;
  /**
   * 解放済みのセル(通常マス + 解放済みのコネクト)のうち、初期地点から解放済みのセルだけを通って到達できるもの。
   * 解放済みでないコネクトは通れないので、その先のマスは含まれない
   */
  reachableNodes(this: void, unlocked: ReadonlySet<string>): Set<string>;
  /** 解放マス数(解放済みの通常マス + 解放済みのコネクト。初期地点は数えない) */
  unlockedCount(this: void, unlocked: ReadonlySet<string>): number;
  /** 使用しているボードPt(解放済みの通常マスの Pt + 解放済みのコネクトの 1 Pt) */
  unlockedPoints(this: void, unlocked: ReadonlySet<string>): number;
  /**
   * 旧データの移行用: 解放済みの通常マス(コネクトは含めない)のうち、**コネクトを通らないと中心から届かない**ものが 1 つでもあるか。
   * 旧実装はコネクトを常に通れる通路として扱っていたので、保存データにはコネクトの解放状態がなく、先のマスがあればコネクトは
   * 解放済みだったと読む(src/storage/boardConnects.ts)
   */
  connectorRequired(this: void, nodes: ReadonlySet<string>): boolean;
  /** 数えうる最大(通常マス + 解放が必要なコネクト) */
  readonly cellCount: number;
  /**
   * セル(通常マスまたはコネクト)を 1 つ解放する計画: 初期地点からそのセルまで、**追加で必要なボードPtが最小**の経路上の
   * 未解放のセルをまとめて解放する(2026-10-04 ユーザー指示「経路選択はマス数ではなく Pt」)。同じPtの経路は、
   * セルの ID 順で先に確定するほう(固定のタイブレーク)。未知のセルは null
   */
  planUnlock(this: void, unlocked: ReadonlySet<string>, cellId: string): UnlockPlan | null;
  /** セルを 1 つ解放する(`planUnlock` の計画を足した集合)。コネクトを横断する経路ならコネクトも解放する */
  unlockNode(this: void, unlocked: ReadonlySet<string>, cellId: string): Set<string>;
  /** セルを 1 つ解除する。それによって初期地点から切り離されるセル(コネクトの先・コネクト自身)もまとめて解除する */
  lockNode(this: void, unlocked: ReadonlySet<string>, cellId: string): Set<string>;
  /** 解放状態をトグルする(未解放なら経路ごと解放、解放済みなら依存ごと解除) */
  toggleNode(this: void, unlocked: ReadonlySet<string>, cellId: string): Set<string>;
  /** 未知の ID を落として既知の通常マスだけにする(保存データの読み込み用。コネクトの ID も落とす) */
  knownNodeIds(this: void, ids: readonly string[]): string[];
}

const key = (x: number, y: number): string => `${String(x)},${String(y)}`;

/**
 * @param nodes 入力対象の通常マス
 * @param origin 初期地点(全ボードの中心。常に解放済み)
 * @param connector 解放が必要なコネクトマス(緑は null)
 * @param pointsOf 通常マスの必要ボードPt(src/data/boardPoints.ts の `nodeBoardPoints`)
 * @param connectorPoints コネクトマスの必要ボードPt
 */
export function createBoardGraph(
  nodes: readonly BoardCell[],
  origin: BoardCell,
  connector: BoardCell | null,
  pointsOf: (nodeId: string) => number | null,
  connectorPoints: number,
): BoardGraph {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const connectorId = connector?.id ?? null;
  const cells: BoardCell[] = [...nodes, origin, ...(connector ? [connector] : [])];
  const cellAt = new Map(cells.map((c) => [key(c.x, c.y), c.id]));
  const cellPos = new Map(cells.map((c) => [c.id, { x: c.x, y: c.y }]));

  function cellPoints(id: string): number {
    if (id === connectorId) return connectorPoints;
    if (id === origin.id) return 0;
    return pointsOf(id) ?? 0;
  }

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

  /** 通れるセル: 初期地点と、解放済みの通常マス・コネクト */
  const isPassable = (cellId: string, unlocked: ReadonlySet<string>): boolean =>
    cellId === origin.id || unlocked.has(cellId);

  /** 初期地点から解放済みのセルだけを通って届くセル */
  function reach(unlocked: ReadonlySet<string>): Set<string> {
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
    return seen;
  }

  function reachableNodes(unlocked: ReadonlySet<string>): Set<string> {
    const seen = reach(unlocked);
    const result = new Set<string>();
    for (const id of unlocked) if (seen.has(id) && id !== origin.id) result.add(id);
    return result;
  }

  function connectorRequired(nodes: ReadonlySet<string>): boolean {
    if (connectorId === null) return false;
    const withConnector = reach(new Set([...nodes, connectorId]));
    const without = reach(nodes);
    for (const id of nodes) if (withConnector.has(id) && !without.has(id)) return true;
    return false;
  }

  function unlockedCount(unlocked: ReadonlySet<string>): number {
    let count = 0;
    for (const id of unlocked) if (nodeIds.has(id) || id === connectorId) count += 1;
    return count;
  }

  function unlockedPoints(unlocked: ReadonlySet<string>): number {
    let points = 0;
    for (const id of unlocked) if (nodeIds.has(id) || id === connectorId) points += cellPoints(id);
    return points;
  }

  function planUnlock(unlocked: ReadonlySet<string>, cellId: string): UnlockPlan | null {
    if (!nodeIds.has(cellId) && cellId !== connectorId) return null;
    // Dijkstra(セルは高々 65 個なので配列で十分): 解放済みのセル・初期地点を通るコスト 0、未解放のセルはそのボードPt。
    // 取り出す順は (距離, セル ID)、更新は厳密に小さいときだけ — 同じPtの経路は常に同じものに決まる
    const dist = new Map<string, number>([[origin.id, 0]]);
    const prev = new Map<string, string>();
    const settled = new Set<string>();
    for (;;) {
      let cur: string | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const [id, d] of dist) {
        if (settled.has(id)) continue;
        if (d < best || (d === best && cur !== null && id < cur)) {
          best = d;
          cur = id;
        }
      }
      if (cur === null || cur === cellId) break;
      settled.add(cur);
      for (const n of neighborsOf(cur)) {
        if (settled.has(n)) continue;
        const next = best + (isPassable(n, unlocked) ? 0 : cellPoints(n));
        if (next < (dist.get(n) ?? Number.POSITIVE_INFINITY)) {
          dist.set(n, next);
          prev.set(n, cur);
        }
      }
    }
    if (!dist.has(cellId)) return null;
    const added: string[] = [];
    let points = 0;
    let at: string | undefined = cellId;
    while (at !== undefined && at !== origin.id) {
      if (!unlocked.has(at)) {
        added.push(at);
        points += cellPoints(at);
      }
      at = prev.get(at);
    }
    return { cells: added.reverse(), points };
  }

  function unlockNode(unlocked: ReadonlySet<string>, cellId: string): Set<string> {
    const result = new Set(unlocked);
    const plan = planUnlock(unlocked, cellId);
    if (plan) for (const id of plan.cells) result.add(id);
    return result;
  }

  function lockNode(unlocked: ReadonlySet<string>, cellId: string): Set<string> {
    const next = new Set(unlocked);
    next.delete(cellId);
    return reachableNodes(next);
  }

  function toggleNode(unlocked: ReadonlySet<string>, cellId: string): Set<string> {
    return unlocked.has(cellId) ? lockNode(unlocked, cellId) : unlockNode(unlocked, cellId);
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

  return {
    edges,
    connectorId,
    cellPoints,
    reachableNodes,
    connectorRequired,
    unlockedCount,
    unlockedPoints,
    cellCount: nodes.length + (connector ? 1 : 0),
    planUnlock,
    unlockNode,
    lockNode,
    toggleNode,
    knownNodeIds,
  };
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
