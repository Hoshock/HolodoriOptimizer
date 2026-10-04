import { describe, expect, it } from "vite-plus/test";

import {
  ACCOUNT_EXPORT_FORMAT,
  ACCOUNT_EXPORT_VERSION,
  serializeAccountExport,
} from "./accountExport";

describe("アカウントの構造化データの出力", () => {
  it("ホロメン(4 色 + コネクト)・メンバー・メモリー・強化ボーナスを 1 つの JSON にする", () => {
    const text = serializeAccountExport({
      boards: {
        red: [],
        blue: [
          { holomenId: "nekomata-okayu", nodes: ["B-001", "B-002"] },
          { holomenId: "tokino-sora", nodes: [] },
        ],
        yellow: [{ holomenId: "shirakami-fubuki", nodes: ["Y-001"] }],
        green: [],
      },
      connect: {
        "nekomata-okayu": { card: { extent: "card-2", permil: 850 } },
        "tokino-sora": {},
      },
      owned: [
        { id: "nekomata-okayu-02", bloom: 5 },
        { id: "unknown-card", bloom: 1 },
      ],
      connectInventory: [
        { extent: "card-3", permil: 2600, count: 2 },
        { extent: "general-1", permil: 1050, count: 1 },
      ],
      account: { memoryPercent: 6, enhancementPercent: 3 },
    });
    const json = JSON.parse(text) as Record<string, unknown>;
    expect(json.format).toBe(ACCOUNT_EXPORT_FORMAT);
    expect(json.version).toBe(ACCOUNT_EXPORT_VERSION);
    // ホロメンはデータの順。空の色・空のコネクトは省く
    expect(json.holomen).toEqual([
      { holomen: "白上フブキ", holomenId: "shirakami-fubuki", yellow: ["Y-001"] },
      {
        holomen: "猫又おかゆ",
        holomenId: "nekomata-okayu",
        blue: ["B-001", "B-002"],
        connect: { card: { extent: "card-2", permil: 850 } },
      },
    ]);
    expect(json.members).toEqual([
      {
        holomen: "猫又おかゆ",
        card: "パラソル下のリバティキャット",
        cardId: "nekomata-okayu-02",
        bloom: 5,
      },
      { holomen: "", card: "", cardId: "unknown-card", bloom: 1 },
    ]);
    // 持っているコネクト(ボードに置いている配置とは別の項目)
    expect(json.connectInventory).toEqual([
      { extent: "card-3", permil: 2600, count: 2 },
      { extent: "general-1", permil: 1050, count: 1 },
    ]);
    expect(json.memoryPercent).toBe(6);
    expect(json.enhancementPercent).toBe(3);
  });

  it("持っているコネクトが空でも connectInventory は [] で出す", () => {
    const json = JSON.parse(
      serializeAccountExport({
        boards: { red: [], blue: [], yellow: [], green: [] },
        connect: {},
        owned: [],
        connectInventory: [],
        account: { memoryPercent: 0, enhancementPercent: 0 },
      }),
    ) as Record<string, unknown>;
    expect(json.connectInventory).toEqual([]);
  });

  const emptyInput = {
    boards: { red: [], blue: [], yellow: [], green: [] },
    connect: {},
    owned: [],
    connectInventory: [],
    account: { memoryPercent: 0, enhancementPercent: 0 },
  };

  it("ホロメンランクと解放済みのコネクトを rank / unlockedConnects として出す(項目の並びは 名前・ID・rank・4 色・unlockedConnects・connect)", () => {
    const text = serializeAccountExport({
      ...emptyInput,
      boards: {
        red: [{ holomenId: "nekomata-okayu", nodes: ["R-001"] }],
        blue: [],
        yellow: [],
        green: [],
      },
      connect: { "nekomata-okayu": { card: { extent: "card-2", permil: 850 } } },
      ranks: [{ holomenId: "nekomata-okayu", rank: 27 }],
      boardConnects: [{ holomenId: "nekomata-okayu", unlocked: ["leader", "card"] }],
    });
    const json = JSON.parse(text) as { holomen: Record<string, unknown>[] };
    expect(json.holomen).toEqual([
      {
        holomen: "猫又おかゆ",
        holomenId: "nekomata-okayu",
        rank: 27,
        red: ["R-001"],
        unlockedConnects: ["leader", "card"],
        connect: { card: { extent: "card-2", permil: 850 } },
      },
    ]);
    expect(Object.keys(json.holomen[0] ?? {})).toEqual([
      "holomen",
      "holomenId",
      "rank",
      "red",
      "unlockedConnects",
      "connect",
    ]);
  });

  it("ランクしか登録していないホロメンも holomen から消さない(rank 以外の項目は出ない)", () => {
    const json = JSON.parse(
      serializeAccountExport({
        ...emptyInput,
        ranks: [{ holomenId: "tokino-sora", rank: 5 }],
      }),
    ) as { holomen: unknown[] };
    expect(json.holomen).toEqual([{ holomen: "ときのそら", holomenId: "tokino-sora", rank: 5 }]);
  });

  it("コネクトの解放だけ登録しているホロメンも消さない(ランクは省略)", () => {
    const json = JSON.parse(
      serializeAccountExport({
        ...emptyInput,
        boardConnects: [{ holomenId: "tokino-sora", unlocked: ["content"] }],
      }),
    ) as { holomen: unknown[] };
    expect(json.holomen).toEqual([
      { holomen: "ときのそら", holomenId: "tokino-sora", unlockedConnects: ["content"] },
    ]);
  });

  it("未登録のランク・空の解放は省略する。ランクもコネクト解放も渡さない旧い呼び出しは、これまでの出力と同じ", () => {
    const base = serializeAccountExport(emptyInput);
    const withEmpty = serializeAccountExport({
      ...emptyInput,
      ranks: [],
      boardConnects: [{ holomenId: "tokino-sora", unlocked: [] }],
    });
    expect(withEmpty).toBe(base);
    expect((JSON.parse(base) as { version: number }).version).toBe(1); // 版は上げない(後から足した任意の項目)
    expect(base).not.toContain("rank");
    expect(base).not.toContain("unlockedConnects");
  });
});
