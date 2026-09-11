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
    expect(json.memoryPercent).toBe(6);
    expect(json.enhancementPercent).toBe(3);
  });
});
