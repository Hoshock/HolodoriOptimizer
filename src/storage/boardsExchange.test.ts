import { describe, expect, it } from "vite-plus/test";

import {
  applyBoardsImport,
  BOARDS_EXCHANGE_FORMAT,
  BOARDS_EXCHANGE_VERSION,
  parseBoardsExchange,
  planBoardsImport,
  serializeBoardsExchange,
} from "./boardsExchange";
import type { BoardsByColor } from "./boardsExchange";

const empty: BoardsByColor = { red: [], blue: [], yellow: [], green: [] };
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
  it("登録している 4 色を 1 ホロメン 1 行にまとめ、空の色は省き、データにないホロメンも残す", () => {
    const text = serializeBoardsExchange(current);
    const json = JSON.parse(text) as {
      format: string;
      version: number;
      boards: Record<string, unknown>[];
    };
    expect(json.format).toBe(BOARDS_EXCHANGE_FORMAT);
    expect(json.version).toBe(BOARDS_EXCHANGE_VERSION);
    expect(json.boards).toEqual([
      {
        holomen: "白上フブキ",
        holomenId: "shirakami-fubuki",
        blue: ["B-001"],
      },
      {
        holomen: "猫又おかゆ",
        holomenId: "nekomata-okayu",
        red: ["R-001", "R-002"],
        blue: ["B-001", "B-002", "B-003"],
      },
      { holomen: "unknown-holomen", holomenId: "unknown-holomen", green: ["G-001"] },
    ]);
  });

  it("コピーした JSON を貼ると同じ状態に戻る（往復）", () => {
    const parsed = parseBoardsExchange(serializeBoardsExchange(current));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = planBoardsImport(parsed.rows, current);
    expect(plan.unknownHolomen).toBe(1); // データにないホロメンは特定できない
    expect(plan.rows.every((r) => !r.changed)).toBe(true);
    const next = applyBoardsImport(plan.rows, current);
    expect(next.red).toEqual(current.red);
    expect(next.blue).toEqual(current.blue);
  });

  it("format が違う・JSON でない・version が違うものは断る", () => {
    expect(parseBoardsExchange("{oops").ok).toBe(false);
    expect(
      parseBoardsExchange(JSON.stringify({ format: "holodori-optimizer/import", version: 1 })).ok,
    ).toBe(false);
    expect(
      parseBoardsExchange(
        JSON.stringify({ format: BOARDS_EXCHANGE_FORMAT, version: 2, boards: [] }),
      ).ok,
    ).toBe(false);
    const fenced = "```json\n" + serializeBoardsExchange(empty) + "\n```";
    expect(parseBoardsExchange(fenced).ok).toBe(true);
  });

  it("holomenId が無ければ表示名で探し、知らないマス ID は数だけ知らせて捨てる", () => {
    const parsed = parseBoardsExchange(
      JSON.stringify({
        format: BOARDS_EXCHANGE_FORMAT,
        version: 1,
        boards: [
          { holomen: "猫又おかゆ", red: ["R-001", "R-999"], green: ["G-001"] },
          { holomen: "だれ" },
          { holomenId: "nekomata-okayu", red: ["R-003"] },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = planBoardsImport(parsed.rows, current);
    // 特定できない 1 行 + 同じホロメンの 2 回目は数えて捨てる
    expect(plan.unknownHolomen).toBe(2);
    expect(plan.unknownNodes).toBe(1);
    expect(plan.rows).toHaveLength(1);
    const row = plan.rows[0];
    expect(row?.holomenId).toBe("nekomata-okayu");
    expect(row?.counts.red).toEqual({ before: 2, after: 1 });
    expect(row?.counts.blue).toEqual({ before: 3, after: 0 }); // 省いた色は全部解除
    expect(row?.counts.green).toEqual({ before: 0, after: 1 });
    expect(row?.changed).toBe(true);
  });

  it("取り込みは書いてあるホロメンの 4 色を置き換え、書いていないホロメンはそのまま", () => {
    const parsed = parseBoardsExchange(
      JSON.stringify({
        format: BOARDS_EXCHANGE_FORMAT,
        version: 1,
        boards: [{ holomenId: "nekomata-okayu", red: ["R-003"], green: ["G-001"] }],
      }),
    );
    if (!parsed.ok) throw new Error(parsed.message);
    const plan = planBoardsImport(parsed.rows, current);
    const next = applyBoardsImport(plan.rows, current);
    expect(next.red).toEqual([{ holomenId: "nekomata-okayu", nodes: ["R-003"] }]);
    expect(next.blue).toEqual([
      { holomenId: "nekomata-okayu", nodes: [] },
      { holomenId: "shirakami-fubuki", nodes: ["B-001"] },
    ]);
    expect(next.green).toEqual([
      { holomenId: "unknown-holomen", nodes: ["G-001"] },
      { holomenId: "nekomata-okayu", nodes: ["G-001"] },
    ]);
    // 元の配列は変えない
    expect(current.red[0]?.nodes).toEqual(["R-001", "R-002"]);
  });
});
