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

  it("複数ホロメンの 4 色をデータの順に並べ、全色空のホロメンも行を出し、貼ると同じ状態に戻る（往復）", () => {
    const nodes = { red: ["R-001"], blue: [], yellow: ["Y-001", "Y-002"], green: [] };
    const empty = { red: [], blue: [], yellow: [], green: [] };
    const text = serializeHolomenBoards({ "nekomata-okayu": nodes, "tokino-sora": empty });
    const parsed = parseBoardsExchange(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows.map((r) => r.holomenId)).toEqual(["tokino-sora", "nekomata-okayu"]);
    const row = parsed.rows[1];
    if (!row) throw new Error("行がない");
    expect(resolveBoardsHolomen(row)).toBe("nekomata-okayu");
    expect(knownBoardsNodes("nekomata-okayu", row)).toEqual({ nodes, unknown: 0 });
    expect(parsed.rows[0]?.nodes).toEqual(empty);
  });

  it("コネクトマスの入力は connect として出し、貼ると同じ入力に戻る（無い行は未配置、壊れた値は捨てる）", () => {
    const connect = {
      card: { extent: "card-2" as const, permil: 850 },
      center: { extent: "center-1" as const, permil: 1400 },
    };
    const text = serializeHolomenBoards({
      "nekomata-okayu": { red: ["R-001"], blue: [], yellow: [], green: [], connect },
      "tokino-sora": { red: [], blue: [], yellow: [], green: [], connect: {} },
    });
    const json = JSON.parse(text) as { boards: Record<string, unknown>[] };
    expect(json.boards[1]?.connect).toEqual(connect);
    expect(json.boards[0]).not.toHaveProperty("connect");
    const parsed = parseBoardsExchange(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows[1]?.connect).toEqual(connect);
    expect(parsed.rows[0]?.connect).toEqual({});
    // 4 色の登録 + コネクトの入力からも同じ形で出る（ボードの無いホロメンも connect だけの行になる）
    const withConnect = JSON.parse(
      serializeBoardsExchange(current, { "tokino-sora": connect, "nekomata-okayu": {} }),
    ) as { boards: Record<string, unknown>[] };
    expect(withConnect.boards.find((r) => r.holomenId === "tokino-sora")).toEqual({
      holomen: "ときのそら",
      holomenId: "tokino-sora",
      connect,
    });
    expect(withConnect.boards.find((r) => r.holomenId === "nekomata-okayu")).not.toHaveProperty(
      "connect",
    );
    const broken = parseBoardsExchange(
      JSON.stringify({
        format: BOARDS_EXCHANGE_FORMAT,
        version: 1,
        boards: [{ holomenId: "tokino-sora", connect: { card: { extent: "zzz", permil: 1 } } }],
      }),
    );
    expect(broken.ok && broken.rows[0]?.connect).toEqual({});
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
