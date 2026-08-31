import { describe, expect, it } from "vite-plus/test";

import type { Card, Holomen } from "../data/types";
import { combinationCount, optimize } from "./optimize";
import { buildHolomenMap, computeUnitScore } from "./score";

function makeCard(overrides: {
  id: string;
  holomenId: string;
  type?: Card["type"];
  stats?: Partial<Card["stats"]>;
  costume?: NonNullable<Card["costumeSkill"]["structured"]>;
  passive?: NonNullable<Card["passiveSkill"]["structured"]>;
}): Card {
  return {
    id: overrides.id,
    name: overrides.id,
    holomenId: overrides.holomenId,
    rarity: 5,
    type: overrides.type ?? "happy",
    stats: {
      performance: 1000,
      technique: 1000,
      sense: 1000,
      ...overrides.stats,
    },
    costumeSkill: { raw: "test", structured: overrides.costume ?? null },
    passiveSkill: { raw: "test", structured: overrides.passive ?? null },
    activeSkill: { raw: "test", structured: null },
    specialSkill: { raw: "test", structured: null },
  };
}

const holomen: Holomen[] = [
  { id: "h-leader", name: "リーダー", affiliations: ["gen0"] },
  { id: "h1", name: "メンバー1", affiliations: ["gen0"] },
  { id: "h2", name: "メンバー2", affiliations: ["gen0"] },
  { id: "h3", name: "メンバー3", affiliations: ["gen1"] },
  { id: "h4", name: "メンバー4", affiliations: ["gen1"] },
  { id: "h5", name: "メンバー5", affiliations: ["gamers"] },
  { id: "h6", name: "メンバー6", affiliations: ["gamers"] },
];
const holomenMap = buildHolomenMap(holomen);

describe("computeUnitScore", () => {
  it("スキルなしならメンバー5人の合計値になり、リーダーは加算されない", () => {
    const leader = makeCard({ id: "leader", holomenId: "h-leader" });
    const members = ["h1", "h2", "h3", "h4", "h5"].map((h) =>
      makeCard({ id: `m-${h}`, holomenId: h }),
    );
    const result = computeUnitScore({ leader, members }, holomenMap);
    expect(result.unitScore).toBe(15000);
    expect(result.costumeSkillActive).toBe(false);
  });

  it("衣装スキルは条件成立時のみ合算値に乗算される", () => {
    const costume = {
      condition: { kind: "affiliationCount", affiliation: "gen0", min: 2 },
      effects: [{ kind: "paramUp", target: { kind: "all" }, param: "all", percent: 50 }],
    } as const;
    const leader = makeCard({
      id: "leader",
      holomenId: "h-leader",
      costume: { ...costume, effects: [...costume.effects] },
    });
    const met = ["h1", "h2", "h3", "h4", "h5"].map((h) => makeCard({ id: `m-${h}`, holomenId: h }));
    const resultMet = computeUnitScore({ leader, members: met }, holomenMap);
    expect(resultMet.costumeSkillActive).toBe(true);
    expect(resultMet.unitScore).toBeCloseTo(22500);

    // gen0 が 1 人だけなら不成立
    const unmet = ["h1", "h3", "h4", "h5", "h6"].map((h) =>
      makeCard({ id: `m-${h}`, holomenId: h }),
    );
    const resultUnmet = computeUnitScore({ leader, members: unmet }, holomenMap);
    expect(resultUnmet.costumeSkillActive).toBe(false);
    expect(resultUnmet.unitScore).toBeCloseTo(15000);
  });

  it("パッシブは対象メンバーの実効値に加算合成される", () => {
    const leader = makeCard({ id: "leader", holomenId: "h-leader" });
    const buffer = makeCard({
      id: "buffer",
      holomenId: "h1",
      passive: {
        condition: { kind: "always" },
        effects: [
          {
            kind: "paramUp",
            target: { kind: "affiliation", affiliation: "gen1" },
            param: "sense",
            percent: 40,
          },
        ],
      },
    });
    const members = [
      buffer,
      makeCard({ id: "m3", holomenId: "h3" }), // gen1: sense 1000 → 1400
      makeCard({ id: "m4", holomenId: "h4" }), // gen1: sense 1000 → 1400
      makeCard({ id: "m5", holomenId: "h5" }),
      makeCard({ id: "m6", holomenId: "h6" }),
    ];
    const result = computeUnitScore({ leader, members }, holomenMap);
    expect(result.baseTotals.sense).toBeCloseTo(5800);
    expect(result.unitScore).toBeCloseTo(15800);
  });
});

describe("optimize", () => {
  const leader = makeCard({
    id: "leader",
    holomenId: "h-leader",
    costume: {
      condition: { kind: "typeCount", type: "cute", min: 2 },
      effects: [{ kind: "paramUp", target: { kind: "all" }, param: "all", percent: 100 }],
    },
  });
  // h1〜h6 の 6 ホロメン × カード。h1 だけ強いカードと弱いカードの 2 枚持ち
  const pool: Card[] = [
    makeCard({ id: "c1-strong", holomenId: "h1", type: "cute", stats: { performance: 3000 } }),
    makeCard({ id: "c1-weak", holomenId: "h1", type: "cute", stats: { performance: 100 } }),
    makeCard({ id: "c2", holomenId: "h2", type: "cute" }),
    makeCard({ id: "c3", holomenId: "h3", type: "happy" }),
    makeCard({ id: "c4", holomenId: "h4", type: "happy" }),
    makeCard({ id: "c5", holomenId: "h5", type: "pure" }),
    makeCard({ id: "c6", holomenId: "h6", type: "pure" }),
  ];

  it("最適解は同一ホロメン排他を守りつつ強いカードを選ぶ", () => {
    const result = optimize({ leader, topN: 3 }, pool, holomenMap);
    const best = result.candidates[0];
    expect(best).toBeDefined();
    const ids = best?.members.map((m) => m.id) ?? [];
    expect(ids).toContain("c1-strong");
    expect(ids).not.toContain("c1-weak");
    // cute 2 枚(c1-strong, c2)がいるので衣装スキル発動
    expect(best?.breakdown.costumeSkillActive).toBe(true);
    expect(result.candidates.length).toBe(3);
    // スコア降順
    const scores = result.candidates.map((c) => c.breakdown.unitScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("固定メンバーと除外カードを尊重する", () => {
    const fixed = pool.find((c) => c.id === "c1-weak");
    expect(fixed).toBeDefined();
    if (!fixed) return;
    const result = optimize(
      { leader, fixedMembers: [fixed], excludedCardIds: ["c5"], topN: 1 },
      pool,
      holomenMap,
    );
    const best = result.candidates[0];
    const ids = best?.members.map((m) => m.id) ?? [];
    expect(ids).toContain("c1-weak");
    expect(ids).not.toContain("c1-strong"); // 同一ホロメン排他
    expect(ids).not.toContain("c5"); // 除外
    expect(ids.length).toBe(5);
  });

  it("リーダーと同一ホロメンのカードもメンバー候補になる(リーダーはメンバーと重複可)", () => {
    const withLeaderDupe = [
      ...pool,
      makeCard({ id: "leader-dupe", holomenId: "h-leader", stats: { performance: 99999 } }),
    ];
    const result = optimize({ leader, topN: 1 }, withLeaderDupe, holomenMap);
    const ids = result.candidates[0]?.members.map((m) => m.id) ?? [];
    expect(ids).toContain("leader-dupe");
  });

  it("リーダーと同一ホロメンの固定メンバーを許容し、固定同士の重複は拒否する", () => {
    const leaderSame = makeCard({ id: "fixed-leader-same", holomenId: "h-leader" });
    const ok = optimize({ leader, fixedMembers: [leaderSame], topN: 1 }, pool, holomenMap);
    expect(ok.candidates[0]?.members.map((m) => m.id)).toContain("fixed-leader-same");

    const dupeA = makeCard({ id: "dupe-a", holomenId: "h1" });
    const dupeB = makeCard({ id: "dupe-b", holomenId: "h1" });
    expect(() => optimize({ leader, fixedMembers: [dupeA, dupeB] }, pool, holomenMap)).toThrow();
  });

  it("combinationCount が正しい", () => {
    expect(combinationCount(69, 5)).toBe(11238513);
    expect(combinationCount(5, 5)).toBe(1);
    expect(combinationCount(4, 5)).toBe(0);
  });
});
