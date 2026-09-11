import { describe, expect, it } from "vite-plus/test";

import { unlockNode } from "./blueBoard";
import { BOARD_CELL_COUNTS, boardUnlockedCount, totalUnlockedCount } from "./boardCount";
import { GREEN_BOARD_NODE_IDS } from "./greenBoard";
import { redUnlockNode } from "./redBoard";
import { yellowToggleNode } from "./yellowBoard";

/**
 * 解放マス数はゲーム内の数え方に合わせ、中心以外のコネクトマス(C)を「そこを通らないと届かないマスが解放されているとき」
 * だけ 1 マスとして数える(2026-09-11 ユーザー指示)
 */
describe("解放マス数(コネクトマスを含む)", () => {
  it("経路が C の手前で止まっていれば C は数えない(青: 中心から B-008 まで 6 マス)", () => {
    const nodes = [...unlockNode(new Set(), "B-008")];
    expect(nodes).toHaveLength(6);
    expect(boardUnlockedCount("blue", nodes)).toBe(6);
  });

  it("C を挟まないと届かないマスを解放すると C を 1 マス分として数える(青 / 赤 / 黄)", () => {
    // 青: C (-7, 0) の外側の B-023 (-8, 0) → 7 マス + C
    expect(boardUnlockedCount("blue", [...unlockNode(new Set(), "B-023")])).toBe(8);
    // 青: C の上下の B-009 (-7, -1) も C を通る
    expect(boardUnlockedCount("blue", [...unlockNode(new Set(), "B-009")])).toBe(8);
    // 赤: C (0, 7) の先のライフ系 R-009 と真上の R-021
    expect(boardUnlockedCount("red", [...redUnlockNode(new Set(), "R-009")])).toBe(8);
    expect(boardUnlockedCount("red", [...redUnlockNode(new Set(), "R-021")])).toBe(8);
    // 黄: C (7, 0) の外側の Y-023
    expect(boardUnlockedCount("yellow", [...yellowToggleNode(new Set(), "Y-023")])).toBe(8);
  });

  it("赤の C の手前(R-008)までなら数えない", () => {
    expect(boardUnlockedCount("red", [...redUnlockNode(new Set(), "R-008")])).toBe(6);
  });

  it("緑にはコネクトマスがなく、解放済みのマスの数そのまま", () => {
    expect(boardUnlockedCount("green", GREEN_BOARD_NODE_IDS)).toBe(GREEN_BOARD_NODE_IDS.length);
    expect(BOARD_CELL_COUNTS.green).toBe(GREEN_BOARD_NODE_IDS.length);
  });

  it("最大は マス + C(赤 64・青 32・黄 32)", () => {
    expect(BOARD_CELL_COUNTS.red).toBe(64);
    expect(BOARD_CELL_COUNTS.blue).toBe(32);
    expect(BOARD_CELL_COUNTS.yellow).toBe(32);
  });

  it("知らない ID は数えない・4 色の合計", () => {
    expect(boardUnlockedCount("blue", ["B-001", "X-999"])).toBe(1);
    expect(
      totalUnlockedCount({
        red: [...redUnlockNode(new Set(), "R-009")],
        blue: [...unlockNode(new Set(), "B-008")],
        yellow: [],
        green: ["G-001"],
      }),
    ).toBe(8 + 6 + 0 + 1);
  });
});
