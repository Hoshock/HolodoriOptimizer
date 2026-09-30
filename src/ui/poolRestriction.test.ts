import { describe, expect, it } from "vite-plus/test";

import { effectiveSelectedIds, roleExclusions } from "./poolRestriction";

const all = ["a", "b", "c", "d"];

describe("除外 / 選択 → 役割別の除外リスト", () => {
  it("除外: 選んだカードをそのまま除外として渡す(選択リストは見ない)", () => {
    expect(
      roleExclusions({
        mode: "exclude",
        excludedIds: ["b"],
        selectedIds: ["a"],
        allCardIds: all,
        poolIds: null,
      }),
    ).toEqual(["b"]);
  });

  it("選択: 選んだカード以外を除外として渡す(除外リストは見ない)", () => {
    expect(
      roleExclusions({
        mode: "select",
        excludedIds: ["b"],
        selectedIds: ["a", "c"],
        allCardIds: all,
        poolIds: null,
      }),
    ).toEqual(["b", "d"]);
  });

  it("選択が空のときは絞らない（0 件になる設定を作らない）", () => {
    expect(
      roleExclusions({
        mode: "select",
        excludedIds: ["b"],
        selectedIds: [],
        allCardIds: all,
        poolIds: null,
      }),
    ).toEqual([]);
  });

  it("所持カードから探すとき、所持外や未知のカードだけの選択は絞らない", () => {
    const base = { mode: "select", excludedIds: [], allCardIds: all } as const;
    expect(
      roleExclusions({ ...base, selectedIds: ["d", "zzz"], poolIds: new Set(["a", "b"]) }),
    ).toEqual([]);
    expect(
      roleExclusions({ ...base, selectedIds: ["a", "d"], poolIds: new Set(["a", "b"]) }),
    ).toEqual(["b", "c", "d"]);
  });

  it("選択の外でも残すカード（おかゆん・ホロメン指定）は除外に入れない", () => {
    expect(
      roleExclusions({
        mode: "select",
        excludedIds: [],
        selectedIds: ["a"],
        allCardIds: all,
        poolIds: null,
        alwaysAllowed: new Set(["c"]),
      }),
    ).toEqual(["b", "d"]);
  });

  it("除外でも、残すカード（ホロメン指定・おかゆん）は除外に入れない", () => {
    expect(
      roleExclusions({
        mode: "exclude",
        excludedIds: ["a", "b"],
        selectedIds: [],
        allCardIds: all,
        poolIds: null,
        alwaysAllowed: new Set(["b"]),
      }),
    ).toEqual(["a"]);
  });

  it("効いている選択の枚数は、既知で所持の中のものだけ数える", () => {
    expect(effectiveSelectedIds(["a", "zzz", "d"], all, new Set(["a", "b"]))).toEqual(["a"]);
    expect(effectiveSelectedIds(["a", "zzz", "d"], all, null)).toEqual(["a", "d"]);
  });
});
