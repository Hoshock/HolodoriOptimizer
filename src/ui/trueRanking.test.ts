import { describe, expect, it } from "vite-plus/test";

import { rankByOptimized, RANKING_UNIT_MS, rankingEstimate, remainingLabel } from "./trueRanking";

describe("rankByOptimized", () => {
  it("最適化後の値の高い順に上位 n 件の添字を返す。同じ値は添字の小さいものを先に、値のないものは並べない", () => {
    expect(rankByOptimized([10, 30, null, 30, 20], 3)).toEqual([1, 3, 4]);
    expect(rankByOptimized([5, null], 10)).toEqual([0]);
  });
});

describe("rankingEstimate", () => {
  const workload = { proxy: 10, search: 5, optimize: 20 };
  const total =
    10 * RANKING_UNIT_MS.proxy + 5 * RANKING_UNIT_MS.search + 20 * RANKING_UNIT_MS.optimize;

  it("始める前は 0 % で、残りは目安の合計", () => {
    expect(rankingEstimate({ workload, phase: null, done: 0, elapsedMs: 0 })).toEqual({
      fraction: 0,
      remainingMs: total,
    });
  });

  it("済んだ段は全部、いまの段は済んだ数ぶんを進み具合に数え、実測の速さで残りを補正する", () => {
    const completed = 10 * RANKING_UNIT_MS.proxy + 2 * RANKING_UNIT_MS.search;
    const slow = rankingEstimate({ workload, phase: "search", done: 2, elapsedMs: completed * 2 });
    expect(slow.fraction).toBeCloseTo(completed / total);
    expect(slow.remainingMs).toBeCloseTo((total - completed) * 2);
  });

  it("飛ばした段(0 件)は重みに入らない。仕事がなければ完了", () => {
    const skipped = rankingEstimate({
      workload: { proxy: 0, search: 1, optimize: 1 },
      phase: "optimize",
      done: 0,
      elapsedMs: 0,
    });
    expect(skipped.fraction).toBeCloseTo(
      RANKING_UNIT_MS.search / (RANKING_UNIT_MS.search + RANKING_UNIT_MS.optimize),
    );
    expect(
      rankingEstimate({
        workload: { proxy: 0, search: 0, optimize: 0 },
        phase: null,
        done: 0,
        elapsedMs: 0,
      }),
    ).toEqual({ fraction: 1, remainingMs: 0 });
  });
});

describe("表示", () => {
  it("残りは分に丸め、1 分を切ったら秒(5 秒刻み。10 秒未満は「数秒」)", () => {
    expect(remainingLabel(4.4 * 60_000)).toBe("約 4 分");
    expect(remainingLabel(62_000)).toBe("約 1 分");
    expect(remainingLabel(58_000)).toBe("約 55 秒");
    expect(remainingLabel(42_000)).toBe("約 40 秒");
    expect(remainingLabel(20_000)).toBe("約 20 秒");
    expect(remainingLabel(4_000)).toBe("数秒");
  });
});
