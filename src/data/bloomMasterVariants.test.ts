import { describe, expect, it } from "vite-plus/test";

import { cardAtBloomWithProvenance } from "./bloom";
import type { BloomResolvedSource } from "./bloom";
import { MASTER_20260912, bloomVariantEvidenceOf } from "./bloomEvidence";
import type { SkillKey } from "./bloomEvidence";
import { cardById } from "./index";
import type { ActiveSkillStructured, Card } from "./types";

/**
 * 低開花 bloomVariants の固定。
 * - 恒常そら / アキ / スバル / フレア / ぼたん の 0凸 Active は 2026-09-13 にユーザーがカード詳細画面で再確認した実機値
 *   （observed-text）。2026-09-12 に抽出マスター（HolodoriDB/holodori-db-jpn-diff f086e90）の level 1 を 0凸として入れていたが、
 *   そら（level 1 = 85 / 実機 100）とぼたん（level 1 = 50→105 / 実機 60→125）で食い違った。master の level 番号と凸段階を
 *   カード共通で一律対応させない。
 * - 恒常マリン / ころね / フブキ の Passive、恒常フブキ の SP の level 1 は抽出マスター由来（外部解析）のまま。
 * 旧 `÷1.1` 推定（例: マリン 12 → 10.9、ころね 11 → 10、フブキ SP 115 → 104.5、パッシブ 45 → 40.9）を再生成しない。
 */

const card = (id: string): Card => {
  const c = cardById.get(id);
  if (!c) throw new Error(`${id} がない`);
  return c;
};
const at = (id: string, bloom: number) => cardAtBloomWithProvenance(card(id), bloom);
const active = (id: string, bloom: number): ActiveSkillStructured => {
  const s = at(id, bloom).card.activeSkill.structured;
  if (!s) throw new Error(`${id} の active が未構造化`);
  return s;
};
const passivePercent = (id: string, bloom: number): number =>
  at(id, bloom).card.passiveSkill.structured?.effects[0]?.percent ?? NaN;
const passiveKind = (id: string, bloom: number): string =>
  at(id, bloom).card.passiveSkill.structured?.effects[0]?.kind ?? "";
const specialOf = (id: string, bloom: number) => at(id, bloom).card.specialSkill.structured;

const MASTER: BloomResolvedSource = "extracted-master-variant";
const NOT_ESTIMATED = (source: BloomResolvedSource) => {
  expect(source).not.toBe("estimated-from-max");
  expect(source).not.toBe("recorded-variant-unclassified");
};

const OBSERVED: BloomResolvedSource = "observed-variant";

describe("実機再確認（2026-09-13）の 0凸 Active: K5 / K6 の 5 枚", () => {
  it("tokino-sora-01 0凸 = 24s / 中 / 10s / 100（抽出マスター level 1 の 85 ではない）", () => {
    const c = card("tokino-sora-01");
    expect(c.holomenId).toBe("tokino-sora");
    expect(c.type).toBe("cute");
    expect(active("tokino-sora-01", 0)).toEqual({
      intervalSeconds: 24,
      probability: "medium",
      durationSeconds: 10,
      scoreUpPercent: 100,
      extraCondition: null,
    });
    expect(at("tokino-sora-01", 0).provenance.activeSkill.source).toBe(OBSERVED);
    expect(bloomVariantEvidenceOf("tokino-sora-01", "activeSkill", 0).observedAt).toBe(
      "2026-09-13",
    );
  });

  it("aki-rosenthal-01 0凸 = 21s / 中 / 8s / 50、ライフ 600 以上で 95", () => {
    const c = card("aki-rosenthal-01");
    expect(c.holomenId).toBe("aki-rosenthal");
    expect(c.type).toBe("cute");
    const a = active("aki-rosenthal-01", 0);
    expect([a.intervalSeconds, a.probability, a.durationSeconds, a.scoreUpPercent]).toEqual([
      21,
      "medium",
      8,
      50,
    ]);
    expect(a.conditionalScoreUp).toEqual({ condition: { kind: "life", min: 600 }, percent: 95 });
    expect(at("aki-rosenthal-01", 0).provenance.activeSkill.source).toBe(OBSERVED);
  });

  it("oozora-subaru-01 0凸 = 34s / 高 / 12s / 95", () => {
    const c = card("oozora-subaru-01");
    expect(c.holomenId).toBe("oozora-subaru");
    expect(c.type).toBe("cute");
    expect(active("oozora-subaru-01", 0)).toEqual({
      intervalSeconds: 34,
      probability: "high",
      durationSeconds: 12,
      scoreUpPercent: 95,
      extraCondition: null,
    });
    expect(at("oozora-subaru-01", 0).provenance.activeSkill.source).toBe(OBSERVED);
  });

  it("shiranui-flare-01 0凸 = 26s / 高 / 9s / 50、40 コンボ以上で 100", () => {
    const c = card("shiranui-flare-01");
    expect(c.holomenId).toBe("shiranui-flare");
    expect(c.type).toBe("pure");
    const a = active("shiranui-flare-01", 0);
    expect([a.intervalSeconds, a.probability, a.durationSeconds, a.scoreUpPercent]).toEqual([
      26,
      "high",
      9,
      50,
    ]);
    expect(a.conditionalScoreUp).toEqual({ condition: { kind: "combo", min: 40 }, percent: 100 });
    expect(at("shiranui-flare-01", 0).provenance.activeSkill.source).toBe(OBSERVED);
  });

  it("shishiro-botan-01 0凸 = 27s / 高 / 9s / 60、ハッピー 2 人以上で 125（抽出マスター level 1 の 50 / 105 ではない）", () => {
    const c = card("shishiro-botan-01");
    expect(c.holomenId).toBe("shishiro-botan");
    expect(c.type).toBe("happy");
    const a = active("shishiro-botan-01", 0);
    expect([a.intervalSeconds, a.probability, a.durationSeconds, a.scoreUpPercent]).toEqual([
      27,
      "high",
      9,
      60,
    ]);
    expect(a.conditionalScoreUp).toEqual({
      condition: { kind: "typeCount", type: "happy", min: 2 },
      percent: 125,
    });
    expect(at("shishiro-botan-01", 0).provenance.activeSkill.source).toBe(OBSERVED);
    expect(bloomVariantEvidenceOf("shishiro-botan-01", "activeSkill", 0).observedAt).toBe(
      "2026-09-13",
    );
  });

  it("1凸以降は最大側レコードのまま: そら 100 / アキ 55→115 / スバル 115 / フレア 60→120 / ぼたん 60→125（そら・ぼたんは 0凸と同値）", () => {
    const lv2 = (id: string) => {
      const r = at(id, 1);
      expect(r.provenance.activeSkill.source).toBe("max-record");
      return active(id, 1);
    };
    expect(lv2("tokino-sora-01").scoreUpPercent).toBe(100);
    expect([
      lv2("aki-rosenthal-01").scoreUpPercent,
      lv2("aki-rosenthal-01").conditionalScoreUp?.percent,
    ]).toEqual([55, 115]);
    expect(lv2("oozora-subaru-01").scoreUpPercent).toBe(115);
    expect([
      lv2("shiranui-flare-01").scoreUpPercent,
      lv2("shiranui-flare-01").conditionalScoreUp?.percent,
    ]).toEqual([60, 120]);
    expect([
      lv2("shishiro-botan-01").scoreUpPercent,
      lv2("shishiro-botan-01").conditionalScoreUp?.percent,
    ]).toEqual([60, 125]);
  });
});

describe("抽出マスター level 1（低凸 Passive / SP）", () => {
  it("houshou-marine-01 1凸 Passive = 3期生 2 人のスコアサポート 9%（旧推定 12/1.1 ≈ 10.9 ではない）、4凸で 12", () => {
    const c = card("houshou-marine-01");
    expect(c.name).toBe("妖艶あふれるマリンブルー");
    expect(c.holomenId).toBe("houshou-marine");
    expect(passiveKind("houshou-marine-01", 1)).toBe("scoreSupport");
    expect(passivePercent("houshou-marine-01", 1)).toBe(9);
    expect(at("houshou-marine-01", 1).card.passiveSkill.structured?.condition).toEqual({
      kind: "affiliationCount",
      affiliation: "gen3",
      min: 2,
    });
    expect(at("houshou-marine-01", 1).card.passiveSkill.structured?.effects[0]?.target).toEqual({
      kind: "affiliation",
      affiliation: "gen3",
      count: 2,
    });
    expect(at("houshou-marine-01", 1).provenance.passiveSkill.source).toBe(MASTER);
    expect(passivePercent("houshou-marine-01", 0)).toBe(9);
    expect(passivePercent("houshou-marine-01", 3)).toBe(9);
    expect(passivePercent("houshou-marine-01", 4)).toBe(12);
    expect(at("houshou-marine-01", 4).provenance.passiveSkill.source).toBe("max-record");
  });

  it("inugami-korone-01 3凸 Passive = ハッピー 2 人のスコアサポート 8%（旧推定 11/1.1 = 10 ではない）、4凸で 11", () => {
    const c = card("inugami-korone-01");
    expect(c.name).toBe("Go! Go! Laughing Skater");
    expect(c.holomenId).toBe("inugami-korone");
    expect(passiveKind("inugami-korone-01", 3)).toBe("scoreSupport");
    expect(passivePercent("inugami-korone-01", 3)).toBe(8);
    expect(at("inugami-korone-01", 3).card.passiveSkill.structured?.effects[0]?.target).toEqual({
      kind: "type",
      type: "happy",
      count: 2,
    });
    expect(at("inugami-korone-01", 3).provenance.passiveSkill.source).toBe(MASTER);
    expect(passivePercent("inugami-korone-01", 4)).toBe(11);
  });

  it("shirakami-fubuki-01 1凸 Passive = 1期生 2 人のパフォーマンス 34%UP（スコアサポートではない。旧推定 45/1.1 ≈ 40.9 ではない）、4凸で 45", () => {
    const c = card("shirakami-fubuki-01");
    expect(c.name).toBe("狐のお宮でこんこんこん");
    expect(c.holomenId).toBe("shirakami-fubuki");
    const p = at("shirakami-fubuki-01", 1).card.passiveSkill.structured?.effects[0];
    expect(p).toEqual({
      kind: "paramUp",
      target: { kind: "affiliation", affiliation: "gen1", count: 2 },
      param: "performance",
      percent: 34,
    });
    expect(at("shirakami-fubuki-01", 1).provenance.passiveSkill.source).toBe(MASTER);
    expect(passivePercent("shirakami-fubuki-01", 4)).toBe(45);
  });

  it("shirakami-fubuki-01 1凸 SP = 14 秒間スコアサポート 95%（旧推定 115/1.1 ≈ 104.5 ではない）、3凸で 115", () => {
    expect(specialOf("shirakami-fubuki-01", 1)).toEqual({
      durationSeconds: 14,
      scoreSupportPercent: 95,
      extra: null,
    });
    expect(at("shirakami-fubuki-01", 1).provenance.specialSkill.source).toBe(MASTER);
    expect(specialOf("shirakami-fubuki-01", 2)?.scoreSupportPercent).toBe(95);
    expect(specialOf("shirakami-fubuki-01", 3)?.scoreSupportPercent).toBe(115);
    expect(at("shirakami-fubuki-01", 3).provenance.specialSkill.source).toBe("max-record");
  });

  it("フブキ恒常 1凸 の Active は 1凸で Lv2（最大側）", () => {
    expect(active("shirakami-fubuki-01", 1).scoreUpPercent).toBe(110);
    expect(at("shirakami-fubuki-01", 1).provenance.activeSkill.source).toBe("max-record");
  });
});

describe("抽出マスター variant の provenance", () => {
  const ENTRIES: [string, SkillKey, number][] = [
    ["houshou-marine-01", "passiveSkill", 0],
    ["inugami-korone-01", "passiveSkill", 0],
    ["shirakami-fubuki-01", "passiveSkill", 0],
    ["shirakami-fubuki-01", "specialSkill", 0],
  ];

  it("0凸 Active 5 枚は observed-text（2026-09-13）で、master との一致 / 不一致を note に持つ。master の level 1 値は実機値へ書き換えない", () => {
    const notes: Record<string, string> = {};
    for (const id of [
      "tokino-sora-01",
      "aki-rosenthal-01",
      "oozora-subaru-01",
      "shiranui-flare-01",
      "shishiro-botan-01",
    ]) {
      const e = bloomVariantEvidenceOf(id, "activeSkill", 0);
      expect(e.kind, id).toBe("observed-text");
      expect(e.observedAt).toBe("2026-09-13");
      expect(e.master).toBeUndefined();
      notes[id] = e.note ?? "";
    }
    expect(notes["tokino-sora-01"]).toContain("85");
    expect(notes["tokino-sora-01"]).toContain("不一致");
    expect(notes["shishiro-botan-01"]).toContain("105");
    expect(notes["shishiro-botan-01"]).toContain("不一致");
    for (const id of ["aki-rosenthal-01", "oozora-subaru-01", "shiranui-flare-01"]) {
      expect(notes[id]).toContain("一致");
      expect(notes[id]).not.toContain("不一致");
    }
  });

  it("Passive / SP の 4 variant は extracted-master-text で、repo / commit / 使用ファイル / マスター側カード ID を持つ（実機観測とは名乗らない）", () => {
    for (const [id, skill, bloom] of ENTRIES) {
      const e = bloomVariantEvidenceOf(id, skill, bloom);
      expect(e.kind, `${id}:${skill}`).toBe("extracted-master-text");
      expect(e.observedAt).toBeUndefined();
      expect(e.master?.repo).toBe("HolodoriDB/holodori-db-jpn-diff");
      expect(e.master?.commit).toBe("f086e9093b07eaa47a102da307e7bfa58c3a9df6");
      expect(e.master?.files).toContain(MASTER_20260912.cardFile);
      expect(e.master?.files.length).toBe(2);
      expect(e.master?.masterCardId).toMatch(/^card-\d{5}-5-uniq-\d{4}-00$/);
      // variant を持つ card 本体にも同じ bloom の variant が実在する
      const variants = card(id)[skill].bloomVariants ?? [];
      expect(variants.some((v) => v.bloom === bloom)).toBe(true);
    }
  });

  it("低凸で解決した値は estimated-from-max ではない（推定経路から外れた）", () => {
    for (const [id, bloom, skill, source] of [
      ["tokino-sora-01", 0, "activeSkill", OBSERVED],
      ["aki-rosenthal-01", 0, "activeSkill", OBSERVED],
      ["oozora-subaru-01", 0, "activeSkill", OBSERVED],
      ["shiranui-flare-01", 0, "activeSkill", OBSERVED],
      ["shishiro-botan-01", 0, "activeSkill", OBSERVED],
      ["houshou-marine-01", 1, "passiveSkill", MASTER],
      ["inugami-korone-01", 3, "passiveSkill", MASTER],
      ["shirakami-fubuki-01", 1, "passiveSkill", MASTER],
      ["shirakami-fubuki-01", 1, "specialSkill", MASTER],
    ] as const) {
      const r = at(id, bloom);
      NOT_ESTIMATED(r.provenance[skill].source);
      expect(r.provenance[skill].source).toBe(source);
      expect(r.provenance[skill].variantBloom).toBe(0);
      expect(r.provenance[skill].exactBloom).toBe(bloom === 0);
    }
  });

  it("そら / ぼたんの 0凸は master level 1 の値（85、50 / 105）を返さない。他の低凸 variant はこの訂正で変えない", () => {
    expect(active("tokino-sora-01", 0).scoreUpPercent).not.toBe(85);
    expect(active("shishiro-botan-01", 0).scoreUpPercent).not.toBe(50);
    expect(active("shishiro-botan-01", 0).conditionalScoreUp?.percent).not.toBe(105);
    expect(passivePercent("houshou-marine-01", 1)).toBe(9);
    expect(passivePercent("inugami-korone-01", 3)).toBe(8);
    expect(passivePercent("shirakami-fubuki-01", 1)).toBe(34);
    expect(specialOf("shirakami-fubuki-01", 1)?.scoreSupportPercent).toBe(95);
  });

  it("推定倍率の再導入を防ぐ: 低凸の各値は整数で、旧 ÷1.1 推定値と異なる", () => {
    expect(passivePercent("houshou-marine-01", 1)).not.toBeCloseTo(12 / 1.1, 3);
    expect(passivePercent("inugami-korone-01", 3)).not.toBeCloseTo(11 / 1.1, 3);
    expect(passivePercent("shirakami-fubuki-01", 1)).not.toBeCloseTo(45 / 1.1, 3);
    expect(specialOf("shirakami-fubuki-01", 1)?.scoreSupportPercent).not.toBeCloseTo(115 / 1.1, 3);
    for (const id of [
      "tokino-sora-01",
      "aki-rosenthal-01",
      "oozora-subaru-01",
      "shiranui-flare-01",
      "shishiro-botan-01",
    ]) {
      const a = active(id, 0);
      expect(Number.isInteger(a.scoreUpPercent)).toBe(true);
      if (a.conditionalScoreUp) expect(Number.isInteger(a.conditionalScoreUp.percent)).toBe(true);
    }
  });
});
