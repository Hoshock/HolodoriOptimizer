import { describe, expect, it } from "vite-plus/test";

import type { Card } from "../data/types";
import { round1 } from "./displayScore";
import type { CategoryContrast, LeaderContrast, Slot } from "./displayScoreCategoryCorpus.fixture";
import {
  BLUE_SNAPSHOT_2026_09_12,
  CATEGORY_CONTRASTS,
  holomenMap,
  LEADER_BASELINE_ID,
  LEADER_CONTRASTS,
  LEADER_SUPPORT_ID,
  LEADER_SUPPORT_PERCENT,
  memberFor,
  realCard,
} from "./displayScoreCategoryCorpus.fixture";
import { expectedActive } from "./displayScoreLeaderSupportExperimental";
import type {
  CandidateAttributionRule,
  PassiveMode,
  SourceEnvironment,
} from "./displayScoreSourceAttributionExperimental";
import {
  attributeColumns,
  buildSourceEnvironment,
  CANDIDATE_RULES,
  evaluateTotal,
  sourceErrorStats,
} from "./displayScoreSourceAttributionExperimental";

/**
 * **これはゲーム仕様の Golden ではなく、秒 × 候補単位の source attribution 仮説の回帰評価（解析用・production 未採用）。**
 * 実測値はモデルに合わせて変えない。固定するのは 2026-09-13 時点の支持・反証で、式ではない。
 *
 * コーパス: Leader-only matched pairs K1〜K6（K5 / K6 は青なしの negative control）、赤だけを変えた直接比較
 * （水着フワワリーダー +24 × 9、R-061 +3、衣装なし R-002 +10 × 3、水着ミオリーダー +24 の黄 0 / 10%）。
 */

const S = LEADER_SUPPORT_PERCENT;
const kronii = realCard(LEADER_SUPPORT_ID);
const miko1 = realCard(LEADER_BASELINE_ID);
const membersOf = (c: LeaderContrast): Card[] => c.members.map((s) => memberFor(s, c.blue));
const envOf = (c: LeaderContrast, leader: Card): SourceEnvironment =>
  buildSourceEnvironment(leader, membersOf(c), holomenMap);
const deltaOf = (c: LeaderContrast) => ({
  costume: round1(c.support[0] - c.baseline[0]),
  board: round1(c.support[2] - c.baseline[2]),
  passive: round1(c.support[3] - c.baseline[3]),
});
const interacting = LEADER_CONTRASTS.filter((c) => !c.cleanControl);
const negativeControls = LEADER_CONTRASTS.filter((c) => c.cleanControl);
const k6 = LEADER_CONTRASTS.find((c) => c.cleanControl && c.passiveSupport);
if (!k6) throw new Error("K6 がない");
const K6: LeaderContrast = k6;
/** 赤 / 衣装コーパスのうち 2026-09-12 の青で観測条件が揃っている 11 行（fit）。09-08 の青を仮定した行と exploratory は別扱い */
const RED_FIT = CATEGORY_CONTRASTS.filter(
  (c) => c.blue === BLUE_SNAPSHOT_2026_09_12 && c.group !== "exploratory",
);
const RED_OLD_BLUE = CATEGORY_CONTRASTS.filter(
  (c) => c.blue !== BLUE_SNAPSHOT_2026_09_12 && c.group !== "exploratory",
);
/** 観測 4 欄（衣装 + アクティブ + ボード + パッシブ）から黄の増分（表示値で近似）を除いた合計 */
const observedTotal = (c: CategoryContrast, f: readonly number[]): number =>
  (f[0] ?? 0) +
  (f[1] ?? 0) +
  (f[2] ?? 0) +
  (f[3] ?? 0) -
  c.songBonus * (100 + (f[0] ?? 0) + (f[1] ?? 0) + (f[3] ?? 0) + (f[4] ?? 0));
const redEnv = (c: CategoryContrast): SourceEnvironment =>
  buildSourceEnvironment(
    realCard(c.leaderId),
    c.members.map((s) => memberFor(s, c.blue)),
    holomenMap,
  );

describe("負の対照 K5 / K6（青なし）: L × P 単独の相互作用は 0、支援は加算合成", () => {
  it("青がなければパッシブ支援の有無によらず Δボード = Δパッシブ = 0、Δ衣装 / 表示アクティブ = 0.60", () => {
    expect(negativeControls.map((c) => c.passiveSupport)).toEqual([false, true]);
    for (const c of negativeControls) {
      const d = deltaOf(c);
      expect(d.board, c.name).toBe(0);
      expect(d.passive, c.name).toBe(0);
      expect(Math.abs(d.costume / c.baseline[1] - S / 100), c.name).toBeLessThan(0.005);
      const env = envOf(c, kronii);
      // 環境の確認: 青 0（候補窓・確率とも基準と同じ）
      expect(env.views.every((v) => (v.active?.pBlue ?? 0) === (v.active?.p0 ?? 0))).toBe(true);
    }
    // K6 だけパッシブ支援の行列が非零（マリン → フレア・マリン）
    expect(Array.from(envOf(K6, kronii).supportMatrix).filter((v) => v !== 0)).toEqual([9, 9]);
  });

  it("加算合成 up × (1 + S + P) は K6 の総増分 44.3 を 0.6 × 73.7 = 44.2 で追い、乗算合成 (1 + S)(1 + P) は 46.0 で 1.7 過大", () => {
    const d = deltaOf(K6);
    const total = round1(d.costume + d.board + d.passive);
    expect(total).toBe(44.3);
    expect(round1((S / 100) * K6.baseline[1])).toBe(44.2);
    expect(round1((S / 100) * (K6.baseline[1] + K6.baseline[3]))).toBe(46.0);
    // 評価器上でも同じ: 乗算合成は静的パッシブ 2.85 の 0.6 倍だけ総増分が大きい
    const env = envOf(K6, kronii);
    const gainAdd =
      evaluateTotal(env, { freq: false, rate: false, passive: "static", combine: "additive" }) -
      evaluateTotal(env, { freq: false, rate: false, passive: "static", leaderPercent: 0 });
    const gainMul =
      evaluateTotal(env, {
        freq: false,
        rate: false,
        passive: "static",
        combine: "multiplicative",
      }) - evaluateTotal(env, { freq: false, rate: false, passive: "static", leaderPercent: 0 });
    expect(gainAdd).toBeCloseTo((S / 100) * expectedActive(env), 6);
    expect(round1(gainMul - gainAdd)).toBe(1.7);
  });
});

describe("総量保存: 支援 3 種（リーダー衣装 / 赤 / パッシブ）の加算合成と、パッシブ支援の掛け方", () => {
  const passiveStatic = (env: SourceEnvironment, x = 0) =>
    evaluateTotal(env, { freq: true, rate: true, passive: "static", redPercent: x });
  const passiveGated = (env: SourceEnvironment, x = 0) =>
    evaluateTotal(env, { freq: true, rate: true, passive: "gated", redPercent: x });

  it("リーダーなし K1〜K4 / K6 の ボード + パッシブ 欄の和は (E_blue − E_base) + 静的パッシブ（対象に常時 S_ji）で ±0.2、供給側の発動確率で重みづけする production 型は 0.6〜1.9 不足", () => {
    const rows = [...interacting, K6];
    const errStatic: number[] = [];
    const errGated: number[] = [];
    for (const c of rows) {
      const env = envOf(c, miko1);
      const active = expectedActive(env);
      const obs = c.baseline[2] + c.baseline[3];
      errStatic.push(passiveStatic(env) - active - obs);
      errGated.push(passiveGated(env) - active - obs);
    }
    // K1 −0.16 / K2 −0.02 / K3 −0.21 / K4 −0.12 / K6 −0.05
    expect(sourceErrorStats(errStatic).maxAbsError).toBeLessThan(0.25);
    // K2（パッシブ支援なし）は両者同じ。それ以外は gated が不足
    expect(errGated[1]).toBeCloseTo(errStatic[1] ?? 0, 9);
    for (const i of [0, 2, 3, 4]) expect(errGated[i]).toBeLessThan(-0.55);
    expect(Math.min(...errGated)).toBeLessThan(-1.8); // K6 −1.87
  });

  it("赤 / 衣装コーパス 11 行（2026-09-12 の青）: 加算合成 × 静的パッシブは赤の前後とも −0.1〜−0.4（4 欄切り上げの偏り程度）、gated は −1.4〜−2.2、乗算合成は +5〜+13", () => {
    const add: number[] = [];
    const gated: number[] = [];
    const mul: number[] = [];
    for (const c of RED_FIT) {
      const env = redEnv(c);
      for (const [x, f] of [
        [c.xBefore, c.before],
        [c.xAfter, c.after],
      ] as const) {
        const obs = observedTotal(c, f);
        add.push(
          evaluateTotal(env, { freq: true, rate: true, passive: "static", redPercent: x }) - obs,
        );
        gated.push(
          evaluateTotal(env, { freq: true, rate: true, passive: "gated", redPercent: x }) - obs,
        );
        // 乗算合成の比較は衣装支援のある行（水着フワワリーダー 10 行）だけ。衣装なしの行は L = 0 で両者ほぼ同じ
        if (env.supportPercent > 0) {
          mul.push(
            evaluateTotal(env, {
              freq: true,
              rate: true,
              passive: "static",
              redPercent: x,
              combine: "multiplicative",
            }) - obs,
          );
        }
      }
    }
    expect(RED_FIT).toHaveLength(11);
    expect(mul).toHaveLength(20);
    const a = sourceErrorStats(add);
    expect(a.maxAbsError).toBeLessThan(0.4);
    expect(a.bias).toBeLessThan(-0.1);
    expect(a.bias).toBeGreaterThan(-0.4);
    // gated: パッシブ支援のある行で不足
    expect(Math.min(...gated)).toBeLessThan(-2.0);
    expect(sourceErrorStats(gated).rmse).toBeGreaterThan(1.0);
    // 乗算合成: 支援 48〜75% がパッシブ支援・赤・衣装で互いに掛かり大幅過大
    expect(Math.min(...mul)).toBeGreaterThan(5);
    expect(Math.max(...mul)).toBeGreaterThan(12);
  });

  it("2026-09-08 の青を仮定した 4 行（水着ミオの青を 0 / 0 と仮定）は静的でも −1.5〜−2.2 不足（入力の青が未確認なので fit に入れない）", () => {
    const errs: number[] = [];
    for (const c of RED_OLD_BLUE) {
      const env = redEnv(c);
      errs.push(
        evaluateTotal(env, { freq: true, rate: true, passive: "static", redPercent: c.xBefore }) -
          observedTotal(c, c.before),
      );
    }
    expect(RED_OLD_BLUE.map((c) => c.name.slice(0, 5))).toEqual([
      "R-002",
      "R-002",
      "水着ミオリ",
      "水着ミオリ",
    ]);
    // 旧おかゆ編成 −1.5、ノエル入替 −0.3、水着ミオ +24 −1.9 / −2.0
    expect(errs[1]).toBeGreaterThan(-0.4);
    expect(Math.min(...errs)).toBeLessThan(-1.8);
    expect(Math.min(...errs)).toBeGreaterThan(-2.3);
  });

  it("パッシブ欄そのもの: K1 / K3 / K4 の実機は gated（0.4〜1.8）に近く、K6 は静的（2.85）に一致する — 列の分割規則は矛盾したまま", () => {
    const rows = [...interacting.filter((c) => c.passiveSupport), K6];
    const table = rows.map((c) => {
      const env = envOf(c, miko1);
      const active = expectedActive(env);
      const blueOnly =
        evaluateTotal(env, { freq: true, rate: true, passive: "none", leaderPercent: 0 }) - active;
      return {
        name: c.name.slice(0, 2),
        obs: c.baseline[3],
        stat: passiveStatic(env) - active - blueOnly,
        gated: passiveGated(env) - active - blueOnly,
      };
    });
    expect(table.map((t) => t.name)).toEqual(["K1", "K3", "K4", "K6"]);
    // K1: obs 1.0 / static 2.49 / gated 1.35, K3: 0.5 / 0.82 / 0.43, K4: 1.5 / 3.25 / 1.82, K6: 2.9 / 2.85 / 1.03
    for (const t of table.slice(0, 3)) {
      expect(Math.abs(t.obs - t.gated)).toBeLessThan(Math.abs(t.obs - t.stat));
      expect(t.obs / t.stat).toBeGreaterThan(0.35);
      expect(t.obs / t.stat).toBeLessThan(0.65);
    }
    const t6 = table[3];
    expect(Math.abs((t6?.obs ?? 0) - (t6?.stat ?? 0))).toBeLessThan(0.1);
    expect(Math.abs((t6?.obs ?? 0) - (t6?.gated ?? 0))).toBeGreaterThan(1.8);
  });
});

describe("秒 × 候補単位の配賦ルール（負の結果）", () => {
  interface RuleStats {
    rule: CandidateAttributionRule;
    costume: ReturnType<typeof sourceErrorStats>;
    board: ReturnType<typeof sourceErrorStats>;
    passive: ReturnType<typeof sourceErrorStats>;
    fuwawaCostume: ReturnType<typeof sourceErrorStats>;
  }
  const evaluateRule = (rule: CandidateAttributionRule, passive: PassiveMode): RuleStats => {
    const c: number[] = [];
    const b: number[] = [];
    const p: number[] = [];
    for (const k of interacting) {
      const withLeader = attributeColumns(envOf(k, kronii), { passive, rule });
      const without = attributeColumns(envOf(k, miko1), { passive, rule });
      const d = deltaOf(k);
      c.push(withLeader.costume - without.costume - d.costume);
      b.push(withLeader.board - without.board - d.board);
      p.push(withLeader.passive - without.passive - d.passive);
    }
    const fc: number[] = [];
    for (const r of CATEGORY_CONTRASTS.filter((x) => x.group === "fuwawa+24")) {
      const a = attributeColumns(redEnv(r), { passive, rule, redPercent: r.xBefore });
      fc.push(a.costume - r.before[0]);
    }
    return {
      rule,
      costume: sourceErrorStats(c),
      board: sourceErrorStats(b),
      passive: sourceErrorStats(p),
      fuwawaCostume: sourceErrorStats(fc),
    };
  };

  it("配賦は総量を変えない（各ルールの 4 欄の和 = 加算合成の総量）", () => {
    for (const k of interacting) {
      const env = envOf(k, kronii);
      const total = evaluateTotal(env, { freq: true, rate: true, passive: "static" });
      for (const rule of CANDIDATE_RULES) {
        const a = attributeColumns(env, { passive: "static", rule });
        expect(a.active + a.costume + a.board + a.passive).toBeCloseTo(total, 6);
        expect(a.active).toBeCloseTo(expectedActive(env), 9);
      }
    }
  });

  it("加算合成では L × P の相互作用がないので、リーダー由来の Δパッシブ はどのルールでも 0 になり、K1 / K3 / K4 の +1.1 / +0.4 / +1.4 を出せない", () => {
    for (const passive of ["gated", "static"] as const) {
      for (const rule of CANDIDATE_RULES) {
        const s = evaluateRule(rule, passive);
        expect(s.passive.rmse, `${rule} ${passive}`).toBeGreaterThan(0.85);
        expect(s.passive.rmse).toBeLessThan(0.95); // 予測 0 に対する観測の RMS 0.91
      }
    }
  });

  it("5 ルール × パッシブ 2 種のどれも K1〜K4 の Δ衣装 / Δボード を 0.2 以内で同時に再現しない。最良は p0Only（発動率 UP で増えた確率ぶんだけボードへ）で 衣装 RMSE 1.9 / 最大 3.6（K2）", () => {
    const summary: Record<string, RuleStats> = {};
    for (const rule of CANDIDATE_RULES) summary[rule] = evaluateRule(rule, "static");
    for (const rule of CANDIDATE_RULES) {
      const s = summary[rule];
      if (!s) throw new Error(rule);
      expect(s.costume.maxAbsError > 0.2 || s.board.maxAbsError > 0.5, rule).toBe(true);
      // gated / static でリーダー由来の Δ衣装・Δボードは同じ（加算合成でパッシブと独立）
      const g = evaluateRule(rule, "gated");
      expect(g.costume.rmse).toBeCloseTo(s.costume.rmse, 9);
    }
    const best = summary.p0Only;
    if (!best) throw new Error("p0Only がない");
    // K1 +1.2 / K2 −3.6 / K3 +0.2 / K4 0.0
    expect(best.costume.rmse).toBeGreaterThan(1.7);
    expect(best.costume.rmse).toBeLessThan(2.1);
    expect(best.costume.maxAbsError).toBeGreaterThan(3.4);
    expect(best.costume.maxAbsError).toBeLessThan(3.8);
    // 他は衣装 RMSE 5 以上（lastApplied = S × E_blue: 10、interactionToBoard = S × E_base: 5.7、baseWindow: 6.8、baseWindowP0: 11.6）
    for (const rule of [
      "lastApplied",
      "interactionToBoard",
      "baseWindow",
      "baseWindowP0",
    ] as const) {
      expect(summary[rule]?.costume.rmse, rule).toBeGreaterThan(5);
    }
    expect(summary.lastApplied?.costume.rmse).toBeGreaterThan(9);
    // 水着フワワ 9 編成の衣装欄（S = 25、赤 X 込みの絶対値）でもどのルールも RMSE 1.5 以上
    for (const rule of CANDIDATE_RULES) {
      expect(summary[rule]?.fuwawaCostume.rmse, rule).toBeGreaterThan(1.5);
    }
  });

  it("青の source を頻度 / 発動率に分けた対称配賦（Shapley、順序 6 通りの平均）でも K1 で +11 過大", () => {
    // 3 source {Q: 頻度, R: 発動率, L: リーダー} の Shapley 値 = S × (2 F(∅) + F(Q) + F(R) + 2 F(QR)) / 6
    const errors = interacting.map((k) => {
      const env = envOf(k, kronii);
      const f0 = evaluateTotal(env, {
        freq: false,
        rate: false,
        passive: "none",
        leaderPercent: 0,
      });
      const fq = evaluateTotal(env, { freq: true, rate: false, passive: "none", leaderPercent: 0 });
      const fr = evaluateTotal(env, { freq: false, rate: true, passive: "none", leaderPercent: 0 });
      const fqr = evaluateTotal(env, { freq: true, rate: true, passive: "none", leaderPercent: 0 });
      return (S / 100) * ((2 * f0 + fq + fr + 2 * fqr) / 6) - deltaOf(k).costume;
    });
    // K1 +10.9 / K2 +1.4 / K3 +5.7 / K4 +8.3
    expect(errors.map(round1)).toEqual([10.9, 1.4, 5.7, 8.3]);
  });
});

describe("次の実機観測の予測（1 件）", () => {
  it("恒常そら0 / アキ0 / スバル0 / フレア0 / 水着フブキ0（青は水着フブキの発動率 15% だけ。フブキのパッシブ 8% はそら・スバルが対象）: 静的なら パッシブ ≈ 2.0、gated なら ≈ 0.5、青の純増分 ≈ 0.2", () => {
    const slots: Slot[] = [
      ["tokino-sora-01", 0],
      ["aki-rosenthal-01", 0],
      ["oozora-subaru-01", 0],
      ["shiranui-flare-01", 0],
      ["shirakami-fubuki-02", 0],
    ];
    const members = slots.map((s) => memberFor(s, BLUE_SNAPSHOT_2026_09_12));
    const env = buildSourceEnvironment(miko1, members, holomenMap);
    const active = expectedActive(env);
    const blueOnly =
      evaluateTotal(env, { freq: true, rate: true, passive: "none", leaderPercent: 0 }) - active;
    const pStatic =
      evaluateTotal(env, { freq: true, rate: true, passive: "static", leaderPercent: 0 }) -
      active -
      blueOnly;
    const pGated =
      evaluateTotal(env, { freq: true, rate: true, passive: "gated", leaderPercent: 0 }) -
      active -
      blueOnly;
    // 供給側（水着フブキ、青 15 / 0）と対象（そら・スバル、青 0）が分かれる
    expect(env.supportMatrix[4 * 5 + 0]).toBe(8);
    expect(env.supportMatrix[4 * 5 + 2]).toBe(8);
    expect(Array.from(env.supportMatrix).filter((v) => v !== 0)).toEqual([8, 8]);
    expect(blueOnly).toBeGreaterThan(0.1);
    expect(blueOnly).toBeLessThan(0.3);
    expect(pStatic).toBeGreaterThan(1.9);
    expect(pStatic).toBeLessThan(2.1);
    expect(pGated).toBeGreaterThan(0.4);
    expect(pGated).toBeLessThan(0.55);
    // クロニーに替えたときの総増分 0.6 × E_blue（評価器 39.2。表示アクティブ基準なら 0.6 × 表示値）
    const gain =
      (S / 100) *
      evaluateTotal(buildSourceEnvironment(kronii, members, holomenMap), {
        freq: true,
        rate: true,
        passive: "none",
        leaderPercent: 0,
      });
    expect(gain).toBeGreaterThan(39);
    expect(gain).toBeLessThan(39.5);
  });
});
