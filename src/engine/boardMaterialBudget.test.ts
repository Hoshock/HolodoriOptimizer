import { describe, expect, it } from "vite-plus/test";

import { BOARD_MATERIAL_COLORS, emptyBoardMaterials } from "../data/boardMaterials";
import type { BoardMaterials } from "../data/boardMaterials";
import { emptyBoardResources } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import {
  remainingAfterMaterials,
  totalAvailableMaterials,
  unlimitedMaterials,
  withinMaterialLimits,
} from "./boardMaterialBudget";

/** 「リソース」の登録値は余り。総利用可能量 = 投入済み + 余り(2026-10-07 ユーザー指示) */
const spentOf = (cube: number, core: number): BoardMaterials => {
  const m = emptyBoardMaterials();
  for (const c of BOARD_MATERIAL_COLORS) m[c] = { cube, core };
  return m;
};
const remainingOf = (cube: number | null, core: number | null): BoardResources => {
  const r = emptyBoardResources();
  for (const c of BOARD_MATERIAL_COLORS) r[c] = { cube, core };
  return r;
};

describe("総利用可能量(投入済み + 余り)", () => {
  it("投入済み 1000 + 余り 200 = 1200(全 8 資材)", () => {
    const total = totalAvailableMaterials(spentOf(1000, 100), remainingOf(200, 20));
    for (const c of BOARD_MATERIAL_COLORS) expect(total[c]).toEqual({ cube: 1200, core: 120 });
  });

  it("色・種類ごとに別々に足す(色をまたいだ流用はない)", () => {
    const spent = emptyBoardMaterials();
    spent.red = { cube: 2300, core: 125 };
    spent.blue = { cube: 1500, core: 100 };
    const remaining = emptyBoardResources();
    remaining.red = { cube: 700, core: 25 };
    remaining.blue = { cube: 300, core: 20 };
    const total = totalAvailableMaterials(spent, remaining);
    expect(total.red).toEqual({ cube: 3000, core: 150 });
    expect(total.blue).toEqual({ cube: 1800, core: 120 });
    // 余りが未登録の項目は制限なし
    expect(total.yellow).toEqual({ cube: Infinity, core: Infinity });
  });

  it("余り 0 は「余りが 0 個」で、制限なしではない(総量 = 投入済みだけ)", () => {
    const total = totalAvailableMaterials(spentOf(500, 50), remainingOf(0, 0));
    expect(total.green).toEqual({ cube: 500, core: 50 });
    expect(Number.isFinite(total.green.cube)).toBe(true);
  });

  it("未登録(null)は制限なし。一部だけ登録していれば、その項目だけ有限", () => {
    expect(totalAvailableMaterials(spentOf(1, 1), emptyBoardResources())).toEqual(
      unlimitedMaterials(),
    );
    const r = emptyBoardResources();
    r.green.cube = 10;
    const total = totalAvailableMaterials(spentOf(100, 5), r);
    expect(total.green).toEqual({ cube: 110, core: Infinity });
  });
});

describe("推奨のあとの余り(保存則)", () => {
  it("推奨の投入が 1100 なら、総量 1200 から 余り 100(最適化前 投入 1000 / 余り 200)", () => {
    const total = totalAvailableMaterials(spentOf(1000, 100), remainingOf(200, 20));
    const after = remainingAfterMaterials(total, spentOf(1100, 110));
    for (const c of BOARD_MATERIAL_COLORS) expect(after[c]).toEqual({ cube: 100, core: 10 });
  });

  it("推奨の投入が 900 なら 余り 300", () => {
    const total = totalAvailableMaterials(spentOf(1000, 100), remainingOf(200, 20));
    const after = remainingAfterMaterials(total, spentOf(900, 90));
    for (const c of BOARD_MATERIAL_COLORS) expect(after[c]).toEqual({ cube: 300, core: 30 });
  });

  it("全 8 資材で 投入済み + 余り が保存される(総量が増減しない)", () => {
    const spentBefore = emptyBoardMaterials();
    const remaining = emptyBoardResources();
    const spentAfter = emptyBoardMaterials();
    let n = 1;
    for (const c of BOARD_MATERIAL_COLORS) {
      spentBefore[c] = { cube: 1000 * n, core: 100 * n };
      remaining[c] = { cube: 37 * n, core: 3 * n };
      spentAfter[c] = { cube: 800 * n + 11, core: 90 * n };
      n += 1;
    }
    const after = remainingAfterMaterials(
      totalAvailableMaterials(spentBefore, remaining),
      spentAfter,
    );
    for (const c of BOARD_MATERIAL_COLORS) {
      expect((after[c].cube ?? 0) + spentAfter[c].cube).toBe(
        spentBefore[c].cube + (remaining[c].cube ?? 0),
      );
      expect((after[c].core ?? 0) + spentAfter[c].core).toBe(
        spentBefore[c].core + (remaining[c].core ?? 0),
      );
    }
  });

  it("未登録の項目は未登録のまま。総量を超える使用量は負の余り(不足)として返す", () => {
    const total = totalAvailableMaterials(spentOf(100, 10), emptyBoardResources());
    expect(remainingAfterMaterials(total, spentOf(500, 50))).toEqual(emptyBoardResources());
    const limited = totalAvailableMaterials(spentOf(100, 10), remainingOf(0, 0));
    const after = remainingAfterMaterials(limited, spentOf(101, 11));
    for (const c of BOARD_MATERIAL_COLORS) expect(after[c]).toEqual({ cube: -1, core: -1 });
  });
});

describe("上限の判定", () => {
  it("1 項目でも超えれば false、ちょうどなら true", () => {
    const limits = totalAvailableMaterials(spentOf(100, 10), remainingOf(0, 0));
    expect(withinMaterialLimits(spentOf(100, 10), limits)).toBe(true);
    expect(withinMaterialLimits(spentOf(101, 10), limits)).toBe(false);
    expect(withinMaterialLimits(spentOf(100, 11), limits)).toBe(false);
    expect(withinMaterialLimits(spentOf(1e9, 1e9), unlimitedMaterials())).toBe(true);
  });
});
