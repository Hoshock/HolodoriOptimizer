import { describe, expect, it } from "vite-plus/test";

import { round1 } from "./displayScore";
import type {
  AttributionQuantization,
  AttributionSource,
} from "./displayScoreAttributionExperimental";
import {
  ATTRIBUTION_ORDERS,
  attributionErrorStats,
  buildAttributionEnvironment,
  experimentalAttributedDisplay,
  experimentalSequentialAttribution,
} from "./displayScoreAttributionExperimental";
import type { BlueTable, CategoryContrast } from "./displayScoreCategoryCorpus.fixture";
import {
  CATEGORY_CONTRASTS,
  holomenMap,
  memberFor,
  realCard,
} from "./displayScoreCategoryCorpus.fixture";
import { experimentalErrorStats, experimentalRedSupportEvaluate } from "./displayScoreExperimental";

interface DeltaRow {
  name: string;
  group: CategoryContrast["group"];
  dC: number;
  dP: number;
  dB: number;
  obsC: number;
  obsP: number;
  obsB: number;
  absC: number;
  obsAbsC: number;
}
function evaluateOrder(
  order: readonly AttributionSource[],
  supplier: "p0" | "blueMultiplicative",
  quantization: AttributionQuantization,
  fit = CATEGORY_CONTRASTS.filter((c) => c.group !== "exploratory"),
): DeltaRow[] {
  return fit.map((c) => {
    const env = buildAttributionEnvironment(
      realCard(c.leaderId),
      c.members.map((s) => memberFor(s, c.blue)),
      holomenMap,
    );
    const display = (x: number) =>
      experimentalAttributedDisplay(
        experimentalSequentialAttribution(env, order, x, { supplier }),
        c.songBonus,
        quantization,
      );
    const b = display(c.xBefore);
    const a = display(c.xAfter);
    return {
      name: c.name,
      group: c.group,
      dC: round1(a.costume - b.costume),
      dP: round1(a.passive - b.passive),
      dB: round1(a.board - b.board),
      obsC: round1(c.after[0] - c.before[0]),
      obsP: round1(c.after[3] - c.before[3]),
      obsB: round1(c.after[2] - c.before[2]),
      absC: b.costume,
      obsAbsC: c.before[0],
    };
  });
}

describe("赤の総増分のカテゴリ配賦: 既存評価器上の sequential marginal attribution（解析用。仕様の Golden ではなく仮説の回帰評価）", () => {
  it("コーパスの各行は 5 欄の和が合計と一致し、赤で動くのは 衣装 / ボード / パッシブ だけ（アクティブ / SP は不変）", () => {
    for (const c of CATEGORY_CONTRASTS) {
      expect(c.after[1], c.name).toBe(c.before[1]);
      expect(c.after[4], c.name).toBe(c.before[4]);
      expect(c.xAfter - c.xBefore, c.name).toBeGreaterThan(0);
    }
    const p1 = CATEGORY_CONTRASTS[0];
    if (!p1) throw new Error("コーパスが空");
    expect(round1(p1.before.reduce((s, v) => s + v, 0))).toBe(205.5);
    expect(round1(p1.after.reduce((s, v) => s + v, 0))).toBe(226.4);
  });

  it("6 順序 × 供給側確率 2 種 × 量子化 2 種のどれも、衣装 ΔC ≤ 0.25 / パッシブ ΔP ≤ 0.25 / ボード ΔB ≤ 0.5 pt を同時に満たさない（2026-09-12 の反証）", () => {
    const summary: string[] = [];
    for (const order of ATTRIBUTION_ORDERS) {
      for (const supplier of ["p0", "blueMultiplicative"] as const) {
        for (const quantization of ["round", "ceil"] as const) {
          const rows = evaluateOrder(order, supplier, quantization);
          const c = attributionErrorStats(rows.map((r) => r.dC - r.obsC));
          const p = attributionErrorStats(rows.map((r) => r.dP - r.obsP));
          const b = attributionErrorStats(rows.map((r) => r.dB - r.obsB));
          summary.push(
            `${order.join(">")} ${supplier} ${quantization}: C ${c.rmse.toFixed(2)} P ${p.rmse.toFixed(2)} B ${b.rmse.toFixed(2)}`,
          );
          const passes = c.maxAbsError <= 0.25 && p.maxAbsError <= 0.25 && b.maxAbsError <= 0.5;
          expect(passes, summary[summary.length - 1]).toBe(false);
          // Leader が SkillTree の後: 衣装欄が赤で ×(1 + X/100) 倍されて +24 で約 +5 動く。前: 赤の総増分が衣装で 1.25 倍されボードが約 +5 ずれる
          const leaderAfterSkillTree = order.indexOf("L") > order.indexOf("S");
          const fuwawa = rows.filter((r) => r.group === "fuwawa+24");
          if (leaderAfterSkillTree) {
            expect(attributionErrorStats(fuwawa.map((r) => r.dC - r.obsC)).rmse).toBeGreaterThan(3);
          } else {
            expect(attributionErrorStats(fuwawa.map((r) => r.dC - r.obsC)).rmse).toBeLessThan(0.5);
            expect(attributionErrorStats(fuwawa.map((r) => r.dB - r.obsB)).rmse).toBeGreaterThan(3);
          }
        }
      }
    }
    // 参考: 2026-09-12 の値(round, p0) S>P>L: C 3.68 / P 0.23 / B 0.75、L>S>P: C 0.30 / P 0.24 / B 4.24
    expect(summary.length).toBe(24);
  });

  it("衣装なしの対照（R-002 +10 × 3、水着ミオリーダー +24）でも、既存のパッシブ支援モデルの marginal はパッシブ欄の増分の大小関係を再現しない", () => {
    // 実機: +10 で パッシブ +0.4 / +0.5 / +0.3、+24 で +0.2。モデル(S 先、供給側 p0): +0.2 / +0.1 / +0.1、+0.5 — 逆の大小関係
    const rows = evaluateOrder(["S", "P", "L"], "p0", "round");
    const ten = rows.filter((r) => r.group === "noCostume+10");
    const mio = rows.filter((r) => r.group === "noCostume+24");
    expect(Math.max(...ten.map((r) => r.dP))).toBeLessThan(Math.min(...ten.map((r) => r.obsP)));
    expect(Math.min(...mio.map((r) => r.dP))).toBeGreaterThan(Math.max(...mio.map((r) => r.obsP)));
    for (const supplier of ["p0", "blueMultiplicative"] as const) {
      for (const order of ATTRIBUTION_ORDERS) {
        const all = evaluateOrder(order, supplier, "round").filter((r) => r.group !== "fuwawa+24");
        expect(attributionErrorStats(all.map((r) => r.dP - r.obsP)).maxAbsError).toBeGreaterThan(
          0.2,
        );
      }
    }
  });

  it("一様な ×(1 + 25/100) の衣装 source は配賦法によらず 衣装欄 ≥ 0.25 × 基準アクティブ になるが、実機の衣装欄はその下限を全 9 編成で下回る", () => {
    // sequential / isolated / leave-one-out / Shapley のどれでも、衣装の marginal は 0.25 × F(prefix) で、F(prefix) ≥ 基準アクティブ
    // (source はどれも F を増やす)。したがって衣装欄 ≥ 0.25 × 基準アクティブ。実機 13.4〜17.4 はこれを 0.6〜5.3 pt 下回る
    for (const c of CATEGORY_CONTRASTS.filter((x) => x.group === "fuwawa+24")) {
      const env = buildAttributionEnvironment(
        realCard(c.leaderId),
        c.members.map((s) => memberFor(s, c.blue)),
        holomenMap,
      );
      const lowerBound = 0.25 * env.baseActive;
      expect(lowerBound, c.name).toBeGreaterThan(c.before[0] + 0.5);
      // 実装の静的倍率(Leader を最初に足す = 最小の marginal)でも下限以上
      const minimal = experimentalSequentialAttribution(env, ["L", "S", "P"], c.xBefore).costume;
      expect(minimal).toBeGreaterThanOrEqual(lowerBound - 1e-9);
    }
  });

  it("感度: 総量モデル（X/100 × E_blue）は水着フワワの青 45 / 0（09-09 報告）より 0 / 0（09-12 構造化データ）で 13 対照に近い — provenance の判定には使わない", () => {
    const ten = CATEGORY_CONTRASTS.filter((c) => c.group === "fuwawa+24" || c.group === "r061+3");
    const errorsWith = (fuwawaBlue: [number, number]) =>
      ten.map((c) => {
        const table: BlueTable = { ...c.blue, "fuwawa-abyssgard": fuwawaBlue };
        const r = experimentalRedSupportEvaluate(
          c.members.map((s) => memberFor(s, table)),
          holomenMap,
          c.xAfter - c.xBefore,
        );
        const observed = round1(
          c.after.reduce((s, v) => s + v, 0) - c.before.reduce((s, v) => s + v, 0),
        );
        return r.gain - observed;
      });
    const zero = experimentalErrorStats(errorsWith([0, 0]));
    const reported = experimentalErrorStats(errorsWith([45, 0]));
    // 2026-09-12: 0 / 0 → RMSE 0.086 / 最大 0.128、45 / 0 → RMSE 0.201 / 最大 0.392(系統的に +0.1〜+0.4)
    expect(zero.rmse).toBeLessThan(0.15);
    expect(reported.rmse).toBeGreaterThan(zero.rmse);
    expect(reported.rmse).toBeLessThan(0.3);
  });

  it("exploratory（恒常みこ、Lv 未再確認）は fit に入れず外部検証だけ: 総量モデルは +16.4 を再現しない（約 +1.0 の未説明差）", () => {
    // 恒常みこは「Lv 約 20」で入力条件の確度が低く、ツールは完凸・最大 Lv 相当のスキル値で評価している。
    // 総量モデル X/100 × E_blue はこの行で約 17.4 を返し、観測 16.4 と約 1.0 ずれる。fit 13 対照(最大 0.128)より
    // 一桁大きいので、モデルを調整せず「入力条件が未確認の外部検証で不一致」として記録する。再読(Lv・スキル Lv)待ち。
    const c = CATEGORY_CONTRASTS.find((x) => x.group === "exploratory");
    if (!c) throw new Error("exploratory がない");
    const r = experimentalRedSupportEvaluate(
      c.members.map((s) => memberFor(s, c.blue)),
      holomenMap,
      c.xAfter - c.xBefore,
    );
    const observed = round1(
      c.after.reduce((s, v) => s + v, 0) - c.before.reduce((s, v) => s + v, 0),
    );
    expect(observed).toBe(16.4);
    const error = r.gain - observed;
    expect(error).toBeGreaterThan(0.5);
    expect(error).toBeLessThan(1.5);
  });
});
