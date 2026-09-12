import { describe, expect, it } from "vite-plus/test";

import displayScoreSource from "../engine/displayScore.ts?raw";
import displayScoreTestSource from "../engine/displayScore.test.ts?raw";
import optimizeSource from "../engine/optimize.ts?raw";
import redBoardSource from "./redBoard.ts?raw";

const sourceFiles: readonly [string, string][] = [
  ["src/engine/displayScore.ts", displayScoreSource],
  ["src/engine/displayScore.test.ts", displayScoreTestSource],
  ["src/engine/optimize.ts", optimizeSource],
  ["src/data/redBoard.ts", redBoardSource],
];

const forbiddenCurrentClaims = [
  "現在最有力の表示再現モデル",
  "候補秒率換算",
  "支持される強い仮説",
  "正確な値は候補の基準候補秒率 × X",
  "正確な値は X × 基準候補秒率",
] as const;

describe("evidence wording guard", () => {
  it("反証済み赤スコア候補秒率を現行仮説として再導入しない", () => {
    const violations: string[] = [];
    for (const [path, text] of sourceFiles) {
      for (const phrase of forbiddenCurrentClaims) {
        if (text.includes(phrase)) violations.push(`${path}: ${phrase}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
