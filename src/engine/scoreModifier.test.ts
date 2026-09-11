import { describe, expect, it } from "vite-plus/test";

import type { Card, Holomen } from "../data/types";
import { computeDisplayScoreBonus, displayUnitScore, round1 } from "./displayScore";
import { optimize } from "./optimize";
import { buildHolomenMap } from "./score";

/**
 * 順位づけの値と、曲で決まる補正の統合テスト。
 * 順位づけ = 曲条件つきユニットスコア(試算。src/engine/displayScore.ts。曲を選んでいれば黄ボードの楽曲スコアボーナスが
 * ホロメンボード効果欄に入る — 2026-09-11 実機確定)× (1 + イベント)。黄をユニットスコアへ後掛けする旧経路は廃止した。
 * 2026-09-09 に旧 src/engine/live.ts(曲長に基づく簡易期待値)を削除したので、曲長・譜面はここに現れない(ADR-006)
 */

function makeCard(overrides: {
  id: string;
  holomenId: string;
  stats?: Partial<Card["stats"]>;
  active?: NonNullable<Card["activeSkill"]["structured"]>;
  special?: NonNullable<Card["specialSkill"]["structured"]>;
  /** 青ボードの [発動率 UP %, 発動頻度 UP %] */
  blue?: [number, number];
}): Card {
  const card: Card = {
    id: overrides.id,
    name: overrides.id,
    reading: "てすと",
    holomenId: overrides.holomenId,
    rarity: 5,
    type: "happy",
    stats: { performance: 1000, technique: 1000, sense: 1000, ...overrides.stats },
    costumeSkill: { raw: "test", structured: null },
    passiveSkill: { raw: "test", structured: null },
    activeSkill: { raw: "test", structured: overrides.active ?? null },
    specialSkill: { raw: "test", structured: overrides.special ?? null },
  };
  return overrides.blue
    ? {
        ...card,
        boardLive: {
          activeRatePercent: overrides.blue[0],
          activeFrequencyPercent: overrides.blue[1],
        },
      }
    : card;
}

const holomen: Holomen[] = ["h-leader", "h1", "h2", "h3", "h4", "h5", "h6"].map((id) => ({
  id,
  name: id,
  reading: "てすと",
  affiliations: ["gen0"],
  board: { blueSide: "left", lifeSide: "left" },
}));
const holomenMap = buildHolomenMap(holomen);

describe("optimize と順位づけの倍率", () => {
  const leader = makeCard({ id: "leader", holomenId: "h-leader" });
  // パラメータはわずかに劣るが、アクティブスキルでスコアボーナスが上がるカード
  const strongActive = makeCard({
    id: "strong-active",
    holomenId: "h6",
    stats: { performance: 990 },
    active: {
      intervalSeconds: 20,
      probability: "high",
      durationSeconds: 10,
      scoreUpPercent: 100,
      extraCondition: null,
    },
  });
  const plain = makeCard({ id: "plain", holomenId: "h6" });
  const others = ["h1", "h2", "h3", "h4"].map((h) => makeCard({ id: `m-${h}`, holomenId: h }));
  const allCards = [leader, strongActive, plain, ...others];

  it("補正がなければ順位づけの値はユニットスコア(試算)そのまま", () => {
    const result = optimize({ leader, topN: 1 }, allCards, holomenMap);
    const top = result.candidates[0];
    expect(top).toBeDefined();
    if (!top) return;
    expect(top.members.map((m) => m.id)).toContain("strong-active");
    expect(top.modifiers.songBonus).toBe(0);
    expect(top.modifiers.eventBonus).toBe(0);
    expect(top.display.songBonus).toBe(0);
    expect(top.modifiers.adjustedUnitScore).toBe(top.display.unitScore);
  });

  it("黄ボードの楽曲スコアボーナスはボード欄に入り、ユニットスコアへ後掛けされない(2026-09-11 実機確定)", () => {
    const base = optimize({ leader, topN: 1 }, allCards, holomenMap);
    const withSong = optimize({ leader, topN: 1, songBonus: 0.075 }, allCards, holomenMap);
    const b = base.candidates[0];
    const s = withSong.candidates[0];
    expect(b).toBeDefined();
    expect(s).toBeDefined();
    if (!b || !s) return;
    expect(s.members.map((m) => m.id)).toEqual(b.members.map((m) => m.id));
    // 黄は display に組み込まれ、順位づけの値は display.unitScore そのもの(倍率 1.075 を掛けない)
    expect(s.modifiers.songBonus).toBe(0.075);
    expect(s.display.songBonus).toBe(0.075);
    expect(s.modifiers.adjustedUnitScore).toBe(s.display.unitScore);
    expect(s.display.unitScore).not.toBe(Math.ceil(b.display.unitScore * 1.075));
    // 増えるのはボード欄だけ(アクティブ / パッシブ / SP は不変)。増分は 黄 × (100 + アクティブ + パッシブ + SP)
    expect(s.display.active).toBe(b.display.active);
    expect(s.display.passive).toBe(b.display.passive);
    expect(s.display.special).toBe(b.display.special);
    const expectedGain = 0.075 * (100 + b.display.active + b.display.passive + b.display.special);
    expect(Math.abs(s.display.board - b.display.board - expectedGain)).toBeLessThanOrEqual(0.1);
    expect(s.display.total).toBe(
      round1(s.display.active + s.display.board + s.display.passive + s.display.special),
    );
    expect(s.display.unitScore).toBe(displayUnitScore(s.breakdown.totalPower, s.display.total));
  });

  it("イベントスコアボーナスだけが後掛けの倍率で、黄と二重に掛からない", () => {
    const result = optimize(
      {
        leader,
        topN: 1,
        songBonus: 0.1,
        eventScore: { percent: 10, cardIds: ["strong-active"] },
      },
      allCards,
      holomenMap,
    );
    const top = result.candidates[0];
    expect(top).toBeDefined();
    if (!top) return;
    expect(top.modifiers.eventBonus).toBe(0.1);
    expect(top.modifiers.songBonus).toBe(0.1);
    // 黄は display.unitScore に入っているので、倍率はイベントの 1.1 だけ(1.1 × 1.1 にならない)
    expect(top.modifiers.adjustedUnitScore).toBeCloseTo(top.display.unitScore * 1.1, 6);
    // display 側の値は探索と同じ関数で再現できる(黄込み)
    const again = computeDisplayScoreBonus(
      { leader: top.leader, members: top.members },
      holomenMap,
      top.breakdown.totalPower,
      { songBonus: 0.1 },
    );
    expect(again).toEqual(top.display);
  });
});

/**
 * 黄は候補ごとの アクティブ + パッシブ + SP に比例して効き、ボード欄には同じ比率で掛からないので、
 * 曲なしと曲ありで候補の順位が入れ替わりうる(以前の「候補共通の倍率だから順位は変わらない」前提は成り立たない)。
 * 青ボードでボード欄を稼ぐカード(黄の恩恵が小さい)と、アクティブ欄を稼ぐカード(黄の恩恵が大きい)を同じ枠で競わせる
 */
describe("曲ありで候補の順位が変わる", () => {
  const leader = makeCard({ id: "leader", holomenId: "h-leader" });
  const others = ["h1", "h2", "h3", "h4"].map((h) => makeCard({ id: `m-${h}`, holomenId: h }));
  // 青で発動率 +45 / 頻度 +12: アクティブ欄 25.1 / ボード欄 27.0(合計 52.1)
  const boardHeavy = makeCard({
    id: "board-heavy",
    holomenId: "h5",
    active: {
      intervalSeconds: 20,
      probability: "high",
      durationSeconds: 10,
      scoreUpPercent: 100,
      extraCondition: null,
    },
    blue: [45, 12],
  });
  // 青なしでスコア UP が大きい: アクティブ欄 51.4 / ボード欄 0(合計 51.4 で曲なしではわずかに負ける)
  const activeHeavy = makeCard({
    id: "active-heavy",
    holomenId: "h5",
    active: {
      intervalSeconds: 20,
      probability: "high",
      durationSeconds: 10,
      scoreUpPercent: 205,
      extraCondition: null,
    },
  });
  const allCards = [leader, ...others, boardHeavy, activeHeavy];
  const request = { leader, topN: 1, excludedMemberCardIds: ["leader"] };
  const pick = (songBonus: number): string | undefined =>
    optimize({ ...request, songBonus }, allCards, holomenMap).candidates[0]?.members.find(
      (m) => m.holomenId === "h5",
    )?.id;

  it("曲なしではボード欄で稼ぐカードが上", () => {
    expect(pick(0)).toBe("board-heavy");
  });

  it("黄 5% / 10% ではアクティブ欄で稼ぐカードが上(黄の増分が 100 + アクティブ + パッシブ + SP に比例するため)", () => {
    expect(pick(0.05)).toBe("active-heavy");
    expect(pick(0.1)).toBe("active-heavy");
    // 入れ替わりの理由を display で確かめる: 黄 10% の増分は board-heavy が 12.5 pt、active-heavy が 15.1 pt
    const evaluate = (card: Card, songBonus: number) =>
      computeDisplayScoreBonus({ leader, members: [...others, card] }, holomenMap, 15000, {
        songBonus,
      });
    const b0 = evaluate(boardHeavy, 0);
    const a0 = evaluate(activeHeavy, 0);
    expect(b0.total).toBeGreaterThan(a0.total);
    const b10 = evaluate(boardHeavy, 0.1);
    const a10 = evaluate(activeHeavy, 0.1);
    expect(a10.total).toBeGreaterThan(b10.total);
    expect(a10.board - a0.board).toBeGreaterThan(b10.board - b0.board);
  });
});
