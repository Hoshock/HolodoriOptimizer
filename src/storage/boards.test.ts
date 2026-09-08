import { describe, expect, it } from "vite-plus/test";

import {
  BOARDS_SCHEMA_VERSION,
  BOARDS_STORAGE_KEY,
  GREEN_BOARDS_STORAGE_KEY,
  parseBoards,
  RED_BOARDS_STORAGE_KEY,
  serializeBoards,
  toBoardMap,
  YELLOW_BOARDS_STORAGE_KEY,
} from "./boards";

describe("ホロメンボードの保存形式", () => {
  it("v1(版番号つき)を読め、書き出しは v1 になる", () => {
    const entries = [{ holomenId: "nekomata-okayu", nodes: ["B-001", "B-002"] }];
    const raw = serializeBoards(entries);
    expect(JSON.parse(raw)).toEqual({ version: BOARDS_SCHEMA_VERSION, boards: entries });
    expect(parseBoards(raw)).toEqual(entries);
  });

  it("壊れた文字列・形の違うデータは空扱い", () => {
    expect(parseBoards(null)).toEqual([]);
    expect(parseBoards("{")).toEqual([]);
    expect(parseBoards(JSON.stringify(["x"]))).toEqual([]);
    expect(parseBoards(JSON.stringify({ boards: [{ nodes: [] }, null, 1] }))).toEqual([]);
  });

  it("現在のデータにないホロメン・マス ID も捨てない(計算に渡すときだけ既知のものに絞る)", () => {
    const raw = JSON.stringify({
      version: 1,
      boards: [
        { holomenId: "unknown-holomen", nodes: ["B-001"] },
        { holomenId: "nekomata-okayu", nodes: ["B-001", "B-999", "B-001"] },
        { holomenId: "nekomata-okayu", nodes: ["B-002"] },
      ],
    });
    const entries = parseBoards(raw);
    expect(entries).toEqual([
      { holomenId: "unknown-holomen", nodes: ["B-001"] },
      { holomenId: "nekomata-okayu", nodes: ["B-001", "B-999"] },
    ]);
    expect(toBoardMap("blue", entries)).toEqual({
      "unknown-holomen": ["B-001"],
      "nekomata-okayu": ["B-001"],
    });
    expect(toBoardMap("blue", [{ holomenId: "x", nodes: ["B-999"] }])).toEqual({});
  });

  it("緑は同じ封筒で別キーに保存し、既知のマスは緑の ID で絞る", () => {
    const entries = parseBoards(
      JSON.stringify({
        version: 1,
        boards: [{ holomenId: "nekomata-okayu", nodes: ["G-001", "B-001", "G-999"] }],
      }),
    );
    expect(entries).toEqual([{ holomenId: "nekomata-okayu", nodes: ["G-001", "B-001", "G-999"] }]);
    expect(toBoardMap("green", entries)).toEqual({ "nekomata-okayu": ["G-001"] });
    expect(GREEN_BOARDS_STORAGE_KEY).not.toBe(BOARDS_STORAGE_KEY);
  });

  it("黄も同じ封筒で別キーに保存し、既知のマスは黄の ID で絞る", () => {
    const entries = parseBoards(
      JSON.stringify({
        version: 1,
        boards: [{ holomenId: "nekomata-okayu", nodes: ["Y-001", "B-001", "G-001", "Y-999"] }],
      }),
    );
    expect(toBoardMap("yellow", entries)).toEqual({ "nekomata-okayu": ["Y-001"] });
    expect(
      new Set([BOARDS_STORAGE_KEY, YELLOW_BOARDS_STORAGE_KEY, GREEN_BOARDS_STORAGE_KEY]).size,
    ).toBe(3);
  });

  it("赤も同じ封筒で別キーに保存し、既知のマスは赤の ID で絞る", () => {
    const entries = parseBoards(
      JSON.stringify({
        version: 1,
        boards: [{ holomenId: "tokino-sora", nodes: ["R-001", "B-001", "R-999"] }],
      }),
    );
    expect(toBoardMap("red", entries)).toEqual({ "tokino-sora": ["R-001"] });
    expect(
      new Set([
        RED_BOARDS_STORAGE_KEY,
        BOARDS_STORAGE_KEY,
        YELLOW_BOARDS_STORAGE_KEY,
        GREEN_BOARDS_STORAGE_KEY,
      ]).size,
    ).toBe(4);
  });

  it("旧データの mirrored(左右型)は読み飛ばし、書き出しにも含めない", () => {
    const raw = JSON.stringify({
      version: 1,
      boards: [{ holomenId: "nekomata-okayu", nodes: ["B-001"], mirrored: true }],
    });
    const entries = parseBoards(raw);
    expect(entries).toEqual([{ holomenId: "nekomata-okayu", nodes: ["B-001"] }]);
    expect(serializeBoards(entries)).not.toContain("mirrored");
  });
});
