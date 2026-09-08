import { describe, expect, it } from "vite-plus/test";

import { cards as realCards, holomen as realHolomen } from "../data";
import type { Card, Holomen } from "../data/types";
import { combinationCount, optimize } from "./optimize";
import { computeDisplayScoreBonus, DISPLAY_UNIT_SCORE_FACTOR } from "./displayScore";
import { liveFactorOf } from "./optimize";
import { computeStaticPower } from "./power";
import { buildHolomenMap } from "./score";

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
    reading: "てすと",
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

const board = { blueSide: "left", lifeSide: "left" } as const;
const holomen: Holomen[] = [
  { id: "h-leader", name: "リーダー", reading: "てすと", affiliations: ["gen0"], board },
  { id: "h1", name: "メンバー1", reading: "てすと", affiliations: ["gen0"], board },
  { id: "h2", name: "メンバー2", reading: "てすと", affiliations: ["gen0"], board },
  { id: "h3", name: "メンバー3", reading: "てすと", affiliations: ["gen1"], board },
  { id: "h4", name: "メンバー4", reading: "てすと", affiliations: ["gen1"], board },
  { id: "h5", name: "メンバー5", reading: "てすと", affiliations: ["gamers"], board },
  { id: "h6", name: "メンバー6", reading: "てすと", affiliations: ["gamers"], board },
];
const holomenMap = buildHolomenMap(holomen);

describe("computeStaticPower(旧 computeUnitScore の基本ケース。加算モデルで同じ結論になる)", () => {
  it("スキルなしならメンバー5人の合計値になり、リーダーは加算されない", () => {
    const leader = makeCard({ id: "leader", holomenId: "h-leader" });
    const members = ["h1", "h2", "h3", "h4", "h5"].map((h) =>
      makeCard({ id: `m-${h}`, holomenId: h }),
    );
    const result = computeStaticPower({ leader, members }, holomenMap);
    expect(result.totalPower).toBe(15000);
    expect(result.costumeSkillActive).toBe(false);
  });

  it("衣装スキルは条件成立時のみ素値 × % が加算される", () => {
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
    const resultMet = computeStaticPower({ leader, members: met }, holomenMap);
    expect(resultMet.costumeSkillActive).toBe(true);
    expect(resultMet.totalPower).toBe(22500);

    // gen0 が 1 人だけなら不成立
    const unmet = ["h1", "h3", "h4", "h5", "h6"].map((h) =>
      makeCard({ id: `m-${h}`, holomenId: h }),
    );
    const resultUnmet = computeStaticPower({ leader, members: unmet }, holomenMap);
    expect(resultUnmet.costumeSkillActive).toBe(false);
    expect(resultUnmet.totalPower).toBe(15000);
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
    const result = computeStaticPower({ leader, members }, holomenMap);
    // 自身のみ全パラメータ +50%(+1500)。他メンバーには波及しない
    expect(result.totalPower).toBe(16500);
  });

  it("衣装スキルの scoreSupport 効果は総合力に入らない", () => {
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
    const result = computeStaticPower({ leader, members }, holomenMap);
    expect(result.costumeSkillActive).toBe(true);
    expect(result.totalPower).toBe(15000);
  });

  it("パッシブは対象メンバーの素値 × % を加算する(人数指定なしなら条件に合う全員)", () => {
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
    const result = computeStaticPower({ leader, members }, holomenMap);
    expect(result.passiveEffect).toBe(800);
    expect(result.totalPower).toBe(15800);
  });
});

describe("2026-09-08 追加カードのスキル表現は既存のエンジンで処理できる", () => {
  const realHolomenMap = buildHolomenMap(realHolomen);
  const real = (id: string): Card => {
    const card = realCards.find((c) => c.id === id);
    if (!card) throw new Error(`${id} がない`);
    return card;
  };
  /** 実在ホロメンの、スキルなし・全パラ 1000 のメンバー */
  const plain = (holomenId: string, type: Card["type"] = "happy") =>
    makeCard({ id: `plain-${holomenId}`, holomenId, type });

  it("ルイ水着: holoX 2 人以上で全員のセンス +135%、パッシブの holoX 2 人スコアサポートは基礎スコア外", () => {
    const leader = real("takane-lui-02");
    const met = [
      plain("hakui-koyori"),
      plain("kazama-iroha"),
      plain("tokino-sora"),
      plain("roboco-san"),
      plain("sakura-miko"),
    ];
    const result = computeStaticPower({ leader, members: met }, realHolomenMap);
    expect(result.costumeSkillActive).toBe(true);
    expect(result.totalPower).toBe(5000 + 5000 + 5000 * 2.35);
    const unmet = computeStaticPower(
      { leader, members: [met[0], met[2], met[3], met[4], plain("hoshimachi-suisei")] },
      realHolomenMap,
    );
    expect(unmet.costumeSkillActive).toBe(false);
    expect(unmet.totalPower).toBe(15000);
  });

  it("フワワ・モココ水着: ピュア 2 人以上で全員の全パラ +30% / 全員の P +80%、同じ条件のスコアサポート +25% は乗算しない", () => {
    const members = [
      plain("tokino-sora", "pure"),
      plain("roboco-san", "pure"),
      plain("sakura-miko"),
      plain("hoshimachi-suisei"),
      plain("akai-haato"),
    ];
    const fuwawa = computeStaticPower(
      { leader: real("fuwawa-abyssgard-02"), members },
      realHolomenMap,
    );
    expect(fuwawa.costumeSkillActive).toBe(true);
    expect(fuwawa.totalPower).toBe(15000 * 1.3);
    const mococo = computeStaticPower(
      { leader: real("mococo-abyssgard-02"), members },
      realHolomenMap,
    );
    // モココは P だけ +80%(2026-09-08 ユーザー実機確認。初期出典の「全パラメータ」は誤り)
    expect(mococo.totalPower).toBe(15000 + 5 * 800);
  });

  it("フワワ水着のパッシブ(ピュア 2 人以上で自身の全パラ +32%)は本人の素値にだけ掛かる(パラメータごとに切り上げ)", () => {
    const leader = plain("tokino-sora");
    const members = [
      real("fuwawa-abyssgard-02"),
      plain("roboco-san", "pure"),
      plain("sakura-miko"),
      plain("hoshimachi-suisei"),
      plain("akai-haato"),
    ];
    const result = computeStaticPower({ leader, members }, realHolomenMap);
    // ceil(10672 × 0.32) + ceil(7366 × 0.32) + ceil(7991 × 0.32) = 3416 + 2358 + 2558
    expect(result.totalPower).toBe(12000 + 10672 + 7366 + 7991 + 3416 + 2358 + 2558);
  });
});

describe("赤ホロメンボード(リーダーのホロメンのボードがメンバー 5 人へ)", () => {
  const members = ["h1", "h2", "h3", "h4", "h5"].map((h) =>
    makeCard({ id: `${h}-c`, holomenId: h }),
  );
  const leader = makeCard({ id: "leader", holomenId: "h-leader", stats: { performance: 9000 } });
  const red = {
    fixed: { performance: 100, technique: 0, sense: 50 },
    percent: { performance: 10, technique: 0, sense: 0 },
    scoreSupportPercent: 0,
  };

  it("固定値はメンバー各自に、割合は 5 人の素値合計に掛けて切り上げ、リーダー自身のパラメータには効かない", () => {
    const result = computeStaticPower({ leader, members }, holomenMap, { red });
    expect(result.redApplied).toBe(true);
    expect(result.redEffect).toBe(5 * 150 + 500);
    expect(result.totalPower).toBe(15000 + 1250);
    const plain = computeStaticPower({ leader, members }, holomenMap);
    expect(plain.redApplied).toBe(false);
    expect(plain.redEffect).toBe(0);
  });

  it("赤とパッシブは別々に素値へ掛かり、掛け合わせない(2026-09-08 実機の加算構造)", () => {
    const withPassive = members.map((m, i) =>
      i === 0
        ? {
            ...m,
            passiveSkill: {
              raw: "t",
              structured: {
                condition: { kind: "always" as const },
                effects: [
                  {
                    kind: "paramUp" as const,
                    target: { kind: "self" as const },
                    param: "performance" as const,
                    percent: 50,
                  },
                ],
              },
            },
          }
        : m,
    );
    const result = computeStaticPower({ leader, members: withPassive }, holomenMap, { red });
    expect(result.passiveEffect).toBe(500);
    expect(result.redEffect).toBe(1250);
    expect(result.totalPower).toBe(15000 + 500 + 1250);
  });

  it("探索でもリーダーのホロメンごとの赤が効き、リーダー探索の最良は各リーダー固定の最良と一致する", () => {
    const pool = [
      ...members,
      makeCard({ id: "h6-c", holomenId: "h6", stats: { performance: 1200 } }),
    ];
    const leaderA = makeCard({ id: "leader-a", holomenId: "h-leader" });
    const leaderB = makeCard({ id: "leader-b", holomenId: "h1" });
    const redByHolomen = {
      // h-leader をリーダーにすると全員 +1000: リーダー探索なら A が勝つ
      "h-leader": {
        fixed: { performance: 1000, technique: 0, sense: 0 },
        percent: { performance: 0, technique: 0, sense: 0 },
        scoreSupportPercent: 0,
      },
    };
    const all = [leaderA, leaderB, ...pool];
    const searched = optimize({ leader: null, redByHolomen, topN: 3 }, all, holomenMap);
    expect(searched.candidates[0]?.leader.id).toBe("leader-a");
    expect(searched.candidates[0]?.breakdown.redApplied).toBe(true);
    const fixedA = optimize({ leader: leaderA, redByHolomen, topN: 1 }, all, holomenMap);
    const fixedB = optimize({ leader: leaderB, redByHolomen, topN: 1 }, all, holomenMap);
    const best = Math.max(
      fixedA.candidates[0]?.breakdown.totalPower ?? 0,
      fixedB.candidates[0]?.breakdown.totalPower ?? 0,
    );
    expect(searched.candidates[0]?.breakdown.totalPower).toBeCloseTo(best);
    expect(fixedA.candidates[0]?.breakdown.totalPower).toBeCloseTo(
      (fixedB.candidates[0]?.breakdown.totalPower ?? 0) + 5 * 1000,
    );
    // 評価器と内訳のモデルが一致する(赤込み。スキルなしのカードなのでユニットスコア = 総合力 × 係数)
    expect(searched.candidates[0]?.live.expectedScore).toBeCloseTo(
      (searched.candidates[0]?.breakdown.totalPower ?? 0) * DISPLAY_UNIT_SCORE_FACTOR,
    );
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
    const scores = result.candidates.map((c) => c.breakdown.totalPower);
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
    expect(best?.breakdown.totalPower).toBeCloseTo(4500 + 3000 * 4);
  });

  it("リーダー未指定なら全カードをリーダー候補として探索し、最良のリーダーを返す", () => {
    // プールで衣装スキルを持つのは leader カードだけなので、リーダーに選ばれるはず
    const withLeader = [...pool, leader];
    const result = optimize({ leader: null, topN: 3 }, withLeader, holomenMap);
    const best = result.candidates[0];
    expect(best?.leader.id).toBe("leader");
    expect(best?.breakdown.costumeSkillActive).toBe(true);
    // スコア降順は維持される
    const scores = result.candidates.map((c) => c.breakdown.totalPower);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("リーダー探索の最良は、各リーダーを固定した探索の最良と一致する(クラス評価と枝刈りの健全性)", () => {
    const withLeader = [...pool, leader];
    const searched = optimize({ leader: null, topN: 1 }, withLeader, holomenMap);
    let best = -Infinity;
    for (const leaderCard of withLeader) {
      const fixed = optimize({ leader: leaderCard, topN: 1 }, withLeader, holomenMap);
      best = Math.max(best, fixed.candidates[0]?.breakdown.totalPower ?? -Infinity);
    }
    expect(searched.candidates[0]?.breakdown.totalPower).toBeCloseTo(best);
  });

  it("リーダーから除外はリーダー候補にだけ効き、メンバーから除外はメンバー候補にだけ効く", () => {
    const withLeader = [...pool, leader];
    // leader をリーダーからだけ除外: リーダーにはならないが、メンバーには入れる
    const leaderOnly = optimize(
      { leader: null, excludedLeaderCardIds: ["leader"], topN: 50 },
      withLeader,
      holomenMap,
    );
    expect(leaderOnly.candidates.every((c) => c.leader.id !== "leader")).toBe(true);
    expect(leaderOnly.candidates.some((c) => c.members.some((m) => m.id === "leader"))).toBe(true);
    // leader をメンバーからだけ除外: メンバーには入らないが、リーダーにはなれる
    const memberOnly = optimize(
      { leader: null, excludedMemberCardIds: ["leader"], topN: 50 },
      withLeader,
      holomenMap,
    );
    expect(memberOnly.candidates.every((c) => c.members.every((m) => m.id !== "leader"))).toBe(
      true,
    );
    expect(memberOnly.candidates.some((c) => c.leader.id === "leader")).toBe(true);
    // 指定したリーダー・固定メンバーには役割別の除外は効かない(ピッカー側で組合せを防ぐ)
    const fixed = pool.find((c) => c.id === "c1-weak");
    if (!fixed) throw new Error("c1-weak がない");
    const forced = optimize(
      {
        leader,
        fixedMembers: [fixed],
        excludedLeaderCardIds: ["leader"],
        excludedMemberCardIds: ["c1-weak"],
        topN: 1,
      },
      withLeader,
      holomenMap,
    );
    expect(forced.candidates[0]?.leader.id).toBe("leader");
    expect(forced.candidates[0]?.members.map((m) => m.id)).toContain("c1-weak");
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

describe("探索の高速評価器と computeStaticPower の一致", () => {
  /** 人数指定つきパッシブ・赤ボード・アカウント補正・ライブ期待値をすべて効かせた小さな全探索 */
  const account = { memoryPercent: 6, enhancementPercent: 2.96 };
  const redByHolomen = {
    "h-leader": {
      fixed: { performance: 120, technique: 80, sense: 50 },
      percent: { performance: 7, technique: 6, sense: 13 },
      scoreSupportPercent: 0,
    },
  };
  const leaders = [
    makeCard({
      id: "leader-red",
      holomenId: "h-leader",
      costume: {
        condition: { kind: "typeCount", type: "cute", min: 2 },
        effects: [{ kind: "paramUp", target: { kind: "all" }, param: "all", percent: 50 }],
      },
    }),
    makeCard({
      id: "leader-p",
      holomenId: "h1",
      costume: {
        condition: { kind: "always" },
        effects: [{ kind: "paramUp", target: { kind: "all" }, param: "performance", percent: 135 }],
      },
    }),
  ];
  const pool: Card[] = [
    makeCard({
      id: "c1",
      holomenId: "h1",
      type: "cute",
      stats: { performance: 1231, technique: 987, sense: 1111 },
      passive: {
        condition: { kind: "typeCount", type: "cute", min: 2 },
        effects: [{ kind: "paramUp", target: { kind: "self" }, param: "all", percent: 24 }],
      },
    }),
    makeCard({
      id: "c2",
      holomenId: "h2",
      type: "cute",
      stats: { performance: 999, technique: 1333, sense: 777 },
      passive: {
        condition: { kind: "always" },
        effects: [
          {
            kind: "paramUp",
            target: { kind: "affiliation", affiliation: "gen0", count: 1 },
            param: "technique",
            percent: 43,
          },
        ],
      },
    }),
    makeCard({ id: "c3", holomenId: "h3", type: "happy", stats: { performance: 1501 } }),
    makeCard({ id: "c4", holomenId: "h4", type: "pure", stats: { sense: 1499 } }),
    makeCard({
      id: "c5",
      holomenId: "h5",
      type: "pure",
      passive: {
        condition: { kind: "typeCount", type: "pure", min: 2 },
        effects: [
          {
            kind: "paramUp",
            target: { kind: "type", type: "pure", count: 2 },
            param: "technique",
            percent: 32,
          },
        ],
      },
    }),
    makeCard({ id: "c6", holomenId: "h6", type: "cute", stats: { technique: 1234 } }),
  ];
  const all = [...leaders, ...pool];

  it("全候補を返させると、順位は総合力 × ライブ倍率の降順で、各候補の値は詳細計算と一致する", () => {
    const result = optimize(
      { leader: null, redByHolomen, account, live: { durationSeconds: 120 }, topN: 1000 },
      all,
      holomenMap,
    );
    // 8 枚から 5 枚のうち、同一ホロメン h1(c1 と leader-p)を両方含む組合せを除く: C(8,5) − C(6,3) = 36。× リーダー 8 通り
    expect(result.candidates.length).toBe((combinationCount(8, 5) - combinationCount(6, 3)) * 8);
    let previous = Infinity;
    for (const c of result.candidates) {
      expect(c.live.expectedScore).toBeLessThanOrEqual(previous + 1e-9);
      previous = c.live.expectedScore;
      const detail = computeStaticPower({ leader: c.leader, members: c.members }, holomenMap, {
        red: redByHolomen[c.leader.holomenId as keyof typeof redByHolomen] ?? null,
        account,
      });
      expect(c.breakdown.totalPower).toBe(detail.totalPower);
      const display = computeDisplayScoreBonus(
        { leader: c.leader, members: c.members },
        holomenMap,
        detail.totalPower,
        {
          red: redByHolomen[c.leader.holomenId as keyof typeof redByHolomen] ?? null,
        },
      );
      expect(c.display.unitScore).toBeCloseTo(display.unitScore, 6);
      expect(c.live.expectedScore).toBeCloseTo(display.unitScore * liveFactorOf(c.live), 6);
    }
  });

  it("上位だけ返させても(枝刈りあり)、全候補のときの上位と同じ順序になる", () => {
    const full = optimize({ leader: null, redByHolomen, account, topN: 1000 }, all, holomenMap);
    const top = optimize({ leader: null, redByHolomen, account, topN: 4 }, all, holomenMap);
    expect(top.candidates.map((c) => c.breakdown.totalPower)).toEqual(
      full.candidates.slice(0, 4).map((c) => c.breakdown.totalPower),
    );
  });
});
