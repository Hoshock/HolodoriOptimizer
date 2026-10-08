import { describe, expect, it } from "vite-plus/test";

import { SEARCH_PREMISES, searchOptionsOf, searchPremiseOf } from "./searchPremise";

/**
 * さがすの前提の 3 択と、保存の形(`search-all` + `search-options`)の読み替え(2026-10-08 ユーザー指示)。
 * 開花はボードに従い、片方だけ OFF の旧保存はボードの値で読む
 */
describe("searchPremise", () => {
  it("並びは いまの育成で / 育てきったら / 全カード", () => {
    expect(SEARCH_PREMISES.map((p) => p.label)).toEqual([
      "いまの育成で",
      "育てきったら",
      "全カード",
    ]);
  });

  it("全カードは保存のオプションによらず全カード。所持カードからはボードの値で決める", () => {
    expect(searchPremiseOf(true, { board: true, bloom: true })).toBe("all");
    expect(searchPremiseOf(false, { board: true, bloom: true })).toBe("current");
    expect(searchPremiseOf(false, { board: false, bloom: false })).toBe("maxed");
    // 片方だけ OFF の旧保存
    expect(searchPremiseOf(false, { board: true, bloom: false })).toBe("current");
    expect(searchPremiseOf(false, { board: false, bloom: true })).toBe("maxed");
  });

  it("書くときはボードと開花を同じ値にする", () => {
    expect(searchOptionsOf("current")).toEqual({ board: true, bloom: true });
    expect(searchOptionsOf("maxed")).toEqual({ board: false, bloom: false });
  });
});
