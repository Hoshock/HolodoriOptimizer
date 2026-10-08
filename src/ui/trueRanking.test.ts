import { describe, expect, it } from "vite-plus/test";

import { rankByOptimized } from "./trueRanking";

describe("rankByOptimized", () => {
  it("最適化後の値の高い順に上位 n 件の添字を返す。同じ値は探索の順位が上のものを先に、値のないものは並べない", () => {
    expect(rankByOptimized([10, 30, null, 30, 20], 3)).toEqual([1, 3, 4]);
    expect(rankByOptimized([5, null], 10)).toEqual([0]);
  });
});
