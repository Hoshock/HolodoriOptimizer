import { describe, expect, it } from "vite-plus/test";

import { defaultSearchOptions, parseSearchOptions } from "./searchOptions";

describe("さがすのオプションの保存形式", () => {
  it("未保存・壊れたデータ・オブジェクトでない値はすべて ON(既定)", () => {
    expect(parseSearchOptions(null)).toEqual(defaultSearchOptions());
    expect(parseSearchOptions("{oops")).toEqual(defaultSearchOptions());
    expect(parseSearchOptions("[]")).toEqual(defaultSearchOptions());
    expect(defaultSearchOptions()).toEqual({ board: true, bloom: true });
  });

  it("明示的に false の項目だけ OFF になる", () => {
    expect(parseSearchOptions(JSON.stringify({ board: false }))).toEqual({
      board: false,
      bloom: true,
    });
  });

  it("撤去したコネクトの項目は読み飛ばす(2026-10-02。OFF で保存されていても他の項目に影響しない)", () => {
    expect(parseSearchOptions(JSON.stringify({ connect: false }))).toEqual(defaultSearchOptions());
    expect(parseSearchOptions(JSON.stringify({ connect: false, bloom: false }))).toEqual({
      ...defaultSearchOptions(),
      bloom: false,
    });
  });

  it("真偽値でない値・知らない項目は既定(ON)へ倒す", () => {
    expect(
      parseSearchOptions(JSON.stringify({ bloom: 0, boardColors: "no", future: false })),
    ).toEqual(defaultSearchOptions());
  });

  it("撤去した衣装・パッシブのしぼりこみは読み飛ばす(2026-09-16)", () => {
    expect(parseSearchOptions(JSON.stringify({ costume: false, passives: false }))).toEqual(
      defaultSearchOptions(),
    );
  });

  it("撤去した色ごとの反映(boardColors)は読み飛ばす(2026-10-08。OFF で保存されていても他の項目に影響しない)", () => {
    expect(
      parseSearchOptions(JSON.stringify({ boardColors: { green: false }, bloom: false })),
    ).toEqual({ ...defaultSearchOptions(), bloom: false });
  });
});
