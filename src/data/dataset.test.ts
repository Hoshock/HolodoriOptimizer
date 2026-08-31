import { describe, expect, it } from "vite-plus/test";

import affiliations from "./affiliations.json";
import cards from "./cards.json";
import holomen from "./holomen.json";
import meta from "./meta.json";
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

  // 構造化率はエラーではなく可視化のみ(下げる変更に気づけるよう下限だけ緩く固定)
  it("衣装・パッシブスキルの構造化率が過半", () => {
    const coverage = structuredCoverage(dataset.cards);
    console.info("structured coverage:", coverage);
    expect(coverage["costumeSkill"]).toBeGreaterThan(0.5);
    expect(coverage["passiveSkill"]).toBeGreaterThan(0.5);
  });
});
