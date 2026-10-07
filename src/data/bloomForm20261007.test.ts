import { describe, expect, it } from "vite-plus/test";

import { bloomTextPickerPool } from "../ui/bloomText";
import { BLOOM_UPGRADE_STAGE, cardAtBloomWithProvenance } from "./bloom";
import { bloomVariantEvidenceOf, isBloomTextVerified } from "./bloomEvidence";
import type { SkillKey } from "./bloomEvidence";
import cards from "./cards.json";
import type { Card } from "./types";

/**
 * 2026-10-07 ユーザー実機観測（開発用の開花文言フォーム 第 5 弾）。フォームに入れた強化前の文言 15 件を
 * そのまま固定する（実機の値。最大側の文言と違うのは数値だけ）。
 * 区間の境目は BLOOM_UPGRADE_STAGE（SP 3凸 / Active 1凸 / Passive 4凸）
 */
const cardById = new Map((cards as Card[]).map((c) => [c.id, c]));

function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} がない`);
  return value;
}

const OBSERVED: [string, Exclude<SkillKey, "costumeSkill">, string][] = [
  ["omaru-polka-02", "specialSkill", "12秒間スコアサポート効果110%"],
  ["omaru-polka-02", "activeSkill", "19秒毎に高確率で7秒間スコアが90%UP"],
  ["omaru-polka-02", "passiveSkill", "ピュアタイプ2人以上でピュアタイプ2人のテクニックが32%UP"],
  [
    "nakiri-ayame-02",
    "specialSkill",
    "12秒間スコアサポート効果100%、2期生が2人以上でスキル発動率が40%UP",
  ],
  ["nakiri-ayame-02", "activeSkill", "27秒毎に中確率で10秒間スコアが95%UP"],
  ["nakiri-ayame-02", "passiveSkill", "2期生が2人以上で2期生2人のスコアサポート効果9%"],
  ["oozora-subaru-02", "specialSkill", "10秒間スコアサポート効果135%"],
  [
    "oozora-subaru-02",
    "activeSkill",
    "17秒毎に中確率で7秒間スコアが45%UP、40コンボ以上でスコアが90%UP",
  ],
  ["oozora-subaru-02", "passiveSkill", "ピュアタイプ2人の全パラメータが11%UP"],
  ["ninomae-inanis-01", "specialSkill", "14秒間スコアサポート効果95%"],
  [
    "ninomae-inanis-01",
    "activeSkill",
    "32秒毎に高確率で13秒間スコアが45%UP、ピュアタイプ2人以上でスコアが85%UP",
  ],
  ["ninomae-inanis-01", "passiveSkill", "ピュアタイプ2人以上で自身の全パラメータが24%UP"],
  ["mori-calliope-02", "specialSkill", "14秒間スコアサポート効果95%"],
  ["mori-calliope-02", "activeSkill", "31秒毎に中確率で12秒間スコアが90%UP"],
  ["mori-calliope-02", "passiveSkill", "キュートタイプ2人以上でキュートタイプ2人のセンスが32%UP"],
];
const IDS = [...new Set(OBSERVED.map(([id]) => id))];
const STAGE = {
  specialSkill: BLOOM_UPGRADE_STAGE.special,
  activeSkill: BLOOM_UPGRADE_STAGE.active,
  passiveSkill: BLOOM_UPGRADE_STAGE.passive,
} as const;

describe("2026-10-07 開花文言フォームの実機報告（ポルカ・あやめ・スバル・イナ・カリオペ）", () => {
  it("実機で入れた 15 件が、強化前の区間の variant として入っている（実機の文言そのまま）", () => {
    for (const [id, skill, text] of OBSERVED) {
      const card = must(cardById.get(id), id);
      expect(
        card[skill].bloomVariants?.map((v) => [v.bloom, v.raw]),
        `${id} ${skill}`,
      ).toEqual([[0, text]]);
      expect(bloomVariantEvidenceOf(id, skill, 0), `${id} ${skill}`).toMatchObject({
        kind: "observed-text",
        observedAt: "2026-10-07",
      });
      const before = cardAtBloomWithProvenance(card, STAGE[skill] - 1);
      expect(before.card[skill].raw, `${id} ${skill} 強化前`).toBe(text);
      expect(before.provenance[skill].source, `${id} ${skill} 強化前`).toBe("observed-variant");
      const after = cardAtBloomWithProvenance(card, STAGE[skill]);
      expect(after.card[skill].raw, `${id} ${skill} 強化後`).toBe(card[skill].raw);
      expect(after.provenance[skill].source, `${id} ${skill} 強化後`).toBe("max-record");
    }
  });

  it("構造化も同じ数値に入っている（raw と structured がずれない）", () => {
    const at0 = (id: string) => cardAtBloomWithProvenance(must(cardById.get(id), id), 0).card;
    expect(at0("omaru-polka-02").specialSkill.structured).toMatchObject({
      durationSeconds: 12,
      scoreSupportPercent: 110,
    });
    expect(at0("omaru-polka-02").activeSkill.structured).toMatchObject({ scoreUpPercent: 90 });
    expect(at0("omaru-polka-02").passiveSkill.structured?.effects[0]).toMatchObject({
      param: "technique",
      percent: 32,
    });
    const ayame = at0("nakiri-ayame-02");
    expect(ayame.specialSkill.structured).toMatchObject({
      scoreSupportPercent: 100,
      skillRateUp: {
        condition: { kind: "affiliationCount", affiliation: "gen2", min: 2 },
        percent: 40,
      },
    });
    expect(ayame.passiveSkill.structured?.effects[0]).toMatchObject({
      kind: "scoreSupport",
      percent: 9,
    });
    expect(at0("oozora-subaru-02").activeSkill.structured).toMatchObject({
      intervalSeconds: 17,
      scoreUpPercent: 45,
      extraCondition: "40コンボ以上でスコアが90%UP",
      conditionalScoreUp: { condition: { kind: "combo", min: 40 }, percent: 90 },
    });
    expect(at0("oozora-subaru-02").passiveSkill.structured?.effects[0]).toMatchObject({
      param: "all",
      percent: 11,
    });
    // イナの 0凸 Active は発動時間も最大側（14 秒）と違う（13 秒）
    expect(at0("ninomae-inanis-01").activeSkill.structured).toMatchObject({
      intervalSeconds: 32,
      durationSeconds: 13,
      scoreUpPercent: 45,
      extraCondition: "ピュアタイプ2人以上でスコアが85%UP",
      conditionalScoreUp: { condition: { kind: "typeCount", type: "pure", min: 2 }, percent: 85 },
    });
    expect(at0("ninomae-inanis-01").passiveSkill.structured?.effects[0]).toMatchObject({
      target: { kind: "self" },
      percent: 24,
    });
    expect(at0("mori-calliope-02").passiveSkill.structured?.effects[0]).toMatchObject({
      param: "sense",
      percent: 32,
    });
  });

  it("衣装スキルは最大側のまま（実機で突き合わせて変更なし）で、途中値を持たない", () => {
    for (const id of IDS) {
      const card = must(cardById.get(id), id);
      expect(card.costumeSkill.bloomVariants, id).toBeUndefined();
      expect(cardAtBloomWithProvenance(card, 0).provenance.costumeSkill.source, id).toBe(
        "max-record",
      );
    }
  });

  it("5 枚とも実機確認済みで、開花文言のピッカーに出ない", () => {
    const pool = bloomTextPickerPool(cards as Card[], []).map((c) => c.id);
    for (const id of IDS) {
      expect(isBloomTextVerified(id), id).toBe(true);
      expect(pool, id).not.toContain(id);
    }
  });
});
