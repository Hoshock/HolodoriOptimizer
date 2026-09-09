import { describe, expect, it } from "vite-plus/test";

import type { LiveActiveSkill } from "./liveSkillTimeline";
import {
  buildActiveWindows,
  effectiveActivationProbability,
  effectiveInterval,
  LIVE_ACTIVE_PROBABILITY,
  segmentTimeline,
} from "./liveSkillTimeline";

/**
 * ライブ最適化用のタイムライン（src/engine/liveSkillTimeline.ts）のテスト。
 * ここで固定するのは**モデルの計算**であって、ゲーム内の実測値ではない（式そのものは仮説 — ADR-007）。
 */

const skill = (over: Partial<LiveActiveSkill> = {}): LiveActiveSkill => ({
  intervalSeconds: 10,
  durationSeconds: 5,
  baseProbability: 0.5,
  scoreUpPercent: 100,
  ...over,
});

describe("effectiveInterval", () => {
  it("発動頻度 0 / 4 / 8 / 12% で周期が 1 + f/100 で割られる", () => {
    expect(effectiveInterval(12, 0)).toBe(12);
    expect(effectiveInterval(12, 4)).toBeCloseTo(12 / 1.04, 10);
    expect(effectiveInterval(12, 8)).toBeCloseTo(12 / 1.08, 10);
    expect(effectiveInterval(12, 12)).toBeCloseTo(12 / 1.12, 10);
  });

  it("端数の頻度でも実数のまま扱う（整数秒への丸めをしない）", () => {
    expect(effectiveInterval(13.5, 6.5)).toBeCloseTo(13.5 / 1.065, 10);
    expect(Number.isInteger(effectiveInterval(10, 3))).toBe(false);
  });
});

describe("effectiveActivationProbability", () => {
  it("発動率 UP なしでは基礎発動確率のまま", () => {
    expect(effectiveActivationProbability(LIVE_ACTIVE_PROBABILITY.low, 0)).toBeCloseTo(0.37, 10);
    expect(effectiveActivationProbability(LIVE_ACTIVE_PROBABILITY.medium, 0)).toBeCloseTo(0.46, 10);
    expect(effectiveActivationProbability(LIVE_ACTIVE_PROBABILITY.high, 0)).toBeCloseTo(0.55, 10);
  });

  it("発動率 UP は乗算で効く（表示スコアボーナスの加算型とは別モデル）", () => {
    expect(effectiveActivationProbability(0.37, 30)).toBeCloseTo(0.481, 10);
    expect(effectiveActivationProbability(0.55, 12)).toBeCloseTo(0.616, 10);
  });

  it("1.0 を超えない", () => {
    expect(effectiveActivationProbability(0.55, 200)).toBe(1);
    expect(effectiveActivationProbability(1, 10)).toBe(1);
  });
});

describe("buildActiveWindows", () => {
  it("k × 周期から効果時間ぶんの区間を作り、評価区間でクリップする", () => {
    const windows = buildActiveWindows(skill(), { frequencyUpPercent: 0, rateUpPercent: 0 }, 28);
    expect(windows.map((w) => [w.start, w.end])).toEqual([
      [10, 15],
      [20, 25],
    ]);
  });

  it("評価区間の途中で始まる回は末尾でクリップされる", () => {
    const windows = buildActiveWindows(skill(), { frequencyUpPercent: 0, rateUpPercent: 0 }, 23);
    expect(windows.map((w) => [w.start, w.end])).toEqual([
      [10, 15],
      [20, 23],
    ]);
  });

  it("頻度と発動率が窓の数と確率に反映される", () => {
    const windows = buildActiveWindows(
      skill({ baseProbability: 0.46 }),
      { frequencyUpPercent: 100, rateUpPercent: 50 },
      21,
    );
    expect(windows).toHaveLength(4);
    expect(windows[0]?.start).toBeCloseTo(5, 10);
    expect(windows[0]?.probability).toBeCloseTo(0.69, 10);
  });

  it("効果時間や確率が 0 のスキルは窓を作らない", () => {
    expect(
      buildActiveWindows(
        skill({ durationSeconds: 0 }),
        {
          frequencyUpPercent: 0,
          rateUpPercent: 0,
        },
        100,
      ),
    ).toEqual([]);
    expect(
      buildActiveWindows(
        skill({ baseProbability: 0 }),
        {
          frequencyUpPercent: 0,
          rateUpPercent: 0,
        },
        100,
      ),
    ).toEqual([]);
  });
});

describe("segmentTimeline", () => {
  it("窓がないときは評価区間全体が 1 つの空セグメント", () => {
    expect(segmentTimeline([], 30)).toEqual([{ start: 0, end: 30, actives: [] }]);
  });

  it("重ならない 2 つの窓を境界で区切る", () => {
    const windows = [
      { start: 5, end: 10, scoreUpPercent: 100, probability: 0.5 },
      { start: 20, end: 25, scoreUpPercent: 200, probability: 0.4 },
    ];
    const segments = segmentTimeline(windows, 30);
    expect(segments.map((s) => [s.start, s.end, s.actives.length])).toEqual([
      [0, 5, 0],
      [5, 10, 1],
      [10, 20, 0],
      [20, 25, 1],
      [25, 30, 0],
    ]);
  });

  it("重なる窓は重なりの区間だけ候補が 2 つになる", () => {
    const windows = [
      { start: 5, end: 15, scoreUpPercent: 100, probability: 0.5 },
      { start: 10, end: 20, scoreUpPercent: 200, probability: 0.4 },
    ];
    const segments = segmentTimeline(windows, 20);
    expect(segments.map((s) => [s.start, s.end, s.actives.length])).toEqual([
      [0, 5, 0],
      [5, 10, 1],
      [10, 15, 2],
      [15, 20, 1],
    ]);
    expect(segments[2]?.actives.map((a) => a.scoreUpPercent).sort((a, b) => a - b)).toEqual([
      100, 200,
    ]);
  });

  it("同じ時刻で終わる窓と始まる窓が並んでも境界が重複しない", () => {
    const windows = [
      { start: 5, end: 10, scoreUpPercent: 100, probability: 0.5 },
      { start: 10, end: 15, scoreUpPercent: 100, probability: 0.5 },
    ];
    const segments = segmentTimeline(windows, 15);
    expect(segments.map((s) => [s.start, s.end, s.actives.length])).toEqual([
      [0, 5, 0],
      [5, 10, 1],
      [10, 15, 1],
    ]);
  });

  it("区間の合計が評価区間に一致する", () => {
    const windows = buildActiveWindows(skill(), { frequencyUpPercent: 8, rateUpPercent: 0 }, 120);
    const segments = segmentTimeline(windows, 120);
    const total = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
    expect(total).toBeCloseTo(120, 9);
  });
});
