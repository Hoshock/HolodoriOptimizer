import { describe, expect, it } from "vite-plus/test";

import {
  accountGreenEffects,
  affiliationEffectOf,
  applyGreenBoard,
  GREEN_BOARD_EDGES,
  GREEN_BOARD_NODE_IDS,
  GREEN_BOARD_NODES,
  greenBoardEffects,
  greenKnownNodeIds,
  greenReachableNodes,
  greenToggleNode,
} from "./greenBoard";
import type { Card } from "./types";

const has = (a: string, b: string) =>
  GREEN_BOARD_EDGES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

describe("緑ホロメンボードの定義", () => {
  it("24 マスで ID・座標が重複せず、中心 (0, 0) は使わない", () => {
    expect(GREEN_BOARD_NODES).toHaveLength(24);
    expect(new Set(GREEN_BOARD_NODE_IDS).size).toBe(24);
    const coords = new Set(GREEN_BOARD_NODES.map((n) => `${String(n.x)},${String(n.y)}`));
    expect(coords.size).toBe(24);
    expect(coords.has("0,0")).toBe(false);
    expect(GREEN_BOARD_NODES.every((n) => n.y < 0)).toBe(true);
  });

  it("接続は 4 近傍(09・10 の列も縦に繋がる — 2026-09-07 実機確認)、中心から全マスに連結", () => {
    expect(has("C", "G-001")).toBe(true);
    expect(has("G-009", "G-012")).toBe(true);
    expect(has("G-012", "G-019")).toBe(true);
    expect(has("G-019", "G-022")).toBe(true);
    expect(has("G-010", "G-015")).toBe(true);
    expect(has("G-020", "G-023")).toBe(true);
    expect(has("G-022", "G-024")).toBe(true);
    expect(has("G-003", "G-009")).toBe(false); // 縦に離れている
    expect(GREEN_BOARD_EDGES).toHaveLength(30);
    expect(greenReachableNodes(new Set(GREEN_BOARD_NODE_IDS)).size).toBe(24);
  });

  it("大きく描くマスは G-011 / G-014 / G-017", () => {
    expect(GREEN_BOARD_NODES.filter((n) => n.large).map((n) => n.id)).toEqual([
      "G-011",
      "G-014",
      "G-017",
    ]);
  });

  it("全取得時の全員向け合計は全パラ +40、P/T/S 各 +15、報酬系 7 種 +0.5%", () => {
    const e = greenBoardEffects("sakura-miko", GREEN_BOARD_NODE_IDS);
    expect(e.allParams).toBe(40);
    expect(e.params).toEqual({ performance: 15, technique: 15, sense: 15 });
    expect(Object.keys(e.rewards)).toHaveLength(7);
    expect(Object.values(e.rewards).every((v) => v === 5)).toBe(true);
  });
});

describe("所属向けマス", () => {
  it("4〜5 人の所属は +50 / +150 / +100(合計 +300)、3 人の所属は +75 / +225 / +150(合計 +450)", () => {
    expect(affiliationEffectOf("houshou-marine", 0)).toEqual({ affiliation: "gen3", value: 50 });
    expect(affiliationEffectOf("houshou-marine", 1)).toEqual({ affiliation: "gen3", value: 150 });
    expect(affiliationEffectOf("houshou-marine", 2)).toEqual({ affiliation: "gen3", value: 100 });
    expect(greenBoardEffects("houshou-marine", GREEN_BOARD_NODE_IDS).byAffiliation).toEqual({
      gen3: 300,
    });
    expect(greenBoardEffects("nakiri-ayame", GREEN_BOARD_NODE_IDS).byAffiliation).toEqual({
      gen2: 450,
    });
  });

  it("白上フブキは 1期生 +100 / ゲーマーズ +300 / 1期生 +200", () => {
    expect(greenBoardEffects("shirakami-fubuki", GREEN_BOARD_NODE_IDS).byAffiliation).toEqual({
      gen1: 300,
      gamers: 300,
    });
    expect(greenBoardEffects("shirakami-fubuki", ["G-011"]).byAffiliation).toEqual({ gamers: 300 });
  });

  it("未知のホロメンの所属向けマスは効果なし", () => {
    expect(affiliationEffectOf("unknown", 0)).toBeNull();
    expect(greenBoardEffects("unknown", GREEN_BOARD_NODE_IDS).byAffiliation).toEqual({});
  });
});

describe("解放・解除", () => {
  it("未解放のマスをタップすると中心からの経路もまとめて解放する", () => {
    const result = greenToggleNode(new Set(), "G-009");
    expect([...result].sort()).toEqual([
      "G-001",
      "G-002",
      "G-005",
      "G-006",
      "G-007",
      "G-008",
      "G-009",
    ]);
    expect(result.has("C")).toBe(false);
  });

  it("解放済みを解除すると、切り離される先も解除する", () => {
    const result = greenToggleNode(new Set(GREEN_BOARD_NODE_IDS), "G-005");
    expect([...result].sort()).toEqual(["G-001", "G-002", "G-003", "G-004"]);
  });

  it("未知の ID は落とす", () => {
    expect(greenKnownNodeIds(["G-001", "G-999", "G-001", "C"])).toEqual(["G-001"]);
  });
});

describe("カードへの適用(アカウント全体の合計)", () => {
  const cardOf = (holomenId: string) =>
    ({
      id: `c-${holomenId}`,
      holomenId,
      stats: { performance: 1000, technique: 2000, sense: 3000 },
    }) as unknown as Card;

  it("全員向けは全カードに、所属向けはその所属のカードにだけ足す", () => {
    const e = accountGreenEffects({
      "houshou-marine": GREEN_BOARD_NODE_IDS,
      "sakura-miko": ["G-001", "G-002"],
    });
    expect(e.allParams).toBe(45);
    expect(e.params.sense).toBe(20);
    const marine = applyGreenBoard(cardOf("houshou-marine"), e);
    expect(marine.stats).toEqual({
      performance: 1000 + 45 + 15 + 300,
      technique: 2000 + 45 + 15 + 300,
      sense: 3000 + 45 + 20 + 300,
    });
    const miko = applyGreenBoard(cardOf("sakura-miko"), e);
    expect(miko.stats.performance).toBe(1000 + 45 + 15);
    expect(miko.id).toBe("c-sakura-miko");
  });

  it("所属向けの合計は +900 が上限(フブキは 1期生と ゲーマーズ の両方が効くが超えない)", () => {
    const boards = Object.fromEntries(
      [
        "shirakami-fubuki",
        "ookami-mio",
        "nekomata-okayu",
        "inugami-korone",
        "natsuiro-matsuri",
      ].map((id) => [id, GREEN_BOARD_NODE_IDS]),
    );
    const e = accountGreenEffects(boards);
    // ゲーマーズ 300 × 3 + フブキ 300 = 1200、1期生 300 × 1 + フブキ 300 = 600
    expect(e.byAffiliation.gamers).toBe(1200);
    expect(e.byAffiliation.gen1).toBe(600);
    const fubuki = applyGreenBoard(cardOf("shirakami-fubuki"), e);
    expect(fubuki.stats.performance).toBe(1000 + e.allParams + e.params.performance + 900);
    const okayu = applyGreenBoard(cardOf("nekomata-okayu"), e);
    expect(okayu.stats.performance).toBe(1000 + e.allParams + e.params.performance + 900);
    const matsuri = applyGreenBoard(cardOf("natsuiro-matsuri"), e);
    expect(matsuri.stats.performance).toBe(1000 + e.allParams + e.params.performance + 600);
  });

  it("効果がなければ元のカードをそのまま返す", () => {
    const card = cardOf("sakura-miko");
    expect(applyGreenBoard(card, accountGreenEffects({}))).toBe(card);
  });
});
