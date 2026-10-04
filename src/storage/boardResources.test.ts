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
  it("版番号つきの封筒で書き、読み戻すと同じ。キーがない・壊れた値は全部 0", () => {
    const resources = setBoardResource(emptyBoardResources(), "blue", "core", 12);
    const raw = serializeBoardResources(resources);
    expect(JSON.parse(raw)).toEqual({ version: BOARD_RESOURCES_SCHEMA_VERSION, resources });
    expect(parseBoardResources(raw)).toEqual(resources);
    expect(parseBoardResources(null)).toEqual(emptyBoardResources());
    expect(parseBoardResources("{")).toEqual(emptyBoardResources());
    expect(parseBoardResources("[]")).toEqual(emptyBoardResources());
    expect(parseBoardResources(JSON.stringify({ version: 1 }))).toEqual(emptyBoardResources());
  });

  it("0 以上の整数だけ受け付ける: 小数は切り捨て、負・数値でない値は 0、上限で止める", () => {
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
      blue: { cube: 0, core: 0 },
      yellow: { cube: BOARD_RESOURCE_MAX, core: 0 },
      green: { cube: 0, core: 0 },
    });
  });

  it("1 色 × 1 種類だけを置き換え、ほかは変えない(元の登録も書き換えない)", () => {
    const base = setBoardResource(emptyBoardResources(), "red", "cube", 100);
    const next = setBoardResource(base, "red", "core", 5);
    expect(next.red).toEqual({ cube: 100, core: 5 });
    expect(next.blue).toEqual({ cube: 0, core: 0 });
    expect(base.red).toEqual({ cube: 100, core: 0 });
    expect(setBoardResource(next, "red", "cube", -1).red.cube).toBe(0);
  });
});
