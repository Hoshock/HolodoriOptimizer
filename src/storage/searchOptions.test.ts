import { describe, expect, it } from "vite-plus/test";

import { defaultSearchOptions, parseSearchOptions } from "./searchOptions";

describe("さがすのオプションの保存形式", () => {
  it("未保存・壊れたデータ・オブジェクトでない値はすべて ON(既定)", () => {
    expect(parseSearchOptions(null)).toEqual(defaultSearchOptions());
    expect(parseSearchOptions("{oops")).toEqual(defaultSearchOptions());
    expect(parseSearchOptions("[]")).toEqual(defaultSearchOptions());
    expect(defaultSearchOptions()).toEqual({
      board: true,
      bloom: true,
      costume: true,
      passives: true,
    });
  });

  it("明示的に false の項目だけ OFF になる", () => {
    expect(parseSearchOptions(JSON.stringify({ board: false, passives: false }))).toEqual({
      board: false,
      bloom: true,
      costume: true,
      passives: false,
    });
  });

  it("真偽値でない値・知らない項目は既定(ON)へ倒す", () => {
    expect(parseSearchOptions(JSON.stringify({ bloom: 0, costume: "no", future: false }))).toEqual(
      defaultSearchOptions(),
    );
  });
});
