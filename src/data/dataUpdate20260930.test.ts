import { describe, expect, it } from "vite-plus/test";

import { bloomTextDefaultsOf, bloomTextPickerPool } from "../ui/bloomText";
import affiliations from "./affiliations.json";
import { BLOOM_UPGRADE_STAGE, cardAtBloomWithProvenance } from "./bloom";
import { bloomVariantEvidenceOf, isBloomTextVerified } from "./bloomEvidence";
import type { SkillKey } from "./bloomEvidence";
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

/** 開花文言フォームの実機報告（2026-09-30）を反映した 4 枚。残り 4 枚は最大開花側のスキルだけで強化前は未確認のまま（うち こぼ は 2026-10-09 に埋めた） */
const FORM_CONFIRMED_IDS = [
  "aki-rosenthal-02",
  "houshou-marine-02",
  "hakui-koyori-02",
  "hakos-baelz-02",
];
/** 後日の開花文言フォーム（2026-10-09 第 6 弾）で強化前を埋めたカード。固定は bloomForm20261009.test.ts */
const LATER_FORM_CONFIRMED_IDS = ["kobo-kanaeru-02"];
const MAX_ONLY_IDS = NEW_CARD_IDS.filter(
  (id) => !FORM_CONFIRMED_IDS.includes(id) && !LATER_FORM_CONFIRMED_IDS.includes(id),
);

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
  // 実機確認前の 3 枚は途中値を作らない（最大値から割り戻した推定 bloomVariants の禁止）
  it("実機確認前の 3 枚は開花の途中値（bloomVariants）を 1 件も持たない", () => {
    expect(MAX_ONLY_IDS).toEqual(["shiori-novella-02", "laplus-darknesss-02", "anya-melfissa-02"]);
    for (const id of MAX_ONLY_IDS) {
      const card = must(cardById.get(id), id);
      for (const key of ["costumeSkill", "passiveSkill", "activeSkill", "specialSkill"] as const) {
        expect(card[key].bloomVariants, `${id} ${key}`).toBeUndefined();
      }
    }
  });

  it("実機確認前の 3 枚は、強化前の区間が「未確認」、強化後と衣装は最大側レコード", () => {
    for (const id of MAX_ONLY_IDS) {
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

  it("実機確認前の 3 枚は、0凸で解決しても未確認の段階は記録なしとして出る（最近傍の凸の内容の流用は計算側だけ）", () => {
    for (const id of MAX_ONLY_IDS) {
      const { provenance } = cardAtBloomWithProvenance(must(cardById.get(id), id), 0);
      expect(provenance.activeSkill.source, id).toBe("unknown");
      expect(provenance.specialSkill.source, id).toBe("unknown");
      expect(provenance.passiveSkill.source, id).toBe("unknown");
    }
  });

  // 開発用「開花文言」のピッカーは、実機確認を通していないカードだけを出す（BloomTextSheet）
  it("実機確認前の 3 枚は開花文言のピッカーに出る（実機確認済みの一覧に入っていない）", () => {
    const pool = bloomTextPickerPool(cards as Card[], []).map((c) => c.id);
    for (const id of MAX_ONLY_IDS) {
      expect(isBloomTextVerified(id), id).toBe(false);
      expect(pool, id).toContain(id);
    }
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

/**
 * 2026-09-30 ユーザー実機観測（開発用の開花文言フォーム 第 4 弾）。フォームに入れた強化前の文言 11 件を
 * そのまま固定する（実機の値。最大側の文言は数値だけ違う）。水着ハコスの 0凸 Active は実機でも確認できなかったので
 * 「未確認」のまま（variant なし）。区間の境目は BLOOM_UPGRADE_STAGE（SP 3凸 / Active 1凸 / Passive 4凸）
 */
const OBSERVED: [string, Exclude<SkillKey, "costumeSkill">, string][] = [
  [
    "aki-rosenthal-02",
    "specialSkill",
    "12秒間スコアサポート効果100%、1期生が2人以上でスキル発動率が40%UP",
  ],
  ["aki-rosenthal-02", "activeSkill", "24秒毎に高確率で9秒間スコアが90%UP"],
  ["aki-rosenthal-02", "passiveSkill", "1期生2人のテクニックが32%UP"],
  ["houshou-marine-02", "specialSkill", "14秒間スコアサポート効果95%"],
  ["houshou-marine-02", "activeSkill", "34秒毎に中確率で12秒間スコアが100%UP"],
  ["houshou-marine-02", "passiveSkill", "ピュアタイプ2人以上でピュアタイプ2人のセンスが32%UP"],
  ["hakui-koyori-02", "specialSkill", "12秒間スコアサポート効果110%"],
  [
    "hakui-koyori-02",
    "activeSkill",
    "25秒毎に中確率で9秒間スコアが50%UP、ライフ600以上でスコアが100%UP",
  ],
  [
    "hakui-koyori-02",
    "passiveSkill",
    "ハッピータイプ2人以上でハッピータイプ2人のパフォーマンスが32%UP",
  ],
  ["hakos-baelz-02", "specialSkill", "15秒間スコアサポート効果90%"],
  ["hakos-baelz-02", "passiveSkill", "Promiseが2人以上で自身の全パラメータが25%UP"],
];
const STAGE = {
  specialSkill: BLOOM_UPGRADE_STAGE.special,
  activeSkill: BLOOM_UPGRADE_STAGE.active,
  passiveSkill: BLOOM_UPGRADE_STAGE.passive,
} as const;

describe("2026-09-30 開花文言フォームの実機報告（水着アキ・マリン・こより・ハコス）", () => {
  it("実機で入れた 11 件が、強化前の区間の variant として入っている（実機の文言そのまま）", () => {
    for (const [id, skill, text] of OBSERVED) {
      const card = must(cardById.get(id), id);
      expect(
        card[skill].bloomVariants?.map((v) => [v.bloom, v.raw]),
        `${id} ${skill}`,
      ).toEqual([[0, text]]);
      // 出所は実機の文言そのもの（observed-text）
      expect(bloomVariantEvidenceOf(id, skill, 0), `${id} ${skill}`).toMatchObject({
        kind: "observed-text",
        observedAt: "2026-09-30",
      });
      // 強化前の区間はこの文言、強化の段階から最大側レコード（境目の前後で確かめる）
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
    const aki = at0("aki-rosenthal-02");
    expect(aki.specialSkill.structured).toMatchObject({
      durationSeconds: 12,
      scoreSupportPercent: 100,
      skillRateUp: {
        condition: { kind: "affiliationCount", affiliation: "gen1", min: 2 },
        percent: 40,
      },
    });
    expect(aki.activeSkill.structured).toMatchObject({ intervalSeconds: 24, scoreUpPercent: 90 });
    expect(aki.passiveSkill.structured?.effects[0]).toMatchObject({
      param: "technique",
      percent: 32,
    });
    const koyori = at0("hakui-koyori-02");
    expect(koyori.activeSkill.structured).toMatchObject({
      scoreUpPercent: 50,
      extraCondition: "ライフ600以上でスコアが100%UP",
      conditionalScoreUp: { condition: { kind: "life", min: 600 }, percent: 100 },
    });
    const marine = at0("houshou-marine-02");
    expect(marine.specialSkill.structured).toMatchObject({
      durationSeconds: 14,
      scoreSupportPercent: 95,
    });
    expect(marine.passiveSkill.structured?.effects[0]).toMatchObject({
      param: "sense",
      percent: 32,
    });
    const hakos = at0("hakos-baelz-02");
    expect(hakos.specialSkill.structured).toMatchObject({
      durationSeconds: 15,
      scoreSupportPercent: 90,
    });
    expect(hakos.passiveSkill.structured?.effects[0]).toMatchObject({
      target: { kind: "self" },
      param: "all",
      percent: 25,
    });
  });

  it("水着ハコスの 0凸 Active は実機でも確認できなかったので「未確認」のまま（variant なし）", () => {
    const hakos = must(cardById.get("hakos-baelz-02"), "hakos-baelz-02");
    expect(hakos.activeSkill.bloomVariants).toBeUndefined();
    expect(cardAtBloomWithProvenance(hakos, 0).provenance.activeSkill.source).toBe("unknown");
  });

  it("衣装スキルは最大側のまま（実機で突き合わせて変更なし）で、途中値を持たない", () => {
    for (const id of FORM_CONFIRMED_IDS) {
      const card = must(cardById.get(id), id);
      expect(card.costumeSkill.bloomVariants, id).toBeUndefined();
      expect(cardAtBloomWithProvenance(card, 0).provenance.costumeSkill.source, id).toBe(
        "max-record",
      );
    }
  });

  it("4 枚とも実機確認済みの一覧に入り、開花文言のピッカーには出ない", () => {
    const pool = bloomTextPickerPool(cards as Card[], []).map((c) => c.id);
    for (const id of FORM_CONFIRMED_IDS) {
      expect(isBloomTextVerified(id), id).toBe(true);
      expect(pool, id).not.toContain(id);
    }
  });
});

describe("2026-09-30 追加の楽曲", () => {
  const newSongs = Array.from({ length: 11 }, (_, i) => `song-${String(198 + i)}`);

  it("song-198〜208 が順番どおり並んでいる", () => {
    expect(songList.slice(197, 208).map((s) => s.id)).toEqual(newSongs);
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

  it("実機で確かめた曲長・レベルが入り、未確認の combo は推測で埋めず null のまま", () => {
    // 2026-09-30 ユーザー報告（曲長 / 難易度 easy・normal・hard・expert のレベル）
    const REPORTED: Record<string, [string, number, number[]]> = {
      "song-208": ["プロポーズ", 133, [3, 10, 18, 25]],
      "song-205": ["きゃぴ", 123, [4, 10, 17, 26]],
      "song-207": ["Play Dice!", 155, [4, 11, 20, 28]],
      "song-206": ["爆ラブ＋ケミストリー", 125, [5, 13, 20, 28]],
    };
    for (const [id, [title, duration, levels]] of Object.entries(REPORTED)) {
      const s = must(songById.get(id), id);
      expect(s.title, id).toBe(title);
      expect(s.durationSeconds, id).toBe(duration);
      expect(Object.keys(s.charts), id).toEqual(["easy", "normal", "hard", "expert"]);
      expect(
        Object.values(s.charts).map((c) => c?.level),
        id,
      ).toEqual(levels);
      for (const c of Object.values(s.charts)) expect(c?.combo, id).toBeNull();
    }
    // 新曲はすべて曲長が入っている
    for (const id of newSongs) {
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
