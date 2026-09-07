import { describe, expect, it } from "vite-plus/test";

import { BOARDS_SCHEMA_VERSION, parseBoards, serializeBoards, toBoardMap } from "./boards";

describe("青ボードの保存形式", () => {
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
    expect(toBoardMap(entries)).toEqual({
      "unknown-holomen": ["B-001"],
      "nekomata-okayu": ["B-001"],
    });
    expect(toBoardMap([{ holomenId: "x", nodes: ["B-999"] }])).toEqual({});
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
