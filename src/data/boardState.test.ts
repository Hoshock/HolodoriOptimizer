import { describe, expect, it } from "vite-plus/test";

import { BLUE_BOARD_NODE_IDS } from "./blueBoard";
import { createBoardGraph } from "./boardGraph";
import { boardPointsForRank, CONNECT_UNLOCK_POINTS, nodeBoardPoints } from "./boardPoints";
import {
  boardBudgetOf,
  connectUnlockStatus,
  emptyHolomenBoards,
  lockCell,
  lockCells,
  lockConnectImpact,
  lockConnector,
  spentBoardPoints,
  totalUnlockedCells,
  unlockCell,
  unlockCells,
  unlockConnector,
} from "./boardState";
import type { HolomenBoards } from "./boardState";
import { GREEN_BOARD_NODE_IDS } from "./greenBoard";
import { RED_BOARD_NODE_IDS } from "./redBoard";
import { YELLOW_BOARD_NODE_IDS } from "./yellowBoard";

/**
 * ホロメンボードの状態と操作(2026-10-04 ユーザー指示): コネクトマスは通常マスと別に明示的な解放状態を持ち、1 Pt。
 * 「コネクトの直前まで」「コネクトを解放」「コネクトの先まで」は 3 つの別の状態。ランク登録済みなら残りPt の範囲でだけ解放でき、
 * 操作全体が成功するか何も変わらないかのどちらか。値のコスト(Pt)はテストへ書き写さず、正典(`nodeBoardPoints`)から引く
 */
const pts = (ids: readonly string[]): number =>
  ids.reduce((sum, id) => sum + (nodeBoardPoints(id) ?? 0), 0);
const must = (r: ReturnType<typeof unlockCell>): HolomenBoards => {
  if (!r.ok) throw new Error("解放できるはずが失敗した");
  return r.boards;
};
/** 青の C の手前の通常マス(B-008)と、C の先の通常マス(B-023) */
const BEFORE_C = ["B-001", "B-002", "B-005", "B-006", "B-007", "B-008"];

describe("コネクトマスの 3 つの状態(直前まで / 解放 / 先まで)", () => {
  it("コネクトの直前まで開けても、コネクトは勝手に開かない(1 Pt を消費せず、解放マス数にも入らない)", () => {
    const b = must(unlockCell(emptyHolomenBoards(), "blue", "B-008", null));
    expect([...b.blue].sort()).toEqual(BEFORE_C);
    expect(b.connects).toEqual([]);
    expect(spentBoardPoints(b)).toBe(pts(BEFORE_C));
    expect(totalUnlockedCells(b)).toBe(BEFORE_C.length);
  });

  it("直前まで経路が繋がっていれば、コネクトマスだけを +1 Pt で解放できる(解放マス数 +1。配置なしの解放済みを表現できる)", () => {
    const before = must(unlockCell(emptyHolomenBoards(), "blue", "B-008", null));
    expect(connectUnlockStatus(before, "card", null)).toEqual({
      unlocked: false,
      canUnlock: true,
      reason: null,
      points: CONNECT_UNLOCK_POINTS,
    });
    const opened = must(unlockConnector(before, "card", null));
    expect(opened.connects).toEqual(["card"]);
    expect([...opened.blue].sort()).toEqual(BEFORE_C); // 通常マスは増えない
    expect(spentBoardPoints(opened)).toBe(spentBoardPoints(before) + 1);
    expect(totalUnlockedCells(opened)).toBe(totalUnlockedCells(before) + 1);
    expect(connectUnlockStatus(opened, "card", null).unlocked).toBe(true);
  });

  it("直前まで経路が届いていないときは解放できない(notReached)", () => {
    expect(connectUnlockStatus(emptyHolomenBoards(), "card", null)).toMatchObject({
      unlocked: false,
      canUnlock: false,
      reason: "notReached",
    });
    expect(connectUnlockStatus(emptyHolomenBoards(), "leader", null).reason).toBe("notReached");
  });

  it("コネクトの先の通常マスを開けると、途中のコネクトも解放され、その 1 Pt が合算される", () => {
    const b = must(unlockCell(emptyHolomenBoards(), "blue", "B-023", null));
    expect(b.blue).toContain("B-023");
    expect(b.connects).toEqual(["card"]);
    expect(spentBoardPoints(b)).toBe(pts([...BEFORE_C, "B-023"]) + CONNECT_UNLOCK_POINTS);
    // 解放マス数 = 通常マス 7 + コネクト 1
    expect(totalUnlockedCells(b)).toBe(BEFORE_C.length + 1 + 1);
  });

  it("コネクトを解除すると、そのコネクトを通らないと届かない先のマスも解除され、手前のマスは残る", () => {
    const beyond = must(unlockCell(emptyHolomenBoards(), "blue", "B-023", null));
    const closed = lockConnector(beyond, "card");
    expect(closed.connects).toEqual([]);
    expect([...closed.blue].sort()).toEqual(BEFORE_C);
    expect(lockConnectImpact(beyond, "card")).toEqual({ nodes: 1 });
    // コネクトの手前のマスを解除しても、コネクトと先が一緒に外れる
    const cut = lockCell(beyond, "blue", "B-005");
    expect(cut.connects).toEqual([]);
    expect(cut.blue.every((id) => ["B-001", "B-002"].includes(id))).toBe(true);
  });

  it("コネクトの解放は自分の色にだけ属する(赤 = leader / 青 = card / 黄 = content)。緑にはない", () => {
    const red = must(unlockCell(emptyHolomenBoards(), "red", "R-009", null));
    expect(red.connects).toEqual(["leader"]);
    const yellow = must(unlockCell(emptyHolomenBoards(), "yellow", "Y-023", null));
    expect(yellow.connects).toEqual(["content"]);
    const green = must(unlockCell(emptyHolomenBoards(), "green", "G-025", null));
    expect(green.connects).toEqual([]);
  });

  it("全体: 通常マス 150 + コネクト 3 = 153 マス、使用 453 Pt(中心は数えない)。ランク 50(361 Pt)でも取り切れない", () => {
    const all = must(
      unlockCells(
        emptyHolomenBoards(),
        [
          ...RED_BOARD_NODE_IDS.map((id) => ({ color: "red" as const, id })),
          ...BLUE_BOARD_NODE_IDS.map((id) => ({ color: "blue" as const, id })),
          ...YELLOW_BOARD_NODE_IDS.map((id) => ({ color: "yellow" as const, id })),
          ...GREEN_BOARD_NODE_IDS.map((id) => ({ color: "green" as const, id })),
        ],
        null,
      ),
    );
    expect(all.connects).toEqual(["leader", "card", "content"]); // 先のマスを開けたので途中のコネクトも解放
    expect(totalUnlockedCells(all)).toBe(153);
    expect(spentBoardPoints(all)).toBe(453);
    expect(boardBudgetOf(50, spentBoardPoints(all)).over).toBe(453 - 361);
  });
});

describe("ホロメンランクの予算", () => {
  it("残りPt ちょうどなら解放できる。1 Pt 不足なら操作全体を拒否し、途中までは開かない(状態も変わらない)", () => {
    const empty = emptyHolomenBoards();
    const need = pts(BEFORE_C);
    expect(unlockCell(empty, "blue", "B-008", need).ok).toBe(true);
    const refused = unlockCell(empty, "blue", "B-008", need - 1);
    expect(refused).toEqual({ ok: false, need, remaining: need - 1 });
    // コネクトを横断する経路は、通常マス + コネクト 1 Pt + 先のマスの合計で判定する
    const total = pts([...BEFORE_C, "B-023"]) + CONNECT_UNLOCK_POINTS;
    expect(unlockCell(empty, "blue", "B-023", total).ok).toBe(true);
    expect(unlockCell(empty, "blue", "B-023", total - 1).ok).toBe(false);
  });

  it("コネクトの解放も残りPt が 1 足りなければできない(budget)", () => {
    const before = must(unlockCell(emptyHolomenBoards(), "blue", "B-008", null));
    expect(connectUnlockStatus(before, "card", 1).canUnlock).toBe(true);
    expect(connectUnlockStatus(before, "card", 0)).toMatchObject({
      canUnlock: false,
      reason: "budget",
    });
    expect(unlockConnector(before, "card", 0).ok).toBe(false);
  });

  it("残りが null(ランク未登録)なら制限なし", () => {
    expect(unlockCell(emptyHolomenBoards(), "red", "R-063", null).ok).toBe(true);
    const budget = boardBudgetOf(null, 999);
    expect(budget).toEqual({ rank: null, budget: null, spent: 999, remaining: null, over: 0 });
  });

  it("ランク登録済みの収支(使用 / 予算 / 残り)", () => {
    expect(boardBudgetOf(27, 94)).toEqual({
      rank: 27,
      budget: boardPointsForRank(27),
      spent: 94,
      remaining: boardPointsForRank(27) - 94,
      over: 0,
    });
  });

  it("すでに予算を超えていても状態は削除されない。超過中は新規の解放ができず、解除はできる", () => {
    const state = must(
      unlockCells(
        emptyHolomenBoards(),
        RED_BOARD_NODE_IDS.map((id) => ({ color: "red" as const, id })),
        null,
      ),
    );
    const spent = spentBoardPoints(state);
    const rank = 20; // 83 Pt。赤全部(212 + 1)は大幅に超える
    const budget = boardBudgetOf(rank, spent);
    expect(budget.over).toBe(spent - boardPointsForRank(rank));
    expect(budget.over).toBeGreaterThan(0);
    // 新しい解放は拒否(青の最初のマスでも)
    const refused = unlockCell(state, "blue", "B-001", budget.remaining);
    expect(refused.ok).toBe(false);
    // 状態はそのまま(拒否しても削除しない)
    expect(state.red).toHaveLength(63);
    // 解除はできる
    const after = lockCell(state, "red", "R-005");
    expect(spentBoardPoints(after)).toBeLessThan(spent);
  });

  it("「すべて解放」は全体が残り以内のときだけ。足りなければ途中まで開けず何も変えない", () => {
    const targets = BLUE_BOARD_NODE_IDS.map((id) => ({ color: "blue" as const, id }));
    const full = must(unlockCells(emptyHolomenBoards(), targets, null));
    const need = spentBoardPoints(full);
    expect(unlockCells(emptyHolomenBoards(), targets, need).ok).toBe(true);
    expect(unlockCells(emptyHolomenBoards(), targets, need - 1)).toEqual({
      ok: false,
      need,
      remaining: need - 1,
    });
  });

  it("「すべて解除」は常にできる(コネクトも外れる)", () => {
    const targets = BLUE_BOARD_NODE_IDS.map((id) => ({ color: "blue" as const, id }));
    const full = must(unlockCells(emptyHolomenBoards(), targets, null));
    expect(full.connects).toEqual(["card"]);
    const cleared = lockCells(full, "blue", [...BLUE_BOARD_NODE_IDS, "C"]);
    expect(cleared.blue).toEqual([]);
    expect(cleared.connects).toEqual([]);
    expect(spentBoardPoints(cleared)).toBe(0);
  });
});

describe("経路の選び方は「マス数」でなく「追加Pt」(Dijkstra)", () => {
  /**
   * 原点 O(0,0)。短い経路 O → a(1,0) → t(2,0) は 2 マスだが a が高い(5 Pt)。長い経路 O → b(0,1) → c(1,1) → d(2,1) → t は
   * 4 マスだが全部 1 Pt。t を開ける最小Ptは長い経路(1+1+1+1 = 4)で、短い経路(5+1 = 6)ではない
   */
  const cost: Record<string, number> = { a: 5, t: 1, b: 1, c: 1, d: 1 };
  const nodes = [
    { id: "a", x: 1, y: 0 },
    { id: "t", x: 2, y: 0 },
    { id: "b", x: 0, y: 1 },
    { id: "c", x: 1, y: 1 },
    { id: "d", x: 2, y: 1 },
  ];
  const graph = createBoardGraph(nodes, { id: "O", x: 0, y: 0 }, null, (id) => cost[id] ?? null, 1);

  it("マス数が少ない経路ではなく、追加Pt が最小の経路を選ぶ", () => {
    const plan = graph.planUnlock(new Set(), "t");
    expect(plan?.points).toBe(4);
    expect([...(plan?.cells ?? [])].sort()).toEqual(["b", "c", "d", "t"]);
    expect(graph.unlockNode(new Set(), "t").has("a")).toBe(false);
  });

  it("解放済みのマスは 0 Pt で通る(a が解放済みなら短い経路が 1 Pt で済む)", () => {
    const plan = graph.planUnlock(new Set(["a"]), "t");
    expect(plan).toEqual({ cells: ["t"], points: 1 });
  });

  it("同じPt の経路が複数あるときも結果は毎回同じ(タイブレークが固定)", () => {
    // 4 近傍の正方格子で O(0,0) から t(1,1): 経由は p(1,0) か q(0,1)(どちらも 1 Pt)。ID の小さい側に固定される
    const g = createBoardGraph(
      [
        { id: "p", x: 1, y: 0 },
        { id: "q", x: 0, y: 1 },
        { id: "t", x: 1, y: 1 },
      ],
      { id: "O", x: 0, y: 0 },
      null,
      () => 1,
      1,
    );
    const first = g.planUnlock(new Set(), "t");
    for (let i = 0; i < 5; i += 1) expect(g.planUnlock(new Set(), "t")).toEqual(first);
    expect(first?.points).toBe(2);
    expect(first?.cells).toEqual(["p", "t"]);
  });
});
