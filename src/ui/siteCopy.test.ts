import { describe, expect, it } from "vite-plus/test";

import { GUIDE_LINK_PATHS, linesOf, SITE_COPY } from "./siteCopy";

/** 画面に出すサイトの文言（説明セクション・共有文）。本番の文言をここで固定する */

describe("サイトの文言", () => {
  it("見出しは改行で折り返し位置を持ち、つなげると本番の見出しになる", () => {
    expect(linesOf(SITE_COPY.heading).join("")).toBe(
      "所持カードから最適編成を探す編成シミュレーター",
    );
  });

  it("できることは重要度順で、ホロメンボードが開花より先。試算値の行は置かない(フッタの免責と重ねない)", () => {
    const features = linesOf(SITE_COPY.features);
    expect(features).toHaveLength(7);
    expect(features[0]).toContain("全探索");
    expect(features.findIndex((f) => f.includes("ホロメンボード"))).toBeLessThan(
      features.findIndex((f) => f.includes("開花")),
    );
    expect(features.some((f) => f.includes("試算値"))).toBe(false);
  });

  it("解説ページのリンクはラベルと行き先の数が合っている", () => {
    expect(linesOf(SITE_COPY.linkLabels)).toHaveLength(GUIDE_LINK_PATHS.length);
  });

  it("複数行の欄は前後の空白と空行を落として配列にする", () => {
    expect(linesOf(" a \n\n b\n")).toEqual(["a", "b"]);
  });
});
