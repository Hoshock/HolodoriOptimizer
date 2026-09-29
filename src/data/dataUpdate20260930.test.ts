import { describe, expect, it } from "vite-plus/test";

import { bloomTextDefaultsOf } from "../ui/bloomText";
import affiliations from "./affiliations.json";
import { cardAtBloomWithProvenance } from "./bloom";
import { isBloomTextVerified } from "./bloomEvidence";
import cards from "./cards.json";
import events from "./events.json";
import holomen from "./holomen.json";
import publishedIds from "./published-ids.json";
import songs from "./songs.json";
import { songSingers } from "./songSingers";
import type { Affiliation, Card, EventData, Holomen, Song } from "./types";
import { validateDataset, validateEvents } from "./validate";

/**
 * 2026-09-30 の更新（新★5 8 枚・楽曲 song-198〜208・event-006 / event-007）の取り込み方を固定する。
 *
 * 固定するのは**構造と出所の区別**だけで、パラメータや曲長の数値は固定しない（値の出所は公開攻略サイト・
 * ユーザー報告・外部解析（HolodoriDB の master）で、実機の再確認を通した値ではない — 実機の値だけを
 * テストの期待値にする方針）。
 * 最大開花側のスキルだけを持ち、強化前の段階は「未確認」のまま（推定した bloomVariants を作らない）。
 */
const cardList = cards as Card[];
const songList = songs as Song[];
const eventList = events as EventData[];
const dataset = {
  affiliations: affiliations as Affiliation[],
  holomen: holomen as Holomen[],
  cards: cardList,
  songs: songList,
};
const cardById = new Map(cardList.map((c) => [c.id, c]));
const songById = new Map(songList.map((s) => [s.id, s]));

function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} がない`);
  return value;
}

/** 2026-09-30 に追加した新カード 8 枚（水着マリンの最大 stats は HolodoriDB の master から確定して同日中に追加） */
const NEW_CARD_IDS = [
  "aki-rosenthal-02",
  "shiori-novella-02",
  "laplus-darknesss-02",
  "anya-melfissa-02",
  "houshou-marine-02",
  "hakui-koyori-02",
  "kobo-kanaeru-02",
  "hakos-baelz-02",
];

describe("2026-09-30 追加のカード", () => {
  it("8 枚が入っていて、公開済み ID にも追記されている", () => {
    for (const id of NEW_CARD_IDS) {
      const card = must(cardById.get(id), id);
      expect(card.rarity).toBe(5);
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

  // 途中開花は最大値から割り戻して作らない（推定 bloomVariants の禁止）
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
      // 衣装は開花で変わらない: 0〜5凸の 1 区間で最大側
      expect(
        d.costumeSkill.map((c) => [c.label, c.source]),
        `${id} costume`,
      ).toEqual([["0〜5凸", "max-record"]]);
      // SP は 3凸、アクティブは 1凸、パッシブは 4凸で強化される（BLOOM_UPGRADE_STAGE）
      expect(
        d.specialSkill.map((c) => [c.label, c.source]),
        `${id} special`,
      ).toEqual([
        ["0〜2凸", "unknown"],
        ["3〜5凸", "max-record"],
      ]);
      expect(
        d.activeSkill.map((c) => [c.label, c.source]),
        `${id} active`,
      ).toEqual([
        ["0凸", "unknown"],
        ["1〜5凸", "max-record"],
      ]);
      expect(
        d.passiveSkill.map((c) => [c.label, c.source]),
        `${id} passive`,
      ).toEqual([
        ["0〜3凸", "unknown"],
        ["4〜5凸", "max-record"],
      ]);
    }
  });

  it("0凸で解決しても未確認の段階は記録なしとして出る（最近傍の凸の内容の流用は計算側だけ）", () => {
    for (const id of NEW_CARD_IDS) {
      const { provenance } = cardAtBloomWithProvenance(must(cardById.get(id), id), 0);
      expect(provenance.activeSkill.source, id).toBe("unknown");
      expect(provenance.specialSkill.source, id).toBe("unknown");
      expect(provenance.passiveSkill.source, id).toBe("unknown");
    }
  });

  // 開発用「開花文言」のピッカーは、実機確認を通していないカードだけを出す（BloomTextSheet）
  it("開花文言のピッカーに出る（実機確認済みの一覧に入っていない）", () => {
    for (const id of NEW_CARD_IDS) expect(isBloomTextVerified(id), id).toBe(false);
  });

  // 水着マリンは最大 stats が確定するまで保留していた（適当な値は入れない）。HolodoriDB の master の
  // Lv80 基礎値と倍率から、確認済みの「Lv 最大・2 凸以上は本体 +10%」と切り上げで確定して追加した。
  // 参照するイベント event-007 も同時に入り、参照整合性を満たす
  it("houshou-marine-02 と、それを課題曲・メンバーボーナスに持つ event-007 が正式に入っていて、参照が解決する", () => {
    const marine = must(cardById.get("houshou-marine-02"), "houshou-marine-02");
    expect(marine.holomenId).toBe("houshou-marine");
    expect(marine.type).toBe("pure");
    expect(publishedIds.cards).toContain("houshou-marine-02");
    const e7 = must(
      eventList.find((e) => e.id === "event-007"),
      "event-007",
    );
    expect(e7.acquisitionBonus.member.cardIds).toContain("houshou-marine-02");
    expect(e7.scoreBonus.songs.find((s) => s.songId === "song-205")?.cardIds).toEqual([
      "houshou-marine-02",
    ]);
    expect(validateEvents(eventList, dataset)).toEqual([]);
    expect(validateDataset(dataset)).toEqual([]);
  });
});

describe("2026-09-30 追加の楽曲", () => {
  const newSongs = Array.from({ length: 11 }, (_, i) => `song-${String(198 + i)}`);

  it("song-198〜208 が順番どおり末尾に入っている", () => {
    expect(songList.slice(-11).map((s) => s.id)).toEqual(newSongs);
  });

  it("調査メタデータ（verification）は入っていない", () => {
    for (const id of newSongs) {
      expect(Object.keys(must(songById.get(id), id)).sort(), id).toEqual([
        "artists",
        "charts",
        "durationSeconds",
        "id",
        "kind",
        "title",
      ]);
    }
  });

  it("未確認の項目は推測で埋めず null / 空のまま", () => {
    // きゃぴ・プロポーズ: 曲長も全難易度も未確認
    for (const id of ["song-205", "song-208"]) {
      const s = must(songById.get(id), id);
      expect(s.durationSeconds, id).toBeNull();
      expect(s.charts, id).toEqual({});
    }
    // Play Dice!: 曲長だけ公開ソースが競合しているので null（譜面は確認済みの 4 難易度）
    const dice = must(songById.get("song-207"), "song-207");
    expect(dice.title).toBe("Play Dice!");
    expect(dice.durationSeconds).toBeNull();
    expect(Object.keys(dice.charts)).toEqual(["easy", "normal", "hard", "expert"]);
    // それ以外の 8 曲は曲長が入っている
    for (const id of newSongs.filter((i) => !["song-205", "song-207", "song-208"].includes(i))) {
      expect(must(songById.get(id), id).durationSeconds, id).not.toBeNull();
    }
  });

  it("歌唱者はすべてホロメン名から導ける（未確認の歌唱者がいない）", () => {
    for (const id of newSongs) {
      const s = must(songById.get(id), id);
      const singers = songSingers(s);
      expect(singers.holomenIds, id).not.toBeNull();
      expect(singers.holomenIds?.length, id).toBe(s.artists.length);
    }
  });
});

describe("譜面が空の曲の検査", () => {
  const base = must(songById.get("song-198"), "song-198");

  it("曲長も未確認（null）なら譜面が空でもよい", () => {
    const errors = validateDataset({
      ...dataset,
      songs: [{ ...base, durationSeconds: null, charts: {} }],
    });
    expect(errors).toEqual([]);
  });

  it("曲長が分かっているのに譜面が空なのは入力漏れとしてエラー", () => {
    const errors = validateDataset({
      ...dataset,
      songs: [{ ...base, durationSeconds: 120, charts: {} }],
    });
    expect(errors).toEqual(["song song-198: charts が空"]);
  });
});
