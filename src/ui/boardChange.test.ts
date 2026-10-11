import { describe, expect, it } from "vite-plus/test";

import { emptyHolomenBoards } from "../data/boardState";
import { boardChangeLabel, boardColorChanges, connectChange } from "./boardChange";

describe("組み直しプランの一覧の、色ごとのマスとコネクトの変化数", () => {
  it("開けるマスと外すマスを色ごとに分けて数え、変化のない色も ±0 で 赤 → 青 → 黄 → 緑 の順に出す", () => {
    const before = { ...emptyHolomenBoards(), blue: ["b1", "b2"], green: ["g1", "g2", "g3"] };
    const after = { ...emptyHolomenBoards(), blue: ["b2", "b3", "b4"], red: ["r1"], green: [] };
    expect(boardColorChanges(before, after)).toEqual([
      { color: "red", added: 1, removed: 0 },
      { color: "blue", added: 2, removed: 1 },
      { color: "yellow", added: 0, removed: 0 },
      { color: "green", added: 0, removed: 3 },
    ]);
  });

  // 2026-10-11 ユーザー指示「赤のコネクトは赤に差分を含める、みたいなことはしない」
  it("コネクトマスの解放・解除は色に数えない", () => {
    const before = { ...emptyHolomenBoards(), connects: ["card"] as const };
    const after = { ...emptyHolomenBoards(), connects: ["leader", "content"] as const };
    expect(boardColorChanges(before, after).every((c) => c.added + c.removed === 0)).toBe(true);
  });

  it("コネクトは 置く・解放する = +1、外す・解除する = −1、置き換え = +1 −1 で数える", () => {
    const a = { extent: "card-3" as const, permil: 1500 };
    const b = { extent: "card-3" as const, permil: 2000 };
    const boards = (...connects: ("leader" | "card" | "content")[]) => ({
      ...emptyHolomenBoards(),
      connects,
    });
    // 置き換え(中心)
    expect(
      connectChange(
        { boards: boards(), placements: { center: a } },
        { boards: boards(), placements: { center: b } },
      ),
    ).toEqual({ added: 1, removed: 1 });
    // 解放して置く(赤)= +1、外して解除する(青)= −1
    expect(
      connectChange(
        { boards: boards("card"), placements: { card: a } },
        { boards: boards("leader"), placements: { leader: a } },
      ),
    ).toEqual({ added: 1, removed: 1 });
    // 置かずに解放するだけ = +1。同じ配置のままなら数えない
    expect(
      connectChange(
        { boards: boards(), placements: { center: a } },
        { boards: boards("content"), placements: { center: { ...a } } },
      ),
    ).toEqual({ added: 1, removed: 0 });
    // 解除したコネクトマスに残った配置は無いものとして比べる(外す = −1 だけ)
    expect(
      connectChange(
        { boards: boards("card"), placements: { card: a } },
        { boards: boards(), placements: { card: a } },
      ),
    ).toEqual({ added: 0, removed: 1 });
  });

  it("表記は 開ける数 → 外す数 で、変化がなければ ±0", () => {
    expect(boardChangeLabel({ color: "red", added: 2, removed: 1 })).toBe("+2 −1");
    expect(boardChangeLabel({ color: "red", added: 2, removed: 0 })).toBe("+2");
    expect(boardChangeLabel({ color: "red", added: 0, removed: 3 })).toBe("−3");
    expect(boardChangeLabel({ color: "red", added: 0, removed: 0 })).toBe("±0");
  });
});
