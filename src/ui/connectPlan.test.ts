import { describe, expect, it } from "vite-plus/test";

import { connectPlanRows } from "./connectPlan";

describe("コネクトの最適化の表の行", () => {
  const a = { extent: "card-3", permil: 2600 } as const;
  const b = { extent: "general-1", permil: 1050 } as const;

  it("現在と推奨で違う置き場所だけを行にする(同じ形・同じ ％ は出さない)", () => {
    const rows = connectPlanRows(
      { okayu: { card: a, center: b }, korone: { leader: a } },
      { okayu: { card: a, center: a }, miko: { content: b } },
      ["okayu", "korone", "miko"],
    );
    expect(rows).toEqual([
      { holomenId: "okayu", anchor: "center", current: b, recommended: a },
      { holomenId: "korone", anchor: "leader", current: a, recommended: null },
      { holomenId: "miko", anchor: "content", current: null, recommended: b },
    ]);
    // 同じコネクトマスなら編成の順(holomenOrder)
    const same = connectPlanRows({}, { korone: { card: a }, okayu: { card: a } }, [
      "okayu",
      "korone",
    ]);
    expect(same.map((r) => r.holomenId)).toEqual(["okayu", "korone"]);
  });

  it("同じ形でも ％ が違えば行になる。何も変わらなければ空", () => {
    expect(
      connectPlanRows(
        { okayu: { card: a } },
        { okayu: { card: { extent: "card-3", permil: 2100 } } },
        [],
      ),
    ).toHaveLength(1);
    expect(connectPlanRows({ okayu: { card: a } }, { okayu: { card: { ...a } } }, [])).toEqual([]);
    expect(connectPlanRows({}, {}, [])).toEqual([]);
  });

  it("並びは コネクトマス(中心 → 赤 → 青 → 黄)が先、同じコネクトマスの中は 編成のホロメン(holomenOrder)→ そのほかは ID 順", () => {
    const rows = connectPlanRows(
      {},
      {
        zzz: { center: a },
        aaa: { content: a, card: a, center: a, leader: a },
        okayu: { card: b },
      },
      ["okayu"],
    );
    expect(rows.map((r) => `${r.holomenId}/${r.anchor}`)).toEqual([
      "aaa/center",
      "zzz/center",
      "aaa/leader",
      "okayu/card",
      "aaa/card",
      "aaa/content",
    ]);
  });
});
