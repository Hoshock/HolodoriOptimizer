import { describe, expect, it } from "vite-plus/test";

import { formatCombinationCount, searchRemainingLabel, searchRemainingMs } from "./searchProgress";

describe("さがすの進み具合(searchProgress)", () => {
  it("組合せの数は 万・億 で 3 けたほどに丸める(切り捨て — 全部済むまで全体と同じ表示にしない)", () => {
    expect(formatCombinationCount(8400)).toBe("8,400");
    expect(formatCombinationCount(11_050_000)).toBe("1,105万");
    expect(formatCombinationCount(368_999_999)).toBe("3.68億");
    expect(formatCombinationCount(369_000_000)).toBe("3.69億");
    expect(formatCombinationCount(1_234_000_000)).toBe("12.3億");
  });

  it("残り時間はここまでの速さで見積もり、届いてから経った時間を引く。まだ何も済んでいなければ出さない", () => {
    expect(searchRemainingMs({ done: 0, total: 100, elapsedMs: 500 }, 1000)).toBeNull();
    // 25 件に 10 秒 → 残り 75 件で 30 秒。届いてから 4 秒たてば 26 秒
    expect(searchRemainingMs({ done: 25, total: 100, elapsedMs: 10_000 }, 10_000)).toBe(30_000);
    expect(searchRemainingMs({ done: 25, total: 100, elapsedMs: 10_000 }, 14_000)).toBe(26_000);
    expect(searchRemainingMs({ done: 25, total: 100, elapsedMs: 10_000 }, 60_000)).toBe(0);
  });

  it("残り時間の表示", () => {
    expect(searchRemainingLabel(4_000)).toBe("残り 数秒");
    expect(searchRemainingLabel(42_000)).toBe("残り 約 40 秒");
    expect(searchRemainingLabel(58_000)).toBe("残り 約 55 秒");
    expect(searchRemainingLabel(80_000)).toBe("残り 約 1 分 20 秒");
    expect(searchRemainingLabel(120_000)).toBe("残り 約 2 分");
    expect(searchRemainingLabel(14 * 60_000)).toBe("残り 約 14 分");
  });
});
