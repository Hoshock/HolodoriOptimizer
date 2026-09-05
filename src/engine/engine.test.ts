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

  it("self 対象のパッシブはスキル持ち自身にだけ加算される", () => {
    const leader = makeCard({ id: "leader", holomenId: "h-leader" });
    const selfBuffer = makeCard({
      id: "self-buffer",
      holomenId: "h1",
      passive: {
        condition: { kind: "always" },
        effects: [{ kind: "paramUp", target: { kind: "self" }, param: "all", percent: 50 }],
      },
    });
    const members = [
      selfBuffer,
      ...["h2", "h3", "h4", "h5"].map((h) => makeCard({ id: `m-${h}`, holomenId: h })),
    ];
    const result = computeUnitScore({ leader, members }, holomenMap);
    // 自身のみ全パラメータ +50%(+1500)。他メンバーには波及しない
    expect(result.unitScore).toBeCloseTo(16500);
  });

  it("衣装スキルの scoreSupport 効果は基礎スコアに乗算されない", () => {
    const leader = makeCard({
      id: "leader",
      holomenId: "h-leader",
      costume: {
        condition: { kind: "always" },
        effects: [{ kind: "scoreSupport", target: { kind: "all" }, percent: 60 }],
      },
    });
    const members = ["h1", "h2", "h3", "h4", "h5"].map((h) =>
      makeCard({ id: `m-${h}`, holomenId: h }),
    );
    const result = computeUnitScore({ leader, members }, holomenMap);
    expect(result.costumeSkillActive).toBe(true);
    expect(result.unitScore).toBe(15000);
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

  it("必須ホロメンはメンバーに必ず 1 枚入り、満たせなければ候補なし(おかゆモード)", () => {
    // h6 は弱いので通常は落とされる
    const weakPool = pool.map((c) =>
      c.holomenId === "h6"
        ? makeCard({ id: "c6-weak", holomenId: "h6", stats: { performance: 1 } })
        : c,
    );
    const normal = optimize({ leader, topN: 1 }, weakPool, holomenMap);
    expect(normal.candidates[0]?.members.map((m) => m.id)).not.toContain("c6-weak");

    const required = optimize(
      { leader, topN: 3, requiredMemberHolomenIds: ["h6"] },
      weakPool,
      holomenMap,
    );
    expect(required.candidates.length).toBe(3);
    for (const c of required.candidates) {
      expect(c.members.filter((m) => m.holomenId === "h6").length).toBe(1);
    }
    // 総組合せ数は h6 を含む組合せだけに絞られる: C(7,5) − C(6,5) = 21 − 6 = 15
    let reportedTotal = 0;
    optimize(
      {
        leader,
        topN: 1,
        requiredMemberHolomenIds: ["h6"],
        onProgress: (_done, total) => {
          reportedTotal = total;
        },
      },
      weakPool,
      holomenMap,
    );
    expect(reportedTotal).toBe(15);

    // 必須ホロメンがプールにいなければ満たせない
    const none = optimize(
      { leader, topN: 3, requiredMemberHolomenIds: ["h-missing"] },
      weakPool,
      holomenMap,
    );
    expect(none.candidates).toEqual([]);
  });

  it("必須ホロメンは固定メンバーで満たしてもよい", () => {
    const fixed = pool.find((c) => c.id === "c6");
    if (!fixed) throw new Error("c6 がない");
    const result = optimize(
      { leader, topN: 1, fixedMembers: [fixed], requiredMemberHolomenIds: ["h6"] },
      pool,
      holomenMap,
    );
    expect(result.candidates[0]?.members.map((m) => m.id)).toContain("c6");
  });

  it("リーダー未指定時の候補を leaderCandidateIds で限定できる", () => {
    const withLeader = [...pool, leader];
    const result = optimize(
      { leader: null, topN: 5, leaderCandidateIds: ["c2"] },
      withLeader,
      holomenMap,
    );
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const c of result.candidates) expect(c.leader.id).toBe("c2");
  });

  it("requireCostumeSkill で衣装スキル不発の編成が候補から外れる(未構造化のリーダーは残る)", () => {
    // leader の衣装スキルは cute 2 枚が条件。cute は c1-strong/c1-weak(同一ホロメン)と c2 の 2 ホロメンのみ
    const all = optimize({ leader, topN: 100 }, pool, holomenMap);
    expect(all.candidates.some((c) => !c.breakdown.costumeSkillActive)).toBe(true);

    const filtered = optimize({ leader, topN: 100, requireCostumeSkill: true }, pool, holomenMap);
    expect(filtered.candidates.length).toBeGreaterThan(0);
    expect(filtered.candidates.length).toBeLessThan(all.candidates.length);
    for (const c of filtered.candidates) expect(c.breakdown.costumeSkillActive).toBe(true);
    // 最良の編成は変わらない(最良はもともと発動している)
    expect(filtered.candidates[0]?.members.map((m) => m.id)).toEqual(
      all.candidates[0]?.members.map((m) => m.id),
    );

    // 発動できない条件のリーダーなら候補なし
    const impossible = makeCard({
      id: "impossible",
      holomenId: "h-leader",
      costume: {
        condition: { kind: "affiliationCount", affiliation: "gamers", min: 3 },
        effects: [{ kind: "paramUp", target: { kind: "all" }, param: "all", percent: 10 }],
      },
    });
    const none = optimize(
      { leader: impossible, topN: 5, requireCostumeSkill: true },
      pool,
      holomenMap,
    );
    expect(none.candidates).toEqual([]);

    // 衣装スキルが未構造化のリーダーは判定できないので除かない
    const plain = makeCard({ id: "plain", holomenId: "h-leader" });
    const kept = optimize({ leader: plain, topN: 5, requireCostumeSkill: true }, pool, holomenMap);
    expect(kept.candidates.length).toBe(5);
  });

  it("requireCostumeSkill はリーダー探索でも効き、不発のリーダーだけが落ちる", () => {
    const plain = makeCard({ id: "plain", holomenId: "h-leader" });
    const withLeaders = [...pool, leader, plain];
    const result = optimize(
      { leader: null, topN: 100, requireCostumeSkill: true },
      withLeaders,
      holomenMap,
    );
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const c of result.candidates) {
      if (c.leader.costumeSkill.structured) expect(c.breakdown.costumeSkillActive).toBe(true);
    }
    // 条件つきリーダー(leader)は cute 2 枚の編成にだけ現れ、無条件の plain は全編成に現れる
    expect(result.candidates.some((c) => c.leader.id === "plain")).toBe(true);
    expect(result.candidates.some((c) => c.leader.id === leader.id)).toBe(true);
  });

  it("requireAllPassives でパッシブが 1 人でも不発の編成が候補から外れる", () => {
    // gamers 2 人が条件のパッシブ持ち(強い)。gamers は h5/h6 の 2 人だけなので両方入るときだけ発動
    const conditional = makeCard({
      id: "cond-passive",
      holomenId: "h5",
      type: "pure",
      stats: { performance: 5000 },
      passive: {
        condition: { kind: "affiliationCount", affiliation: "gamers", min: 2 },
        effects: [{ kind: "paramUp", target: { kind: "self" }, param: "all", percent: 10 }],
      },
    });
    const withCond = pool.map((c) => (c.holomenId === "h5" ? conditional : c));
    const all = optimize({ leader, topN: 100 }, withCond, holomenMap);
    const unmet = all.candidates.filter(
      (c) =>
        c.members.some((m) => m.id === "cond-passive") &&
        c.members.filter((m) => m.holomenId === "h6").length === 0,
    );
    expect(unmet.length).toBeGreaterThan(0);

    const filtered = optimize(
      { leader, topN: 100, requireAllPassives: true },
      withCond,
      holomenMap,
    );
    expect(filtered.candidates.length).toBe(all.candidates.length - unmet.length);
    for (const c of filtered.candidates) {
      if (c.members.some((m) => m.id === "cond-passive")) {
        expect(c.members.some((m) => m.holomenId === "h6")).toBe(true);
      }
    }
    // 固定メンバーで不発が確定していれば候補なし
    const none = optimize(
      {
        leader,
        topN: 5,
        fixedMembers: [conditional],
        excludedCardIds: ["c6"],
        requireAllPassives: true,
      },
      withCond,
      holomenMap,
    );
    expect(none.candidates).toEqual([]);
  });

  it("全探索の評価器も self 対象を実効値に含めて順位づけする", () => {
    // 素の値は低いが self バフで実効値が高くなるカードが選ばれること
    const selfStrong = makeCard({
      id: "self-strong",
      holomenId: "h1",
      stats: { performance: 500, technique: 500, sense: 500 },
      passive: {
        condition: { kind: "always" },
        effects: [{ kind: "paramUp", target: { kind: "self" }, param: "all", percent: 200 }],
      },
    });
    const plains = ["h2", "h3", "h4", "h5", "h6"].map((h) =>
      makeCard({ id: `plain-${h}`, holomenId: h }),
    );
    const plainLeader = makeCard({ id: "plain-leader", holomenId: "h-leader" });
    const result = optimize({ leader: plainLeader, topN: 1 }, [selfStrong, ...plains], holomenMap);
    const best = result.candidates[0];
    // self-strong の実効値は 1500×3 = 4500 > 素の 3000。落とされるのは plain のいずれか
    expect(best?.members.map((m) => m.id)).toContain("self-strong");
    expect(best?.breakdown.unitScore).toBeCloseTo(4500 + 3000 * 4);
  });

  it("リーダー未指定なら全カードをリーダー候補として探索し、最良のリーダーを返す", () => {
    // プールで衣装スキルを持つのは leader カードだけなので、リーダーに選ばれるはず
    const withLeader = [...pool, leader];
    const result = optimize({ leader: null, topN: 3 }, withLeader, holomenMap);
    const best = result.candidates[0];
    expect(best?.leader.id).toBe("leader");
    expect(best?.breakdown.costumeSkillActive).toBe(true);
    // スコア降順は維持される
    const scores = result.candidates.map((c) => c.breakdown.unitScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("リーダー探索の最良は、各リーダーを固定した探索の最良と一致する(クラス評価と枝刈りの健全性)", () => {
    const withLeader = [...pool, leader];
    const searched = optimize({ leader: null, topN: 1 }, withLeader, holomenMap);
    let best = -Infinity;
    for (const leaderCard of withLeader) {
      const fixed = optimize({ leader: leaderCard, topN: 1 }, withLeader, holomenMap);
      best = Math.max(best, fixed.candidates[0]?.breakdown.unitScore ?? -Infinity);
    }
    expect(searched.candidates[0]?.breakdown.unitScore).toBeCloseTo(best);
  });

  it("リーダー探索でも除外カードはリーダー候補にならない", () => {
    const withLeader = [...pool, leader];
    const result = optimize(
      { leader: null, excludedCardIds: ["leader"], topN: 1 },
      withLeader,
      holomenMap,
    );
    expect(result.candidates[0]?.leader.id).not.toBe("leader");
  });

  it("combinationCount が正しい", () => {
    expect(combinationCount(69, 5)).toBe(11238513);
    expect(combinationCount(5, 5)).toBe(1);
    expect(combinationCount(4, 5)).toBe(0);
  });
});
