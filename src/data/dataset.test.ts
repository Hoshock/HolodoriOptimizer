import { describe, expect, it } from "vite-plus/test";

import affiliations from "./affiliations.json";
import cards from "./cards.json";
import holomen from "./holomen.json";
import meta from "./meta.json";
import publishedIds from "./published-ids.json";
import songs from "./songs.json";
import type { Affiliation, Card, DatasetMeta, Holomen, Song } from "./types";
import { structuredCoverage, validateDataset } from "./validate";

const dataset = {
  affiliations: affiliations as Affiliation[],
  holomen: holomen as Holomen[],
  cards: cards as Card[],
  songs: songs as Song[],
};

describe("dataset", () => {
  it("整合性エラーがない", () => {
    expect(validateDataset(dataset)).toEqual([]);
  });

  it("★5 カードと楽曲が入っている", () => {
    expect(dataset.cards.length).toBeGreaterThanOrEqual(60);
    expect(dataset.songs.length).toBeGreaterThanOrEqual(100);
    expect(dataset.holomen.length).toBeGreaterThanOrEqual(40);
  });

  it("出典メタ情報を持つ", () => {
    const m = meta as DatasetMeta;
    expect(m.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(m.sources.length).toBeGreaterThan(0);
  });

  // 公開済みの ID はユーザーのブラウザ(localStorage)に登録として保存されているので、
  // 削除・改名すると登録が消える。published-ids.json で凍結し、差分をここで検知する(2026-09-02)。
  // 直したい ID があっても改名せず、新 ID を追加して旧 ID は残す(別名対応は保存層で行う)
  it("公開済みのカード・ホロメン ID を削除・改名していない", () => {
    const cardIds = new Set(dataset.cards.map((c) => c.id));
    const holomenIds = new Set(dataset.holomen.map((h) => h.id));
    const missingCards = publishedIds.cards.filter((id) => !cardIds.has(id));
    const missingHolomen = publishedIds.holomen.filter((id) => !holomenIds.has(id));
    expect(missingCards, "published-ids.json にあるカード ID が cards.json から消えている").toEqual(
      [],
    );
    expect(
      missingHolomen,
      "published-ids.json にあるホロメン ID が holomen.json から消えている",
    ).toEqual([]);
  });

  it("新しいカード・ホロメン ID は published-ids.json にも追記されている", () => {
    const frozenCards = new Set(publishedIds.cards);
    const frozenHolomen = new Set(publishedIds.holomen);
    expect(dataset.cards.map((c) => c.id).filter((id) => !frozenCards.has(id))).toEqual([]);
    expect(dataset.holomen.map((h) => h.id).filter((id) => !frozenHolomen.has(id))).toEqual([]);
  });

  // 2026-09-08 追加の水着 3 枚(最大 Lv のパラメータはユーザーの実機確認値。そのまま保存する)
  it("2026-09-08 追加の★5 カード 3 枚が実機確認のパラメータのまま入っている", () => {
    const byId = new Map(dataset.cards.map((c) => [c.id, c]));
    const expected: Record<string, [string, string, Card["type"], number, number, number]> = {
      "takane-lui-02": ["takane-lui", "波音に安らぐ、しごでき幹部", "happy", 6947, 7828, 11145],
      "fuwawa-abyssgard-02": [
        "fuwawa-abyssgard",
        "フワワのFlowing Summer",
        "pure",
        10672,
        7366,
        7991,
      ],
      "mococo-abyssgard-02": [
        "mococo-abyssgard",
        "モココのBreezy Summer",
        "pure",
        11145,
        6947,
        7828,
      ],
    };
    for (const [id, [holomenId, name, type, p, t, s]] of Object.entries(expected)) {
      const card = byId.get(id);
      expect(card, id).toBeDefined();
      if (!card) continue;
      expect(card.holomenId).toBe(holomenId);
      expect(card.name).toBe(name);
      expect(card.type).toBe(type);
      expect(card.rarity).toBe(5);
      expect(card.stats).toEqual({ performance: p, technique: t, sense: s });
      // 同じホロメンの通常版(-01)と別カードとして両方ある
      expect(byId.has(id.replace(/-02$/, "-01"))).toBe(true);
    }
  });

  // 2026-09-11 ユーザー実機確認(カード画面の衣装スキル原文)。データは初期出典の転記時点から 130% で正しかったが、
  // 「120% の誤データが入っている」との申告があったので、原文と構造化の両方を実機どおりに固定する。
  // 同日の実機の衣装スキル効果 59,810(T の素値合計 × 130% をメンバーごとに切り上げ)も 130% と整合する(power.test.ts)
  it("ookami-mio-02 の衣装スキルは「ピュアタイプ 2 人以上で全員のテクニック 130% UP」(2026-09-11 実機確認)", () => {
    const card = dataset.cards.find((c) => c.id === "ookami-mio-02");
    expect(card).toBeDefined();
    if (!card) return;
    expect(card.name).toBe("夏にまどろむWolf Heart");
    expect(card.costumeSkill.raw).toBe("ピュアタイプ2人以上で全員のテクニックが130%UP");
    expect(card.costumeSkill.structured).toEqual({
      condition: { kind: "typeCount", type: "pure", min: 2 },
      effects: [{ kind: "paramUp", target: { kind: "all" }, param: "technique", percent: 130 }],
    });
    // 衣装スキルは開花で強化されない(bloomVariants を持たない)
    expect(card.costumeSkill.bloomVariants).toBeUndefined();
  });

  it("カード ID・楽曲 ID に重複がない", () => {
    expect(new Set(dataset.cards.map((c) => c.id)).size).toBe(dataset.cards.length);
    expect(new Set(dataset.songs.map((s) => s.id)).size).toBe(dataset.songs.length);
  });

  // 2026-08-31 に全件構造化済み。以後は新規カードも構造化してから追加する(UI に未構造化の表現がない)
  it("衣装・パッシブスキルは全カード構造化済み", () => {
    const coverage = structuredCoverage(dataset.cards);
    console.info("structured coverage:", coverage);
    expect(coverage["costumeSkill"]).toBe(1);
    expect(coverage["passiveSkill"]).toBe(1);
  });
});
