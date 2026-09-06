import { describe, expect, it } from "vite-plus/test";

import {
  applyBlueBoard,
  BLUE_BOARD_EDGES,
  BLUE_BOARD_NODE_IDS,
  BLUE_BOARD_NODES,
  blueBoardEffects,
  knownNodeIds,
  lockNode,
  reachableNodes,
  toggleNode,
  unlockNode,
} from "./blueBoard";
import type { Card } from "./types";

describe("青ホロメンボードの定義", () => {
  it("31 マスで ID・座標が重複しない", () => {
    expect(BLUE_BOARD_NODES).toHaveLength(31);
    expect(new Set(BLUE_BOARD_NODE_IDS).size).toBe(31);
    const coords = new Set(BLUE_BOARD_NODES.map((n) => `${String(n.x)},${String(n.y)}`));
    expect(coords.size).toBe(31);
    expect(coords.has("0,0")).toBe(false);
    expect(coords.has("-7,0")).toBe(false);
  });

  it("全取得時の合計が共有資料の値になる(全パラ +300、P/T/S 各 +400 +5%、発動率 +30%、頻度 +12%)", () => {
    const e = blueBoardEffects(BLUE_BOARD_NODE_IDS);
    expect(e.allParams).toBe(300);
    expect(e.params).toEqual({ performance: 400, technique: 400, sense: 400 });
    expect(e.percents).toEqual({ performance: 5, technique: 5, sense: 5 });
    expect(e.activeRatePercent).toBe(30);
    expect(e.activeFrequencyPercent).toBe(12);
  });

  it("斜めは接続しない(左端の 5 マス塊の端 B-013 / B-020 と左端の列)", () => {
    const has = (a: string, b: string) =>
      BLUE_BOARD_EDGES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    expect(has("B-013", "B-029")).toBe(false);
    expect(has("B-013", "B-028")).toBe(false);
    expect(has("B-020", "B-031")).toBe(false);
    expect(has("B-020", "B-030")).toBe(false);
    expect(has("B-013", "B-012")).toBe(true);
    expect(has("B-015", "B-014")).toBe(true);
    expect(has("R", "B-001")).toBe(true);
    expect(has("C", "B-009")).toBe(true);
  });

  it("大きく描くマスは B-007 と 5 マス塊の両端(% と頻度)の 7 つ", () => {
    expect(BLUE_BOARD_NODES.filter((n) => n.large).map((n) => n.id)).toEqual([
      "B-007",
      "B-013",
      "B-015",
      "B-020",
      "B-022",
      "B-029",
      "B-031",
    ]);
  });

  it("全マスは初期地点から連結している", () => {
    expect(reachableNodes(new Set(BLUE_BOARD_NODE_IDS)).size).toBe(31);
  });
});

describe("解放・解除の操作", () => {
  it("未解放のマスをタップすると初期地点からの経路もまとめて解放する", () => {
    const result = unlockNode(new Set(), "B-007");
    expect([...result].sort()).toEqual(["B-001", "B-002", "B-005", "B-006", "B-007"]);
  });

  it("コネクトマスは通路として通れる(入力対象ではない)", () => {
    const result = unlockNode(new Set(), "B-009");
    expect(result.has("C")).toBe(false);
    expect(result.has("B-008")).toBe(true);
    expect(result.has("B-009")).toBe(true);
  });

  it("経路は解放済みマスを優先して選ぶ", () => {
    // B-024 は C→B-009 経由と C→B-023 経由の 2 経路。B-023 が解放済みならそちらを使う
    const base = unlockNode(new Set(), "B-023");
    const result = unlockNode(base, "B-024");
    expect(result.has("B-009")).toBe(false);
    expect(result.has("B-023")).toBe(true);
  });

  it("解放済みのマスを解除すると、切り離される先のマスもまとめて解除する", () => {
    const full = new Set(BLUE_BOARD_NODE_IDS);
    const result = lockNode(full, "B-005");
    expect(result.has("B-005")).toBe(false);
    expect(result.has("B-006")).toBe(false);
    expect(result.has("B-027")).toBe(false);
    expect([...result].sort()).toEqual(["B-001", "B-002", "B-003", "B-004"]);
  });

  it("環になっている経路の片側を解除しても、もう片側で繋がるマスは残る", () => {
    const full = new Set(BLUE_BOARD_NODE_IDS);
    const result = lockNode(full, "B-023");
    expect(result.has("B-024")).toBe(true); // B-009 経由で残る
    expect(result.has("B-025")).toBe(true); // B-016 経由で残る
    expect(result.has("B-026")).toBe(false); // B-023 の先
  });

  it("toggle は状態で解放・解除を切り替え、未知の ID は無視する", () => {
    const a = toggleNode(new Set(), "B-001");
    expect(a.has("B-001")).toBe(true);
    expect(toggleNode(a, "B-001").size).toBe(0);
    expect(toggleNode(new Set(["B-001"]), "B-999").size).toBe(1);
    expect(knownNodeIds(["B-001", "B-999", "B-001", "C"])).toEqual(["B-001"]);
  });
});

describe("カードへの適用", () => {
  const card = {
    id: "c1",
    stats: { performance: 6984, technique: 10346, sense: 6184 },
  } as unknown as Card;

  it("固定値と切り上げの割合補正を本体に足し、発動率・頻度を boardLive に載せる", () => {
    const resolved = applyBlueBoard(card, BLUE_BOARD_NODE_IDS);
    // 本体 + 全パラ 300 + 個別 400 + ceil(本体 × 5%)
    expect(resolved.stats.performance).toBe(6984 + 700 + 350);
    expect(resolved.stats.technique).toBe(10346 + 700 + 518);
    expect(resolved.stats.sense).toBe(6184 + 700 + 310);
    expect(resolved.boardLive).toEqual({ activeRatePercent: 30, activeFrequencyPercent: 12 });
    expect(resolved.id).toBe("c1");
  });

  it("マスが空なら元のカードをそのまま返す", () => {
    expect(applyBlueBoard(card, [])).toBe(card);
  });
});
