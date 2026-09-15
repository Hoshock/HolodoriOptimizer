import { describe, expect, it } from "vite-plus/test";

import { cards as realCards, holomen as realHolomen } from "../data";
import { cardAtBloomWithProvenance } from "../data/bloom";
import type { Card } from "../data/types";
import {
  compileDisplayMember,
  createDisplayMemberPart,
  createDisplayScratch,
  prepareDisplay,
} from "./displayScore";
import { buildAffIndex, NO_ACCOUNT_BONUS } from "./power";
import { buildHolomenMap } from "./score";

/**
 * **3 欄の配賦と 0.1% 量子化の位相（2026-09-15 実機・青 0 / 赤 0 / 黄 0 / 曲なし）。**
 *
 * リーダーを 典獄クロニー（全員のスコアサポート 60%）にした 12 編成と、同じメンバーでリーダーだけ
 * 恒常みこ 0凸（スコアサポート 0）に替えた 6 編成の baseline。青も赤もないので **ボード欄は 0**、
 * 表示は 衣装 / アクティブ / パッシブ / SP の 4 欄に縮退し、内部の自由度は
 * 「総量 `T` を 衣装 と パッシブ へどう割るか」と「0.1% へ落とす位相」の 2 つだけになる。
 *
 * 確定していること（このファイルで固定する）:
 * 1. アクティブ欄・SP 欄・合計は 12 件すべて一致する。`ΔP`（パッシブのスコアサポートがタイムラインへ足す量）も
 *    みこ側の baseline 6 件で一致するので、総量 `T = 0.60 × A + ΔP` は正しい。
 * 2. パッシブ支援の**対象選抜**は みこ側のパッシブ欄で決まる（S2 だけ 2 通り残るが結論は変わらない）。
 * 3. **位相は 1 通りしか残らない**: 衣装欄は「アクティブ欄との差」`ceil(A + C) − ceil(A)`、パッシブ欄は素の `ceil(P)`。
 *    欄ごとの規則（独立 / 差分 × 切り上げ / 切り捨て / 四捨五入）と累積順序を総当たりしても、他はすべてどこかで両立不能。
 * 4. その位相のもとで**現行の重み `W_P = ΔP` は 8 件中 6 件を外す**。実機は リーダー支援を足すとパッシブ欄を動かすが、
 *    production は `W_C = 0.60 × H_C` と `W_P = ΔP` が約分されて動かない。
 * 4b. **`W_C` はリーダーのスコアサポート % に比例する**。同じ S1 / S2 / S3 を 恒常ぺこら（25%）で読むと、
 *    60% で測った「支援を受けるメンバーが重み全体に占める割合 `f`」がそのまま通る（要求区間が 3/3 で交わる）。
 *    予測を先に出してから読んだ out-of-sample の一致で、現行モデルは同じ 3 件のうち S2 / S3 を外す。
 *    したがって残る不定性は**メンバーごとの重み `w_i` の形だけ**（表示の重み = `Σ (支援%/100) × w_i`）。
 * 5. 棄却済み: 定数倍 `W_P = k × ΔP`（1 と S3 で符号が逆）、メンバーごとの `g(s)` 型（編成 2 と S4 が入らない）、
 *    `ΔP` や `ΔP / A` の単調関数（編成 2 < S3 で向きが逆）、`w_i` を 取り分 / 一様 / スコアUP% / 発動確率 /
 *    正規化なしの寄与 / 発動候補秒 / 候補の均等割り に替える形（どれも 8 件中 0〜2 件）。
 *
 * 観測は docs/human/repro/display-score-20260915-costume.md。実測値はモデルに合わせて変えない。
 */
const holomenMap = buildHolomenMap(realHolomen);
const affIndex = buildAffIndex(holomenMap);
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
const LEADER_SUPPORT_PERCENT = 60;
/**
 * 同じメンバーでリーダーだけ **恒常ぺこら（スコアサポート 25%）** にした実機（2026-09-15）。
 * 60% で測った重みの割合 `f` を据え置いた予測（S2 16.5 / 4.3、S3 15.0 / 5.7〜5.8、S1 は現行モデルと同値）を
 * **事前に出してから読んだ** 3 件で、実機は 3/3 でそちらに一致した（現行モデルは S2 16.3 / 4.4、S3 14.5 / 6.2）。
 */
const PEKORA_25_PERCENT = 25;
const PEKORA_25: Record<string, [costume: number, passive: number]> = {
  S1: [16.6, 2.3],
  S2: [16.5, 4.3],
  S3: [15.0, 5.8],
};

/** [ラベル, メンバー, 実機アクティブ欄, 実機衣装欄(クロニー), 実機パッシブ欄(クロニー), 実機パッシブ欄(みこ)] */
type Observed = [string, [string, number][], number, number, number, number | null];
const OBSERVED: Observed[] = [
  [
    "1",
    [
      ["houshou-marine-01", 1],
      ["roboco-san-01", 0],
      ["oozora-subaru-01", 0],
      ["anya-melfissa-01", 0],
      ["pavolia-reine-01", 0],
    ],
    69.3,
    41.5,
    2.5,
    2.4,
  ],
  [
    "2",
    [
      ["roboco-san-01", 0],
      ["omaru-polka-01", 0],
      ["ayunda-risu-01", 0],
      ["koseki-bijou-01", 0],
      ["nerissa-ravencroft-01", 1],
    ],
    67.3,
    40.6,
    8.6,
    8.8,
  ],
  [
    "3",
    [
      ["usada-pekora-01", 1],
      ["shiranui-flare-01", 0],
      ["oozora-subaru-01", 0],
      ["irys-01", 0],
      ["koseki-bijou-01", 0],
    ],
    65.8,
    39.5,
    2.1,
    null,
  ],
  [
    "6",
    [
      ["usada-pekora-01", 1],
      ["shiranui-flare-01", 0],
      ["anya-melfissa-01", 0],
      ["kobo-kanaeru-01", 0],
      ["otonose-kanade-02", 0],
    ],
    68.3,
    40.9,
    0,
    null,
  ],
  [
    "7",
    [
      ["usada-pekora-01", 1],
      ["airani-iofifteen-01", 0],
      ["pavolia-reine-01", 0],
      ["irys-01", 0],
      ["otonose-kanade-02", 0],
    ],
    65.3,
    39.1,
    0,
    null,
  ],
  [
    "8",
    [
      ["oozora-subaru-01", 0],
      ["aki-rosenthal-01", 0],
      ["anya-melfissa-01", 0],
      ["kobo-kanaeru-01", 0],
      ["irys-01", 0],
    ],
    56.6,
    33.9,
    0,
    null,
  ],
  [
    "K5",
    [
      ["tokino-sora-01", 0],
      ["aki-rosenthal-01", 0],
      ["oozora-subaru-01", 0],
      ["shiranui-flare-01", 0],
      ["shishiro-botan-01", 0],
    ],
    63.3,
    37.9,
    0,
    null,
  ],
  [
    "K6",
    [
      ["tokino-sora-01", 0],
      ["aki-rosenthal-01", 0],
      ["oozora-subaru-01", 0],
      ["shiranui-flare-01", 0],
      ["houshou-marine-01", 1],
    ],
    73.7,
    44.3,
    2.9,
    null,
  ],
  [
    "S1",
    [
      ["roboco-san-01", 0],
      ["pavolia-reine-01", 0],
      ["oozora-subaru-01", 0],
      ["anya-melfissa-01", 0],
      ["otonose-kanade-02", 0],
    ],
    66.2,
    39.8,
    2.3,
    2.3,
  ],
  [
    "S2",
    [
      ["roboco-san-01", 0],
      ["omaru-polka-01", 0],
      ["oozora-subaru-01", 0],
      ["anya-melfissa-01", 0],
      ["otonose-kanade-02", 0],
    ],
    65.4,
    39.4,
    4.3,
    4.4,
  ],
  [
    "S3",
    [
      ["roboco-san-01", 0],
      ["omaru-polka-01", 0],
      ["ayunda-risu-01", 0],
      ["oozora-subaru-01", 0],
      ["anya-melfissa-01", 0],
    ],
    58.0,
    35.4,
    5.7,
    6.2,
  ],
  [
    "S4",
    [
      ["roboco-san-01", 0],
      ["pavolia-reine-01", 0],
      ["koseki-bijou-01", 0],
      ["nerissa-ravencroft-01", 1],
      ["oozora-subaru-01", 0],
    ],
    67.3,
    40.5,
    4.4,
    4.4,
  ],
];

interface Row {
  label: string;
  activeObs: number;
  costumeObs: number;
  passiveObs: number;
  passiveBaselineObs: number | null;
  /** アクティブ欄 raw */
  a: number;
  /** パッシブのスコアサポートがタイムラインへ足す量 */
  dp: number;
  /** メンバーごとのパッシブ支援(%) */
  support: number[];
  /** `H_C` のメンバーごとの取り分(production の重みの材料) */
  share: number[];
}

const rows: Row[] = OBSERVED.map(([label, slots, activeObs, costumeObs, passiveObs, base]) => {
  const views = slots.map(([id, b]) =>
    compileDisplayMember(member(id, b), holomenMap, affIndex, NO_ACCOUNT_BONUS, 200),
  );
  const typeCounts = new Int32Array(3);
  const affCounts = new Int32Array(affIndex.size);
  for (const v of views) {
    typeCounts[v.typeIndex] = (typeCounts[v.typeIndex] ?? 0) + 1;
    for (const x of v.affIndices) affCounts[x] = (affCounts[x] ?? 0) + 1;
  }
  const scratch = createDisplayScratch();
  const part = createDisplayMemberPart();
  prepareDisplay(views, typeCounts, affCounts, scratch, part, 200);
  return {
    label,
    activeObs,
    costumeObs,
    passiveObs,
    passiveBaselineObs: base,
    a: part.active,
    dp: part.withPassive - part.blue,
    support: Array.from(scratch.passiveSupport.slice(0, slots.length)),
    share: Array.from(part.costumeShare.slice(0, slots.length)),
  };
});
const withPassive = rows.filter((r) => r.dp > 0);
const totalOf = (r: Row, leaderPercent: number = LEADER_SUPPORT_PERCENT): number =>
  (leaderPercent / 100) * r.a + r.dp;
/** その編成で支援を受けるメンバーの合計支援 %（S 系列はどのメンバーも同じ値） */
const supportPercentOf = (r: Row): number => Math.max(...r.support);

const ceil1 = (v: number): number => Math.ceil(v * 10 - 1e-9) / 10;
const floor1 = (v: number): number => Math.floor(v * 10 + 1e-9) / 10;
const round1s = (v: number): number => Math.round(v * 10 + 1e-9) / 10;
const d1 = (v: number): number => Math.round(v * 10) / 10;
const QUANT = { 切り上げ: ceil1, 切り捨て: floor1, 四捨五入: round1s };
/** 1 欄ぶんの位相: raw を 0.1% へ落とす規則（独立 / アクティブ欄との差） */
const COLUMN_PHASES: Record<string, (a: number, x: number) => number> = {};
for (const [name, q] of Object.entries(QUANT)) {
  COLUMN_PHASES[`独立-${name}`] = (_a, x) => q(x);
  COLUMN_PHASES[`差分-${name}`] = (a, x) => (x === 0 ? 0 : d1(q(a + x) - q(a)));
}

/** 位相 `(衣装, パッシブ)` のもとで、実機 2 欄と両立する「パッシブの取り分」φ = P / T の区間 */
function feasiblePassiveShare(
  r: Row,
  phaseCostume: (a: number, x: number) => number,
  phasePassive: (a: number, x: number) => number,
  observed: [number, number] = [r.costumeObs, r.passiveObs],
  leaderPercent: number = LEADER_SUPPORT_PERCENT,
): [number, number] | null {
  const t = totalOf(r, leaderPercent);
  let lo: number | null = null;
  let hi = 0;
  for (let k = 0; k <= 40000; k++) {
    const phi = k / 40000;
    const p = t * phi;
    if (
      Math.abs(phaseCostume(r.a, t - p) - observed[0]) < 1e-9 &&
      Math.abs(phasePassive(r.a, p) - observed[1]) < 1e-9
    ) {
      if (lo === null) lo = phi;
      hi = phi;
    }
  }
  return lo === null ? null : [lo, hi];
}

/** 位相の組が 12 編成 + みこ baseline 6 件すべてと両立するか */
function phasePairFails(costumeName: string, passiveName: string): string[] {
  const qc = COLUMN_PHASES[costumeName];
  const qp = COLUMN_PHASES[passiveName];
  if (!qc || !qp) throw new Error("位相がない");
  const fails: string[] = [];
  for (const r of rows) {
    if (r.passiveBaselineObs !== null && Math.abs(qp(r.a, r.dp) - r.passiveBaselineObs) >= 1e-9) {
      fails.push(`${r.label}:みこ`);
    }
    if (r.dp === 0) {
      // パッシブ支援がない編成は配賦の自由度がなく、衣装欄 raw = 総量 T になる
      if (Math.abs(qc(r.a, totalOf(r)) - r.costumeObs) >= 1e-9) fails.push(r.label);
      continue;
    }
    if (feasiblePassiveShare(r, qc, qp) === null) fails.push(r.label);
  }
  return fails;
}

describe("3 欄の配賦と量子化の位相(2026-09-15 実機 12 編成・青なし)", () => {
  it("アクティブ欄は 12 編成すべて実機と一致する(衣装欄・パッシブ欄の食い違いは入力のせいではない)", () => {
    expect(rows.filter((r) => ceil1(r.a) !== r.activeObs).map((r) => r.label)).toEqual([]);
  });

  it("みこ baseline(支援 0)のパッシブ欄は 6 件とも ceil(ΔP) と一致する — 総量 T と対象選抜が正しい", () => {
    const base = rows.filter((r) => r.passiveBaselineObs !== null);
    expect(base.length).toBe(6);
    expect(base.map((r) => ceil1(r.dp))).toEqual(base.map((r) => r.passiveBaselineObs));
  });

  it("量子化の位相は 1 通りしか残らない(衣装欄はアクティブ欄との差・パッシブ欄は素の切り上げ)", () => {
    const survivors: string[] = [];
    for (const c of Object.keys(COLUMN_PHASES)) {
      for (const p of Object.keys(COLUMN_PHASES)) {
        if (phasePairFails(c, p).length === 0) survivors.push(`衣装=${c} / パッシブ=${p}`);
      }
    }
    // 切り上げと切り捨ては「差分」では同じ値になるので 2 通りに見えるが、規則としては 1 つ
    expect(survivors).toEqual([
      "衣装=差分-切り上げ / パッシブ=独立-切り上げ",
      "衣装=差分-切り捨て / パッシブ=独立-切り上げ",
    ]);
    // 現行(全欄を独立に切り上げ)はパッシブ支援がない 4 件で外れる
    expect(phasePairFails("独立-切り上げ", "独立-切り上げ")).toEqual(["6", "7", "8", "K5"]);
  });

  /** 残った位相のもとで実機が要求する重み比 ρ = W_P / W_C（W_C = 0.60 × H_C は gauge の基準） */
  const required = new Map<string, [number, number]>();
  for (const r of withPassive) {
    const span = feasiblePassiveShare(
      r,
      COLUMN_PHASES["差分-切り上げ"]!,
      COLUMN_PHASES["独立-切り上げ"]!,
    );
    if (!span) throw new Error(`${r.label} が残った位相と両立しない`);
    required.set(r.label, [span[0] / (1 - span[0]), span[1] / (1 - span[1])]);
  }
  const requiredWeight = (r: Row): [number, number] => {
    const [lo, hi] = required.get(r.label)!;
    const wc = (LEADER_SUPPORT_PERCENT / 100) * r.a;
    return [lo * wc, hi * wc];
  };
  const inRange = (v: number, [lo, hi]: [number, number]): boolean =>
    v >= lo - 1e-9 && v <= hi + 1e-9;

  it("現行の重み W_P = ΔP は 8 件中 6 件を外す(リーダー支援でパッシブ欄が動くのを再現できない)", () => {
    const missed = withPassive.filter((r) => !inRange(r.dp, requiredWeight(r))).map((r) => r.label);
    expect(missed).toEqual(["1", "2", "3", "S2", "S3", "S4"]);
  });

  it("定数倍 W_P = k × ΔP でも両立しない(編成 1 は k > 1、S3 は k < 0.9 を要求する)", () => {
    const k = (r: Row): [number, number] => {
      const [lo, hi] = requiredWeight(r);
      return [lo / r.dp, hi / r.dp];
    };
    const one = k(withPassive.find((r) => r.label === "1")!);
    const s3 = k(withPassive.find((r) => r.label === "S3")!);
    expect(one[0]).toBeGreaterThan(1);
    expect(s3[1]).toBeLessThan(0.9);
  });

  it("メンバーごとの g(s) 型も棄却される(S1 / S2 / S3 で決まる g が 編成 2 と S4 で逆へ外れる)", () => {
    // 同じ支援 % が 2 人に乗る S1(8%) / S2(16%) / S3(24%) から g(8) / g(16) / g(24) の区間を出す
    const gOf = (label: string): [number, number] => {
      const r = withPassive.find((x) => x.label === label)!;
      const mass = r.share.reduce((a, w, i) => a + ((r.support[i] ?? 0) > 0 ? w : 0), 0);
      const [lo, hi] = requiredWeight(r);
      return [lo / mass, hi / mass];
    };
    const g = new Map([
      [8, gOf("S1")],
      [16, gOf("S2")],
      [24, gOf("S3")],
    ]);
    const predict = (r: Row): [number, number] => {
      let lo = 0;
      let hi = 0;
      r.support.forEach((s, i) => {
        if (s === 0) return;
        const band = g.get(s);
        if (!band) throw new Error(`g(${String(s)}) が未定`);
        lo += band[0] * (r.share[i] ?? 0);
        hi += band[1] * (r.share[i] ?? 0);
      });
      return [lo, hi];
    };
    // 編成 2 は g 型の上限でも足りず、S4 は g 型の下限でも多すぎる — 同じ g で両方は満たせない
    const two = withPassive.find((x) => x.label === "2")!;
    expect(predict(two)[1]).toBeLessThan(requiredWeight(two)[0]);
    const s4 = withPassive.find((x) => x.label === "S4")!;
    expect(predict(s4)[0]).toBeGreaterThan(requiredWeight(s4)[1]);
  });

  /** 支援を受けるメンバーが重み全体に占める割合 `f`。`ρ = 支援% × f / リーダー支援%` を逆に解く */
  const fractionOf = (
    r: Row,
    leaderPercent: number,
    observed: [number, number],
  ): [number, number] => {
    const span = feasiblePassiveShare(
      r,
      COLUMN_PHASES["差分-切り上げ"]!,
      COLUMN_PHASES["独立-切り上げ"]!,
      observed,
      leaderPercent,
    );
    if (!span) throw new Error(`${r.label} が ${String(leaderPercent)}% で位相と両立しない`);
    const toF = (phi: number): number => ((phi / (1 - phi)) * leaderPercent) / supportPercentOf(r);
    return [toF(span[0]), toF(span[1])];
  };

  it("支援 25%(恒常ぺこら)の 3 件も同じ位相で両立する", () => {
    for (const [label, observed] of Object.entries(PEKORA_25)) {
      const r = withPassive.find((x) => x.label === label)!;
      expect(
        feasiblePassiveShare(
          r,
          COLUMN_PHASES["差分-切り上げ"]!,
          COLUMN_PHASES["独立-切り上げ"]!,
          observed,
          PEKORA_25_PERCENT,
        ),
        label,
      ).not.toBeNull();
    }
  });

  it("W_C は リーダーのスコアサポート % に比例する(25% と 60% が同じ f を要求する)", () => {
    for (const [label, observed] of Object.entries(PEKORA_25)) {
      const r = withPassive.find((x) => x.label === label)!;
      const at60 = fractionOf(r, LEADER_SUPPORT_PERCENT, [r.costumeObs, r.passiveObs]);
      const at25 = fractionOf(r, PEKORA_25_PERCENT, observed);
      // 区間が交わる = 同じ f で両方の支援 % を説明できる
      expect(Math.max(at60[0], at25[0]), label).toBeLessThanOrEqual(Math.min(at60[1], at25[1]));
    }
  });

  it("現行の重み(競合で正規化した取り分)は 25% でも S2 / S3 を外す", () => {
    const modelFraction = (r: Row): number => {
      const mass = r.share.reduce((a, w, i) => a + ((r.support[i] ?? 0) > 0 ? w : 0), 0);
      return mass / r.share.reduce((a, w) => a + w, 0);
    };
    const missed = Object.entries(PEKORA_25)
      .filter(([label, observed]) => {
        const r = withPassive.find((x) => x.label === label)!;
        const [lo, hi] = fractionOf(r, PEKORA_25_PERCENT, observed);
        const f = modelFraction(r);
        return f < lo - 1e-9 || f > hi + 1e-9;
      })
      .map(([label]) => label);
    expect(missed).toEqual(["S2", "S3"]);
  });

  it("S2 → S3(奏 を リス へ 1 枚差し替え)で、実機が要求する重みの向きがモデルの取り分と逆になる", () => {
    // 支援を受ける 2 人が同じなので「その 2 人が重み全体に占める割合」を直接比べられる
    const fraction = (label: string, supportPercent: number): [number, number] => {
      const r = withPassive.find((x) => x.label === label)!;
      const [lo, hi] = required.get(r.label)!;
      const scale = LEADER_SUPPORT_PERCENT / supportPercent;
      return [lo * scale, hi * scale];
    };
    const modelFraction = (label: string): number => {
      const r = withPassive.find((x) => x.label === label)!;
      const mass = r.share.reduce((a, w, i) => a + ((r.support[i] ?? 0) > 0 ? w : 0), 0);
      return mass / r.share.reduce((a, w) => a + w, 0);
    };
    const s2 = fraction("S2", 16);
    const s3 = fraction("S3", 24);
    // 実機: S3 のほうが小さい（区間が重ならない）
    expect(s3[1]).toBeLessThan(s2[0]);
    // モデルの取り分: S3 のほうが大きい（向きが逆）
    expect(modelFraction("S3")).toBeGreaterThan(modelFraction("S2"));
  });
});
