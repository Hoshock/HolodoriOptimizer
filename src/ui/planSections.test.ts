import { describe, expect, it } from "vite-plus/test";

import { planSectionOf } from "./planSections";

/** 組み直しプランの区分(リーダー・メンバー / 所属グループ / その他)。所属は `holomen.json` の値 */
describe("planSectionOf", () => {
  // リーダー こより(holox)、メンバー ころね(gamers)
  const unit = { leaderHolomenId: "hakui-koyori", memberHolomenIds: ["inugami-korone"] };

  it("リーダーとメンバーのホロメンはリーダー・メンバー", () => {
    expect(planSectionOf("hakui-koyori", unit)).toBe("unit");
    expect(planSectionOf("inugami-korone", unit)).toBe("unit");
  });

  it("所属グループはメンバーと所属が同じユニット外だけ。リーダーとだけ所属が同じホロメンはその他", () => {
    expect(planSectionOf("ookami-mio", unit)).toBe("group"); // gamers
    expect(planSectionOf("takane-lui", unit)).toBe("other"); // holox(リーダーの所属だけ)
    expect(planSectionOf("tokino-sora", unit)).toBe("other"); // gen0
  });
});
