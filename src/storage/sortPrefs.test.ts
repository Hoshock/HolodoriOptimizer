import { describe, expect, it } from "vite-plus/test";

import { loadSortPref } from "./sortPrefs";

const defaults = {
  key: "name" as "name" | "unlocked",
  direction: { name: "asc", unlocked: "desc" } as const,
};

describe("並び順の保存", () => {
  it("未保存・壊れた文字列は既定値", () => {
    expect(loadSortPref("holomen", defaults, null)).toEqual(defaults);
    expect(loadSortPref("holomen", defaults, "{")).toEqual(defaults);
    expect(loadSortPref("holomen", defaults, "[]")).toEqual(defaults);
  });

  it("保存した picker の設定を読み、未知のキー・向きは既定値で埋める", () => {
    const raw = JSON.stringify({
      holomen: { key: "unlocked", direction: { name: "desc", unlocked: "bogus", other: "asc" } },
      song: { key: "level", direction: { duration: "asc", level: "asc" } },
    });
    expect(loadSortPref("holomen", defaults, raw)).toEqual({
      key: "unlocked",
      direction: { name: "desc", unlocked: "desc" },
    });
    expect(loadSortPref("holomen", defaults, JSON.stringify({ holomen: { key: "zzz" } }))).toEqual(
      defaults,
    );
  });
});
