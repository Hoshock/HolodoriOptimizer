import { describe, expect, it } from "vite-plus/test";

import { cards as realCards, holomen as realHolomen } from "../data";
import { cardAtBloom } from "../data/bloom";
import type { RedBoardEffects } from "../data/redBoard";
import { redUnitEffects } from "../data/redBoard";
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
 * 122533 に対し 122531(−2)で、衣装(素値 × %)とボード増分(詳細値 − 素値)にそのまま伝播する(pending.md「赤割合効果の丸め単位」)。
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

  it("パッシブの内訳: ぺこら自身 24% / ミオのピュア 2 人 T 32% / おかゆのゲーマーズ 2 人 P 43%(素値合計の上位 2 人 = おかゆ・ころね)", () => {
    const b = computeStaticPower({ leader: real("nekomata-okayu-02"), members }, holomenMap, {
      account,
    });
    const [pekora, korone, okayu, fubuki, mio] = b.members;
    expect(pekora?.passive).toEqual({ performance: 1608, technique: 2329, sense: 1744 });
    // ころねは T 32%(ミオ)と P 43%(おかゆ。ゲーマーズ 3 人のうち素値合計の上位 2 人 = おかゆ・ころね。P 上位・編成順の先頭とも同じ集合)
    expect(korone?.passive).toEqual({ performance: 2988, technique: 3567, sense: 0 });
    expect(okayu?.passive).toEqual({ performance: 4793, technique: 0, sense: 0 });
    expect(fubuki?.passive).toEqual({ performance: 0, technique: 0, sense: 0 });
    expect(mio?.passive).toEqual({ performance: 0, technique: 3311, sense: 0 });
  });
});

/**
 * 赤の歌唱者条件のゴールデン(2026-09-11 ユーザー実機観測。観測値の全文は docs/human/repro/display-score-20260908-11.md「2026-09-11: 赤の歌唱者条件」)。
 *
 * 同じメンバー 5 枚(2026-09-08 と同じカード・開花)、リーダーは水着ミオ(ookami-mio-02。ピュア 2 人以上で全員の T +130%)で、
 * 曲だけを ぺこらソロ(歌唱者条件 OFF)と ミオソロ(ON)に変えた 2 点。赤ボードの現在値はユーザーがゲーム内の集計表示で確認した
 * 値をそのまま使う(全パラ +784・+6%、S +640 +7%、P +775 +7%、T +775 +7%、歌唱者条件 P/T/S 各 +10%)。
 *
 * この観測時点の青・緑ボードの解放状態は共有されていない(2026-09-08 のカード詳細値を使うと ボード効果 と 強化ボーナス、総合力 が
 * その差のぶん低く出る — 実機のボード効果 90,130 から逆算すると青・緑の増分は 51,490 で、09-08 の 48,810 より 2,680 増えている)。
 * そのため絶対値のゴールデンは青・緑に依存しない 4 項目(メンバーパラメータ・衣装・パッシブ・メモリー)だけにし、
 * 歌唱者条件の効果は **OFF → ON の差分**(ボード効果 +12,251・強化ボーナス +367・総合力 +12,618・メンバー別表示値の差)で固定する。
 * 差分は青・緑の状態に(強化ボーナスの切り上げ位置以外)依存しない。
 *
 * 強化ボーナスの % は 2026-09-08 時点の 2.96% ではなく **3.00%**(2026-09-11 のアカウント現在値。ユーザー確認済み): 実機の
 * 8,787(OFF)/ 9,154(ON)/ 7,306(黄の観測)はいずれも基準(メモリー抜きの合計)の 3.00% にメンバーごとの切り上げ(+0〜5)で
 * 整合し、2.96% では 100〜120 点足りない(切り上げでは埋まらない)。内訳からの逆算とアカウント画面が一致した(docs/human/repro/display-score-20260908-11.md「観測時点のアカウント値」)。
 * ゴールデンの実機値はモデルに合わせて変えない(.claude/rules/game-facts.md)。
 */
describe("赤の歌唱者条件のゴールデン(2026-09-11 実機 A / B)", () => {
  /** 実機の表示順: おかゆ / ころね / ミオ / フブキ / ぺこら */
  const members2 = [
    observed("nekomata-okayu-02", 5, [14902, 11158, 10908]),
    observed("inugami-korone-02", 2, [10362, 14511, 11707]),
    observed("ookami-mio-02", 1, [8308, 12210, 9363]),
    observed("shirakami-fubuki-02", 0, [9468, 10048, 14093]),
    observed("usada-pekora-01", 1, [10186, 13082, 11037]),
  ];
  const account2: AccountBonus = { memoryPercent: 6.0, enhancementPercent: 3.0 };
  /** 水着ミオの赤ボードの現在値(ゲーム内の集計表示の転記。歌唱者条件 OFF / ON) */
  const redBoard: RedBoardEffects = {
    allParams: 784,
    params: { performance: 775, technique: 775, sense: 640 },
    allPercent: 6,
    percents: { performance: 7, technique: 7, sense: 7 },
    singerPercents: { performance: 10, technique: 10, sense: 10 },
    scoreSupportPercent: 28.1,
    singerScoreSupportPercent: 24,
    life: 0,
    rewards: { memberExp: 0, gold: 0 },
    judgement: "none",
    lifeRecovery: false,
  };
  const redOff = redUnitEffects(redBoard, false);
  const redOn = redUnitEffects(redBoard, true);
  const leader = real("ookami-mio-02");
  const off = computeStaticPower({ leader, members: members2 }, holomenMap, {
    red: redOff,
    account: account2,
  });
  const on = computeStaticPower({ leader, members: members2 }, holomenMap, {
    red: redOn,
    account: account2,
  });

  it("歌唱者条件は redUnitEffects の singer フラグで P/T/S の割合 13% → 23%・スコアサポート 28.1% → 52.1% になる", () => {
    expect(redOff).toEqual({
      fixed: { performance: 1559, technique: 1559, sense: 1424 },
      percent: { performance: 13, technique: 13, sense: 13 },
      scoreSupportPercent: 28.1,
    });
    expect(redOn).toEqual({
      fixed: { performance: 1559, technique: 1559, sense: 1424 },
      percent: { performance: 23, technique: 23, sense: 23 },
      scoreSupportPercent: 52.1,
    });
  });

  it("A(歌唱者条件 OFF): 青・緑に依存しない 4 項目は実機と一致する(素値の復元誤差 −2 は既知)", () => {
    expect(off.costumeSkillActive).toBe(true);
    expectGolden("メンバーパラメータ", off.memberParameters, 122533, -2);
    // 衣装 T +130%: メンバーごとに ceil(素値 T × 1.3)。120% なら 55,205 で約 4,600 足りない(130% で確定)
    expectGolden("衣装スキル", off.costumeEffect, 59810, -2);
    expectGolden("パッシブスキル", off.passiveEffect, 20340, 0);
    expectGolden("メモリー効果", off.memoryEffect, 7359, 0);
    // 赤の分(モデル)。実機のボード効果 90,130 − 38,640 = 51,490 が観測時点の青・緑の増分の逆算値(未共有)
    expect(off.redEffect).toBe(38640);
  });

  it("B(歌唱者条件 ON): 4 項目は A と同じで、赤の割合だけが 23% になる", () => {
    expectGolden("メンバーパラメータ", on.memberParameters, 122533, -2);
    expectGolden("衣装スキル", on.costumeEffect, 59810, -2);
    expectGolden("パッシブスキル", on.passiveEffect, 20340, 0);
    expectGolden("メモリー効果", on.memoryEffect, 7359, 0);
    expect(on.redEffect).toBe(50893);
    expect(on.blueGreenEffect).toBe(off.blueGreenEffect);
  });

  it("OFF → ON の差分: ボード効果 +12,251(モデル +12,253。素値 ±1 では埋まらない既知のずれ)・強化 +367・総合力 +12,618", () => {
    // 歌唱者条件の P/T/S +10% は総合力のホロメンボード効果に入り、強化ボーナスの基準にも入る(実機確定)
    expectGolden("ボード効果の増分", on.boardEffect - off.boardEffect, 12251, 2);
    expectGolden(
      "強化ボーナスの増分",
      on.memberEnhancementEffect - off.memberEnhancementEffect,
      367,
      0,
    );
    expectGolden("総合力の増分", on.totalPower - off.totalPower, 12618, 2);
    // 増分はボードと強化だけ(他の 4 項目は不変)
    expect(on.memberParameters).toBe(off.memberParameters);
    expect(on.costumeEffect).toBe(off.costumeEffect);
    expect(on.passiveEffect).toBe(off.passiveEffect);
    expect(on.memoryEffect).toBe(off.memoryEffect);
    // 参考: 差分を単純に ceil(122,533 × 10%) = 12,254 と比べてはいけない。通常時すでに 13% が入っているので
    // 差は f(23%) − f(13%) であり、このモデルでは 12,253
    expect(ceilPercent(122533, 10)).toBe(12254);
  });

  it("メンバー別表示値の差(実機 2669 / 2669 / 2420 / 2423 / 2437)はモデルと ±1 以内", () => {
    // メンバーごとの赤の割合分は小数のまま持ち、表示値は四捨五入。強化ボーナスの切り上げ位置は青・緑の状態で
    // 1 変わりうるので、ここは ±1 を許容する(値を合わせるための補正は入れない)
    const observedDelta = [2669, 2669, 2420, 2423, 2437];
    const modelDelta = on.members.map(
      (m, i) => Math.round(m.total) - Math.round(off.members[i]?.total ?? 0),
    );
    expect(modelDelta).toEqual([2670, 2669, 2421, 2422, 2437]);
    modelDelta.forEach((d, i) => {
      expect(Math.abs(d - (observedDelta[i] ?? 0)), members2[i]?.id).toBeLessThanOrEqual(1);
    });
    // メンバー別の差の合計 = 総合力の増分(実機 12,618)
    expect(observedDelta.reduce((a, b) => a + b, 0)).toBe(12618);
  });

  it("強化ボーナスは 3.00%(アカウント現在値)で実機と切り上げの範囲で整合し、09-08 時点の 2.96% では 100 点以上足りない", () => {
    // 実機の内訳から基準(メモリー抜きの合計)を出し、メンバーごとの切り上げ(+0〜5)の範囲に入るかを見る
    const baseOff = 122533 + 59810 + 90130 + 20340;
    const baseOn = 122533 + 59810 + 102381 + 20340;
    for (const [base, observedValue] of [
      [baseOff, 8787],
      [baseOn, 9154],
    ] as const) {
      const exact300 = (base * 3.0) / 100;
      expect(observedValue).toBeGreaterThanOrEqual(Math.floor(exact300));
      expect(observedValue).toBeLessThanOrEqual(Math.ceil(exact300) + 5);
      const exact296 = (base * 2.96) / 100;
      expect(observedValue - exact296).toBeGreaterThan(100);
    }
  });
});

/**
 * 赤 R-001「全員の全パラメータ +50」の総合力への効き(2026-09-11 ユーザー実機観測。水着おかゆリーダー、同じメンバー 5 枚、曲なし):
 * 総合力 258,144 → 258,917(+773)= ホロメンボード効果 50,440 → 51,190(+750 = 5 人 × 3 パラメータ × 50)+ 強化ボーナス
 * 7,306 → 7,329(+23 ≈ 3.00% × 750 = 22.5 のメンバーごとの切り上げ)。他 4 項目は不変。R-002(歌唱者条件のスコアサポート)は
 * 曲なしでは不発で総合力にも入らない。観測時点の青・緑は未共有なので、既存の加算モデルの差分だけを固定する(式は変更なし)
 */
describe("赤 R-001 全員の全パラ +50 の差分(2026-09-11 実機: ボード +750・強化 +23・総合力 +773)", () => {
  const members2 = [
    observed("nekomata-okayu-02", 5, [14902, 11158, 10908]),
    observed("inugami-korone-02", 2, [10362, 14511, 11707]),
    observed("ookami-mio-02", 1, [8308, 12210, 9363]),
    observed("shirakami-fubuki-02", 0, [9468, 10048, 14093]),
    observed("usada-pekora-01", 1, [10186, 13082, 11037]),
  ];
  const account2: AccountBonus = { memoryPercent: 6.0, enhancementPercent: 3.0 };
  const leader = real("nekomata-okayu-02");
  const plain = computeStaticPower({ leader, members: members2 }, holomenMap, {
    red: null,
    account: account2,
  });
  const r001 = computeStaticPower({ leader, members: members2 }, holomenMap, {
    red: {
      fixed: { performance: 50, technique: 50, sense: 50 },
      percent: { performance: 0, technique: 0, sense: 0 },
      scoreSupportPercent: 0,
    },
    account: account2,
  });

  it("固定値 +50 はメンバー 5 人 × 3 パラメータにそのまま足され、ボード効果 +750(実機と完全一致)", () => {
    expectGolden("ボード効果の増分", r001.boardEffect - plain.boardEffect, 750, 0);
    expect(r001.redEffect).toBe(750);
    expect(r001.memberParameters).toBe(plain.memberParameters);
    expect(r001.costumeEffect).toBe(plain.costumeEffect);
    expect(r001.passiveEffect).toBe(plain.passiveEffect);
    expect(r001.memoryEffect).toBe(plain.memoryEffect);
  });

  it("強化ボーナスの増分は 3.00% × 150 = 4.5 のメンバーごとの切り上げの差で +20〜+25。モデル +22(実機 +23。切り上げ位置は青・緑の状態で変わる)", () => {
    const enhancement = r001.memberEnhancementEffect - plain.memberEnhancementEffect;
    expectGolden("強化ボーナスの増分", enhancement, 23, -1);
    expect(enhancement).toBeGreaterThanOrEqual(Math.floor(750 * 0.03) - 2);
    expect(enhancement).toBeLessThanOrEqual(Math.ceil(750 * 0.03) + 2);
    expectGolden("総合力の増分", r001.totalPower - plain.totalPower, 773, -1);
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
      makeCard({ id: "m3", holomenId: "h3", stats: { sense: 1500 } }), // gen1: S は高いが素値合計 3500 → 選ばれない
      makeCard({ id: "m4", holomenId: "h4", stats: { performance: 3000, sense: 1400 } }), // gen1: 素値合計 5400 → 選ばれる
      makeCard({ id: "m5", holomenId: "h5" }),
    ];
    const b = computeStaticPower(
      { leader: makeCard({ id: "leader", holomenId: "h-leader" }), members },
      synthMap,
    );
    // 対象は「対象パラメータの上位」でも「編成順の先頭」でもなく素値合計の上位 count 人(2026-09-12 実機。下の水着フワワリーダーのゴールデン)
    expect(b.passiveEffect).toBe(560);
    expect(b.members[2]?.passive.sense).toBe(0);
    expect(b.members[3]?.passive.sense).toBe(560);
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

/**
 * 水着フワワリーダーの 5 人(2026-09-12 ユーザー実機観測。観測値の全文は docs/human/repro/display-score-20260912.md「水着フワワリーダーの初観測」)。
 * リーダー 水着フワワ 0凸、メンバー 水着フワワ 0凸・水着おかゆ 5凸・水着ころね 2凸・水着みこ 1凸・水着ミオ 1凸(この並び)。
 * 実機の総合力 274,687 = メンバー 122,582 / 衣装 36,783 / ボード 75,674 / パッシブ 24,500 / メモリー 7,360 / 強化 7,788。
 *
 * パッシブが決め手: 「ピュアタイプ 2 人の P 32%」(みこ)と「ピュアタイプ 2 人の T 32%」(ミオ)の対象を**対象パラメータの上位 2 人**
 * にすると 26,688(+2,188)で合わず、**素値合計の上位 2 人のピュア(ころね 25,920・フワワ 23,663)**にすると 24,501 で一致する
 * (みこ分 1,020 + ミオ分 1,168 = 2,188)。編成順を みこ・ミオ・フワワ・おかゆ・ころね に入れ替えても実機は 24,500 のままなので
 * 「編成順の先頭 2 人」(23,946)ではない。青・緑ボードに依存しない 4 項目(メンバーパラメータ・衣装・パッシブ・メモリー)をここで固定する
 * (ボードと強化ボーナスは docs/human/repro/20260912-account-snapshot.md の JSON 全体を入力にした再計算で 75,676 / 7,788 と一致 — 総合力 274,687)。
 */
describe("水着フワワリーダーの 5 人(2026-09-12 実機。「◯◯2人の」は素値合計の上位 2 人)", () => {
  const at = (id: string, bloom: number): Card => {
    const bloomed = cardAtBloom(real(id), bloom);
    return { ...bloomed, naturalStats: bloomed.stats };
  };
  const fuwawaMembers = [
    at("fuwawa-abyssgard-02", 0),
    at("nekomata-okayu-02", 5),
    at("inugami-korone-02", 2),
    at("sakura-miko-02", 1),
    at("ookami-mio-02", 1),
  ];
  const fuwawaAccount: AccountBonus = { memoryPercent: 6.0, enhancementPercent: 3.0 };

  it("メンバーパラメータ 122,580 / 衣装 36,782 / パッシブ 24,501 / メモリー 7,360(実機 122,582 / 36,783 / 24,500 / 7,360)", () => {
    const b = computeStaticPower(
      { leader: real("fuwawa-abyssgard-02"), members: fuwawaMembers },
      holomenMap,
      { account: fuwawaAccount },
    );
    expect(b.memberParameters).toBe(122580);
    expect(b.costumeEffect).toBe(36782);
    expect(b.passiveEffect).toBe(24501);
    expect(b.memoryEffect).toBe(7360);
    expect(Math.abs(b.memberParameters - 122582)).toBeLessThanOrEqual(2);
    expect(Math.abs(b.costumeEffect - 36783)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.passiveEffect - 24500)).toBeLessThanOrEqual(1);
  });

  it("編成順を みこ・ミオ・フワワ・おかゆ・ころね に入れ替えてもパッシブは 24,501 のまま(実機 24,500。編成順の先頭 2 人なら 23,946)", () => {
    const swapped = [
      fuwawaMembers[3]!,
      fuwawaMembers[4]!,
      fuwawaMembers[0]!,
      fuwawaMembers[1]!,
      fuwawaMembers[2]!,
    ];
    const b = computeStaticPower(
      { leader: real("fuwawa-abyssgard-02"), members: swapped },
      holomenMap,
      { account: fuwawaAccount },
    );
    expect(b.passiveEffect).toBe(24501);
    expect(b.memberParameters).toBe(122580);
  });

  it("パッシブの内訳: フワワ自身 24% + みこの P 32% + ミオの T 32%、ころねに おかゆの P 43% + みこの P 32% + ミオの T 32%、みこ・ミオ自身には入らない", () => {
    const b = computeStaticPower(
      { leader: real("fuwawa-abyssgard-02"), members: fuwawaMembers },
      holomenMap,
      { account: fuwawaAccount },
    );
    const [fuwawa, okayu, korone, miko, mio] = b.members;
    expect(fuwawa?.passive).toEqual({ performance: 5434, technique: 3751, sense: 1744 });
    expect(okayu?.passive).toEqual({ performance: 4793, technique: 0, sense: 0 });
    expect(korone?.passive).toEqual({ performance: 5212, technique: 3567, sense: 0 });
    expect(miko?.passive).toEqual({ performance: 0, technique: 0, sense: 0 });
    expect(mio?.passive).toEqual({ performance: 0, technique: 0, sense: 0 });
  });
});
