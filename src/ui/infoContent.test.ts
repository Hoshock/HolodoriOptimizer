import { describe, expect, it } from "vite-plus/test";

import { PREMISE_INFO, RESULT_TAB_INFO } from "./infoContent";
import { SEARCH_PREMISES } from "./searchPremise";

/**
 * ⓘ から開く中身(2026-10-08 ユーザー指示)。名前は画面の選択肢と同じ並び・同じ名前で、表のどの行も列の数だけ枡を持つ
 */
describe("infoContent", () => {
  it("育成の前提の列は 3 択と同じ並び", () => {
    expect(PREMISE_INFO.columns.map((c) => c.key)).toEqual(SEARCH_PREMISES.map((p) => p.key));
    expect(PREMISE_INFO.columns.map((c) => c.label)).toEqual(SEARCH_PREMISES.map((p) => p.label));
  });

  it("表のどの行も列の数だけ枡を持ち、行の名前は重ならない", () => {
    for (const row of PREMISE_INFO.rows)
      expect(row.cells).toHaveLength(PREMISE_INFO.columns.length);
    const labels = PREMISE_INFO.rows.map((r) => r.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("コネクトはどの前提でも登録している配置(2026-10-02 ユーザー指示)", () => {
    expect(PREMISE_INFO.rows.find((r) => r.label === "コネクト")?.cells).toEqual([
      "登録のまま",
      "登録のまま",
      "登録のまま",
    ]);
  });

  it("結果の並びは いまのまま / 組み直すと の 2 つを、タブと同じ並びで", () => {
    expect(RESULT_TAB_INFO.terms.map((t) => [t.key, t.label])).toEqual([
      ["now", "いまのまま"],
      ["grown", "組み直すと"],
    ]);
  });
});
