import { describe, expect, it } from "vite-plus/test";

import {
  BOARD_RESOURCE_MAX,
  BOARD_RESOURCES_SCHEMA_VERSION,
  emptyBoardResources,
  parseBoardResources,
  serializeBoardResources,
  setBoardResource,
} from "./boardResources";

describe("余っているボード用リソースの保存形式", () => {
  it("未登録は null(画面では ∞)。キーがない・壊れた値は全部未登録", () => {
    const none = { cube: null, core: null };
    const all = { red: none, blue: none, yellow: none, green: none };
    expect(emptyBoardResources()).toEqual(all);
    expect(parseBoardResources(null)).toEqual(all);
    expect(parseBoardResources("{")).toEqual(all);
    expect(parseBoardResources("[]")).toEqual(all);
    expect(parseBoardResources(JSON.stringify({ version: 1 }))).toEqual(all);
  });

  it("版番号つきの封筒で書き、読み戻すと同じ(0 は 0 個で、未登録とは別の値)", () => {
    const resources = setBoardResource(
      setBoardResource(emptyBoardResources(), "blue", "core", 12),
      "red",
      "cube",
      0,
    );
    const raw = serializeBoardResources(resources);
    expect(JSON.parse(raw)).toEqual({ version: BOARD_RESOURCES_SCHEMA_VERSION, resources });
    expect(parseBoardResources(raw)).toEqual(resources);
    expect(parseBoardResources(raw).red.cube).toBe(0);
    expect(parseBoardResources(raw).red.core).toBeNull();
  });

  it("0 以上の整数だけ受け付ける: 小数は切り捨て、負は 0、上限で止め、数値でない値は未登録", () => {
    const raw = JSON.stringify({
      version: 1,
      resources: {
        red: { cube: 12.9, core: -3 },
        blue: { cube: "5", core: null },
        yellow: { cube: BOARD_RESOURCE_MAX + 1, core: Number.NaN },
        green: 7,
        purple: { cube: 99 },
      },
    });
    expect(parseBoardResources(raw)).toEqual({
      red: { cube: 12, core: 0 },
      blue: { cube: null, core: null },
      yellow: { cube: BOARD_RESOURCE_MAX, core: null },
      green: { cube: null, core: null },
    });
  });

  it("1 色 × 1 種類だけを置き換え、ほかは変えない(元の登録も書き換えない)。null で未登録に戻る", () => {
    const base = setBoardResource(emptyBoardResources(), "red", "cube", 100);
    const next = setBoardResource(base, "red", "core", 5);
    expect(next.red).toEqual({ cube: 100, core: 5 });
    expect(next.blue).toEqual({ cube: null, core: null });
    expect(base.red).toEqual({ cube: 100, core: null });
    expect(setBoardResource(next, "red", "cube", -1).red.cube).toBe(0);
    expect(setBoardResource(next, "red", "cube", null).red.cube).toBeNull();
  });
});
