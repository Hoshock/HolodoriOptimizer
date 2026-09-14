import { describe, expect, it } from "vite-plus/test";

import { parseSearchAll, resolveSearchAll } from "./searchAll";

describe("所持カードから探すの保存", () => {
  it("保存済みの真偽値を読む", () => {
    expect(parseSearchAll("true")).toBe(true);
    expect(parseSearchAll("false")).toBe(false);
  });

  it("未保存・壊れたデータ・真偽値でない値は「まだ選んでいない」", () => {
    expect(parseSearchAll(null)).toBe(null);
    expect(parseSearchAll("{oops")).toBe(null);
    expect(parseSearchAll('"true"')).toBe(null);
    expect(parseSearchAll("1")).toBe(null);
  });

  it("選んでいれば所持カードの枚数によらず保存値を使う(既に使っている人の設定を変えない)", () => {
    expect(resolveSearchAll(false, 0)).toBe(false);
    expect(resolveSearchAll(true, 120)).toBe(true);
  });

  it("選んでいないときは、所持カードが無ければ全カード・あれば所持カードから探す", () => {
    expect(resolveSearchAll(null, 0)).toBe(true);
    expect(resolveSearchAll(null, 1)).toBe(false);
  });
});
