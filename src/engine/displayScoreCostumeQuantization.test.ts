import { describe, expect, it } from "vite-plus/test";

import { cards as realCards, holomen as realHolomen } from "../data";
import { cardAtBloomWithProvenance } from "../data/bloom";
import type { Card } from "../data/types";
import { computeDisplayScoreRaw } from "./displayScore";
import { buildHolomenMap } from "./score";

/**
 * **衣装欄の量子化の位相（2026-09-15 実機）。**
 *
 * 典獄クロニー（全員のスコアサポート 60%）をリーダーに、**青 0・赤 0・黄 0・曲なし**の 5 人編成で
 * アクティブ欄と衣装欄を読んだ 8 件。青も赤もないので production の衣装欄 raw は `0.60 × アクティブ欄 raw`
 * ちょうどになり、**残るのは「表示 0.1 刻みへ落とす位相」だけ**という設計。
 *
 * **アクティブ欄は 8 件すべて実機と一致した**（ユーザー確認）。したがって衣装欄の食い違いは入力ではなく位相の問題。
 *
 * 結論: **欄ごとに独立に切り上げる現行の規則は棄却**。パッシブ支援がない 4 件（K5 / 6 / 7 / 8）で
 * 4/4 外し、「アクティブ欄との差として量子化する」形が 4/4 当てる。
 * 残る食い違いは**パッシブ支援がある編成**に限られる（K6 と 2）。観測は
 * docs/human/repro/display-score-20260915-costume.md。
 */
const holomenMap = buildHolomenMap(realHolomen);
const realCard = (id: string): Card => {
  const c = realCards.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
};
const member = (id: string, bloom: number): Card => {
  const b = cardAtBloomWithProvenance(realCard(id), bloom).card;
  return {
    ...b,
    naturalStats: b.stats,
    boardLive: { activeRatePercent: 0, activeFrequencyPercent: 0 },
  };
};
const ceil1 = (v: number): number => Math.ceil(v * 10 - 1e-9) / 10;
const LEADER = "ouro-kronii-01";

/** [名前, メンバー(カードID, 開花), 実機アクティブ欄, 実機衣装欄] */
const OBSERVED: [string, [string, number][], number, number][] = [
  [
    "1 マリン1 / ロボ子0 / スバル0 / アーニャ0 / レイネ0",
    [
      ["houshou-marine-01", 1],
      ["roboco-san-01", 0],
      ["oozora-subaru-01", 0],
      ["anya-melfissa-01", 0],
      ["pavolia-reine-01", 0],
    ],
    69.3,
    41.5,
  ],
  [
    "2 ロボ子0 / ポルカ0 / リス0 / ビジュー0 / ネリッサ1",
    [
      ["roboco-san-01", 0],
      ["omaru-polka-01", 0],
      ["ayunda-risu-01", 0],
      ["koseki-bijou-01", 0],
      ["nerissa-ravencroft-01", 1],
    ],
    67.3,
    40.6,
  ],
  [
    "3 ぺこら1 / フレア0 / スバル0 / IRyS0 / ビジュー0",
    [
      ["usada-pekora-01", 1],
      ["shiranui-flare-01", 0],
      ["oozora-subaru-01", 0],
      ["irys-01", 0],
      ["koseki-bijou-01", 0],
    ],
    65.8,
    39.5,
  ],
  [
    "6 ぺこら1 / フレア0 / アーニャ0 / こぼ0 / 奏0",
    [
      ["usada-pekora-01", 1],
      ["shiranui-flare-01", 0],
      ["anya-melfissa-01", 0],
      ["kobo-kanaeru-01", 0],
      ["otonose-kanade-02", 0],
    ],
    68.3,
    40.9,
  ],
  [
    "7 ぺこら1 / イオフィ0 / レイネ0 / IRyS0 / 奏0",
    [
      ["usada-pekora-01", 1],
      ["airani-iofifteen-01", 0],
      ["pavolia-reine-01", 0],
      ["irys-01", 0],
      ["otonose-kanade-02", 0],
    ],
    65.3,
    39.1,
  ],
  [
    "8 スバル0 / アキ0 / アーニャ0 / こぼ0 / IRyS0",
    [
      ["oozora-subaru-01", 0],
      ["aki-rosenthal-01", 0],
      ["anya-melfissa-01", 0],
      ["kobo-kanaeru-01", 0],
      ["irys-01", 0],
    ],
    56.6,
    33.9,
  ],
];

const rows = OBSERVED.map(([label, slots, active, costume]) => ({
  label,
  active,
  costume,
  raw: computeDisplayScoreRaw(
    { leader: realCard(LEADER), members: slots.map(([id, b]) => member(id, b)) },
    holomenMap,
    {},
  ),
}));

describe("衣装欄の量子化の位相(2026-09-15 実機 6 編成)", () => {
  it("アクティブ欄は 6 編成すべて実機と一致する(衣装欄の食い違いは入力のせいではない)", () => {
    const mismatched = rows.filter((r) => ceil1(r.raw.active) !== r.active).map((r) => r.label);
    expect(mismatched).toEqual([]);
  });

  it("青 0・赤 0 なので衣装欄 raw は 0.60 × アクティブ欄 raw ちょうど", () => {
    for (const r of rows) {
      expect(Math.abs(r.raw.costume - 0.6 * r.raw.active), r.label).toBeLessThan(1e-9);
    }
  });

  it("パッシブ支援がない編成では、独立に切り上げる現行の規則が 3/3 外れる", () => {
    const noPassive = rows.filter((r) => r.raw.passive === 0);
    expect(noPassive.map((r) => r.label.slice(0, 1))).toEqual(["6", "7", "8"]);
    // 現行の独立量子化は 3 件とも実機より 0.1 高い
    expect(noPassive.map((r) => Math.round((ceil1(r.raw.costume) - r.costume) * 10) / 10)).toEqual([
      0.1, 0.1, 0.1,
    ]);
  });

  it("パッシブ支援がない編成では、アクティブ欄との差として量子化すると 3/3 一致する", () => {
    const marginal = (raw: { active: number; costume: number }): number =>
      Math.round((ceil1(raw.active + raw.costume) - ceil1(raw.active)) * 10) / 10;
    const noPassive = rows.filter((r) => r.raw.passive === 0);
    expect(noPassive.map((r) => marginal(r.raw))).toEqual(noPassive.map((r) => r.costume));
  });

  it("パッシブ支援がある編成は、どちらの位相でも説明しきれない(2 は 0.24 足りない)", () => {
    const withPassive = rows.filter((r) => r.raw.passive > 0);
    expect(withPassive.map((r) => r.label.slice(0, 1))).toEqual(["1", "2", "3"]);
    const two = withPassive.find((r) => r.label.startsWith("2"));
    if (!two) throw new Error("2 がない");
    // 累積(パッシブ → 衣装)で実機 40.6 を出すには衣装欄 raw が 40.5884 以上要るが、モデルは 40.3498
    const needed =
      ceil1(two.raw.active + two.raw.passive) +
      two.costume -
      0.1 -
      two.raw.active -
      two.raw.passive;
    expect(Math.round((needed - two.raw.costume) * 100) / 100).toBe(0.24);
  });
});
