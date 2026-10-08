import { describe, expect, it } from "vite-plus/test";

import { PREMISE_INFO, RESULT_TAB_INFO } from "./infoTables";
import { SEARCH_PREMISES } from "./searchPremise";

/**
 * ⓘ から開く違いの表(2026-10-08 ユーザー指示)。列は画面の選択肢と同じ並び・同じ名前で、どの行も列の数だけ枡を持つ
 */
describe("infoTables", () => {
  it("育成の前提の列は 3 択と同じ並び", () => {
    expect(PREMISE_INFO.columns.map((c) => c.key)).toEqual(SEARCH_PREMISES.map((p) => p.key));
    expect(PREMISE_INFO.columns.map((c) => c.label)).toEqual(SEARCH_PREMISES.map((p) => p.label));
  });

  it("結果の並びの列は いまのまま / 組み直すと", () => {
    expect(RESULT_TAB_INFO.columns.map((c) => c.label)).toEqual(["いまのまま", "組み直すと"]);
  });

  it("どの行も列の数だけ枡を持ち、行の名前は重ならない", () => {
    for (const table of [PREMISE_INFO, RESULT_TAB_INFO]) {
      for (const row of table.rows) expect(row.cells).toHaveLength(table.columns.length);
      const labels = table.rows.map((r) => r.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("コネクトはどの前提でも登録している配置(2026-10-02 ユーザー指示)", () => {
    expect(PREMISE_INFO.rows.find((r) => r.label === "コネクト")?.cells).toEqual([
      "登録のまま",
      "登録のまま",
      "登録のまま",
    ]);
  });
});
