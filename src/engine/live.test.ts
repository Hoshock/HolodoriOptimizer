import { describe, expect, it } from "vite-plus/test";

import { ACTIVE_PROBABILITY, SCORE_SUPPORT_WEIGHT, SP_ACTIVATIONS_PER_SONG } from "../data/live";
import type { Card, Holomen } from "../data/types";
import { liveBonusOf } from "./live";
import { optimize } from "./optimize";
import { buildHolomenMap } from "./score";

function makeCard(overrides: {
  id: string;
  holomenId: string;
  stats?: Partial<Card["stats"]>;
  active?: NonNullable<Card["activeSkill"]["structured"]>;
  special?: NonNullable<Card["specialSkill"]["structured"]>;
}): Card {
  return {
    id: overrides.id,
    name: overrides.id,
    holomenId: overrides.holomenId,
    rarity: 5,
    type: "happy",
    stats: { performance: 1000, technique: 1000, sense: 1000, ...overrides.stats },
    costumeSkill: { raw: "test", structured: null },
    passiveSkill: { raw: "test", structured: null },
    activeSkill: { raw: "test", structured: overrides.active ?? null },
    specialSkill: { raw: "test", structured: overrides.special ?? null },
  };
}

const holomen: Holomen[] = ["h-leader", "h1", "h2", "h3", "h4", "h5", "h6"].map((id) => ({
  id,
  name: id,
  affiliations: ["gen0"],
}));
const holomenMap = buildHolomenMap(holomen);

describe("liveBonusOf", () => {
  it("アクティブ: 発動機会 × 発動率 × 効果時間のカバー率 × 効果量", () => {
    const card = makeCard({
      id: "a",
      holomenId: "h1",
      active: {
        intervalSeconds: 20,
        probability: "medium",
        durationSeconds: 10,
        scoreUpPercent: 100,
        extraCondition: null,
      },
    });
    // 曲 100 秒: 発動機会 floor(100/20)=5 回、期待カバー 5 × p × 10 秒
    const expected = (100 / 100) * ((5 * ACTIVE_PROBABILITY.medium * 10) / 100);
    expect(liveBonusOf(card, { durationSeconds: 100 }).active).toBeCloseTo(expected, 10);
  });

  it("アクティブ: 期待カバー時間は曲長を超えない", () => {
    const card = makeCard({
      id: "a",
      holomenId: "h1",
      active: {
        intervalSeconds: 15,
        probability: "high",
        durationSeconds: 100,
        scoreUpPercent: 60,
        extraCondition: null,
      },
    });
    // floor(90/15)=6 回 × p × 100 秒 は 90 秒を超えるためカバー率 1 に頭打ち
    expect(liveBonusOf(card, { durationSeconds: 90 }).active).toBeCloseTo(0.6, 10);
  });

  it("SP: 発動回数 × 効果時間のカバー率 × スコアサポート効果 × 重み", () => {
    const card = makeCard({
      id: "s",
      holomenId: "h1",
      special: { durationSeconds: 10, scoreSupportPercent: 160, extra: null },
    });
    const expected = SCORE_SUPPORT_WEIGHT * (160 / 100) * ((SP_ACTIVATIONS_PER_SONG * 10) / 100);
    expect(liveBonusOf(card, { durationSeconds: 100 }).sp).toBeCloseTo(expected, 10);
  });

  it("未構造化・スコア系でないスキルは寄与 0", () => {
    const card = makeCard({ id: "n", holomenId: "h1" });
    const bonus = liveBonusOf(card, { durationSeconds: 100 });
    expect(bonus.active).toBe(0);
    expect(bonus.sp).toBe(0);
  });
});

describe("optimize と期待値の統合", () => {
  const leader = makeCard({ id: "leader", holomenId: "h-leader" });
  // パラメータはわずかに劣るが、アクティブの期待寄与が大きいカード
  const strongActive = makeCard({
    id: "strong-active",
    holomenId: "h6",
    stats: { performance: 990 },
    active: {
      intervalSeconds: 20,
      probability: "high",
      durationSeconds: 10,
      scoreUpPercent: 100,
      extraCondition: null,
    },
  });
  const plain = makeCard({ id: "plain", holomenId: "h6" });
  const others = ["h1", "h2", "h3", "h4"].map((h) => makeCard({ id: `m-${h}`, holomenId: h }));
  const allCards = [leader, strongActive, plain, ...others];

  it("live 指定時は総合期待スコアで順位づけされ、内訳が返る", () => {
    const result = optimize(
      { leader, topN: 1, live: { durationSeconds: 100 } },
      allCards,
      holomenMap,
    );
    const top = result.candidates[0];
    expect(top).toBeDefined();
    if (!top) return;
    expect(top.members.map((m) => m.id)).toContain("strong-active");
    expect(top.live.expectedScore).toBeCloseTo(
      top.breakdown.unitScore * (1 + top.live.active + top.live.sp),
      6,
    );
    expect(top.live.active).toBeGreaterThan(0);
  });

  it("live 未指定なら従来どおりユニットスコアのみで順位づけされる", () => {
    const result = optimize({ leader, topN: 1 }, allCards, holomenMap);
    const top = result.candidates[0];
    expect(top).toBeDefined();
    if (!top) return;
    expect(top.members.map((m) => m.id)).toContain("plain");
    expect(top.live.active).toBe(0);
    expect(top.live.sp).toBe(0);
    expect(top.live.expectedScore).toBe(top.breakdown.unitScore);
  });
});
