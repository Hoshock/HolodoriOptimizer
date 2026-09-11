import { describe, expect, it } from "vite-plus/test";

import { diffDebugBoards, parseDebugBoards, serializeDebugBoards } from "./debugBoards";

describe("デバッグ用ホロメンボードの保存と差分", () => {
  it("往復し、壊れたものは空に戻し、previous は無ければ null", () => {
    const state = {
      current: {
        "nekomata-okayu": { red: ["R-001"], blue: [], yellow: ["Y-001"], green: [] },
      },
      previous: null,
    };
    expect(parseDebugBoards(serializeDebugBoards(state))).toEqual(state);
    expect(parseDebugBoards(null)).toEqual({ current: {}, previous: null });
    expect(parseDebugBoards("{oops")).toEqual({ current: {}, previous: null });
    // 色が欠けていても 4 色そろえて読む。重複は落とす
    expect(
      parseDebugBoards(
        JSON.stringify({ version: 1, current: { a: { red: ["R-001", "R-001"] } }, previous: {} }),
      ),
    ).toEqual({
      current: { a: { red: ["R-001"], blue: [], yellow: [], green: [] } },
      previous: {},
    });
  });

  it("差分はホロメン × 色ごとに増えたマス・減ったマスで、変化のない組は出さない", () => {
    const previous = {
      a: { red: ["R-001", "R-002"], blue: ["B-001"], yellow: [], green: [] },
    };
    const current = {
      a: { red: ["R-002", "R-003"], blue: ["B-001"], yellow: [], green: [] },
      b: { red: [], blue: [], yellow: ["Y-001"], green: [] },
    };
    expect(diffDebugBoards(previous, current)).toEqual([
      { holomenId: "a", color: "red", added: ["R-003"], removed: ["R-001"] },
      { holomenId: "b", color: "yellow", added: ["Y-001"], removed: [] },
    ]);
    expect(diffDebugBoards(current, current)).toEqual([]);
  });
});
