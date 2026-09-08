import { describe, expect, it } from "vite-plus/test";

import affiliations from "./affiliations.json";
import cards from "./cards.json";
import {
  activeChapter,
  activeEvent,
  chapterOf,
  EVENT_AWAKENING_BONUS,
  hasChapters,
} from "./events";
import events from "./events.json";
import holomen from "./holomen.json";
import songs from "./songs.json";
import type { Affiliation, Card, EventData, Holomen, Song } from "./types";
import { validateEvents } from "./validate";

const dataset = {
  affiliations: affiliations as Affiliation[],
  holomen: holomen as Holomen[],
  cards: cards as Card[],
  songs: songs as Song[],
};
const list = events as EventData[];
const byId = new Map(list.map((e) => [e.id, e]));
const cardById = new Map(dataset.cards.map((c) => [c.id, c]));
const holomenById = new Map(dataset.holomen.map((h) => [h.id, h]));
const songById = new Map(dataset.songs.map((s) => [s.id, s]));

function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} がない`);
  return value;
}

describe("events.json", () => {
  it("整合性エラーがない(cardId / holomenId / songId は正規データに存在し、期間・チャプターの形が正しい)", () => {
    expect(validateEvents(list, dataset)).toEqual([]);
  });

  it("サービス開始後の 5 イベントを開始順に持つ", () => {
    expect(list.map((e) => e.id)).toEqual([
      "event-001",
      "event-002",
      "event-003",
      "event-004",
      "event-005",
    ]);
    for (let i = 1; i < list.length; i++) {
      const prev = must(list[i - 1], "prev");
      const cur = must(list[i], "cur");
      expect(Date.parse(prev.endAt), `${prev.id} と ${cur.id} の期間が重なる`).toBeLessThan(
        Date.parse(cur.startAt),
      );
    }
  });

  // ID は表示名から解決したもの。表示名がゲーム内(ユーザー共有)の表記と一致することを名前で固定する
  it("現在イベント(無邪気なふたり、見守るeyes)の対象は水着ルイ・フワワ・モココと 3 曲", () => {
    const e = must(byId.get("event-005"), "event-005");
    expect(e.type).toBe("score-challenge");
    expect(e.acquisitionBonus.member.percent).toBe(30);
    expect(e.acquisitionBonus.member.cardIds.map((id) => cardById.get(id)?.name)).toEqual([
      "波音に安らぐ、しごでき幹部",
      "フワワのFlowing Summer",
      "モココのBreezy Summer",
    ]);
    expect(e.acquisitionBonus.holomen.percent).toBe(30);
    expect(e.acquisitionBonus.holomen.holomenIds.map((id) => holomenById.get(id)?.name)).toEqual([
      "鷹嶺ルイ",
      "フワワ・アビスガード",
      "モココ・アビスガード",
    ]);
    expect(e.scoreBonus).toMatchObject({ percent: 10, capPercent: 10 });
    expect(
      e.scoreBonus.songs.map((s) => [
        songById.get(s.songId)?.title,
        s.cardIds.map((id) => cardById.get(id)?.name),
      ]),
    ).toEqual([
      [
        "三位一体♡ラブシステム",
        ["波音に安らぐ、しごでき幹部", "フワワのFlowing Summer", "モココのBreezy Summer"],
      ],
      ["ホロホーク", ["波音に安らぐ、しごでき幹部"]],
      ["めくるめくランデヴー", ["フワワのFlowing Summer", "モココのBreezy Summer"]],
    ]);
  });

  it("イベント 1 の課題曲は 6 曲(You & 合図 も含む。曲名は songs.json の表記で解決)", () => {
    const e = must(byId.get("event-001"), "event-001");
    expect(e.scoreBonus.songs.map((s) => songById.get(s.songId)?.title)).toEqual([
      "Boom! Boom! Tropica Vacation",
      "HOT DUCK!",
      "UNDEAD",
      "ほめのび",
      "恋愛サーキュレーション",
      "You & aIzu",
    ]);
    expect(must(e.scoreBonus.songs[0], "song 0").cardIds).toHaveLength(5);
    expect(
      must(e.scoreBonus.songs[5], "song 5").cardIds.map((id) => cardById.get(id)?.name),
    ).toEqual(["潮風にのせる、笑顔のハーモニー"]);
  });

  it("イベント 4 のフブキは既存 ID shirakami-fubuki-02(cards.json の表記「海で魅せるtwinkle」)で参照する", () => {
    const e = must(byId.get("event-004"), "event-004");
    expect(e.acquisitionBonus.member.cardIds).toContain("shirakami-fubuki-02");
    expect(cardById.get("shirakami-fubuki-02")?.name).toBe("海で魅せるtwinkle");
  });

  it("イベント 3(アルティメットサマー)だけチャプター制で、新★5 5 枚は本体、ホロメンと課題曲はチャプター側", () => {
    const e = must(byId.get("event-003"), "event-003");
    expect(e.type).toBe("spotlight");
    expect(hasChapters(e)).toBe(true);
    expect(list.filter(hasChapters)).toEqual([e]);
    expect(e.acquisitionBonus.member.percent).toBe(50);
    expect(e.acquisitionBonus.member.cardIds).toHaveLength(5);
    expect(e.acquisitionBonus.holomen.holomenIds).toEqual([]);
    expect(e.scoreBonus.songs).toEqual([]);
    const chapters = e.chapters ?? [];
    expect(chapters).toHaveLength(5);
    expect(
      chapters.map((c) => [
        c.holomenBonus?.holomenIds.map((id) => holomenById.get(id)?.name),
        c.scoreBonusSongs?.map((s) => songById.get(s.songId)?.title),
      ]),
    ).toEqual([
      [["森カリオペ"], ["NIGHTBREAK"]],
      [["百鬼あやめ"], ["万歳☆満開"]],
      [["クレイジー・オリー"], ["Oshi Mode ON"]],
      [["姫森ルーナ"], ["天たこ観測"]],
      [["一伊那尓栖"], ["星屑カプセル"]],
    ]);
    // 48 時間ごとに切り替わり、最初はイベント開始・最後はイベント終了と一致
    for (const c of chapters) {
      expect(Date.parse(c.endAt) + 60_000 - Date.parse(c.startAt)).toBe(48 * 3600 * 1000);
    }
    expect(must(chapters[0], "ch1").startAt).toBe(e.startAt);
    expect(must(chapters[4], "ch5").endAt).toBe(e.endAt);
  });

  it("開花ボーナスは全イベント共通の表(イベント側の上書きはなし)", () => {
    expect(EVENT_AWAKENING_BONUS).toEqual({
      3: [0, 1, 1, 2, 2, 3],
      4: [0, 6, 7, 8, 9, 10],
      5: [0, 15, 18, 22, 26, 30],
    });
    for (const e of list) expect(e.acquisitionBonus.awakening).toBeUndefined();
  });
});

describe("activeEvent / activeChapter", () => {
  it("日本時間の開催期間で開催中のイベントを引く(終了の 19:59 の分まで開催中、20:00 は終了)", () => {
    expect(activeEvent(new Date("2026-09-08T12:00:00+09:00"))?.id).toBe("event-005");
    expect(activeEvent(new Date("2026-09-17T19:59:59+09:00"))?.id).toBe("event-005");
    expect(activeEvent(new Date("2026-09-17T20:00:00+09:00"))).toBeNull();
    expect(activeEvent(new Date("2026-09-08T11:59:59+09:00"))).toBeNull(); // イベント 4 終了後の谷間
    expect(activeEvent(new Date("2026-07-28T11:00:00+09:00"))).toBeNull(); // サービス開始直後
  });

  it("チャプター制イベントの進行中チャプターを引く", () => {
    const e = must(byId.get("event-003"), "event-003");
    expect(activeChapter(e, new Date("2026-08-17T20:00:00+09:00"))?.id).toBe("event-003-ch1");
    expect(activeChapter(e, new Date("2026-08-19T19:59:00+09:00"))?.id).toBe("event-003-ch1");
    expect(activeChapter(e, new Date("2026-08-19T20:00:00+09:00"))?.id).toBe("event-003-ch2");
    expect(activeChapter(e, new Date("2026-08-27T19:59:30+09:00"))?.id).toBe("event-003-ch5");
    expect(activeChapter(e, new Date("2026-08-27T20:00:00+09:00"))).toBeNull();
    expect(chapterOf(e, "event-003-ch3")?.name).toBe("チャプター 3");
    expect(chapterOf(e, "event-001-ch1")).toBeUndefined();
    // チャプター制でないイベントは常に null
    expect(
      activeChapter(
        must(byId.get("event-005"), "event-005"),
        new Date("2026-09-08T12:00:00+09:00"),
      ),
    ).toBeNull();
  });
});

describe("validateEvents", () => {
  const base = must(byId.get("event-005"), "event-005");
  it("未定義の ID・期間の逆転・チャプターの持ち方の誤りを検出する", () => {
    const broken: EventData = {
      ...base,
      id: "event-999",
      startAt: base.endAt,
      endAt: base.startAt,
      acquisitionBonus: {
        member: { percent: 30, cardIds: ["no-such-card"] },
        holomen: { percent: 30, holomenIds: ["no-such-holomen"] },
      },
      scoreBonus: { percent: 20, capPercent: 10, songs: [{ songId: "song-999", cardIds: [] }] },
    };
    const errors = validateEvents([broken], dataset);
    expect(errors.some((m) => m.includes("no-such-card"))).toBe(true);
    expect(errors.some((m) => m.includes("no-such-holomen"))).toBe(true);
    expect(errors.some((m) => m.includes("song-999"))).toBe(true);
    expect(errors.some((m) => m.includes("開始が終了より前でない"))).toBe(true);
    expect(errors.some((m) => m.includes("capPercent"))).toBe(true);
    expect(errors.some((m) => m.includes("対象カードが空"))).toBe(true);
    // 通常イベントにチャプターを持たせるのは誤り
    const spotlight = must(byId.get("event-003"), "event-003");
    expect(
      validateEvents([{ ...base, chapters: spotlight.chapters }], dataset).some((m) =>
        m.includes("spotlight だけ"),
      ),
    ).toBe(true);
  });
});
