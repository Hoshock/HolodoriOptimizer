import { describe, expect, it } from "vite-plus/test";

import {
  ACCOUNT_INFO,
  FREQUENCY_OBJECTIVE_INFO,
  PREMISE_INFO,
  RESOURCE_INFO,
  RESULT_TAB_INFO,
} from "./infoContent";
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

  it("アカウントは 4 つの入口と同じ並び(ボード / カード / コネクト / リソース)", () => {
    expect(ACCOUNT_INFO.terms.map((t) => t.label)).toEqual([
      "ボード",
      "カード",
      "コネクト",
      "リソース",
    ]);
  });

  it("発動頻度の選び方は条件のタブの 3 択と同じ並び・同じ名前", () => {
    expect(FREQUENCY_OBJECTIVE_INFO.terms.map((t) => [t.key, t.label])).toEqual([
      ["expected", "期待値重視"],
      ["perfect", "理論値重視"],
      ["unit", "ユニットスコア重視"],
    ]);
  });

  it("どの説明も空の段落を持たない", () => {
    const lines = [
      ...[RESULT_TAB_INFO, ACCOUNT_INFO, FREQUENCY_OBJECTIVE_INFO].flatMap((i) =>
        i.terms.flatMap((t) => t.paragraphs),
      ),
      ...RESOURCE_INFO.paragraphs,
    ];
    for (const line of lines) expect(line.trim()).not.toBe("");
  });
});
