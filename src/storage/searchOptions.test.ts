import { describe, expect, it } from "vite-plus/test";

import { canTurnOffColor, defaultSearchOptions, parseSearchOptions } from "./searchOptions";

describe("さがすのオプションの保存形式", () => {
  it("未保存・壊れたデータ・オブジェクトでない値はすべて ON(既定)", () => {
    expect(parseSearchOptions(null)).toEqual(defaultSearchOptions());
    expect(parseSearchOptions("{oops")).toEqual(defaultSearchOptions());
    expect(parseSearchOptions("[]")).toEqual(defaultSearchOptions());
    expect(defaultSearchOptions()).toEqual({
      board: true,
      boardColors: { red: true, blue: true, yellow: true, green: true },
      connect: true,
      bloom: true,
    });
  });

  it("明示的に false の項目だけ OFF になる", () => {
    expect(
      parseSearchOptions(
        JSON.stringify({ board: false, connect: false, boardColors: { green: false } }),
      ),
    ).toEqual({
      board: false,
      boardColors: { red: true, blue: true, yellow: true, green: false },
      connect: false,
      bloom: true,
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

  it("4 色すべて OFF で保存されていても既定(すべて ON)へ戻す", () => {
    expect(
      parseSearchOptions(
        JSON.stringify({ boardColors: { red: false, blue: false, yellow: false, green: false } }),
      ),
    ).toEqual(defaultSearchOptions());
  });

  it("最後の 1 色は外せない(canTurnOffColor)", () => {
    const options = defaultSearchOptions();
    expect(canTurnOffColor(options, "green")).toBe(true);

    options.boardColors = { red: false, blue: false, yellow: false, green: true };
    expect(canTurnOffColor(options, "green")).toBe(false);
    expect(canTurnOffColor(options, "red")).toBe(true);
  });
});
