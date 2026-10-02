import { describe, expect, it } from "vite-plus/test";

import {
  CONNECT_INVENTORY_MAX_COUNT,
  CONNECT_INVENTORY_SCHEMA_VERSION,
  hasInventory,
  inventoryCount,
  inventoryItems,
  inventoryTotal,
  parseConnectInventory,
  placementShortage,
  serializeConnectInventory,
  setInventoryCount,
} from "./connectInventory";
import type { ConnectInventoryEntry } from "./connectInventory";

describe("所持のコネクトの保存形式", () => {
  const entries: ConnectInventoryEntry[] = [
    { extent: "card-3", permil: 2600, count: 2 },
    { extent: "card-3", permil: 2100, count: 1 },
    { extent: "general-1", permil: 1050, count: 3 },
  ];

  it("版番号つきの封筒で書き、読み戻すと同じ。無いキー・壊れた値は空扱い", () => {
    const raw = serializeConnectInventory(entries);
    expect(JSON.parse(raw)).toEqual({ version: CONNECT_INVENTORY_SCHEMA_VERSION, entries });
    expect(parseConnectInventory(raw)).toEqual(entries);
    expect(parseConnectInventory(null)).toEqual([]);
    expect(parseConnectInventory("{")).toEqual([]);
    expect(parseConnectInventory(JSON.stringify({ boards: [] }))).toEqual([]);
    expect(parseConnectInventory("[]")).toEqual([]);
  });

  it("知らない形・正でない ‰・正の整数でない枚数・壊れた項目は捨て、同じ 形 × ‰ は枚数を合算する", () => {
    const raw = JSON.stringify({
      version: 1,
      entries: [
        { extent: "nope", permil: 1500, count: 1 },
        { extent: "card-1", permil: 0, count: 1 },
        { extent: "card-1", permil: -5, count: 1 },
        { extent: "card-1", permil: 1100, count: 0 },
        { extent: "card-1", permil: 1100, count: "2" },
        { extent: "card-1", permil: 1100.4, count: 2.9 },
        { extent: "card-1", permil: 1100, count: 3 },
        { extent: "card-2", permil: 850, count: 500 },
        "text",
        null,
      ],
    });
    expect(parseConnectInventory(raw)).toEqual([
      { extent: "card-1", permil: 1100, count: 5 },
      { extent: "card-2", permil: 850, count: CONNECT_INVENTORY_MAX_COUNT },
    ]);
  });

  it("枚数の読み書き: 置き換え・0 で外す・上限・元の配列は変えない", () => {
    expect(inventoryCount(entries, "card-3", 2600)).toBe(2);
    expect(inventoryCount(entries, "card-3", 1)).toBe(0);
    expect(inventoryTotal(entries, "card-3")).toBe(3);
    expect(inventoryTotal(entries, "center-1")).toBe(0);

    const up = setInventoryCount(entries, "card-3", 2600, 5);
    expect(up.map((e) => [e.extent, e.permil, e.count])).toEqual([
      ["card-3", 2600, 5],
      ["card-3", 2100, 1],
      ["general-1", 1050, 3],
    ]);
    expect(setInventoryCount(entries, "card-3", 2100, 0)).toEqual([
      { extent: "card-3", permil: 2600, count: 2 },
      { extent: "general-1", permil: 1050, count: 3 },
    ]);
    expect(setInventoryCount([], "card-4", 2000, 1)).toEqual([
      { extent: "card-4", permil: 2000, count: 1 },
    ]);
    expect(setInventoryCount(entries, "card-3", 2600, 999)[0]?.count).toBe(
      CONNECT_INVENTORY_MAX_COUNT,
    );
    expect(setInventoryCount(entries, "card-3", 2600, -3)).toHaveLength(2);
    expect(entries[0]?.count).toBe(2);
  });

  it("最適化に渡す形と、持っているかの判定", () => {
    expect(inventoryItems(entries)).toEqual([
      { placement: { extent: "card-3", permil: 2600 }, count: 2 },
      { placement: { extent: "card-3", permil: 2100 }, count: 1 },
      { placement: { extent: "general-1", permil: 1050 }, count: 3 },
    ]);
    expect(hasInventory(entries)).toBe(true);
    expect(hasInventory([])).toBe(false);
  });
});

describe("ボードの配置と所持の過不足", () => {
  const a = { extent: "card-3", permil: 2600 } as const;
  const b = { extent: "general-1", permil: 1050 } as const;
  const owned: ConnectInventoryEntry[] = [
    { extent: "card-3", permil: 2600, count: 2 },
    { extent: "general-1", permil: 1050, count: 1 },
  ];

  it("置いている数が所持の枚数に収まっていれば不足なし(置いていなくても、余っていてもよい)", () => {
    expect(placementShortage({}, owned)).toEqual([]);
    expect(
      placementShortage({ okayu: { card: a, center: b }, korone: { card: a } }, owned),
    ).toEqual([]);
  });

  it("所持にない形・％、または所持の枚数を超えて置いているものを不足として返す", () => {
    expect(
      placementShortage(
        {
          okayu: { card: a, center: a, leader: a }, // 3 枚置いて 2 枚しかない
          korone: { card: { extent: "card-3", permil: 2100 } }, // 同じ形でも ％ が所持にない
          miko: { content: { extent: "content-2", permil: 850 } }, // 所持にない形
        },
        owned,
      ),
    ).toEqual([
      { extent: "card-3", permil: 2600, placed: 3, owned: 2 },
      { extent: "card-3", permil: 2100, placed: 1, owned: 0 },
      { extent: "content-2", permil: 850, placed: 1, owned: 0 },
    ]);
    // 所持が空なら、置いているものはすべて不足
    expect(placementShortage({ okayu: { card: a } }, [])).toEqual([
      { extent: "card-3", permil: 2600, placed: 1, owned: 0 },
    ]);
  });
});
