import { describe, expect, it } from "vite-plus/test";

import {
  ASSUMED_PARAM_UPGRADE_RATIO,
  ASSUMED_SKILL_UPGRADE_RATIO,
  BLOOM_MAX,
  bloomOf,
  cardAtBloom,
} from "./bloom";
import type { BuffSkillStructured, Card } from "./types";

function buff(percent: number): BuffSkillStructured {
  return {
    condition: { kind: "always" },
    effects: [{ kind: "paramUp", target: { kind: "all" }, param: "all", percent }],
  };
}

function makeCard(overrides?: Partial<Card>): Card {
  return {
    id: "c1",
    name: "c1",
    reading: "しーわん",
    holomenId: "h1",
    rarity: 5,
    type: "happy",
    stats: { performance: 1000, technique: 2000, sense: 3000 },
    costumeSkill: { raw: "costume-max", structured: buff(50) },
    passiveSkill: { raw: "passive-max", structured: buff(44) },
    activeSkill: {
      raw: "active-max",
      structured: {
        intervalSeconds: 20,
        probability: "high",
        durationSeconds: 7,
        scoreUpPercent: 66,
        extraCondition: null,
      },
    },
    specialSkill: {
      raw: "sp-max",
      structured: { durationSeconds: 10, scoreSupportPercent: 145, extra: null },
    },
    ...overrides,
  };
}

describe("cardAtBloom", () => {
  it("開花最大は本体をそのまま返す", () => {
    const card = makeCard();
    expect(cardAtBloom(card, BLOOM_MAX)).toBe(card);
  });

  it("4凸は全項目とも強化後(本体と同値)になる", () => {
    const card = makeCard();
    const resolved = cardAtBloom(card, 4);
    expect(resolved.stats).toEqual(card.stats);
    expect(resolved.activeSkill.structured?.scoreUpPercent).toBe(66);
    expect(resolved.specialSkill.structured?.scoreSupportPercent).toBe(145);
    expect(resolved.passiveSkill.structured?.effects[0]?.percent).toBe(44);
  });

  it("0凸は仮定倍率で割り戻す(衣装は不変)", () => {
    const card = makeCard();
    const resolved = cardAtBloom(card, 0);
    expect(resolved.stats.performance).toBe(Math.round(1000 / ASSUMED_PARAM_UPGRADE_RATIO));
    expect(resolved.stats.sense).toBe(Math.round(3000 / ASSUMED_PARAM_UPGRADE_RATIO));
    expect(resolved.activeSkill.structured?.scoreUpPercent).toBeCloseTo(
      66 / ASSUMED_SKILL_UPGRADE_RATIO,
    );
    expect(resolved.specialSkill.structured?.scoreSupportPercent).toBeCloseTo(
      145 / ASSUMED_SKILL_UPGRADE_RATIO,
    );
    expect(resolved.passiveSkill.structured?.effects[0]?.percent).toBeCloseTo(
      44 / ASSUMED_SKILL_UPGRADE_RATIO,
    );
    expect(resolved.costumeSkill).toBe(card.costumeSkill);
    // 元のカードは書き換えない
    expect(card.stats.performance).toBe(1000);
    expect(card.activeSkill.structured?.scoreUpPercent).toBe(66);
  });

  it("段階の境目: 1凸でアクティブ強化後、3凸で SP 強化後、パラメータは 2凸から", () => {
    const card = makeCard();
    const b1 = cardAtBloom(card, 1);
    expect(b1.activeSkill.structured?.scoreUpPercent).toBe(66); // 1凸で強化済み
    expect(b1.stats.performance).toBe(Math.round(1000 / ASSUMED_PARAM_UPGRADE_RATIO)); // 2凸未満
    expect(b1.specialSkill.structured?.scoreSupportPercent).toBeCloseTo(
      145 / ASSUMED_SKILL_UPGRADE_RATIO,
    );
    const b2 = cardAtBloom(card, 2);
    expect(b2.stats).toEqual(card.stats); // 2凸で強化済み
    const b3 = cardAtBloom(card, 3);
    expect(b3.specialSkill.structured?.scoreSupportPercent).toBe(145); // 3凸で強化済み
    expect(b3.passiveSkill.structured?.effects[0]?.percent).toBeCloseTo(
      44 / ASSUMED_SKILL_UPGRADE_RATIO,
    ); // パッシブは 4凸から
  });

  it("確認済みの bloomVariants がある段階は割り戻しよりそちらを優先する", () => {
    const card = makeCard({
      passiveSkill: {
        raw: "passive-max",
        structured: buff(44),
        bloomVariants: [{ bloom: 0, raw: "passive-0", structured: buff(40) }],
      },
    });
    const resolved = cardAtBloom(card, 0);
    expect(resolved.passiveSkill.raw).toBe("passive-0");
    expect(resolved.passiveSkill.structured?.effects[0]?.percent).toBe(40); // 割り戻さない
    // variant がないスキルは引き続き推定
    expect(resolved.activeSkill.structured?.scoreUpPercent).toBeCloseTo(
      66 / ASSUMED_SKILL_UPGRADE_RATIO,
    );
    expect(cardAtBloom(card, BLOOM_MAX).passiveSkill.raw).toBe("passive-max");
  });
});

describe("bloomOf", () => {
  it("map 未指定・未登録は 0凸", () => {
    expect(bloomOf(undefined, "c1")).toBe(0);
    expect(bloomOf({}, "c1")).toBe(0);
    expect(bloomOf({ c1: 3 }, "c1")).toBe(3);
  });
});
