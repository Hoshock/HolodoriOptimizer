import { describe, expect, it } from "vite-plus/test";

import { bloomTextDefaultsOf } from "../ui/bloomText";
import { CARD_CONNECT_EFFECTS } from "./cardConnect";
import cards from "./cards.json";
import meta from "./meta.json";
import publishedIds from "./published-ids.json";
import songs from "./songs.json";
import { SONG_READINGS } from "./songReadings";
import { songSingers } from "./songSingers";
import type { Card, Song } from "./types";

/**
 * 2026-10-22 の更新（新★5 4 枚・楽曲 song-214〜217）の取り込み方を固定する。
 *
 * 固定するのは**構造と出所の区別**だけで、パラメータや曲長の数値は固定しない（値の出所は抽出マスター
 * HolodoriDB/holodori-db-jpn-diff の外部解析で、実機の再確認を通した値ではない — 実機の値だけをテストの期待値にする方針）。
 * 新★5 は最大開花側のスキルだけを持ち、強化前の段階は「未確認」のまま（推定した bloomVariants を作らない）。
 * 配信前の song-218 / song-219 とイベントのボーナスは取り込まない。
 */
const cardList = cards as Card[];
const songList = songs as Song[];
const cardById = new Map(cardList.map((c) => [c.id, c]));
const songById = new Map(songList.map((s) => [s.id, s]));

function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} がない`);
  return value;
}

const NEW_CARD_IDS = [
  "tokoyami-towa-02",
  "shishiro-botan-02",
  "kaela-kovalskia-02",
  "koseki-bijou-02",
];
const NEW_SONG_IDS = ["song-214", "song-215", "song-216", "song-217"];

describe("2026-10-22 追加のカード", () => {
  it("4 枚が ★5 として入っていて、公開済み ID にも追記され、ID に重複がない", () => {
    for (const id of NEW_CARD_IDS) {
      expect(must(cardById.get(id), id).rarity).toBe(5);
      expect(publishedIds.cards, id).toContain(id);
    }
    expect(new Set(cardList.map((c) => c.id)).size).toBe(cardList.length);
  });

  it("取り込み用の調査メタデータはカードに入っていない", () => {
    const allowed = new Set([
      "id",
      "name",
      "reading",
      "holomenId",
      "rarity",
      "type",
      "stats",
      "costumeSkill",
      "passiveSkill",
      "activeSkill",
      "specialSkill",
    ]);
    for (const id of NEW_CARD_IDS) {
      expect(
        Object.keys(must(cardById.get(id), id)).filter((k) => !allowed.has(k)),
        id,
      ).toEqual([]);
    }
  });

  // master の level 番号と凸段階は一律に対応しないので、途中開花は転記しない
  it("開花の途中値（bloomVariants）を 1 件も持たない", () => {
    for (const id of NEW_CARD_IDS) {
      const card = must(cardById.get(id), id);
      for (const key of ["costumeSkill", "passiveSkill", "activeSkill", "specialSkill"] as const) {
        expect(card[key].bloomVariants, `${id} ${key}`).toBeUndefined();
      }
    }
  });

  it("強化前の区間は「未確認」、強化後と衣装は最大側レコード", () => {
    for (const id of NEW_CARD_IDS) {
      const d = bloomTextDefaultsOf(must(cardById.get(id), id));
      expect(
        d.costumeSkill.map((c) => [c.label, c.source]),
        `${id} costume`,
      ).toEqual([["0〜5凸", "max-record"]]);
      for (const key of ["specialSkill", "activeSkill", "passiveSkill"] as const) {
        const sources = d[key].map((c) => c.source);
        expect(sources, `${id} ${key}`).toContain("unknown");
        expect(sources.at(-1), `${id} ${key}`).toBe("max-record");
      }
    }
  });

  it("master の「ID3期生」は holoh3ro（id-gen3）に読み替えてある", () => {
    const kaela = must(cardById.get("kaela-kovalskia-02"), "kaela-kovalskia-02");
    expect(kaela.costumeSkill.raw).toContain("holoh3roが2人以上で");
    expect(kaela.costumeSkill.structured?.condition).toEqual({
      kind: "affiliationCount",
      affiliation: "id-gen3",
      min: 2,
    });
    for (const id of NEW_CARD_IDS) {
      const c = must(cardById.get(id), id);
      for (const k of ["costumeSkill", "passiveSkill", "activeSkill", "specialSkill"] as const) {
        expect(c[k].raw, `${id} ${k}`).not.toMatch(/ID[123]期生/);
      }
    }
  });

  it("カード固有のコネクト効果が対応表にある", () => {
    for (const id of NEW_CARD_IDS) expect(CARD_CONNECT_EFFECTS, id).toHaveProperty(id);
  });
});

describe("2026-10-22 追加の楽曲", () => {
  it("song-214〜217 が song-213 の次に順番どおり並んでいる", () => {
    const i = songList.findIndex((s) => s.id === "song-213");
    expect(songList.slice(i + 1, i + 5).map((s) => s.id)).toEqual(NEW_SONG_IDS);
  });

  it("4 曲とも曲長・4 難易度のレベルとコンボが入っていて、読みもある", () => {
    for (const id of NEW_SONG_IDS) {
      const song = must(songById.get(id), id);
      expect(song.durationSeconds, id).toBeGreaterThan(0);
      for (const diff of ["easy", "normal", "hard", "expert"] as const) {
        expect(song.charts[diff]?.level, `${id} ${diff}`).toBeGreaterThan(0);
        expect(song.charts[diff]?.combo, `${id} ${diff}`).toBeGreaterThan(0);
      }
      expect(SONG_READINGS[id], id).toBeTruthy();
    }
  });

  it("歌唱者はアーティスト表記のホロメン 1 人（ソロ楽曲）", () => {
    for (const id of NEW_SONG_IDS) {
      const singers = songSingers(must(songById.get(id), id));
      expect(singers.scope, id).toBe("solo");
      expect(singers.holomenIds, id).toHaveLength(1);
    }
  });

  it("配信前の song-218 / song-219 は取り込まない", () => {
    expect(songById.has("song-218")).toBe(false);
    expect(songById.has("song-219")).toBe(false);
    expect(songList.map((s) => s.title)).not.toContain("アマリリス");
  });
});

describe("2026-10-22 の meta", () => {
  it("asOf は 2026-10-22 以降で、外部解析・実機未確認の出所と未配信曲を見送った記録を残している", () => {
    expect(meta.asOf >= "2026-10-22").toBe(true);
    expect(meta.sources.some((s) => s.includes("2026-10-22") && s.includes("ed117f1d"))).toBe(true);
    expect(meta.notes.some((n) => n.includes("song-218") && n.includes("配信確認"))).toBe(true);
  });
});
