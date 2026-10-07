import { describe, expect, it } from "vite-plus/test";

import { bloomTextDefaultsOf } from "../ui/bloomText";
import cards from "./cards.json";
import meta from "./meta.json";
import publishedIds from "./published-ids.json";
import songs from "./songs.json";
import { SONG_READINGS } from "./songReadings";
import { songSingers } from "./songSingers";
import type { Card, Song } from "./types";

/**
 * 2026-10-07 の更新（新★5 3 枚・楽曲 song-209〜213・event-008）の取り込み方を固定する。
 *
 * 固定するのは**構造と出所の区別**だけで、パラメータや曲長の数値は固定しない（値の出所は公開攻略情報と
 * 外部解析（HolodoriDB の master）で、実機の再確認を通した値ではない — 実機の値だけをテストの期待値にする方針）。
 * 新★5 は最大開花側のスキルだけを持ち、強化前の段階は「未確認」のまま（推定した bloomVariants を作らない）。
 */
const cardList = cards as Card[];
const songList = songs as Song[];
const cardById = new Map(cardList.map((c) => [c.id, c]));
const songById = new Map(songList.map((s) => [s.id, s]));

function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} がない`);
  return value;
}

const NEW_CARD_IDS = ["yukihana-lamy-02", "omaru-polka-02", "ichijou-ririka-02"];
/** 開花文言フォームの実機報告（同日）で強化前を埋めた尾丸ポルカ以外の 2 枚は、最大開花側のスキルだけのまま */
const MAX_ONLY_IDS = ["yukihana-lamy-02", "ichijou-ririka-02"];
const NEW_SONG_IDS = ["song-209", "song-210", "song-211", "song-212", "song-213"];

describe("2026-10-07 追加のカード", () => {
  it("3 枚が入っていて、公開済み ID にも追記されている", () => {
    for (const id of NEW_CARD_IDS) {
      expect(must(cardById.get(id), id).rarity).toBe(5);
      expect(publishedIds.cards, id).toContain(id);
    }
  });

  it("取り込み用の調査メタデータ（verification など）はカードに入っていない", () => {
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
  it("実機確認前の 2 枚は開花の途中値（bloomVariants）を 1 件も持たない", () => {
    for (const id of MAX_ONLY_IDS) {
      const card = must(cardById.get(id), id);
      for (const key of ["costumeSkill", "passiveSkill", "activeSkill", "specialSkill"] as const) {
        expect(card[key].bloomVariants, `${id} ${key}`).toBeUndefined();
      }
    }
  });

  it("実機確認前の 2 枚は、強化前の区間が「未確認」、強化後と衣装は最大側レコード", () => {
    for (const id of MAX_ONLY_IDS) {
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
});

describe("2026-10-07 追加の楽曲", () => {
  it("song-209〜213 が順番どおり並んでいる", () => {
    expect(songList.slice(208, 213).map((s) => s.id)).toEqual(NEW_SONG_IDS);
  });

  it("5 曲とも曲長・4 難易度のレベルとコンボが入っていて、読みもある", () => {
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
});

describe("2026-10-07 の meta", () => {
  it("asOf が更新され、event-008 の終了時刻が候補であることを notes に残している", () => {
    expect(meta.asOf).toBe("2026-10-07");
    expect(meta.notes.some((n) => n.includes("event-008") && n.includes("候補"))).toBe(true);
  });
});
