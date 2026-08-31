import { describe, expect, it } from "vite-plus/test";

import { GACHA_RATES, PICKUP_RATE_EACH } from "../data/gacha";
import type { Card } from "../data/types";
import type { GachaConfig, GachaPools, Rng } from "./gacha";
import { pullGuaranteed, pullOne, pullTen, star5OtherRateEach } from "./gacha";

function makeStar5(id: string): Card {
  return {
    id,
    name: id,
    holomenId: `h-${id}`,
    rarity: 5,
    type: "happy",
    stats: { performance: 1000, technique: 1000, sense: 1000 },
    costumeSkill: { raw: "test", structured: null },
    passiveSkill: { raw: "test", structured: null },
    activeSkill: { raw: "test", structured: null },
    specialSkill: { raw: "test", structured: null },
  };
}

const pools: GachaPools = {
  star5: [makeStar5("s5-a"), makeStar5("s5-b"), makeStar5("s5-c")],
  lowRarityHolomenIds: ["h1", "h2", "h3", "h4"],
};

const noPickup: GachaConfig = { pickupIds: [], pickupRateEach: 0, guaranteeStar5: false };

/** 指定した値を順番に返す乱数(足りなくなったら 0.999… を返す) */
function seq(...values: number[]): Rng {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.9999);
}

describe("gacha", () => {
  it("通常枠: 乱数の区間どおりに ★5 / ★4 / ★3 が出る", () => {
    // ★5(< 0.05)。2 つ目の乱数がカード選択
    expect(pullOne(pools, noPickup, seq(0.049, 0))).toMatchObject({ rarity: 5, cardId: "s5-a" });
    // ★4(0.05 <= r < 0.15)
    expect(pullOne(pools, noPickup, seq(0.05, 0))).toMatchObject({ rarity: 4, holomenId: "h1" });
    expect(pullOne(pools, noPickup, seq(0.1499, 0.99))).toMatchObject({
      rarity: 4,
      holomenId: "h4",
    });
    // ★3(0.15 より上。0.05 + 0.1 は浮動小数点で 0.150000…2 になるため境界ちょうどは避ける)
    expect(pullOne(pools, noPickup, seq(0.16, 0.5))).toMatchObject({ rarity: 3, holomenId: "h3" });
  });

  it("確定枠: ★3 は出ず、★5 でなければ ★4 になる", () => {
    expect(pullGuaranteed(pools, noPickup, seq(0.9999, 0))).toMatchObject({ rarity: 4 });
    expect(pullGuaranteed(pools, noPickup, seq(0.049, 0))).toMatchObject({ rarity: 5 });
  });

  it("スタートダッシュ(guaranteeStar5): 確定枠が必ず ★5 になる", () => {
    const config: GachaConfig = { ...noPickup, guaranteeStar5: true };
    const results = pullTen(pools, config, () => 0.9999);
    expect(results).toHaveLength(10);
    expect(results[9].rarity).toBe(5);
  });

  it("10 連: 10 枚返り、10 枚目は ★4 以上", () => {
    const results = pullTen(pools, noPickup, () => 0.9999);
    expect(results).toHaveLength(10);
    // 乱数 0.9999 では通常枠は全部 ★3
    expect(results.slice(0, 9).every((r) => r.rarity === 3)).toBe(true);
    expect(results[9].rarity).toBe(4);
  });

  it("ピックアップ: 対象は各 1% 相当、その他は残り(5% - 1%)の均等割り", () => {
    const config: GachaConfig = {
      pickupIds: ["s5-a"],
      pickupRateEach: PICKUP_RATE_EACH,
      guaranteeStar5: false,
    };
    const otherRate = star5OtherRateEach(pools, config);
    expect(otherRate).toBeCloseTo((GACHA_RATES.star5 - PICKUP_RATE_EACH) / 2, 10);
    // ★5 内の相対確率: s5-a が 1% / 5% = 0.2。r=0.19 → pickup、r=0.21 → その他
    expect(pullOne(pools, config, seq(0, 0.19))).toMatchObject({
      rarity: 5,
      cardId: "s5-a",
      pickup: true,
    });
    const other = pullOne(pools, config, seq(0, 0.21));
    expect(other.rarity).toBe(5);
    if (other.rarity === 5) expect(other.pickup).toBe(false);
  });

  it("ピックアップにプール外の ID を渡しても無視される", () => {
    const config: GachaConfig = {
      pickupIds: ["not-in-pool"],
      pickupRateEach: PICKUP_RATE_EACH,
      guaranteeStar5: false,
    };
    expect(star5OtherRateEach(pools, config)).toBeCloseTo(GACHA_RATES.star5 / 3, 10);
  });
});
