import { describe, expect, it } from "vite-plus/test";

import { cards } from "./index";
import { bloomVariantEvidenceOf } from "./bloomEvidence";
import type { SkillKey } from "./bloomEvidence";

const SKILLS: readonly SkillKey[] = [
  "costumeSkill",
  "passiveSkill",
  "activeSkill",
  "specialSkill",
];

describe("bloom variant provenance", () => {
  it("既存のbloomVariantsはすべて出典分類されている", () => {
    const unclassified: string[] = [];
    for (const card of cards) {
      for (const skill of SKILLS) {
        for (const variant of card[skill].bloomVariants ?? []) {
          const evidence = bloomVariantEvidenceOf(card.id, skill, variant.bloom);
          if (evidence.kind === "recorded-unclassified") {
            unclassified.push(`${card.id}:${skill}:${String(variant.bloom)}`);
          }
        }
      }
    }
    expect(unclassified).toEqual([]);
  });
});
