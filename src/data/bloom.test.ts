import { describe, expect, it } from "vite-plus/test";

import {
  ASSUMED_SKILL_UPGRADE_RATIO,
  BLOOM_MAX,
  CONFIRMED_PARAM_UPGRADE_RATIO,
  bloomOf,
  cardAtBloom,
  cardAtBloomWithProvenance,
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

  it("未確認0凸はパラメータを確認済み+10%から復元し、スキルだけ仮定倍率で割り戻す", () => {
    const card = makeCard();
    const resolved = cardAtBloomWithProvenance(card, 0);
    expect(resolved.card.stats.performance).toBe(Math.round(1000 / CONFIRMED_PARAM_UPGRADE_RATIO));
    expect(resolved.card.activeSkill.structured?.scoreUpPercent).toBeCloseTo(
      66 / ASSUMED_SKILL_UPGRADE_RATIO,
    );
    expect(resolved.provenance.stats.source).toBe("derived-from-max-confirmed-ratio");
    expect(resolved.provenance.activeSkill.source).toBe("estimated-from-max");
  });

  it("0凸Active variantを1凸以降へ持ち越さない", () => {
    const card = makeCard({
      activeSkill: {
        raw: "active-max",
        structured: {
          intervalSeconds: 20,
          probability: "high",
          durationSeconds: 7,
          scoreUpPercent: 110,
          extraCondition: null,
        },
        bloomVariants: [
          {
            bloom: 0,
            raw: "active-0",
            structured: {
              intervalSeconds: 20,
              probability: "high",
              durationSeconds: 7,
              scoreUpPercent: 95,
              extraCondition: null,
            },
          },
        ],
      },
    });
    expect(cardAtBloom(card, 0).activeSkill.structured?.scoreUpPercent).toBe(95);
    expect(cardAtBloom(card, 1).activeSkill.structured?.scoreUpPercent).toBe(110);
    expect(cardAtBloom(card, 4).activeSkill.structured?.scoreUpPercent).toBe(110);
  });

  it("強化前のvariantは同じスキルの強化段階直前まで伝播し、境界で最大側へ戻る", () => {
    const card = makeCard({
      passiveSkill: {
        raw: "passive-max",
        structured: buff(44),
        bloomVariants: [{ bloom: 1, raw: "passive-pre4", structured: buff(40) }],
      },
    });
    expect(cardAtBloom(card, 0).passiveSkill.structured?.effects[0]?.percent).toBe(40);
    expect(cardAtBloom(card, 1).passiveSkill.structured?.effects[0]?.percent).toBe(40);
    expect(cardAtBloom(card, 3).passiveSkill.structured?.effects[0]?.percent).toBe(40);
    expect(cardAtBloom(card, 4).passiveSkill.structured?.effects[0]?.percent).toBe(44);
  });

  it("強化境界そのものに実測variantがある場合はそのvariantを優先する", () => {
    const card = makeCard({
      passiveSkill: {
        raw: "passive-max",
        structured: buff(44),
        bloomVariants: [{ bloom: 4, raw: "passive-4-observed", structured: buff(43) }],
      },
    });
    expect(cardAtBloom(card, 4).passiveSkill.structured?.effects[0]?.percent).toBe(43);
  });

  it("元カードを書き換えない", () => {
    const card = makeCard();
    cardAtBloom(card, 0);
    expect(card.stats.performance).toBe(1000);
    expect(card.activeSkill.structured?.scoreUpPercent).toBe(66);
  });
});

describe("bloomOf", () => {
  it("map 未指定・未登録は0凸", () => {
    expect(bloomOf(undefined, "c1")).toBe(0);
    expect(bloomOf({}, "c1")).toBe(0);
    expect(bloomOf({ c1: 3 }, "c1")).toBe(3);
  });
});
