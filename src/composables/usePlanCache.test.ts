import { afterEach, describe, expect, it } from "vite-plus/test";

import { cachedPlan, clearPlanCache, getPlan, planCacheKey, setPlan } from "./usePlanCache";

/**
 * 3 つの最適化の結果のキャッシュ(2026-10-04 ユーザー指示): 同じ編成・開花・曲・範囲なら再計算せず、
 * 結果詳細に戻るまで残り、別の画面へ戻ったら捨てる
 */
const team = { leaderId: "L", memberIds: ["A", "B"] };
afterEach(() => clearPlanCache());

describe("planCacheKey", () => {
  it("編成・開花・曲・範囲・種類のどれかが違えば別のキー", () => {
    const base = planCacheKey("board", team, { L: 5, A: 1 }, null, "unit");
    expect(planCacheKey("board", team, { L: 5, A: 1 }, null, "unit")).toBe(base);
    expect(planCacheKey("connect", team, { L: 5, A: 1 }, null, "unit")).not.toBe(base);
    expect(planCacheKey("board", team, { L: 5, A: 2 }, null, "unit")).not.toBe(base);
    expect(planCacheKey("board", team, { L: 5, A: 1 }, "song-1", "unit")).not.toBe(base);
    expect(planCacheKey("board", team, { L: 5, A: 1 }, null, "all")).not.toBe(base);
    expect(
      planCacheKey("board", { leaderId: "L", memberIds: ["B", "A"] }, { L: 5, A: 1 }, null, "unit"),
    ).not.toBe(base);
  });

  it("編成にいないカードの開花は関係しない(キャッシュを無駄に分けない)", () => {
    expect(planCacheKey("board", team, { L: 5, Z: 3 }, null)).toBe(
      planCacheKey("board", team, { L: 5, Z: 0 }, null),
    );
  });
});

describe("キャッシュの出し入れ", () => {
  it("cachedPlan は同じキーで 1 度しか計算しない。clearPlanCache で捨てる", () => {
    let calls = 0;
    const compute = (): number => ++calls;
    expect(cachedPlan("k", compute)).toBe(1);
    expect(cachedPlan("k", compute)).toBe(1);
    expect(calls).toBe(1);
    clearPlanCache();
    expect(cachedPlan("k", compute)).toBe(2);
  });

  it("getPlan / setPlan(Worker の結果を入れる側)", () => {
    expect(getPlan("x")).toBeUndefined();
    setPlan("x", { a: 1 });
    expect(getPlan("x")).toEqual({ a: 1 });
    clearPlanCache();
    expect(getPlan("x")).toBeUndefined();
  });
});
