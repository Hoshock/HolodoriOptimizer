import { describe, expect, it } from "vite-plus/test";

import { cardById, eventById, holomen } from "../data";
import { activeChapter } from "../data/events";
import type { Card, EventData } from "../data/types";
import {
  applyEventScoreBonus,
  awakeningBonusPercent,
  eventAcquisitionBonus,
  eventScoreBonus,
  eventScoreTargetCardIds,
} from "./event";
import { optimize } from "./optimize";
import { buildHolomenMap } from "./score";

function must<T>(value: T | undefined | null, label: string): T {
  if (value === undefined || value === null) throw new Error(`${label} がない`);
  return value;
}
const card = (id: string): Card => must(cardById.get(id), id);
const event = (id: string): EventData => must(eventById.get(id), id);

const current = event("event-005");
const luiSwim = card("takane-lui-02");
const luiPlain = card("takane-lui-01");
const fuwawaSwim = card("fuwawa-abyssgard-02");
const mococoSwim = card("mococo-abyssgard-02");
const unrelated = card("tokino-sora-01");

describe("eventAcquisitionBonus(現在イベント: 無邪気なふたり、見守るeyes)", () => {
  it("水着ルイ 0凸 = メンバー 30 + ホロメン 30 + 開花 0 = 60", () => {
    const r = eventAcquisitionBonus(current, [{ card: luiSwim, bloom: 0 }]);
    expect(r).toMatchObject({
      totalPercent: 60,
      memberBonusPercent: 30,
      holomenBonusPercent: 30,
      awakeningBonusPercent: 0,
    });
    expect(r.perCard).toEqual([
      {
        cardId: "takane-lui-02",
        memberBonusPercent: 30,
        holomenBonusPercent: 30,
        awakeningBonusPercent: 0,
        totalPercent: 60,
      },
    ]);
  });

  it("水着ルイ 2凸 = 30 + 30 + 18 = 78", () => {
    expect(eventAcquisitionBonus(current, [{ card: luiSwim, bloom: 2 }]).totalPercent).toBe(78);
  });

  it("通常ルイ 2凸 = 0 + 30 + 18 = 48(ホロメンボーナスはカードの種類を問わない)", () => {
    const r = eventAcquisitionBonus(current, [{ card: luiPlain, bloom: 2 }]);
    expect(r).toMatchObject({
      totalPercent: 48,
      memberBonusPercent: 0,
      holomenBonusPercent: 30,
      awakeningBonusPercent: 18,
    });
  });

  it("無関係の★5 5凸 = 0 + 0 + 30 = 30(開花ボーナスは全カード)", () => {
    const r = eventAcquisitionBonus(current, [{ card: unrelated, bloom: 5 }]);
    expect(r).toMatchObject({
      totalPercent: 30,
      memberBonusPercent: 0,
      holomenBonusPercent: 0,
      awakeningBonusPercent: 30,
    });
  });

  it("編成全体はカードごとの合計を足す(水着ルイ 2凸 + 通常フワワ 0凸 + 無関係 5凸 = 78 + 30 + 30)", () => {
    const r = eventAcquisitionBonus(current, [
      { card: luiSwim, bloom: 2 },
      { card: card("fuwawa-abyssgard-01"), bloom: 0 },
      { card: unrelated, bloom: 5 },
    ]);
    expect(r.totalPercent).toBe(138);
    expect(r.memberBonusPercent).toBe(30);
    expect(r.holomenBonusPercent).toBe(60);
    expect(r.awakeningBonusPercent).toBe(48);
    expect(r.perCard.map((c) => c.totalPercent)).toEqual([78, 30, 30]);
  });

  it("開花ボーナスの表は★5 の 0〜5凸で 0 / 15 / 18 / 22 / 26 / 30、範囲外は例外", () => {
    expect([0, 1, 2, 3, 4, 5].map((b) => awakeningBonusPercent(current, unrelated, b))).toEqual([
      0, 15, 18, 22, 26, 30,
    ]);
    expect(() => awakeningBonusPercent(current, unrelated, 6)).toThrow();
  });
});

describe("eventScoreBonus(現在イベントの課題曲)", () => {
  const trinity = "song-195"; // 三位一体♡ラブシステム
  const holohawk = "song-196"; // ホロホーク
  const rendezvous = "song-197"; // めくるめくランデヴー

  it("三位一体♡ラブシステム: 対象カードが 1 枚でも 10、3 枚そろっても 10(30 にはならない)、通常ルイだけなら 0", () => {
    expect(eventScoreBonus(current, trinity, [luiSwim])).toEqual({
      percent: 10,
      matchedCardIds: ["takane-lui-02"],
    });
    expect(eventScoreBonus(current, trinity, [fuwawaSwim]).percent).toBe(10);
    const all = eventScoreBonus(current, trinity, [luiSwim, fuwawaSwim, mococoSwim]);
    expect(all.percent).toBe(10);
    expect(all.matchedCardIds).toEqual([
      "takane-lui-02",
      "fuwawa-abyssgard-02",
      "mococo-abyssgard-02",
    ]);
    expect(eventScoreBonus(current, trinity, [luiPlain])).toEqual({
      percent: 0,
      matchedCardIds: [],
    });
  });

  it("ホロホーク: 水着ルイ 10、通常ルイ 0、水着フワワ 0", () => {
    expect(eventScoreBonus(current, holohawk, [luiSwim]).percent).toBe(10);
    expect(eventScoreBonus(current, holohawk, [luiPlain]).percent).toBe(0);
    expect(eventScoreBonus(current, holohawk, [fuwawaSwim]).percent).toBe(0);
  });

  it("めくるめくランデヴー: 水着フワワ 10、水着モココ 10、両方 10、水着ルイ 0", () => {
    expect(eventScoreBonus(current, rendezvous, [fuwawaSwim]).percent).toBe(10);
    expect(eventScoreBonus(current, rendezvous, [mococoSwim]).percent).toBe(10);
    expect(eventScoreBonus(current, rendezvous, [fuwawaSwim, mococoSwim]).percent).toBe(10);
    expect(eventScoreBonus(current, rendezvous, [luiSwim]).percent).toBe(0);
  });

  it("課題曲でない曲は対象カードがあっても 0", () => {
    expect(eventScoreBonus(current, "song-001", [luiSwim, fuwawaSwim, mococoSwim]).percent).toBe(0);
    expect(eventScoreTargetCardIds(current, "song-001")).toEqual([]);
  });

  it("applyEventScoreBonus は通常スコアの後に 1.10 倍する", () => {
    expect(applyEventScoreBonus(123456, 10)).toBeCloseTo(135801.6, 6);
    expect(applyEventScoreBonus(123456, 0)).toBe(123456);
  });
});

describe("spotlight(アルティメットサマー！ for Me？ チャプター 2)", () => {
  const spotlight = event("event-003");
  const chapter2 = "event-003-ch2";
  const calliopeSwim = card("mori-calliope-02");
  const ayamePlain = card("nakiri-ayame-01");
  const ayameSwim = card("nakiri-ayame-02");
  const banzai = "song-183"; // 万歳☆満開

  it("水着カリオペ: メンバー +50、ホロメン 0(チャプター 2 の対象人物はあやめだけ)", () => {
    const r = eventAcquisitionBonus(spotlight, [{ card: calliopeSwim, bloom: 0 }], chapter2);
    expect(r).toMatchObject({ memberBonusPercent: 50, holomenBonusPercent: 0, totalPercent: 50 });
  });

  it("通常あやめ: メンバー 0、ホロメン +50", () => {
    const r = eventAcquisitionBonus(spotlight, [{ card: ayamePlain, bloom: 0 }], chapter2);
    expect(r).toMatchObject({ memberBonusPercent: 0, holomenBonusPercent: 50, totalPercent: 50 });
  });

  it("水着あやめ: メンバー +50、ホロメン +50", () => {
    const r = eventAcquisitionBonus(spotlight, [{ card: ayameSwim, bloom: 0 }], chapter2);
    expect(r).toMatchObject({ memberBonusPercent: 50, holomenBonusPercent: 50, totalPercent: 100 });
  });

  it("万歳☆満開: 水着あやめあり +10、水着カリオペのみ 0、通常あやめのみ 0", () => {
    expect(eventScoreBonus(spotlight, banzai, [ayameSwim, calliopeSwim], chapter2).percent).toBe(
      10,
    );
    expect(eventScoreBonus(spotlight, banzai, [calliopeSwim], chapter2).percent).toBe(0);
    expect(eventScoreBonus(spotlight, banzai, [ayamePlain], chapter2).percent).toBe(0);
  });

  it("チャプターは ID でもオブジェクトでも渡せ、別チャプターでは課題曲が違う(ch1 の NIGHTBREAK は ch2 では 0)", () => {
    const ch1 = must(activeChapter(spotlight, new Date("2026-08-18T12:00:00+09:00")), "ch1");
    expect(ch1.id).toBe("event-003-ch1");
    expect(eventScoreBonus(spotlight, "song-182", [calliopeSwim], ch1).percent).toBe(10);
    expect(eventScoreBonus(spotlight, "song-182", [calliopeSwim], chapter2).percent).toBe(0);
    expect(
      eventAcquisitionBonus(spotlight, [{ card: calliopeSwim, bloom: 0 }], ch1).holomenBonusPercent,
    ).toBe(50);
  });

  it("チャプター制イベントでチャプターを省略・別イベントのチャプターを渡すと例外(黙って 0 にしない)", () => {
    expect(() => eventAcquisitionBonus(spotlight, [{ card: ayameSwim, bloom: 0 }])).toThrow(
      /チャプター/,
    );
    expect(() => eventScoreBonus(spotlight, banzai, [ayameSwim])).toThrow(/チャプター/);
    expect(() => eventScoreBonus(spotlight, banzai, [ayameSwim], "event-999-ch1")).toThrow();
    // 通常イベントにチャプターを渡すのも誤り
    expect(() => eventScoreBonus(current, "song-195", [luiSwim], chapter2)).toThrow();
  });
});

describe("optimize の eventScore(通常スコアの後に 1.10 倍する隔離した実装)", () => {
  const holomenMap = buildHolomenMap(holomen);
  const pool = [
    luiSwim,
    luiPlain,
    fuwawaSwim,
    mococoSwim,
    unrelated,
    card("roboco-san-01"),
    card("azki-01"),
  ];

  it("対象カードをメンバーに含む候補だけ eventBonus 0.1 が掛かり、複数枚でも重複しない", () => {
    const leader = unrelated;
    const targets = eventScoreTargetCardIds(current, "song-197"); // めくるめく: 水着フワワ・モココ
    const plain = optimize({ leader, topN: 30, live: { durationSeconds: 120 } }, pool, holomenMap);
    const withEvent = optimize(
      {
        leader,
        topN: 30,
        live: { durationSeconds: 120 },
        eventScore: { percent: 10, cardIds: targets },
      },
      pool,
      holomenMap,
    );
    expect(withEvent.candidates.length).toBe(plain.candidates.length);
    const key = (c: { members: Card[] }): string =>
      c.members
        .map((m) => m.id)
        .sort()
        .join(",");
    const plainByKey = new Map(plain.candidates.map((c) => [key(c), c]));
    let matched = 0;
    for (const c of withEvent.candidates) {
      const base = must(plainByKey.get(key(c)), key(c));
      const hasTarget = c.members.some((m) => targets.includes(m.id));
      expect(c.live.eventBonus).toBe(hasTarget ? 0.1 : 0);
      expect(c.live.expectedScore).toBeCloseTo(base.live.expectedScore * (hasTarget ? 1.1 : 1), 6);
      if (hasTarget) matched++;
    }
    expect(matched).toBeGreaterThan(0);
    // 探索中の評価と内訳の再計算が一致する(順位づけの値 = 内訳の式)
    for (const c of withEvent.candidates) {
      expect(c.live.expectedScore).toBeCloseTo(
        c.breakdown.totalPower * (1 + c.live.active + c.live.sp) * (1 + c.live.eventBonus),
        6,
      );
    }
    // 降順が保たれている
    for (let i = 1; i < withEvent.candidates.length; i++) {
      expect(must(withEvent.candidates[i - 1], "prev").live.expectedScore).toBeGreaterThanOrEqual(
        must(withEvent.candidates[i], "cur").live.expectedScore,
      );
    }
  });

  it("eventScore 未指定なら eventBonus は 0 で従来どおり", () => {
    const r = optimize({ leader: unrelated, topN: 3 }, pool, holomenMap);
    for (const c of r.candidates) {
      expect(c.live.eventBonus).toBe(0);
      expect(c.live.expectedScore).toBe(c.breakdown.totalPower);
    }
  });
});
