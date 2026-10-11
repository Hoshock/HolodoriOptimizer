import { describe, expect, it } from "vite-plus/test";

import { planSectionOf, sortPlanHolomen } from "./planSections";

/** 組み直しプランの区分(リーダー・メンバー / グループ / その他)。所属は `holomen.json` の値 */
describe("planSectionOf", () => {
  // リーダー こより(holox)、メンバー ころね(gamers)
  const unit = { leaderHolomenId: "hakui-koyori", memberHolomenIds: ["inugami-korone"] };

  it("リーダーとメンバーのホロメンはリーダー・メンバー", () => {
    expect(planSectionOf("hakui-koyori", unit)).toBe("unit");
    expect(planSectionOf("inugami-korone", unit)).toBe("unit");
  });

  it("グループはメンバーと所属が同じユニット外。リーダーとだけ所属が同じホロメンはその他", () => {
    expect(planSectionOf("ookami-mio", unit)).toBe("group"); // gamers
    expect(planSectionOf("takane-lui", unit)).toBe("other"); // holox(リーダーの所属だけ)
    expect(planSectionOf("tokino-sora", unit)).toBe("other"); // gen0
  });

  // 2026-10-11 ユーザー指示「黄色の楽曲系のユニットもここにいれる」
  it("計算した曲の歌唱者(ソロ・ユニット曲)もグループ。全体楽曲・曲なしでは入れない", () => {
    // ラミィズバリバリワークアウト = 雪花ラミィのソロ曲(ラミィは holox でも gamers でもない)
    expect(planSectionOf("yukihana-lamy", { ...unit, songId: "song-212" })).toBe("group");
    expect(planSectionOf("yukihana-lamy", unit)).toBe("other");
    expect(planSectionOf("yukihana-lamy", { ...unit, songId: null })).toBe("other");
    // Shiny Smily Story = 全体楽曲
    expect(planSectionOf("yukihana-lamy", { ...unit, songId: "song-001" })).toBe("other");
  });
});

describe("sortPlanHolomen", () => {
  it("リーダー → メンバー(結果のメンバーの順)→ グループ → その他。グループとその他の中はホロメン順", () => {
    const unit = {
      leaderHolomenId: "hakui-koyori",
      memberHolomenIds: ["nekomata-okayu", "inugami-korone", "ookami-mio"],
    };
    expect(
      sortPlanHolomen(
        [
          "akai-haato",
          "sakura-miko",
          "shirakami-fubuki", // ゲーマーズ = グループ
          "ookami-mio",
          "inugami-korone",
          "nekomata-okayu",
          "hakui-koyori",
        ],
        unit,
      ),
    ).toEqual([
      "hakui-koyori",
      "nekomata-okayu",
      "inugami-korone",
      "ookami-mio",
      "shirakami-fubuki",
      // ホロメン順 `HOLOMEN_ORDER`: さくらみこ(0期生)→ 赤井はあと(1期生)。五十音順・holomen.json の並びなら逆
      "sakura-miko",
      "akai-haato",
    ]);
  });
});
