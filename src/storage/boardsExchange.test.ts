import { describe, expect, it } from "vite-plus/test";

import {
  BOARDS_EXCHANGE_FORMAT,
  BOARDS_EXCHANGE_VERSION,
  knownBoardsNodes,
  parseBoardsExchange,
  resolveBoardsHolomen,
  serializeBoardsExchange,
  serializeHolomenBoards,
} from "./boardsExchange";
import type { BoardsByColor } from "./boardsExchange";

const current: BoardsByColor = {
  red: [{ holomenId: "nekomata-okayu", nodes: ["R-001", "R-002"] }],
  blue: [
    { holomenId: "nekomata-okayu", nodes: ["B-001", "B-002", "B-003"] },
    { holomenId: "shirakami-fubuki", nodes: ["B-001"] },
  ],
  yellow: [{ holomenId: "shirakami-fubuki", nodes: [] }],
  green: [{ holomenId: "unknown-holomen", nodes: ["G-001"] }],
};

describe("ホロメンボードの構造化データ", () => {
  it("4 色の登録を 1 ホロメン 1 行にまとめ、空の色は省き、データにないホロメンも残す", () => {
    const json = JSON.parse(serializeBoardsExchange(current)) as {
      format: string;
      version: number;
      boards: Record<string, unknown>[];
    };
    expect(json.format).toBe(BOARDS_EXCHANGE_FORMAT);
    expect(json.version).toBe(BOARDS_EXCHANGE_VERSION);
    expect(json.boards).toEqual([
      { holomen: "白上フブキ", holomenId: "shirakami-fubuki", blue: ["B-001"] },
      {
        holomen: "猫又おかゆ",
        holomenId: "nekomata-okayu",
        red: ["R-001", "R-002"],
        blue: ["B-001", "B-002", "B-003"],
      },
      { holomen: "unknown-holomen", holomenId: "unknown-holomen", green: ["G-001"] },
    ]);
  });

  it("1 ホロメンの 4 色は全色空でも行を 1 つ出し、貼ると同じ状態に戻る（往復）", () => {
    const nodes = { red: ["R-001"], blue: [], yellow: ["Y-001", "Y-002"], green: [] };
    const text = serializeHolomenBoards("nekomata-okayu", nodes);
    const parsed = parseBoardsExchange(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toHaveLength(1);
    const row = parsed.rows[0];
    if (!row) throw new Error("行がない");
    expect(resolveBoardsHolomen(row)).toBe("nekomata-okayu");
    expect(knownBoardsNodes("nekomata-okayu", row)).toEqual({ nodes, unknown: 0 });
    const emptyText = serializeHolomenBoards("nekomata-okayu", {
      red: [],
      blue: [],
      yellow: [],
      green: [],
    });
    const emptyParsed = parseBoardsExchange(emptyText);
    expect(emptyParsed.ok && emptyParsed.rows.length === 1).toBe(true);
  });

  it("format が違う・JSON でない・version が違うものは断り、コードブロックの囲みは外す", () => {
    expect(parseBoardsExchange("{oops").ok).toBe(false);
    expect(
      parseBoardsExchange(JSON.stringify({ format: "holodori-optimizer/import", version: 1 })).ok,
    ).toBe(false);
    expect(
      parseBoardsExchange(
        JSON.stringify({ format: BOARDS_EXCHANGE_FORMAT, version: 2, boards: [] }),
      ).ok,
    ).toBe(false);
    const fenced = "```json\n" + serializeBoardsExchange(current) + "\n```";
    expect(parseBoardsExchange(fenced).ok).toBe(true);
  });

  it("holomenId が無ければ表示名で探し、決まらなければ null。知らないマス ID は数だけ知らせて捨てる", () => {
    const parsed = parseBoardsExchange(
      JSON.stringify({
        format: BOARDS_EXCHANGE_FORMAT,
        version: 1,
        boards: [
          { holomen: "猫又おかゆ", red: ["R-001", "R-999"], green: ["G-001"] },
          { holomen: "だれ" },
          { holomenId: "shirakami-fubuki", blue: ["B-001", "X-1"] },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const [a, b, c] = parsed.rows;
    if (!a || !b || !c) throw new Error("3 行ない");
    expect(resolveBoardsHolomen(a)).toBe("nekomata-okayu");
    expect(resolveBoardsHolomen(b)).toBeNull();
    expect(resolveBoardsHolomen(c)).toBe("shirakami-fubuki");
    expect(knownBoardsNodes("nekomata-okayu", a)).toEqual({
      nodes: { red: ["R-001"], blue: [], yellow: [], green: ["G-001"] },
      unknown: 1,
    });
    expect(knownBoardsNodes("shirakami-fubuki", c).unknown).toBe(1);
  });
});
