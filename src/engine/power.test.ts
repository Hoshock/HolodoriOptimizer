import { describe, expect, it } from "vite-plus/test";

import { cards as realCards, holomen as realHolomen } from "../data";
import { cardAtBloom } from "../data/bloom";
import type { Card, Holomen, StatBlock } from "../data/types";
import { ceilPercent, computeStaticPower } from "./power";
import type { AccountBonus } from "./power";
import { buildHolomenMap } from "./score";

/**
 * 総合力のゴールデンケース(2026-09-08 ユーザー実機観測。メニューのユニット編成画面の「総合力」とその内訳)。
 *
 * 5 枚のメンバーは全ケース共通。カード詳細画面の P/T/S(青・緑ボード込み)を stats に、開花段階を解決した本体値を
 * naturalStats に置く(resolveCard が返す形と同じ。ボードの解放状況そのものは持たないので、詳細値から増分を得る)。
 *
 * 一致しない項目は「無理に合わせず、どの段階から何点ずれるか」を明記する(ユーザー指示 2026-09-08)。
 * 現状のずれはすべて 0/1凸カードの素値の復元(src/data/bloom.ts の ÷1.1 の丸め、±1)に由来する: 5 人の素値合計が実機の
 * 122533 に対し 122531(−2)で、衣装(素値 × %)とボード増分(詳細値 − 素値)にそのまま伝播する(pending 7)。
 * 素値に依存しないか、切り上げが ±1 を吸収する項目(パッシブ・メモリー・赤ボード・強化ボーナス)は完全一致する。
 */

const holomenMap = buildHolomenMap(realHolomen);
const real = (id: string): Card => {
  const card = realCards.find((c) => c.id === id);
  if (!card) throw new Error(`${id} がない`);
  return card;
};

/** 実機の開花段階に解決し、カード詳細画面の表示値を stats に載せたカード */
function observed(id: string, bloom: number, detail: [number, number, number]): Card {
  const bloomed = cardAtBloom(real(id), bloom);
  return {
    ...bloomed,
    stats: { performance: detail[0], technique: detail[1], sense: detail[2] },
    naturalStats: bloomed.stats,
  };
}

/** 共通メンバー 5 枚(表示順は実機のケース A) */
const members = [
  observed("usada-pekora-01", 1, [10186, 13082, 11037]),
  observed("inugami-korone-02", 2, [10362, 14511, 11707]),
  observed("nekomata-okayu-02", 5, [14902, 11158, 10908]),
  observed("shirakami-fubuki-02", 0, [9468, 10048, 14093]),
  observed("ookami-mio-02", 1, [8308, 12210, 9363]),
];

/** 2026-09-08 のアカウント共通値 */
const account: AccountBonus = { memoryPercent: 6.0, enhancementPercent: 2.96 };

/** ミオ恒常の赤ボード(2026-09-08 時点の解放状況。歌唱者条件の効果は曲未指定のため不発) */
const mioRed = {
  fixed: { performance: 775 + 954, technique: 775 + 954, sense: 640 + 954 } satisfies StatBlock,
  percent: { performance: 6 + 7, technique: 6 + 7, sense: 6 + 7 } satisfies StatBlock,
  scoreSupportPercent: 0,
};

/** 実機値との差を明示して比較する(knownDiff = 0 なら完全一致) */
function expectGolden(
  label: string,
  actual: number,
  observedValue: number,
  knownDiff: number,
): void {
  expect(`${label}: ${String(actual)} (実機 ${String(observedValue)})`).toBe(
    `${label}: ${String(observedValue + knownDiff)} (実機 ${String(observedValue)})`,
  );
}

describe("総合力のゴールデンケース(2026-09-08 実機)", () => {
  it("ケース A: リーダー恒常ミオ(全パラ +50%、赤ボードあり)", () => {
    const b = computeStaticPower({ leader: real("ookami-mio-01"), members }, holomenMap, {
      red: mioRed,
      account,
    });
    expect(b.costumeSkillActive).toBe(true);
    expectGolden("メンバーパラメータ", b.memberParameters, 122533, -2);
    expectGolden("衣装スキル", b.costumeEffect, 61268, 2);
    expectGolden("ホロメンボード効果", b.boardEffect, 90000, 2);
    expectGolden("パッシブスキル", b.passiveEffect, 20340, 0);
    expectGolden("メモリー効果", b.memoryEffect, 7359, 0);
    expectGolden("メンバー強化ボーナス", b.memberEnhancementEffect, 8709, 0);
    expectGolden("総合力", b.totalPower, 310209, 2);
    // 赤ボードだけの増分(ケース B との差)は完全一致
    expectGolden("赤ボード", b.redEffect, 41190, 0);
    // メンバー別の表示値(四捨五入)
    const totals = b.members.map((m) => Math.round(m.total));
    expect(totals).toEqual([63142, 67984, 66570, 56471 + 1, 56042 + 1]);
  });

  it("ケース B: リーダー水着おかゆ(P +135%、赤ボードなし)", () => {
    const b = computeStaticPower({ leader: real("nekomata-okayu-02"), members }, holomenMap, {
      red: null,
      account,
    });
    expect(b.costumeSkillActive).toBe(true);
    expectGolden("メンバーパラメータ", b.memberParameters, 122533, -2);
    expectGolden("衣装スキル", b.costumeEffect, 50166, -1);
    expectGolden("ホロメンボード効果", b.boardEffect, 48810, 2);
    expectGolden("パッシブスキル", b.passiveEffect, 20340, 0);
    expectGolden("メモリー効果", b.memoryEffect, 7359, 0);
    expectGolden("メンバー強化ボーナス", b.memberEnhancementEffect, 7161, 0);
    expectGolden("総合力", b.totalPower, 256369, -1);
    const totals = b.members.map((m) => Math.round(m.total));
    expect(totals).toEqual([51900 - 1, 55625, 60047 - 2, 44613 + 1, 44184 + 1]);
  });

  it("パッシブの内訳: ぺこら自身 24% / ミオのピュア 2 人 T 32% / おかゆのゲーマーズ 2 人 P 43%(P 上位 2 人)", () => {
    const b = computeStaticPower({ leader: real("nekomata-okayu-02"), members }, holomenMap, {
      account,
    });
    const [pekora, korone, okayu, fubuki, mio] = b.members;
    expect(pekora?.passive).toEqual({ performance: 1608, technique: 2329, sense: 1744 });
    // ころねは T 32%(ミオ)と P 43%(おかゆ。ゲーマーズ 4 人のうち P 上位 2 人 = おかゆ・ころね)
    expect(korone?.passive).toEqual({ performance: 2988, technique: 3567, sense: 0 });
    expect(okayu?.passive).toEqual({ performance: 4793, technique: 0, sense: 0 });
    expect(fubuki?.passive).toEqual({ performance: 0, technique: 0, sense: 0 });
    expect(mio?.passive).toEqual({ performance: 0, technique: 3311, sense: 0 });
  });
});

describe("ceilPercent", () => {
  it("切り上げで、浮動小数の上振れで 1 多くならない", () => {
    expect(ceilPercent(6696, 24)).toBe(1608);
    expect(ceilPercent(11145, 50)).toBe(5573);
    expect(ceilPercent(11146, 50)).toBe(5573);
    expect(ceilPercent(2500, 2.96)).toBe(74);
    expect(ceilPercent(0, 50)).toBe(0);
    expect(ceilPercent(1000, 0)).toBe(0);
  });
});

/** 合成データ(素値と詳細値が同じ = ボードなし) */
function makeCard(overrides: {
  id: string;
  holomenId: string;
  type?: Card["type"];
  stats?: Partial<StatBlock>;
  costume?: NonNullable<Card["costumeSkill"]["structured"]>;
  passive?: NonNullable<Card["passiveSkill"]["structured"]>;
}): Card {
  return {
    id: overrides.id,
    name: overrides.id,
    reading: "てすと",
    holomenId: overrides.holomenId,
    rarity: 5,
    type: overrides.type ?? "happy",
    stats: { performance: 1000, technique: 1000, sense: 1000, ...overrides.stats },
    costumeSkill: { raw: "test", structured: overrides.costume ?? null },
    passiveSkill: { raw: "test", structured: overrides.passive ?? null },
    activeSkill: { raw: "test", structured: null },
    specialSkill: { raw: "test", structured: null },
  };
}
const board = { blueSide: "left", lifeSide: "left" } as const;
const synthHolomen: Holomen[] = [
  { id: "h-leader", name: "リーダー", reading: "てすと", affiliations: ["gen0"], board },
  { id: "h1", name: "メンバー1", reading: "てすと", affiliations: ["gen0"], board },
  { id: "h2", name: "メンバー2", reading: "てすと", affiliations: ["gen0"], board },
  { id: "h3", name: "メンバー3", reading: "てすと", affiliations: ["gen1"], board },
  { id: "h4", name: "メンバー4", reading: "てすと", affiliations: ["gen1"], board },
  { id: "h5", name: "メンバー5", reading: "てすと", affiliations: ["gamers"], board },
  { id: "h6", name: "メンバー6", reading: "てすと", affiliations: ["gamers"], board },
];
const synthMap = buildHolomenMap(synthHolomen);
const plainMembers = ["h1", "h2", "h3", "h4", "h5"].map((h) =>
  makeCard({ id: `m-${h}`, holomenId: h }),
);

describe("computeStaticPower(合成データ)", () => {
  it("スキル・ボード・アカウント補正なしならメンバー 5 人の素値合計で、リーダーは加算されない", () => {
    const leader = makeCard({ id: "leader", holomenId: "h-leader", stats: { performance: 9000 } });
    const b = computeStaticPower({ leader, members: plainMembers }, synthMap);
    expect(b.totalPower).toBe(15000);
    expect(b.memberParameters).toBe(15000);
    expect(b.costumeEffect).toBe(0);
    expect(b.boardEffect).toBe(0);
    expect(b.costumeSkillActive).toBe(false);
  });

  it("衣装スキルは条件成立時だけ、素値 × % をメンバー × パラメータごとに切り上げて加算する(連鎖乗算しない)", () => {
    const leader = makeCard({
      id: "leader",
      holomenId: "h-leader",
      costume: {
        condition: { kind: "affiliationCount", affiliation: "gen0", min: 2 },
        effects: [{ kind: "paramUp", target: { kind: "all" }, param: "all", percent: 50 }],
      },
    });
    const met = computeStaticPower({ leader, members: plainMembers }, synthMap);
    expect(met.costumeSkillActive).toBe(true);
    expect(met.costumeEffect).toBe(7500);
    expect(met.totalPower).toBe(22500);
    const unmet = computeStaticPower(
      {
        leader,
        members: [
          plainMembers[0]!,
          plainMembers[2]!,
          plainMembers[3]!,
          plainMembers[4]!,
          makeCard({ id: "m-h6", holomenId: "h6" }),
        ],
      },
      synthMap,
    );
    expect(unmet.costumeSkillActive).toBe(false);
    expect(unmet.totalPower).toBe(15000);
  });

  it("「◯◯2人の」は条件に合うメンバーのうち対象パラメータの素値が高い 2 人にだけ効く", () => {
    const buffer = makeCard({
      id: "buffer",
      holomenId: "h1",
      passive: {
        condition: { kind: "always" },
        effects: [
          {
            kind: "paramUp",
            target: { kind: "affiliation", affiliation: "gen1", count: 1 },
            param: "sense",
            percent: 40,
          },
        ],
      },
    });
    const members = [
      buffer,
      makeCard({ id: "m2", holomenId: "h2" }),
      makeCard({ id: "m3", holomenId: "h3", stats: { sense: 1500 } }), // gen1: 上位
      makeCard({ id: "m4", holomenId: "h4", stats: { sense: 1400 } }), // gen1: 選ばれない
      makeCard({ id: "m5", holomenId: "h5" }),
    ];
    const b = computeStaticPower(
      { leader: makeCard({ id: "leader", holomenId: "h-leader" }), members },
      synthMap,
    );
    expect(b.passiveEffect).toBe(600);
    expect(b.members[2]?.passive.sense).toBe(600);
    expect(b.members[3]?.passive.sense).toBe(0);
  });

  it("赤ボードは固定値をメンバー各自に、割合は 5 人の素値合計に掛けて切り上げる(パッシブや衣装と掛け合わせない)", () => {
    const leader = makeCard({
      id: "leader",
      holomenId: "h-leader",
      costume: {
        condition: { kind: "always" },
        effects: [{ kind: "paramUp", target: { kind: "all" }, param: "all", percent: 50 }],
      },
    });
    const red = {
      fixed: { performance: 100, technique: 0, sense: 50 },
      percent: { performance: 10, technique: 0, sense: 0 },
      scoreSupportPercent: 0,
    };
    const b = computeStaticPower({ leader, members: plainMembers }, synthMap, { red });
    expect(b.redApplied).toBe(true);
    expect(b.redEffect).toBe(5 * 150 + 500);
    expect(b.costumeEffect).toBe(7500); // 赤の固定値には掛からない
    expect(b.totalPower).toBe(15000 + 7500 + 1250);
  });

  it("メモリーはメンバー × パラメータごとに切り上げ、強化ボーナスはメモリーを含まない基準にメンバーごとに切り上げる", () => {
    const leader = makeCard({ id: "leader", holomenId: "h-leader" });
    const members = plainMembers.map((m) => ({
      ...m,
      stats: { performance: 1001, technique: 1001, sense: 1001 },
    }));
    const b = computeStaticPower({ leader, members }, synthMap, {
      account: { memoryPercent: 6, enhancementPercent: 3 },
    });
    // 1001 × 6% = 60.06 → 61 が 15 個
    expect(b.memoryEffect).toBe(15 * 61);
    // 3003 × 3% = 90.09 → 91 が 5 人(メモリーを基準に含めると 3003 + 183 = 3186 × 3% → 96)
    expect(b.memberEnhancementEffect).toBe(5 * 91);
    expect(b.totalPower).toBe(15015 + 915 + 455);
  });

  it("青・緑ボードの増分は詳細値 − 素値で、割合効果の基準にはならない", () => {
    const leader = makeCard({
      id: "leader",
      holomenId: "h-leader",
      costume: {
        condition: { kind: "always" },
        effects: [{ kind: "paramUp", target: { kind: "all" }, param: "performance", percent: 100 }],
      },
    });
    const members = plainMembers.map((m) => ({
      ...m,
      stats: { performance: 1300, technique: 1000, sense: 1000 },
      naturalStats: { performance: 1000, technique: 1000, sense: 1000 },
    }));
    const b = computeStaticPower({ leader, members }, synthMap);
    expect(b.blueGreenEffect).toBe(1500);
    expect(b.costumeEffect).toBe(5000);
    expect(b.totalPower).toBe(15000 + 1500 + 5000);
  });
});
