import { describe, expect, it } from "vite-plus/test";

import { cards as realCards, holomen as realHolomen } from "../data";
import { cardAtBloom } from "../data/bloom";
import type { Card } from "../data/types";
import {
  activeCoverageSeconds,
  computeDisplayScoreBonus,
  DISPLAY_UNIT_SCORE_FACTOR,
} from "./displayScore";
import { buildHolomenMap } from "./score";

/**
 * メニュー画面のスコアボーナスのゴールデンケース(2026-09-08 ユーザー実機観測。総合力側は power.test.ts)。
 * モデルは引き継ぎメモの仮定をそのまま実装したもので、実機とはずれる。「どの項目が何点ずれるか」を knownDiff で明記する
 * (ユーザー指示: 多少ずれてもよいから仮定で実装、無理に合わせない)。小数第 1 位で比較する
 */

const holomenMap = buildHolomenMap(realHolomen);
const real = (id: string): Card => {
  const card = realCards.find((c) => c.id === id);
  if (!card) throw new Error(`${id} がない`);
  return card;
};

/** 実機の開花段階と青ボード(発動率 / 発動頻度)を載せたカード */
function observed(id: string, bloom: number, rate: number, frequency: number): Card {
  const bloomed = cardAtBloom(real(id), bloom);
  return {
    ...bloomed,
    naturalStats: bloomed.stats,
    boardLive: { activeRatePercent: rate, activeFrequencyPercent: frequency },
  };
}

const members = [
  observed("usada-pekora-01", 1, 24, 8),
  observed("inugami-korone-02", 2, 33.6, 4),
  observed("nekomata-okayu-02", 5, 35.1, 12),
  observed("shirakami-fubuki-02", 0, 33, 8),
  observed("ookami-mio-02", 1, 0, 0),
];

/** ミオ恒常の赤ボードのうち表示スコアボーナスに効く分(全員のスコアサポート +28.1%。歌唱者条件は曲未指定で不発) */
const mioRed = {
  fixed: { performance: 1729, technique: 1729, sense: 1594 },
  percent: { performance: 13, technique: 13, sense: 13 },
  scoreSupportPercent: 28.1,
};

const round1 = (v: number): number => Math.round(v * 10) / 10;

function expectGolden(
  label: string,
  actual: number,
  observedValue: number,
  knownDiff: number,
): void {
  expect(`${label}: ${String(round1(actual))} (実機 ${String(observedValue)})`).toBe(
    `${label}: ${String(round1(observedValue + knownDiff))} (実機 ${String(observedValue)})`,
  );
}

function withOkayuBlue(rate: number, frequency: number): Card[] {
  return members.map((m, i) =>
    i === 2
      ? { ...m, boardLive: { activeRatePercent: rate, activeFrequencyPercent: frequency } }
      : m,
  );
}

describe("表示スコアボーナスのゴールデンケース(2026-09-08 実機。仮定モデルなのでずれを明記)", () => {
  it("ケース B: リーダー水着おかゆ(赤なし)", () => {
    const d = computeDisplayScoreBonus(
      { leader: real("nekomata-okayu-02"), members },
      holomenMap,
      256369,
    );
    expectGolden("アクティブスキル", d.active, 77.0, 0.9);
    expectGolden("ホロメンボード効果", d.board, 13.2, 12.1);
    expectGolden("パッシブスキル", d.passive, 2.2, 3.8);
    expectGolden("スペシャルスキル", d.special, 46.0, -13.0);
    expectGolden("スコアボーナス合計", d.total, 138.4, 3.8);
    // ユニットスコア(実機 1245189。総合力は実機値を与えているので差はスコアボーナスの差 +3.8pt 分)
    expect(Math.round(d.unitScore)).toBe(
      Math.round(256369 * (1 + d.total / 100) * DISPLAY_UNIT_SCORE_FACTOR),
    );
    expect(Math.abs(d.unitScore - 1245189) / 1245189).toBeLessThan(0.02);
  });

  it("ケース A: リーダー恒常ミオ(赤の全員スコアサポート +28.1%)", () => {
    const d = computeDisplayScoreBonus(
      { leader: real("ookami-mio-01"), members },
      holomenMap,
      310209,
      {
        red: mioRed,
      },
    );
    expectGolden("アクティブスキル", d.active, 77.0, 0.9);
    expectGolden("ホロメンボード効果", d.board, 36.7, 19.3);
    expectGolden("パッシブスキル", d.passive, 3.1, 2.9);
    expectGolden("スペシャルスキル", d.special, 46.0, -13.0);
    expectGolden("スコアボーナス合計", d.total, 162.8, 10.1);
    expect(Math.abs(d.unitScore - 1660900) / 1660900).toBeLessThan(0.04);
  });

  it("青ボード変更実験: アクティブ欄は変わらず、頻度・発動率の変更はボード欄だけに出る(変化量は実機と合わない)", () => {
    const base = computeDisplayScoreBonus(
      { leader: real("nekomata-okayu-02"), members },
      holomenMap,
      256369,
    );
    const freq8 = computeDisplayScoreBonus(
      { leader: real("nekomata-okayu-02"), members: withOkayuBlue(35.1, 8) },
      holomenMap,
      256369,
    );
    const rate32 = computeDisplayScoreBonus(
      { leader: real("nekomata-okayu-02"), members: withOkayuBlue(32.1, 8) },
      holomenMap,
      256369,
    );
    expect(freq8.active).toBe(base.active);
    expect(rate32.active).toBe(base.active);
    expect(freq8.passive).toBeCloseTo(base.passive, 6);
    // 実機: 頻度 12 → 8 でボード −2.3pt。モデルでは 8 回目の発動が 200 秒ちょうどで寄与 0 のため変化なし(ずれ +2.3)
    expectGolden("頻度 −4% のボード欄の変化", freq8.board - base.board, -2.3, 2.3);
    // 実機: 発動率 35.1 → 32.1 でボード −0.1pt。モデルでは −0.6(ずれ −0.5)
    expectGolden("発動率 −3% のボード欄の変化", rate32.board - freq8.board, -0.1, -0.5);
  });
});

describe("activeCoverageSeconds", () => {
  it("周期ごとの発動時刻に効果時間を乗せ、終端で打ち切り、確率を掛ける", () => {
    // 200 秒 / 周期 28 秒 → 28, 56, ..., 196 の 7 回。最後は 4 秒で打ち切り
    expect(activeCoverageSeconds(28, 10, 1, 200)).toBe(64);
    expect(activeCoverageSeconds(28, 10, 0.55, 200)).toBeCloseTo(64 * 0.55, 9);
    expect(activeCoverageSeconds(30, 12, 1, 200)).toBe(72);
    expect(activeCoverageSeconds(0, 12, 1, 200)).toBe(0);
  });
});

describe("computeDisplayScoreBonus の配賦", () => {
  const plain = (id: string, holomenId: string, type: Card["type"] = "happy"): Card => ({
    id,
    name: id,
    reading: "てすと",
    holomenId,
    rarity: 5,
    type,
    stats: { performance: 1000, technique: 1000, sense: 1000 },
    costumeSkill: { raw: "t", structured: null },
    passiveSkill: { raw: "t", structured: null },
    activeSkill: { raw: "t", structured: null },
    specialSkill: { raw: "t", structured: null },
  });
  const active = (card: Card): Card => ({
    ...card,
    activeSkill: {
      raw: "t",
      structured: {
        intervalSeconds: 50,
        probability: "high",
        durationSeconds: 10,
        scoreUpPercent: 100,
        extraCondition: null,
      },
    },
  });

  it("アクティブ欄は青なしの基準、青の増分はボード欄、パッシブのスコアサポートはパッシブ欄、赤のスコアサポートはボード欄", () => {
    // 200 秒 / 50 秒 → 50, 100, 150, 200(0 秒) → 30 秒 × 0.55 × 100% / 200 = 8.25%
    const a = active(plain("a", "tokino-sora"));
    const supporter: Card = {
      ...plain("s", "roboco-san"),
      passiveSkill: {
        raw: "t",
        structured: {
          condition: { kind: "always" },
          effects: [{ kind: "scoreSupport", target: { kind: "all" }, percent: 10 }],
        },
      },
    };
    const others = [
      plain("c", "sakura-miko"),
      plain("d", "hoshimachi-suisei"),
      plain("e", "akai-haato"),
    ];
    const leader = plain("l", "aki-rosenthal");
    const base = computeDisplayScoreBonus(
      { leader, members: [a, supporter, ...others] },
      holomenMap,
      10000,
    );
    expect(base.active).toBeCloseTo(8.25, 9);
    expect(base.board).toBeCloseTo(0, 9);
    expect(base.passive).toBeCloseTo(0.825, 9); // 8.25 × 10%
    expect(base.special).toBe(0);
    expect(base.unitScore).toBeCloseTo(
      10000 * (1 + base.total / 100) * DISPLAY_UNIT_SCORE_FACTOR,
      6,
    );

    // 青: 発動率 +100%(上限 1)・頻度 +25%(周期 40 秒 → 40, 80, 120, 160, 200 → 40 秒) → 40 × 1 × 100% / 200 = 20%
    const blue = { ...a, boardLive: { activeRatePercent: 100, activeFrequencyPercent: 25 } };
    const withBlue = computeDisplayScoreBonus(
      { leader, members: [blue, supporter, ...others] },
      holomenMap,
      10000,
    );
    expect(withBlue.active).toBeCloseTo(8.25, 9);
    expect(withBlue.board).toBeCloseTo(20 - 8.25, 9);
    expect(withBlue.passive).toBeCloseTo(2, 9); // 20 × 10%

    // 赤の全員スコアサポート +20% は(パッシブ後の)寄与に掛かり、増分はボード欄へ
    const red = computeDisplayScoreBonus(
      { leader, members: [blue, supporter, ...others] },
      holomenMap,
      10000,
      {
        red: {
          fixed: { performance: 0, technique: 0, sense: 0 },
          percent: { performance: 0, technique: 0, sense: 0 },
          scoreSupportPercent: 20,
        },
      },
    );
    expect(red.passive).toBeCloseTo(2, 9);
    expect(red.board).toBeCloseTo(20 - 8.25 + 22 * 0.2, 9);
  });

  it("SP はスコアサポート% × 効果時間 / 200 の合計、リーダー枠のスキルは数えない", () => {
    const sp: Card = {
      ...plain("sp", "tokino-sora"),
      specialSkill: {
        raw: "t",
        structured: { durationSeconds: 10, scoreSupportPercent: 100, extra: null },
      },
    };
    const leader = active(sp);
    const members = [
      sp,
      plain("b", "roboco-san"),
      plain("c", "sakura-miko"),
      plain("d", "hoshimachi-suisei"),
      plain("e", "akai-haato"),
    ];
    const d = computeDisplayScoreBonus({ leader, members }, holomenMap, 10000);
    expect(d.special).toBeCloseTo(5, 9);
    expect(d.active).toBe(0);
  });
});
