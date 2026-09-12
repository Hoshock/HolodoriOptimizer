import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const sourceFiles = [
  new URL("../engine/displayScore.ts", import.meta.url),
  new URL("../engine/displayScore.test.ts", import.meta.url),
  new URL("../engine/optimize.ts", import.meta.url),
  new URL("./redBoard.ts", import.meta.url),
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
    for (const url of sourceFiles) {
      const path = fileURLToPath(url);
      const text = readFileSync(path, "utf8");
      for (const phrase of forbiddenCurrentClaims) {
        if (text.includes(phrase)) violations.push(`${path}: ${phrase}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
