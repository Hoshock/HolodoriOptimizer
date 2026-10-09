import { describe, expect, it } from "vite-plus/test";

import { cardAtBloomWithProvenance } from "./bloom";
import cards from "./cards.json";
import { cards as runtimeCards, star5Cards } from "./index";
import { masterSkillLevels, masterSkillLevelsSource } from "./masterSkillLevels";
import meta from "./meta.json";
import publishedIds from "./published-ids.json";
import type { Card } from "./types";
import { MAX_LEVEL_BY_RARITY } from "./types";
import { structuredCoverage } from "./validate";

/**
 * 2026-10-09 の更新（★4 54 枚の収録 — ADR-022）の取り込み方を固定する。
 *
 * 固定するのは**構造と出所の区別**だけで、パラメータ・スキルの数値は固定しない（値の出所は抽出マスター
 * HolodoriDB/holodori-db-jpn-diff で、実機の再確認を通した値ではない — 実機の値だけをテストの期待値にする方針）。
 * ★4 は最大開花側（master の level 2）のスキルだけを持ち、強化前の段階は「未確認」のまま（level 1 を 0凸に転記しない）。
 */
const cardList = cards as Card[];
const star4 = cardList.filter((c) => c.rarity === 4);
const star5 = cardList.filter((c) => c.rarity === 5);

describe("2026-10-09 追加の ★4 カード", () => {
  it("★4 は 54 枚、★5 は 84 枚のまま、合計 138 枚で ID に重複がない", () => {
    expect(star4).toHaveLength(54);
    expect(star5).toHaveLength(84);
    expect(cardList).toHaveLength(138);
    expect(new Set(cardList.map((c) => c.id)).size).toBe(138);
    // ランタイム正典も同じ枚数で、★5 だけの一覧は 84 枚
    expect(runtimeCards).toHaveLength(138);
    expect(star5Cards).toHaveLength(84);
    expect(star5Cards.every((c) => c.rarity === 5)).toBe(true);
  });

  it("★4 はホロメン 54 人に 1 枚ずつで、ID は <holomenId>-star4-01、公開済み ID にも追記されている", () => {
    expect(new Set(star4.map((c) => c.holomenId)).size).toBe(54);
    const frozen = new Set(publishedIds.cards);
    for (const c of star4) {
      expect(c.id).toBe(`${c.holomenId}-star4-01`);
      expect(frozen.has(c.id), c.id).toBe(true);
    }
    // ★5 は 2 枚持つホロメンがいるが、★4 を持たない ★5 のホロメンはいない
    const star4Holomen = new Set(star4.map((c) => c.holomenId));
    for (const c of star5) expect(star4Holomen.has(c.holomenId), c.holomenId).toBe(true);
  });

  it("レベル上限は ★4 が 70・★5 が 80 で、stats は正の整数 3 つ", () => {
    expect(MAX_LEVEL_BY_RARITY).toEqual({ 4: 70, 5: 80 });
    for (const c of star4) {
      for (const v of Object.values(c.stats)) {
        expect(Number.isInteger(v) && v > 0, c.id).toBe(true);
      }
    }
  });

  it("★4 は最大開花側のスキルだけを持ち、強化前の区間は「未確認」になる（途中値を推定で作らない）", () => {
    for (const c of star4) {
      for (const k of ["costumeSkill", "passiveSkill", "activeSkill", "specialSkill"] as const) {
        expect(c[k].bloomVariants, `${c.id} ${k}`).toBeUndefined();
      }
      const { provenance } = cardAtBloomWithProvenance(c, 0);
      expect(provenance.activeSkill.source).toBe("unknown");
      expect(provenance.specialSkill.source).toBe("unknown");
      expect(provenance.passiveSkill.source).toBe("unknown");
      expect(provenance.costumeSkill.source).toBe("max-record");
    }
  });

  it("4 種のスキルは全カード構造化済み（試算に未算入のスキルを作らない）", () => {
    const coverage = structuredCoverage(cardList);
    expect(coverage["costumeSkill"]).toBe(1);
    expect(coverage["passiveSkill"]).toBe(1);
    expect(coverage["activeSkill"]).toBe(1);
    expect(coverage["specialSkill"]).toBe(1);
  });

  it("SP の追加効果（ライフ回復・GOOD 以上が PERFECT）は構造化され、raw の末尾に読点でつながる", () => {
    const life = star4.filter((c) => c.specialSkill.structured?.lifeRecovery);
    const judge = star4.filter((c) => c.specialSkill.structured?.judgeUpgrade);
    expect(life.length + judge.length).toBe(15);
    for (const c of [...life, ...judge]) {
      const s = c.specialSkill.structured;
      expect(s?.extra, c.id).not.toBeNull();
      expect(c.specialSkill.raw.endsWith(`、${s?.extra ?? ""}`), c.id).toBe(true);
      expect(s?.skillRateUp, c.id).toBeUndefined();
    }
    for (const c of life) expect(c.specialSkill.raw).toMatch(/ライフが\d+回復$/);
    for (const c of judge) expect(c.specialSkill.raw).toMatch(/GOOD以上がPERFECTになる$/);
  });

  it("master の「ID1〜3期生」は AREA15 / holoro / holoh3ro に読み替えてある（所属 ID はその 3 つ）", () => {
    const byId = new Map(star4.map((c) => [c.id, c]));
    const expected: Record<string, [string, string]> = {
      "airani-iofifteen-star4-01": ["AREA15", "id-gen1"],
      "pavolia-reine-star4-01": ["holoro", "id-gen2"],
      "kaela-kovalskia-star4-01": ["holoh3ro", "id-gen3"],
    };
    for (const [id, [name, affId]] of Object.entries(expected)) {
      const c = byId.get(id);
      expect(c, id).toBeDefined();
      if (!c) continue;
      expect(c.costumeSkill.raw).toContain(`${name}が2人以上で`);
      expect(c.costumeSkill.structured?.condition).toEqual({
        kind: "affiliationCount",
        affiliation: affId,
        min: 2,
      });
      expect(c.passiveSkill.raw).not.toContain("ID");
    }
    for (const c of cardList) {
      for (const k of ["costumeSkill", "passiveSkill", "activeSkill", "specialSkill"] as const) {
        expect(c[k].raw, `${c.id} ${k}`).not.toMatch(/ID[123]期生/);
      }
    }
  });
});

describe("★4 のマスター原文（資料）", () => {
  it("54 枚ぶんあり、マスター側の ID に重複がなく、出典のコミットを持つ", () => {
    expect(masterSkillLevels).toHaveLength(54);
    expect(new Set(masterSkillLevels.map((m) => m.masterCardId)).size).toBe(54);
    expect(new Set(masterSkillLevels.map((m) => m.cardId))).toEqual(
      new Set(star4.map((c) => c.id)),
    );
    expect(masterSkillLevelsSource.repo).toBe("HolodoriDB/holodori-db-jpn-diff");
    expect(masterSkillLevelsSource.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(masterSkillLevelsSource.asOf).toBe("2026-10-09");
  });

  it("カードの最大開花側の文言は master の level 2 から（空白 → 読点、ID 期生 → 所属名）作ったもの", () => {
    const normalize = (raw: string): string =>
      raw
        .replace(/ /g, "、")
        .replace(/ID1期生2人の/g, "AREA15 2人の")
        .replace(/ID1期生/g, "AREA15")
        .replace(/ID2期生/g, "holoro")
        .replace(/ID3期生/g, "holoh3ro");
    const byId = new Map(star4.map((c) => [c.id, c]));
    for (const m of masterSkillLevels) {
      const c = byId.get(m.cardId);
      expect(c, m.cardId).toBeDefined();
      if (!c) continue;
      expect(c.costumeSkill.raw).toBe(normalize(m.costume));
      expect(c.passiveSkill.raw).toBe(normalize(m.passive.level2));
      expect(c.activeSkill.raw).toBe(normalize(m.active.level2));
      expect(c.specialSkill.raw).toBe(normalize(m.special.level2));
      // level 1 は資料として残すだけ(level 2 と同じ文言でも構わない)
      expect(typeof m.passive.level1).toBe("string");
    }
  });
});

describe("2026-10-09 の meta", () => {
  it("asOf が更新され、★4 が外部解析で実機未確認であることを notes に残している", () => {
    expect(meta.asOf).toBe("2026-10-09");
    expect(meta.notes.some((n) => n.includes("★4") && n.includes("実機"))).toBe(true);
  });
});
