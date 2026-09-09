import { describe, expect, it } from "vite-plus/test";

import type { Card, Holomen } from "../data/types";
import { optimize } from "./optimize";
import { buildHolomenMap } from "./score";

/**
 * 順位づけの値と、その後から掛かる倍率(score modifier)の統合テスト。
 * 順位づけ = ユニットスコア(試算。src/engine/displayScore.ts)× (1 + 黄の楽曲スコアボーナス) × (1 + イベント)。
 * 2026-09-09 に旧 src/engine/live.ts(曲長に基づく簡易期待値)を削除したので、曲長・譜面はここに現れない(ADR-006)
 */

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
    reading: "てすと",
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
  reading: "てすと",
  affiliations: ["gen0"],
  board: { blueSide: "left", lifeSide: "left" },
}));
const holomenMap = buildHolomenMap(holomen);

describe("optimize と順位づけの倍率", () => {
  const leader = makeCard({ id: "leader", holomenId: "h-leader" });
  // パラメータはわずかに劣るが、アクティブスキルでスコアボーナスが上がるカード
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

  it("倍率がなければ順位づけの値はユニットスコア(試算)そのまま", () => {
    const result = optimize({ leader, topN: 1 }, allCards, holomenMap);
    const top = result.candidates[0];
    expect(top).toBeDefined();
    if (!top) return;
    expect(top.members.map((m) => m.id)).toContain("strong-active");
    expect(top.modifiers.songBonus).toBe(0);
    expect(top.modifiers.eventBonus).toBe(0);
    expect(top.modifiers.adjustedUnitScore).toBe(top.display.unitScore);
  });

  it("黄ボードの楽曲スコアボーナスはユニットスコア(試算)の後に掛かり、順位は変えない", () => {
    const base = optimize({ leader, topN: 2 }, allCards, holomenMap);
    const withBonus = optimize({ leader, topN: 2, songBonus: 0.075 }, allCards, holomenMap);
    expect(withBonus.candidates.map((c) => c.members.map((m) => m.id))).toEqual(
      base.candidates.map((c) => c.members.map((m) => m.id)),
    );
    const top = withBonus.candidates[0];
    expect(top).toBeDefined();
    if (!top) return;
    expect(top.modifiers.songBonus).toBe(0.075);
    expect(top.modifiers.adjustedUnitScore).toBeCloseTo(top.display.unitScore * 1.075, 6);
  });
});
