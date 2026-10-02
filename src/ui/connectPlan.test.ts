import { describe, expect, it } from "vite-plus/test";

import { connectPlanRows } from "./connectPlan";

describe("コネクトの最適化の表の行", () => {
  const a = { extent: "card-3", permil: 2600 } as const;
  const b = { extent: "general-1", permil: 1050 } as const;
  const unit = {
    leaderHolomenId: "hakui-koyori",
    memberHolomenIds: ["nekomata-okayu", "inugami-korone", "ookami-mio"],
  };

  it("現在と推奨で違う置き場所だけを行にする(同じ形・同じ ％ は出さない)", () => {
    const rows = connectPlanRows(
      { "nekomata-okayu": { card: a, center: b }, "inugami-korone": { leader: a } },
      { "nekomata-okayu": { card: a, center: a }, "sakura-miko": { content: b } },
      unit,
    );
    expect(rows).toEqual([
      { holomenId: "nekomata-okayu", anchor: "center", current: b, recommended: a },
      { holomenId: "inugami-korone", anchor: "leader", current: a, recommended: null },
      { holomenId: "sakura-miko", anchor: "content", current: null, recommended: b },
    ]);
  });

  it("同じ形でも ％ が違えば行になる。何も変わらなければ空", () => {
    expect(
      connectPlanRows(
        { "nekomata-okayu": { card: a } },
        { "nekomata-okayu": { card: { extent: "card-3", permil: 2100 } } },
        unit,
      ),
    ).toHaveLength(1);
    expect(
      connectPlanRows(
        { "nekomata-okayu": { card: a } },
        { "nekomata-okayu": { card: { ...a } } },
        unit,
      ),
    ).toEqual([]);
    expect(connectPlanRows({}, {}, unit)).toEqual([]);
  });

  it("並びは リーダー → メンバー(結果のメンバーの順)→ それ以外(五十音順)、同じホロメンの中は 中心 → 赤 → 青 → 黄", () => {
    const rows = connectPlanRows(
      {},
      {
        // それ以外: 読みは 赤井はあと(あかい…)→ 猫又おかゆ ではなく、ユニット外の さくらみこ(さくら…)・赤井はあと の順
        "sakura-miko": { center: a },
        "akai-haato": { content: a, card: a, center: a, leader: a },
        // メンバー(順は 猫又おかゆ → 戌神ころね → 大神ミオ)
        "ookami-mio": { card: b },
        "inugami-korone": { center: b },
        "nekomata-okayu": { content: b, center: b },
        // リーダー
        "hakui-koyori": { leader: b },
      },
      unit,
    );
    expect(rows.map((r) => `${r.holomenId}/${r.anchor}`)).toEqual([
      "hakui-koyori/leader",
      "nekomata-okayu/center",
      "nekomata-okayu/content",
      "inugami-korone/center",
      "ookami-mio/card",
      "akai-haato/center",
      "akai-haato/leader",
      "akai-haato/card",
      "akai-haato/content",
      "sakura-miko/center",
    ]);
  });

  it("リーダーがメンバーと同じホロメンでも、1 回だけ数える(リーダーの位置)", () => {
    const rows = connectPlanRows(
      {},
      { "nekomata-okayu": { center: a }, "ookami-mio": { center: a } },
      { leaderHolomenId: "nekomata-okayu", memberHolomenIds: ["ookami-mio", "nekomata-okayu"] },
    );
    expect(rows.map((r) => r.holomenId)).toEqual(["nekomata-okayu", "ookami-mio"]);
  });
});
