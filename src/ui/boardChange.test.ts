import { describe, expect, it } from "vite-plus/test";

import { emptyHolomenBoards } from "../data/boardState";
import { boardChangeLabel, boardColorChanges } from "./boardChange";

describe("組み直しプランのボードの、色ごとのマスの変化数", () => {
  it("開けるマスと外すマスを色ごとに分けて数え、変化のない色も 0 で 赤 → 青 → 黄 → 緑 の順に出す", () => {
    const before = { ...emptyHolomenBoards(), blue: ["b1", "b2"], green: ["g1", "g2", "g3"] };
    const after = { ...emptyHolomenBoards(), blue: ["b2", "b3", "b4"], red: ["r1"], green: [] };
    expect(boardColorChanges(before, after)).toEqual([
      { color: "red", added: 1, removed: 0 },
      { color: "blue", added: 2, removed: 1 },
      { color: "yellow", added: 0, removed: 0 },
      { color: "green", added: 0, removed: 3 },
    ]);
  });

  it("コネクトマスはその色のボードのマスとして数える", () => {
    const before = { ...emptyHolomenBoards(), connects: ["card"] as const };
    const after = { ...emptyHolomenBoards(), connects: ["leader", "content"] as const };
    expect(boardColorChanges(before, after)).toEqual([
      { color: "red", added: 1, removed: 0 },
      { color: "blue", added: 0, removed: 1 },
      { color: "yellow", added: 1, removed: 0 },
      { color: "green", added: 0, removed: 0 },
    ]);
  });

  it("表記は 開ける数 → 外す数 で、変化がなければ 0", () => {
    expect(boardChangeLabel({ color: "red", added: 2, removed: 1 })).toBe("+2 −1");
    expect(boardChangeLabel({ color: "red", added: 2, removed: 0 })).toBe("+2");
    expect(boardChangeLabel({ color: "red", added: 0, removed: 3 })).toBe("−3");
    expect(boardChangeLabel({ color: "red", added: 0, removed: 0 })).toBe("0");
  });
});
