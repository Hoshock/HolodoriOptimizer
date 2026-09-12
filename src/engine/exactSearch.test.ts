import { describe, expect, it } from "vite-plus/test";

import type { RedUnitEffects } from "../data/redBoard";
import type { Card, Holomen } from "../data/types";
import { optimizeExact } from "./exactSearch";
import { combinationCount, optimize } from "./optimize";
import { buildHolomenMap } from "./score";

/**
 * 近似探索（optimize: 上限値で shortlist → 正確評価）と厳密探索（optimizeExact: 全組合せを正確評価）の突き合わせ。
 *
 * 目的は「必ず一致するはず」と仮定することではなく、**shortlist が真の上位を落とすケースを見つけられる状態を持つこと**
 * （ADR-005）。落とした場合はこのテストが「どの編成が抜けたか」を出す。
 * フィクスチャは近似の弱点になりうる要素を混ぜてある: アクティブの周期・効果時間・確率の違い、青ボードの発動率と
 * 発動頻度、パッシブのスコアサポート（供給側の確率で重みづけされる）、赤の全員スコアサポート、衣装スキルの発動条件、
 * パッシブの発動条件、SP のスコアサポートとスキル発動率 UP。
 */

const board = { blueSide: "left", lifeSide: "left" } as const;
const holomenIds = [
  "hl1",
  "hl2",
  "hl3",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "h7",
  "h8",
  "h9",
  "h10",
  "h11",
  "h12",
  "h13",
  "h14",
];
const holomen: Holomen[] = holomenIds.map((id, i) => ({
  id,
  name: id,
  reading: "てすと",
  affiliations: [i % 3 === 0 ? "gen0" : i % 3 === 1 ? "gen1" : "gamers"],
  board,
}));
const holomenMap = buildHolomenMap(holomen);

type Structured = {
  costume?: NonNullable<Card["costumeSkill"]["structured"]>;
  passive?: NonNullable<Card["passiveSkill"]["structured"]>;
  active?: NonNullable<Card["activeSkill"]["structured"]>;
  special?: NonNullable<Card["specialSkill"]["structured"]>;
};

function makeCard(
  id: string,
  holomenId: string,
  type: Card["type"],
  stats: Card["stats"],
  skills: Structured,
  blue?: [number, number],
): Card {
  const card: Card = {
    id,
    name: id,
    reading: "てすと",
    holomenId,
    rarity: 5,
    type,
    stats,
    naturalStats: stats,
    costumeSkill: { raw: "test", structured: skills.costume ?? null },
    passiveSkill: { raw: "test", structured: skills.passive ?? null },
    activeSkill: { raw: "test", structured: skills.active ?? null },
    specialSkill: { raw: "test", structured: skills.special ?? null },
  };
  return blue
    ? { ...card, boardLive: { activeRatePercent: blue[0], activeFrequencyPercent: blue[1] } }
    : card;
}

const activeSkill = (
  intervalSeconds: number,
  probability: "low" | "medium" | "high",
  durationSeconds: number,
  scoreUpPercent: number,
  conditional?: {
    condition: { kind: "typeCount"; type: Card["type"]; min: number };
    percent: number;
  },
): NonNullable<Card["activeSkill"]["structured"]> => ({
  intervalSeconds,
  probability,
  durationSeconds,
  scoreUpPercent,
  extraCondition: conditional ? "test" : null,
  ...(conditional ? { conditionalScoreUp: conditional } : {}),
});

const spSkill = (
  durationSeconds: number,
  scoreSupportPercent: number,
  rate?: number,
): NonNullable<Card["specialSkill"]["structured"]> => ({
  durationSeconds,
  scoreSupportPercent,
  extra: rate === undefined ? null : "test",
  ...(rate === undefined
    ? {}
    : { skillRateUp: { condition: { kind: "always" as const }, percent: rate } }),
});

/** メンバー候補 14 枚。素値・アクティブ・青・パッシブ・SP をすべて違う値にして同点を避ける */
const pool: Card[] = [
  makeCard(
    "m1",
    "h1",
    "cute",
    { performance: 9000, technique: 8000, sense: 7000 },
    {
      active: activeSkill(20, "high", 10, 100),
      special: spSkill(12, 120, 50),
    },
    [30, 12],
  ),
  makeCard(
    "m2",
    "h2",
    "happy",
    { performance: 8800, technique: 8200, sense: 7100 },
    {
      active: activeSkill(23, "medium", 8, 115),
      passive: {
        condition: { kind: "typeCount", type: "cute", min: 2 },
        effects: [
          { kind: "scoreSupport", target: { kind: "type", type: "cute", count: 2 }, percent: 11 },
        ],
      },
    },
    [24, 8],
  ),
  makeCard(
    "m3",
    "h3",
    "pure",
    { performance: 8600, technique: 8400, sense: 7200 },
    {
      active: activeSkill(15, "low", 6, 55, {
        condition: { kind: "typeCount", type: "pure", min: 2 },
        percent: 110,
      }),
      special: spSkill(10, 145),
    },
    [33.6, 4],
  ),
  makeCard(
    "m4",
    "h4",
    "cute",
    { performance: 8400, technique: 8600, sense: 7300 },
    {
      passive: {
        condition: { kind: "always" },
        effects: [{ kind: "paramUp", target: { kind: "self" }, param: "all", percent: 24 }],
      },
    },
  ),
  makeCard(
    "m5",
    "h5",
    "happy",
    { performance: 8200, technique: 8800, sense: 7400 },
    {
      active: activeSkill(28, "high", 12, 90),
      special: spSkill(11, 130, 35),
    },
    [35.1, 12],
  ),
  makeCard(
    "m6",
    "h6",
    "pure",
    { performance: 8000, technique: 9000, sense: 7500 },
    {
      active: activeSkill(35, "medium", 13, 95),
      passive: {
        condition: { kind: "affiliationCount", affiliation: "gen1", min: 2 },
        effects: [{ kind: "scoreSupport", target: { kind: "all" }, percent: 8 }],
      },
    },
    [33, 8],
  ),
  makeCard(
    "m7",
    "h7",
    "cute",
    { performance: 7800, technique: 9200, sense: 7600 },
    {
      active: activeSkill(22, "high", 8, 55, {
        condition: { kind: "typeCount", type: "cute", min: 3 },
        percent: 115,
      }),
      special: spSkill(12, 110),
    },
    [0, 0],
  ),
  makeCard(
    "m8",
    "h8",
    "happy",
    { performance: 7600, technique: 9400, sense: 7700 },
    {
      passive: {
        condition: { kind: "typeCount", type: "happy", min: 2 },
        effects: [
          {
            kind: "paramUp",
            target: { kind: "type", type: "happy", count: 2 },
            param: "technique",
            percent: 32,
          },
        ],
      },
      special: spSkill(14, 95),
    },
  ),
  makeCard(
    "m9",
    "h9",
    "pure",
    { performance: 7400, technique: 9600, sense: 7800 },
    {
      active: activeSkill(27, "medium", 12, 90),
    },
    [12, 4],
  ),
  makeCard(
    "m10",
    "h10",
    "cute",
    { performance: 7200, technique: 9800, sense: 7900 },
    {
      active: activeSkill(19, "low", 7, 60),
      special: spSkill(10, 100, 50),
    },
    [6, 0],
  ),
  makeCard(
    "m11",
    "h11",
    "happy",
    { performance: 7000, technique: 10000, sense: 8000 },
    {
      passive: {
        condition: { kind: "always" },
        effects: [
          {
            kind: "scoreSupport",
            target: { kind: "affiliation", affiliation: "gen0", count: 2 },
            percent: 12,
          },
        ],
      },
    },
  ),
  makeCard(
    "m12",
    "h12",
    "pure",
    { performance: 6800, technique: 10200, sense: 8100 },
    {
      active: activeSkill(25, "high", 10, 110),
      special: spSkill(12, 135, 35),
    },
    [39.6, 4],
  ),
  makeCard(
    "m13",
    "h13",
    "cute",
    { performance: 6600, technique: 10400, sense: 8200 },
    {
      active: activeSkill(30, "medium", 15, 80),
    },
    [18, 8],
  ),
  makeCard(
    "m14",
    "h14",
    "happy",
    { performance: 6400, technique: 10600, sense: 8300 },
    {
      special: spSkill(13, 115),
    },
  ),
];

/** リーダー候補 3 枚: 衣装の条件と割合が違い、赤ボードのスコアサポートも違う */
const leaders: Card[] = [
  makeCard(
    "l1",
    "hl1",
    "cute",
    { performance: 9000, technique: 9000, sense: 9000 },
    {
      costume: {
        condition: { kind: "typeCount", type: "cute", min: 2 },
        effects: [
          { kind: "paramUp", target: { kind: "all" }, param: "all", percent: 50 },
          { kind: "scoreSupport", target: { kind: "all" }, percent: 25 },
        ],
      },
    },
  ),
  makeCard(
    "l2",
    "hl2",
    "happy",
    { performance: 9100, technique: 8900, sense: 9000 },
    {
      costume: {
        condition: { kind: "affiliationCount", affiliation: "gamers", min: 2 },
        effects: [{ kind: "paramUp", target: { kind: "all" }, param: "performance", percent: 135 }],
      },
    },
  ),
  makeCard(
    "l3",
    "hl3",
    "pure",
    { performance: 8900, technique: 9100, sense: 9000 },
    {
      costume: {
        condition: { kind: "always" },
        effects: [
          { kind: "paramUp", target: { kind: "type", type: "pure" }, param: "sense", percent: 80 },
        ],
      },
    },
  ),
];

const red = (support: number, fixed: number): RedUnitEffects => ({
  fixed: { performance: fixed, technique: fixed, sense: fixed },
  percent: { performance: 3, technique: 3, sense: 0 },
  scoreSupportPercent: support,
});
const redByHolomen: Record<string, RedUnitEffects> = {
  hl1: red(28.1, 150),
  hl2: red(4, 100),
};
const account = { memoryPercent: 6, enhancementPercent: 2.96 };
const allCards = [...leaders, ...pool];
/** リーダー候補は 3 枚に限る(厳密探索の評価回数を抑える。メンバー候補は全 17 枚のまま) */
const leaderCandidateIds = leaders.map((l) => l.id);
/** 葉(メンバー 5 枚の組合せ)の数。ホロメンは全員別なので単純な C(17,5) */
const LEAVES = combinationCount(allCards.length, 5);

const keyOf = (c: { leader: Card; members: Card[] }): string =>
  `${c.leader.id}|${c.members
    .map((m) => m.id)
    .sort()
    .join(",")}`;

describe("近似探索と厳密探索の突き合わせ", () => {
  it("リーダーおまかせ・赤・曲(黄はボード欄に入る)とイベントの倍率つきで Top10 が一致する", () => {
    const request = {
      leader: null,
      leaderCandidateIds,
      redByHolomen,
      account,
      songBonus: 0.075,
      eventScore: { percent: 10, cardIds: ["m3", "m12"] },
      topN: 10,
    };
    const approx = optimize(request, allCards, holomenMap);
    const exact = optimizeExact(request, allCards, holomenMap);
    // 葉は C(17,5) = 6188 通りで shortlist(500 件)より多いので、絞り込みが実際に効いている
    expect(LEAVES).toBeGreaterThan(500);
    expect(exact.evaluated).toBe(LEAVES * leaders.length);
    expect(approx.evaluated).toBe(LEAVES * leaders.length);
    expect(approx.candidates.map(keyOf)).toEqual(exact.candidates.map(keyOf));
    approx.candidates.forEach((c, i) => {
      expect(c.modifiers.adjustedUnitScore).toBeCloseTo(
        exact.candidates[i]?.modifiers.adjustedUnitScore ?? 0,
        6,
      );
      // 黄はボード欄に入る(2026-09-11)。近似・厳密の両方が同じ曲条件つきの display を返す
      expect(c.display.board).toBeCloseTo(exact.candidates[i]?.display.board ?? 0, 9);
      expect(c.display.total).toBeCloseTo(exact.candidates[i]?.display.total ?? 0, 9);
      expect(c.display.songBonus).toBe(0.075);
      expect(c.display.unitScore).toBe(exact.candidates[i]?.display.unitScore);
      expect(c.breakdown.totalPower).toBe(exact.candidates[i]?.breakdown.totalPower);
    });
  });

  it("黄 10%(上限)でも shortlist の上限値が真の上位を落とさず Top10 が一致する", () => {
    // 黄はボード欄に 黄 × (100 + アクティブ + パッシブ + SP) として入るので候補ごとに効き方が違う。
    // 上限値側は 5 欄の合計の上限 U を U × (1 + 黄) + 100 × 黄 に置き換えている(optimize.ts)。その置き換えが
    // 上限のままであることを、黄が最大の 10% で厳密探索と突き合わせて確かめる
    const request = {
      leader: null,
      leaderCandidateIds,
      redByHolomen,
      account,
      songBonus: 0.1,
      topN: 10,
    };
    const approx = optimize(request, allCards, holomenMap);
    const exact = optimizeExact(request, allCards, holomenMap);
    expect(approx.candidates.map(keyOf)).toEqual(exact.candidates.map(keyOf));
    approx.candidates.forEach((c, i) => {
      expect(c.display.unitScore).toBe(exact.candidates[i]?.display.unitScore);
      expect(c.modifiers.adjustedUnitScore).toBe(c.display.unitScore);
    });
    // 曲なしの Top10 と並びが違いうる(黄は候補共通の倍率ではない)ことも記録しておく: 少なくとも値は変わる
    const plain = optimizeExact({ ...request, songBonus: 0 }, allCards, holomenMap);
    expect(plain.candidates[0]?.display.unitScore).toBeLessThan(
      exact.candidates[0]?.display.unitScore ?? 0,
    );
  });

  it("しぼりこみ(衣装スキル発動・パッシブ全員発動)つきでも Top10 が一致する", () => {
    const request = {
      leader: null,
      leaderCandidateIds,
      redByHolomen,
      account,
      requireCostumeSkill: true,
      requireAllPassives: true,
      topN: 10,
    };
    const approx = optimize(request, allCards, holomenMap);
    const exact = optimizeExact(request, allCards, holomenMap);
    expect(exact.candidates.length).toBeGreaterThan(0);
    expect(approx.candidates.map(keyOf)).toEqual(exact.candidates.map(keyOf));
  });

  it("リーダー固定でも Top1 が一致する", () => {
    const request = { leader: leaders[0] ?? null, redByHolomen, account, topN: 1 };
    const approx = optimize(request, allCards, holomenMap);
    const exact = optimizeExact(request, allCards, holomenMap);
    expect(approx.candidates.map(keyOf)).toEqual(exact.candidates.map(keyOf));
  });

  it("厳密探索は規模の上限を超えると実行しない(本番 UI 用ではない)", () => {
    expect(() =>
      optimizeExact({ leader: null, topN: 1 }, allCards, holomenMap, { maxEvaluations: 100 }),
    ).toThrow(/厳密探索は小規模専用/);
  });
});
