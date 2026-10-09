import { describe, expect, it } from "vite-plus/test";

import {
  connectInventoryOf,
  hasInventory,
  inventoryCount,
  inventoryItems,
  inventoryTotal,
  placementShortage,
} from "./connectInventory";
import type { ConnectInventoryEntry } from "./connectInventory";
import { CARD_CONNECT_EFFECTS } from "../data/cardConnect";
import { CONNECT_EFFECTS } from "../data/connect";

/**
 * 持っているコネクトは所持カードと開花段階から導く(2026-10-09 — ADR-022)。
 * 1 枚のカードはコネクト 1 枚で、％ は 0〜4凸 が Lv1・5凸 が Lv2(`connectLevel` の暫定モデル)
 */
describe("所持カードから導く持っているコネクト", () => {
  it("カード固有の形と、開花段階に応じた Lv1 / Lv2 の ‰ になる", () => {
    const okayu = CONNECT_EFFECTS[CARD_CONNECT_EFFECTS["nekomata-okayu-01"]];
    const entries = connectInventoryOf([
      { id: "nekomata-okayu-01", bloom: 0 },
      { id: "nekomata-okayu-01", bloom: 5 },
    ]);
    expect(entries).toEqual([
      { extent: okayu.extent, permil: okayu.permil[0], count: 1 },
      { extent: okayu.extent, permil: okayu.permil[1], count: 1 },
    ]);
  });

  it("同じホロメンでもカードが違えば別の効果(★5 / ★4)で、同じ 形 × ‰ は枚数を合算する", () => {
    const entries = connectInventoryOf([
      { id: "nekomata-okayu-02", bloom: 4 },
      { id: "nekomata-okayu-star4-01", bloom: 4 },
      { id: "yukihana-lamy-02", bloom: 4 }, // content-2-r5: おかゆ -02 と同じ 形 × ‰
    ]);
    const okayu5 = CONNECT_EFFECTS["content-2-r5"];
    const okayu4 = CONNECT_EFFECTS["center-4-r4"];
    expect(CARD_CONNECT_EFFECTS["nekomata-okayu-02"]).toBe("content-2-r5");
    expect(CARD_CONNECT_EFFECTS["nekomata-okayu-star4-01"]).toBe("center-4-r4");
    expect(entries).toEqual([
      { extent: okayu5.extent, permil: okayu5.permil[0], count: 2 },
      { extent: okayu4.extent, permil: okayu4.permil[0], count: 1 },
    ]);
  });

  it("データにないカード ID は数えない(登録は残っていても所持のコネクトにはならない)", () => {
    expect(connectInventoryOf([{ id: "unknown-card", bloom: 3 }])).toEqual([]);
    expect(hasInventory(connectInventoryOf([]))).toBe(false);
  });
});

describe("持っているコネクトの集計", () => {
  const entries: ConnectInventoryEntry[] = [
    { extent: "card-3", permil: 2600, count: 2 },
    { extent: "card-3", permil: 2100, count: 1 },
    { extent: "general-1", permil: 1050, count: 3 },
  ];

  it("形 × ‰ の枚数と、形ごとの合計を引ける", () => {
    expect(inventoryCount(entries, "card-3", 2600)).toBe(2);
    expect(inventoryCount(entries, "card-3", 1600)).toBe(0);
    expect(inventoryTotal(entries, "card-3")).toBe(3);
    expect(inventoryTotal(entries, "center-1")).toBe(0);
    expect(hasInventory(entries)).toBe(true);
  });

  it("最適化へは 形 × ‰ × 枚数 の形で渡す", () => {
    expect(inventoryItems(entries)).toEqual([
      { placement: { extent: "card-3", permil: 2600 }, count: 2 },
      { placement: { extent: "card-3", permil: 2100 }, count: 1 },
      { placement: { extent: "general-1", permil: 1050 }, count: 3 },
    ]);
  });

  it("ボードに置いている数が持っている枚数を超えている 形 × ‰ を不足として返す", () => {
    const shortage = placementShortage(
      {
        "nekomata-okayu": {
          center: { extent: "card-3", permil: 2600 },
          card: { extent: "card-3", permil: 2600 },
          leader: { extent: "card-3", permil: 2600 },
        },
        "tokino-sora": {
          center: { extent: "general-1", permil: 1050 },
          content: { extent: "center-1", permil: 1400 },
        },
      },
      entries,
    );
    expect(shortage).toEqual([
      { extent: "card-3", permil: 2600, placed: 3, owned: 2 },
      { extent: "center-1", permil: 1400, placed: 1, owned: 0 },
    ]);
    expect(placementShortage({}, entries)).toEqual([]);
  });
});
