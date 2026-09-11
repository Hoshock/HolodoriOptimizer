import { describe, expect, it } from "vite-plus/test";

import {
  diffDebugBoards,
  diffDebugConnect,
  parseDebugBoards,
  serializeDebugBoards,
} from "./debugBoards";

describe("デバッグ用ホロメンボードの保存と差分", () => {
  it("往復し、壊れたものは空に戻し、previous は無ければ null", () => {
    const state = {
      current: {
        "nekomata-okayu": {
          red: ["R-001"],
          blue: [],
          yellow: ["Y-001"],
          green: [],
          connect: { card: { extent: "card-2" as const, permil: 850 } },
        },
      },
      previous: null,
    };
    expect(parseDebugBoards(serializeDebugBoards(state))).toEqual(state);
    expect(parseDebugBoards(null)).toEqual({ current: {}, previous: null });
    expect(parseDebugBoards("{oops")).toEqual({ current: {}, previous: null });
    // 色が欠けていても 4 色そろえて読む。重複は落とす。コネクトが無ければ未配置、壊れた値は捨てる
    expect(
      parseDebugBoards(
        JSON.stringify({
          version: 1,
          current: {
            a: { red: ["R-001", "R-001"] },
            b: { connect: { center: { extent: "nope", permil: 1 }, leader: "x" } },
          },
          previous: {},
        }),
      ),
    ).toEqual({
      current: {
        a: { red: ["R-001"], blue: [], yellow: [], green: [], connect: {} },
        b: { red: [], blue: [], yellow: [], green: [], connect: {} },
      },
      previous: {},
    });
  });

  it("差分はホロメン × 色ごとに増えたマス・減ったマスで、変化のない組は出さない", () => {
    const previous = {
      a: { red: ["R-001", "R-002"], blue: ["B-001"], yellow: [], green: [], connect: {} },
    };
    const current = {
      a: { red: ["R-002", "R-003"], blue: ["B-001"], yellow: [], green: [], connect: {} },
      b: { red: [], blue: [], yellow: ["Y-001"], green: [], connect: {} },
    };
    expect(diffDebugBoards(previous, current)).toEqual([
      { holomenId: "a", color: "red", added: ["R-003"], removed: ["R-001"] },
      { holomenId: "b", color: "yellow", added: ["Y-001"], removed: [] },
    ]);
    expect(diffDebugBoards(current, current)).toEqual([]);
  });

  it("コネクトの差分はホロメン × アンカーごとの前後で、同じ入力は出さない", () => {
    const empty = { red: [], blue: [], yellow: [], green: [] };
    const previous = {
      a: { ...empty, connect: { card: { extent: "card-2" as const, permil: 850 } } },
    };
    const current = {
      a: {
        ...empty,
        connect: {
          card: { extent: "card-2" as const, permil: 1350 },
          center: { extent: "center-1" as const, permil: 1400 },
        },
      },
      b: { ...empty, connect: {} },
    };
    expect(diffDebugConnect(previous, current)).toEqual([
      {
        holomenId: "a",
        anchor: "center",
        before: null,
        after: { extent: "center-1", permil: 1400 },
      },
      {
        holomenId: "a",
        anchor: "card",
        before: { extent: "card-2", permil: 850 },
        after: { extent: "card-2", permil: 1350 },
      },
    ]);
    expect(diffDebugConnect(current, current)).toEqual([]);
  });
});
