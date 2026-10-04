import { describe, expect, it } from "vite-plus/test";

import { unlockNode } from "./blueBoard";
import { BOARD_CELL_COUNTS, boardUnlockedCount, totalUnlockedCount } from "./boardCount";
import { boardColorTotals } from "./boardPoints";
import { GREEN_BOARD_NODE_IDS } from "./greenBoard";
import { redUnlockNode } from "./redBoard";
import { yellowToggleNode } from "./yellowBoard";

/**
 * 解放マス数は**明示的に解放した通常マス + 解放済みのコネクトマス(赤 / 青 / 黄の C)**で、中心は数えない(2026-10-04 ユーザー指示。
 * 旧仕様は「先のマスが解放されていればコネクトも解放扱い」と推定して数えていた)。コネクトに効果を置いているかどうかは数に影響しない
 */
describe("解放マス数(コネクトマスを含む)", () => {
  it("コネクトの直前まで 8 マス開けてコネクトが未解放なら 8(コネクトは数えない・1 Pt も使わない)", () => {
    const nodes = [...unlockNode(new Set(), "B-008")];
    expect(nodes).toHaveLength(6);
    expect(boardUnlockedCount("blue", nodes, [])).toBe(6);
  });

  it("コネクトを解放すると 1 マス増える(その先がなくても)。先を開けても数えるのは通常マスだけ増える", () => {
    const before = ["B-001", "B-002", "B-005", "B-006", "B-007", "B-008"];
    expect(boardUnlockedCount("blue", before, [])).toBe(6);
    expect(boardUnlockedCount("blue", before, ["card"])).toBe(7);
    // 先を 5 マス開ける: 6 + コネクト 1 + 5
    const beyond = [...before, "B-023", "B-024", "B-025", "B-026", "B-027"];
    expect(boardUnlockedCount("blue", beyond, ["card"])).toBe(12);
  });

  it("コネクトが解放済みでなければ、先のマスが保存されていてもコネクトは数えない(推定しない)", () => {
    expect(boardUnlockedCount("blue", [...unlockNode(new Set(), "B-023")], [])).toBe(7);
    expect(boardUnlockedCount("red", [...redUnlockNode(new Set(), "R-009")], [])).toBe(7);
    expect(boardUnlockedCount("yellow", [...yellowToggleNode(new Set(), "Y-023")], [])).toBe(7);
  });

  it("コネクトの解放は自分の色にだけ効く(赤の leader は赤だけ)", () => {
    expect(boardUnlockedCount("red", ["R-001"], ["leader"])).toBe(2);
    expect(boardUnlockedCount("blue", ["B-001"], ["leader"])).toBe(1);
    expect(boardUnlockedCount("yellow", ["Y-001"], ["content"])).toBe(2);
  });

  it("緑にはコネクトマスがなく、解放済みのマスの数そのまま", () => {
    expect(boardUnlockedCount("green", GREEN_BOARD_NODE_IDS)).toBe(GREEN_BOARD_NODE_IDS.length);
    expect(BOARD_CELL_COUNTS.green).toBe(GREEN_BOARD_NODE_IDS.length);
    expect(boardUnlockedCount("green", ["G-001"], ["leader", "card", "content"])).toBe(1);
  });

  it("通常マスは 赤 63・青 31・黄 31・緑 25 の 150、コネクトを入れた最大は 153(中心は数えない)", () => {
    expect(BOARD_CELL_COUNTS.red).toBe(64);
    expect(BOARD_CELL_COUNTS.blue).toBe(32);
    expect(BOARD_CELL_COUNTS.yellow).toBe(32);
    expect(BOARD_CELL_COUNTS.green).toBe(25);
    const nodes = (["red", "blue", "yellow", "green"] as const).reduce(
      (sum, c) => sum + boardColorTotals(c).nodes,
      0,
    );
    expect(nodes).toBe(150);
    expect(Object.values(BOARD_CELL_COUNTS).reduce((a, b) => a + b, 0)).toBe(153);
  });

  it("知らない ID は数えない・4 色の合計(解放済みのコネクトも足す)", () => {
    expect(boardUnlockedCount("blue", ["B-001", "X-999"])).toBe(1);
    expect(
      totalUnlockedCount(
        {
          red: [...redUnlockNode(new Set(), "R-009")],
          blue: [...unlockNode(new Set(), "B-008")],
          yellow: [],
          green: ["G-001"],
        },
        ["leader"],
      ),
    ).toBe(7 + 1 + 6 + 0 + 1);
  });
});
