import { describe, expect, it } from "vite-plus/test";

import { bloomTextPickerPool } from "../ui/bloomText";
import { BLOOM_UPGRADE_STAGE, cardAtBloomWithProvenance } from "./bloom";
import { bloomVariantEvidenceOf, isBloomTextVerified } from "./bloomEvidence";
import type { SkillKey } from "./bloomEvidence";
import cards from "./cards.json";
import type { Card } from "./types";

/**
 * 2026-10-09 ユーザー実機観測（開発用の開花文言フォーム 第 6 弾）。フォームに入れた強化前の文言 3 件を
 * そのまま固定する（実機の値。最大側の文言と違うのは数値だけ）。
 * 区間の境目は BLOOM_UPGRADE_STAGE（SP 3凸 / Active 1凸 / Passive 4凸）
 */
const cardById = new Map((cards as Card[]).map((c) => [c.id, c]));

function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} がない`);
  return value;
}

const ID = "kobo-kanaeru-02";
const OBSERVED: [Exclude<SkillKey, "costumeSkill">, string][] = [
  ["specialSkill", "10秒間スコアサポート効果135%"],
  ["activeSkill", "29秒毎に高確率で10秒間スコアが95%UP"],
  ["passiveSkill", "キュートタイプ2人以上でキュートタイプ2人のセンスが32%UP"],
];
const STAGE = {
  specialSkill: BLOOM_UPGRADE_STAGE.special,
  activeSkill: BLOOM_UPGRADE_STAGE.active,
  passiveSkill: BLOOM_UPGRADE_STAGE.passive,
} as const;

describe("2026-10-09 開花文言フォームの実機報告（水着こぼ）", () => {
  const card = must(cardById.get(ID), ID);

  it("実機で入れた 3 件が、強化前の区間の variant として入っている（実機の文言そのまま）", () => {
    for (const [skill, text] of OBSERVED) {
      expect(
        card[skill].bloomVariants?.map((v) => [v.bloom, v.raw]),
        skill,
      ).toEqual([[0, text]]);
      expect(bloomVariantEvidenceOf(ID, skill, 0), skill).toMatchObject({
        kind: "observed-text",
        observedAt: "2026-10-09",
      });
      const before = cardAtBloomWithProvenance(card, STAGE[skill] - 1);
      expect(before.card[skill].raw, `${skill} 強化前`).toBe(text);
      expect(before.provenance[skill].source, `${skill} 強化前`).toBe("observed-variant");
      const after = cardAtBloomWithProvenance(card, STAGE[skill]);
      expect(after.card[skill].raw, `${skill} 強化後`).toBe(card[skill].raw);
      expect(after.provenance[skill].source, `${skill} 強化後`).toBe("max-record");
    }
  });

  it("構造化も同じ数値に入っている（raw と structured がずれない）", () => {
    const at0 = cardAtBloomWithProvenance(card, 0).card;
    expect(at0.specialSkill.structured).toMatchObject({
      durationSeconds: 10,
      scoreSupportPercent: 135,
    });
    expect(at0.activeSkill.structured).toMatchObject({
      intervalSeconds: 29,
      probability: "high",
      durationSeconds: 10,
      scoreUpPercent: 95,
    });
    expect(at0.passiveSkill.structured).toMatchObject({
      condition: { kind: "typeCount", type: "cute", min: 2 },
      effects: [{ target: { kind: "type", type: "cute", count: 2 }, param: "sense", percent: 32 }],
    });
  });

  it("衣装スキルは最大側のまま（実機で突き合わせて変更なし）で、途中値を持たない", () => {
    expect(card.costumeSkill.bloomVariants).toBeUndefined();
    expect(cardAtBloomWithProvenance(card, 0).provenance.costumeSkill.source).toBe("max-record");
  });

  it("実機確認済みで、開花文言のピッカーに出ない", () => {
    expect(isBloomTextVerified(ID)).toBe(true);
    expect(bloomTextPickerPool(cards as Card[], []).map((c) => c.id)).not.toContain(ID);
  });
});
