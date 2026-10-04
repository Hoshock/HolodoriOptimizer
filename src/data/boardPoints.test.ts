import { describe, expect, it } from "vite-plus/test";

import { BLUE_BOARD_NODE_IDS } from "./blueBoard";
import {
  BOARD_NODE_COSTS,
  boardColorTotals,
  boardPointsForRank,
  CONNECT_UNLOCK_POINTS,
  HOLOMEN_RANK_MAX,
  HOLOMEN_RANK_MIN,
  isValidHolomenRank,
  nodeBoardPoints,
} from "./boardPoints";
import { GREEN_BOARD_NODE_IDS } from "./greenBoard";
import { RED_BOARD_NODE_IDS } from "./redBoard";
import { YELLOW_BOARD_NODE_IDS } from "./yellowBoard";

/**
 * ホロメンボードPt(2026-10-04 ユーザー提供。外部マスタ由来 — HolodoriDB の CharacterLevel.json / SkillTreeNode.json、master コミット
 * e83a4eb03baf974c434eb0ddfa1cd1d2385dad11)。値は実機の目視確認ではなく外部マスタから取った値で、境界の累積値はユーザーが提示した確認値
 */
describe("ホロメンランク → 累積ボードPt", () => {
  it("境界の累積値(ランク 1 = 0 … ランク 50 = 361)", () => {
    const expected: Record<number, number> = {
      1: 0,
      2: 2,
      3: 4,
      4: 6,
      5: 9,
      9: 21,
      10: 26,
      14: 46,
      15: 52,
      19: 76,
      20: 83,
      24: 111,
      25: 119,
      29: 151,
      30: 161,
      40: 261,
      50: 361,
    };
    for (const [rank, points] of Object.entries(expected))
      expect(boardPointsForRank(Number(rank)), `Rank ${rank}`).toBe(points);
  });

  it("ランクごとの加算(2〜4 は +2、5〜9 は +3、10〜14 は +5、15〜19 は +6、20〜24 は +7、25〜29 は +8、30〜50 は +10)", () => {
    const step = (rank: number): number => boardPointsForRank(rank) - boardPointsForRank(rank - 1);
    const bands: [number, number, number][] = [
      [2, 4, 2],
      [5, 9, 3],
      [10, 14, 5],
      [15, 19, 6],
      [20, 24, 7],
      [25, 29, 8],
      [30, 50, 10],
    ];
    for (const [from, to, per] of bands)
      for (let rank = from; rank <= to; rank += 1) expect(step(rank), `Rank ${rank}`).toBe(per);
  });

  it("範囲は 1〜50 の整数。範囲外・非整数は例外(未登録は 0 でなく null として呼び出し側が扱う)", () => {
    expect([HOLOMEN_RANK_MIN, HOLOMEN_RANK_MAX]).toEqual([1, 50]);
    for (const bad of [0, -1, 51, 2.5, Number.NaN]) {
      expect(isValidHolomenRank(bad)).toBe(false);
      expect(() => boardPointsForRank(bad)).toThrow(RangeError);
    }
    expect(isValidHolomenRank(1)).toBe(true);
    expect(isValidHolomenRank(50)).toBe(true);
  });

  it("ランク 50 でも全マス(453 Pt)は取れない", () => {
    expect(boardPointsForRank(50)).toBeLessThan(453);
  });
});

describe("通常マスの必要ボードPt(マス ID → cost の正典)", () => {
  it("赤 63 マス / 212 Pt、青 31 マス / 86 Pt、黄 31 マス / 86 Pt、緑 25 マス / 66 Pt", () => {
    expect(boardColorTotals("red")).toEqual({ nodes: 63, points: 212 });
    expect(boardColorTotals("blue")).toEqual({ nodes: 31, points: 86 });
    expect(boardColorTotals("yellow")).toEqual({ nodes: 31, points: 86 });
    expect(boardColorTotals("green")).toEqual({ nodes: 25, points: 66 });
  });

  it("通常マス合計 150 マス / 450 Pt、非中心コネクト 3 つ(各 1 Pt)込みで 153 / 453", () => {
    const colors = ["red", "blue", "yellow", "green"] as const;
    const nodes = colors.reduce((s, c) => s + boardColorTotals(c).nodes, 0);
    const points = colors.reduce((s, c) => s + boardColorTotals(c).points, 0);
    expect([nodes, points]).toEqual([150, 450]);
    expect(CONNECT_UNLOCK_POINTS).toBe(1);
    expect([nodes + 3, points + 3 * CONNECT_UNLOCK_POINTS]).toEqual([153, 453]);
  });

  it("コストの表のマス ID は、盤面の定義のマス ID と過不足なく一致する(G-025 を含む)", () => {
    const ids = new Set([
      ...RED_BOARD_NODE_IDS,
      ...BLUE_BOARD_NODE_IDS,
      ...YELLOW_BOARD_NODE_IDS,
      ...GREEN_BOARD_NODE_IDS,
    ]);
    expect(new Set(BOARD_NODE_COSTS.keys())).toEqual(ids);
    expect(ids.size).toBe(150);
  });

  it("個別の値(外部マスタの抜き取り): 緑 G-011 = 5、G-025 = 3、青 B-007 = 4、黄 Y-008 = 4、赤 R-051 = 6", () => {
    expect(nodeBoardPoints("G-011")).toBe(5);
    expect(nodeBoardPoints("G-025")).toBe(3);
    expect(nodeBoardPoints("B-007")).toBe(4);
    expect(nodeBoardPoints("Y-008")).toBe(4);
    expect(nodeBoardPoints("R-051")).toBe(6);
    expect(nodeBoardPoints("R-999")).toBeNull();
    expect(nodeBoardPoints("C")).toBeNull();
  });
});
