import { describe, expect, it } from "vite-plus/test";

import { BLUE_FREQUENCY_NODE_IDS, blueBoardEffects, unlockNode } from "../data/blueBoard";
import type { FrequencyCandidate, FrequencyMember } from "./liveFrequencyOptimizer";
import {
  anyActiveProbability,
  enumerateFrequencyCandidates,
  evaluateFrequencyPlan,
  evaluateTimeline,
  optimizeFrequency,
  segmentExpectedScore,
  segmentPerfectScore,
} from "./liveFrequencyOptimizer";
import { buildActiveWindows, segmentTimeline } from "./liveSkillTimeline";
import type { LiveActiveSkill } from "./liveSkillTimeline";

/**
 * 発動頻度の最適化（src/engine/liveFrequencyOptimizer.ts）のテスト。
 * 目的関数 2 つ（期待値 / 理論最大）・tie-break・候補列挙の**モデルとしての挙動**を固定する
 * （式そのものは仮説 — ADR-007）。
 */

const candidate = (
  frequencyPercent: number,
  ratePercent = 0,
  additionalNodeCount = 0,
): FrequencyCandidate => ({
  frequencyNodeCount: Math.round(frequencyPercent / 4),
  effectiveFrequencyPercent: frequencyPercent,
  effectiveRatePercent: ratePercent,
  unlockedNodeIds: [],
  addedNodeIds: [],
  additionalNodeCount,
});

const member = (
  holomenId: string,
  skill: LiveActiveSkill | null,
  candidates: FrequencyCandidate[],
): FrequencyMember => ({
  holomenId,
  cardId: `${holomenId}-01`,
  skill,
  candidates,
  currentIndex: 0,
});

const skill = (over: Partial<LiveActiveSkill> = {}): LiveActiveSkill => ({
  intervalSeconds: 12,
  durationSeconds: 6,
  baseProbability: 1,
  scoreUpPercent: 100,
  ...over,
});

/** テスト内で 1 案の期待値を素朴に評価する（optimizeFrequency と同じ値になるべき参照実装） */
function expectedOf(members: FrequencyMember[], choice: number[], horizon: number): number {
  return evaluateFrequencyPlan(members, choice, horizon).averageExpectedActiveScorePercent;
}

/** テスト内で 1 案の理論最大を素朴に評価する */
function perfectOf(members: FrequencyMember[], choice: number[], horizon: number): number {
  return evaluateFrequencyPlan(members, choice, horizon).averagePerfectActivationScorePercent;
}

describe("segmentExpectedScore", () => {
  it("候補がなければ 0", () => {
    expect(segmentExpectedScore([])).toBe(0);
  });

  it("1 つだけなら スコア UP × 発動確率", () => {
    expect(segmentExpectedScore([{ scoreUpPercent: 120, probability: 0.55 }])).toBeCloseTo(66, 10);
  });

  it("スコア UP が違う 2 つは、高い方が不発のときだけ低い方が効く", () => {
    // 100 × 0.5 + 50 × 0.5 × 0.5 = 62.5
    expect(
      segmentExpectedScore([
        { scoreUpPercent: 100, probability: 0.5 },
        { scoreUpPercent: 50, probability: 0.5 },
      ]),
    ).toBeCloseTo(62.5, 10);
  });

  it("スコア UP が同じ 2 つは重複せず、どちらかが発動すれば 1 回ぶん", () => {
    // 100 × (1 - 0.5 × 0.6) = 70
    expect(
      segmentExpectedScore([
        { scoreUpPercent: 100, probability: 0.5 },
        { scoreUpPercent: 100, probability: 0.4 },
      ]),
    ).toBeCloseTo(70, 10);
  });

  it("発動確率 1 なら最も高いスコア UP がそのまま値になる", () => {
    expect(
      segmentExpectedScore([
        { scoreUpPercent: 150, probability: 1 },
        { scoreUpPercent: 90, probability: 1 },
      ]),
    ).toBeCloseTo(150, 10);
  });
});

describe("segmentPerfectScore", () => {
  it("候補がなければ 0", () => {
    expect(segmentPerfectScore([])).toBe(0);
  });

  it("発動確率によらず、その区間の最大スコア UP を取る", () => {
    expect(
      segmentPerfectScore([
        { scoreUpPercent: 100, probability: 0.5 },
        { scoreUpPercent: 50, probability: 0.5 },
      ]),
    ).toBe(100);
    expect(segmentPerfectScore([{ scoreUpPercent: 100, probability: 0.05 }])).toBe(100);
  });
});

describe("expectedCoverage（補助指標）", () => {
  it("1 つのスキルだけなら、発動候補の時間 × 発動確率", () => {
    const windows = buildActiveWindows(
      skill({ intervalSeconds: 10, durationSeconds: 5, baseProbability: 0.5 }),
      { frequencyUpPercent: 0, rateUpPercent: 0 },
      20,
    );
    const metrics = evaluateTimeline(segmentTimeline(windows, 20), 20);
    // 候補は [10,15] の 5 秒ぶんだけ → 5/20 × 0.5
    expect(metrics.structuralCoverage).toBeCloseTo(0.25, 10);
    expect(metrics.expectedCoverage).toBeCloseTo(0.125, 10);
  });

  it("重ならない 2 つは確率がそのまま足し合わされる（時間で按分）", () => {
    const segments = segmentTimeline(
      [
        { start: 0, end: 5, scoreUpPercent: 100, probability: 0.5 },
        { start: 5, end: 10, scoreUpPercent: 100, probability: 0.4 },
      ],
      10,
    );
    expect(evaluateTimeline(segments, 10).expectedCoverage).toBeCloseTo(0.45, 10);
  });

  it("重なる区間は 1 - (1 - p1)(1 - p2)", () => {
    const segments = segmentTimeline(
      [
        { start: 0, end: 10, scoreUpPercent: 100, probability: 0.5 },
        { start: 0, end: 10, scoreUpPercent: 200, probability: 0.4 },
      ],
      10,
    );
    expect(anyActiveProbability(segments[0]?.actives ?? [])).toBeCloseTo(0.7, 10);
    expect(evaluateTimeline(segments, 10).expectedCoverage).toBeCloseTo(0.7, 10);
  });

  it("空白は合計と最長の両方を返す", () => {
    const segments = segmentTimeline(
      [
        { start: 5, end: 10, scoreUpPercent: 100, probability: 1 },
        { start: 20, end: 22, scoreUpPercent: 100, probability: 1 },
      ],
      30,
    );
    const metrics = evaluateTimeline(segments, 30);
    expect(metrics.totalGapSeconds).toBeCloseTo(5 + 10 + 8, 10);
    expect(metrics.maximumGapSeconds).toBeCloseTo(10, 10);
  });
});

describe("optimizeFrequency", () => {
  it("小さな fixture で全探索が既知の最良案を選ぶ", () => {
    const horizon = 60;
    const members = [
      member("a", skill({ scoreUpPercent: 200 }), [candidate(0), candidate(8, 0, 5)]),
      member("b", skill({ intervalSeconds: 13.5, scoreUpPercent: 100 }), [
        candidate(0),
        candidate(8, 0, 4),
      ]),
    ];
    const result = optimizeFrequency(members, horizon);
    expect(result.evaluated).toBe(4);

    // 参照実装（テスト内で 4 通りを素朴に評価）と一致する
    const all = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ].map((choice) => ({ choice, value: expectedOf(members, choice, horizon) }));
    const bestValue = Math.max(...all.map((a) => a.value));
    expect(result.expected.best.metrics.averageExpectedActiveScorePercent).toBeCloseTo(
      bestValue,
      9,
    );
    expect(all.find((a) => a.value === bestValue)?.choice).toEqual(result.expected.best.choice);
    expect(result.current.choice).toEqual([0, 0]);
    expect(result.current.additionalNodeCount).toBe(0);
  });

  it("発動頻度を上げれば常に良くなるとは限らない（0 / 4 / 8 / 12 の中間が最適になる）", () => {
    const horizon = 120;
    // 高スコア（200%）の A は 12 秒周期・6 秒。B（100%）は基礎 13.5 秒周期で、
    // 頻度を上げると A と重なる位置へ寄っていき、+4% が最良になる
    const members = [
      member("high", skill({ intervalSeconds: 12, durationSeconds: 6, scoreUpPercent: 200 }), [
        candidate(0),
      ]),
      member("low", skill({ intervalSeconds: 13.5, durationSeconds: 6, scoreUpPercent: 100 }), [
        candidate(0),
        candidate(4, 0, 4),
        candidate(8, 0, 8),
        candidate(12, 0, 12),
      ]),
    ];
    const values = [0, 1, 2, 3].map((i) => expectedOf(members, [0, i], horizon));
    expect(values[1]).toBeGreaterThan(values[0] ?? 0);
    expect(values[1]).toBeGreaterThan(values[2] ?? 0);
    expect(values[1]).toBeGreaterThan(values[3] ?? 0);

    const result = optimizeFrequency(members, horizon);
    expect(result.expected.best.choice).toEqual([0, 1]);
    expect(result.expected.best.metrics.averageExpectedActiveScorePercent).toBeCloseTo(
      values[1] ?? 0,
      9,
    );
  });

  it("期待値重視と理論最大重視で最適解が変わる（2 モードが名前違いでないことの担保）", () => {
    const horizon = 60;
    // 強いが発動率の低い A（+300% / 10%）と、弱いが必ず発動する B（+50% / 100%）。
    // B の頻度を上げると A と重なる位置へ寄る:
    // 期待値では A が不発の 90% のときに B が効くので重なっても価値があるが、
    // 理論最大では A が必ず発動する前提なので重なった B は価値 0 になる
    const members = [
      member(
        "strong",
        skill({
          intervalSeconds: 8,
          durationSeconds: 5,
          baseProbability: 0.1,
          scoreUpPercent: 300,
        }),
        [candidate(0)],
      ),
      member(
        "weak",
        skill({
          intervalSeconds: 8.6,
          durationSeconds: 6,
          baseProbability: 1,
          scoreUpPercent: 50,
        }),
        [candidate(0), candidate(4, 0, 4), candidate(8, 0, 8), candidate(12, 0, 12)],
      ),
    ];
    const expectedValues = [0, 1, 2, 3].map((i) => expectedOf(members, [0, i], horizon));
    const perfectValues = [0, 1, 2, 3].map((i) => perfectOf(members, [0, i], horizon));
    const argmax = (values: number[]): number =>
      values.indexOf(Math.max(...values.filter((v) => Number.isFinite(v))));
    expect(argmax(expectedValues)).toBe(3);
    expect(argmax(perfectValues)).toBe(0);

    const result = optimizeFrequency(members, horizon);
    expect(result.expected.best.choice).toEqual([0, 3]);
    expect(result.perfect.best.choice).toEqual([0, 0]);
    expect(result.expected.best.choice).not.toEqual(result.perfect.best.choice);
  });

  it("理論最大は構造カバレッジの最大化ではない", () => {
    const horizon = 90;
    // 長時間・弱い A（+20%）と、短時間・強い B（+150%）。B の頻度を上げると
    // 候補のある時間（構造カバレッジ）はむしろ減るが、理論最大の値は上がる
    const members = [
      member(
        "long-weak",
        skill({ intervalSeconds: 12, durationSeconds: 6, baseProbability: 1, scoreUpPercent: 20 }),
        [candidate(0)],
      ),
      member(
        "short-strong",
        skill({
          intervalSeconds: 13.6,
          durationSeconds: 5,
          baseProbability: 1,
          scoreUpPercent: 150,
        }),
        [candidate(0), candidate(4, 0, 4), candidate(8, 0, 8), candidate(12, 0, 12)],
      ),
    ];
    const metrics = [0, 1, 2, 3].map((i) => evaluateFrequencyPlan(members, [0, i], horizon));
    const perfect = metrics.map((m) => m.averagePerfectActivationScorePercent);
    const structural = metrics.map((m) => m.structuralCoverage);
    const argmax = (values: number[]): number => values.indexOf(Math.max(...values));
    expect(argmax(perfect)).toBe(3);
    expect(argmax(structural)).toBe(0);

    const result = optimizeFrequency(members, horizon);
    expect(result.perfect.best.choice).toEqual([0, 3]);
    // 構造カバレッジが最大の案は理論最大では選ばれない
    expect(result.perfect.best.metrics.structuralCoverage).toBeLessThan(structural[0] ?? 0);
  });

  it("ほぼ同等なら追加解放数の少ない案を省素材案として返す（推薦ポリシー）", () => {
    const horizon = 60;
    // 2 つの候補は効果が完全に同じで、追加解放数だけ違う
    const members = [member("a", skill(), [candidate(4, 0, 6), candidate(4, 0, 2)])];
    const result = optimizeFrequency(members, horizon);
    expect(result.expected.saving.additionalNodeCount).toBe(2);
    expect(result.expected.best.additionalNodeCount).toBe(2);
    expect(result.perfect.saving.additionalNodeCount).toBe(2);
  });

  it("アクティブのスコア UP を持たないメンバーはタイムラインに載らない", () => {
    const horizon = 60;
    const withNull = optimizeFrequency(
      [member("a", skill(), [candidate(0)]), member("b", null, [candidate(0), candidate(4, 0, 4)])],
      horizon,
    );
    const alone = optimizeFrequency([member("a", skill(), [candidate(0)])], horizon);
    expect(withNull.expected.best.metrics.averageExpectedActiveScorePercent).toBeCloseTo(
      alone.expected.best.metrics.averageExpectedActiveScorePercent,
      10,
    );
    // 効果がないので、頻度マスを追加しない案が選ばれる
    expect(withNull.expected.best.additionalNodeCount).toBe(0);
  });
});

describe("enumerateFrequencyCandidates", () => {
  it("未登録（解放 0）でも 3 マスぶんの候補が出て、追加解放数は経路の長さになる", () => {
    const candidates = enumerateFrequencyCandidates([]);
    expect(candidates.map((c) => c.frequencyNodeCount)).toEqual([0, 1, 2, 3]);
    expect(candidates[0]?.additionalNodeCount).toBe(0);
    expect(candidates[0]?.effectiveFrequencyPercent).toBe(0);
    expect(candidates.at(-1)?.effectiveFrequencyPercent).toBe(12);
    // 頻度マスは初期地点から連結でないと解放できないので、1 マス目でも経路ぶんの解放が必要
    expect(candidates[1]?.additionalNodeCount).toBeGreaterThan(1);
    for (const c of candidates) {
      expect(c.additionalNodeCount).toBe(c.addedNodeIds.length);
      expect(c.unlockedNodeIds.length).toBe(c.additionalNodeCount);
    }
  });

  it("現在のボード状態は壊さず、頻度マスだけを候補にする（発動率マス・経路はそのまま残る）", () => {
    // 発動率マスを含む現在の状態を作る（B-007 までの経路 = 発動率 +6.0%）
    const current = [...unlockNode(new Set<string>(), "B-007")];
    const currentEffects = blueBoardEffects(current);
    expect(currentEffects.activeRatePercent).toBeGreaterThan(0);
    expect(currentEffects.activeFrequencyPercent).toBe(0);

    const candidates = enumerateFrequencyCandidates(current);
    for (const c of candidates) {
      // 現在の解放マスは全候補に残る
      for (const id of current) expect(c.unlockedNodeIds).toContain(id);
      // 追加ぶんは現在の状態に含まれないマスだけ
      for (const id of c.addedNodeIds) expect(current).not.toContain(id);
      // 発動率は減らない（経路上の発動率マスが増えることはある）
      expect(c.effectiveRatePercent).toBeGreaterThanOrEqual(currentEffects.activeRatePercent);
      expect(c.effectiveFrequencyPercent).toBe(c.frequencyNodeCount * 4);
    }
    expect(candidates[0]?.additionalNodeCount).toBe(0);
    expect(candidates[0]?.effectiveRatePercent).toBe(currentEffects.activeRatePercent);
  });

  it("すでに頻度マスを解放している状態では、それを含む候補だけが出る", () => {
    const first = BLUE_FREQUENCY_NODE_IDS[0];
    if (first === undefined) throw new Error("発動頻度マスがない");
    const current = [...unlockNode(new Set<string>(), first)];
    const candidates = enumerateFrequencyCandidates(current);
    expect(candidates.map((c) => c.frequencyNodeCount)).toEqual([1, 2, 3]);
    for (const c of candidates) expect(c.unlockedNodeIds).toContain(first);
  });
});
