import { describe, expect, it } from "vite-plus/test";

import { cards as realCards, holomen as realHolomen } from "../data";
import { cardAtBloom } from "../data/bloom";
import type { Card } from "../data/types";
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
import { experimentalErrorStats, experimentalRedSupportEvaluate } from "./displayScoreExperimental";
import { buildHolomenMap } from "./score";

/**
 * **これはゲーム仕様の Golden ではなく、赤スコアサポートの総増分を 衣装 / ボード / パッシブ へ配賦する仮説の回帰評価（解析用・
 * production 未採用）。** 実測値はモデルに合わせて変えない。ここで固定するのは 2026-09-12 時点の**反証**で、式ではない。
 *
 * カテゴリ配賦の観測コーパス（docs/human/repro/display-score-20260912.md、displayScore.test.ts）。各行は赤だけを変えた
 * 直接比較で、赤変更前後の 5 欄の絶対値・X・黄を持つ。青の実効値は観測時点ごとに分ける（現在値で過去観測を上書きしない）。
 * - 2026-09-12 水着フワワリーダー +24 × 9（Gamers X=26 → FUWAMOCO X=50、黄 10%）: reported + cross-checked
 * - 2026-09-12 R-061 +3（曲なし X 23 → 26）: reported + cross-checked
 * - 2026-09-11 / 12 R-002 +10 × 3（衣装にスコアサポートなし。旧おかゆ編成の青は 09-08 の値、ノエル入替はノエル頻度 12）
 * - 2026-09-11 水着ミオリーダーの 4 象限（+24、黄 0 / 10%。衣装にスコアサポートなし。青・緑の観測時点の状態は未共有 → 09-08 の値）
 * - 2026-09-12 水着みこ → 恒常みこ（Lv「約 20」で入力条件の確度が低い）: exploratory。fit 条件には使わず外部検証だけ
 * 水着フワワの青は 2026-09-12 の構造化データどおり 0 / 0（2026-09-09 の実機報告 45 / 0 と食い違う — 下の感度テスト）。
 */

const holomenMap = buildHolomenMap(realHolomen);
export const realCard = (id: string): Card => {
  const card = realCards.find((c) => c.id === id);
  if (!card) throw new Error(`${id} がない`);
  return card;
};
type BlueTable = Record<string, [number, number]>;
const holomenIdOf = (cardId: string): string => cardId.replace(/-0\d$/, "");
const BLUE_2026_09_08: BlueTable = {
  "usada-pekora": [30, 8],
  "inugami-korone": [33.6, 4],
  "nekomata-okayu": [35.1, 12],
  "shirakami-fubuki": [39, 8],
  "ookami-mio": [0, 0],
};
const BLUE_SNAPSHOT_2026_09_12: BlueTable = {
  "nekomata-okayu": [35.1, 12],
  "inugami-korone": [39.6, 0],
  "shirakami-fubuki": [15.0, 0],
  "usada-pekora": [30.0, 8],
  "ookami-mio": [36.6, 8],
  "shirogane-noel": [42.0, 8],
  "sakura-miko": [42.0, 0],
  "houshou-marine": [0, 0],
  "fuwawa-abyssgard": [0, 0],
};
const BLUE_AT_NOEL_OBSERVATION: BlueTable = {
  ...BLUE_SNAPSHOT_2026_09_12,
  "shirogane-noel": [42.0, 12],
};

type Slot = [cardId: string, bloom: number];
export function memberFor(slot: Slot, table: BlueTable): Card {
  const [id, bloom] = slot;
  const bloomed = cardAtBloom(realCard(id), bloom);
  const [r, f] = table[holomenIdOf(id)] ?? [0, 0];
  return {
    ...bloomed,
    naturalStats: bloomed.stats,
    boardLive: { activeRatePercent: r, activeFrequencyPercent: f },
  };
}
const MIKO2: Slot = ["sakura-miko-02", 1];
const MIKO1: Slot = ["sakura-miko-01", 0];
const FUWAWA2: Slot = ["fuwawa-abyssgard-02", 0];
const OKAYU2: Slot = ["nekomata-okayu-02", 5];
const KORONE2: Slot = ["inugami-korone-02", 2];
const KORONE1: Slot = ["inugami-korone-01", 3];
const MIO2: Slot = ["ookami-mio-02", 1];
const FUBUKI2: Slot = ["shirakami-fubuki-02", 0];
const FUBUKI1: Slot = ["shirakami-fubuki-01", 1];
const NOEL2: Slot = ["shirogane-noel-02", 0];
const MARINE1: Slot = ["houshou-marine-01", 1];
const PEKORA1: Slot = ["usada-pekora-01", 1];
const pair = (a: Slot, b: Slot): Slot[] => [MIKO2, a, FUWAWA2, OKAYU2, b];

/** 5 欄の表示値 [衣装, アクティブ, ボード, パッシブ, SP] */
type Five = [number, number, number, number, number];
interface CategoryContrast {
  name: string;
  group: "fuwawa+24" | "r061+3" | "noCostume+10" | "noCostume+24" | "exploratory";
  leaderId: string;
  members: Slot[];
  blue: BlueTable;
  songBonus: number;
  xBefore: number;
  xAfter: number;
  before: Five;
  after: Five;
}
const FL = "fuwawa-abyssgard-02";
const OL = "nekomata-okayu-02";
const ML = "ookami-mio-02";
const S12 = BLUE_SNAPSHOT_2026_09_12;
export const CATEGORY_CONTRASTS: CategoryContrast[] = [
  {
    name: "+24 水着ミオ1 / 水着ころね2",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(MIO2, KORONE2),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [14.1, 77.7, 64.8, 1.9, 47.0],
    after: [14.6, 77.7, 85.2, 1.9, 47.0],
  },
  {
    name: "+24 水着フブキ0 / 水着ころね2",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(FUBUKI2, KORONE2),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [13.7, 71.7, 58.8, 2.6, 43.4],
    after: [14.1, 71.7, 77.4, 2.7, 43.4],
  },
  {
    name: "+24 水着ノエル0 / 水着ころね2",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(NOEL2, KORONE2),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [13.4, 74.8, 62.8, 1.8, 44.5],
    after: [13.8, 74.8, 82.3, 1.9, 44.5],
  },
  {
    name: "+24 恒常マリン1 / 水着ころね2",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(MARINE1, KORONE2),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [15.6, 78.2, 61.7, 2.0, 47.9],
    after: [15.9, 78.2, 82.1, 2.1, 47.9],
  },
  {
    name: "+24 水着ミオ1 / 恒常マリン1",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(MIO2, MARINE1),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [17.4, 72.1, 65.9, 0, 43.6],
    after: [17.3, 72.1, 86.9, 0, 43.6],
  },
  {
    name: "+24 水着フブキ0 / 恒常マリン1",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(FUBUKI2, MARINE1),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [14.5, 70.8, 54.2, 0.8, 42.8],
    after: [14.9, 70.8, 72.4, 0.8, 42.8],
  },
  {
    name: "+24 恒常フブキ1 / 恒常マリン1",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(FUBUKI1, MARINE1),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [16.5, 77.4, 59.2, 0, 46.9],
    after: [16.8, 77.4, 79.5, 0, 46.9],
  },
  {
    name: "+24 恒常フブキ1 / 水着ころね2",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(FUBUKI1, KORONE2),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [14.5, 79.4, 61.5, 1.9, 48.1],
    after: [15.0, 79.4, 81.7, 1.9, 48.1],
  },
  {
    name: "+24 恒常フブキ1 / 恒常ころね3",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(FUBUKI1, KORONE1),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [15.1, 77.4, 62.9, 2.0, 49.7],
    after: [15.5, 77.4, 83.0, 2.0, 49.7],
  },
  {
    name: "R-061 +3 水着ミオ1 / 水着ころね2（曲なし）",
    group: "r061+3",
    leaderId: FL,
    members: pair(MIO2, KORONE2),
    blue: S12,
    songBonus: 0,
    xBefore: 23,
    xAfter: 26,
    before: [14.0, 77.7, 38.1, 1.9, 47.0],
    after: [14.1, 77.7, 40.7, 1.9, 47.0],
  },
  {
    name: "R-002 +10 旧おかゆ編成（黄 3%、青は 09-08）",
    group: "noCostume+10",
    leaderId: OL,
    members: [PEKORA1, KORONE2, OKAYU2, FUBUKI2, MIO2],
    blue: BLUE_2026_09_08,
    songBonus: 0.03,
    xBefore: 0,
    xAfter: 10,
    before: [0, 77.0, 21.0, 2.3, 46.0],
    after: [0, 77.0, 29.4, 2.7, 46.0],
  },
  {
    name: "R-002 +10 ノエル入替（黄 3%）",
    group: "noCostume+10",
    leaderId: OL,
    members: [OKAYU2, KORONE2, MIO2, FUBUKI2, NOEL2],
    blue: BLUE_AT_NOEL_OBSERVATION,
    songBonus: 0.03,
    xBefore: 0,
    xAfter: 10,
    before: [0, 78.9, 17.3, 1.5, 46.3],
    after: [0, 78.9, 25.3, 2.0, 46.3],
  },
  {
    name: "R-002 +10 水着フワワ入り 3 編成目（黄 3%）",
    group: "noCostume+10",
    leaderId: OL,
    members: [MIO2, OKAYU2, KORONE2, PEKORA1, FUWAWA2],
    blue: S12,
    songBonus: 0.03,
    xBefore: 0,
    xAfter: 10,
    before: [0, 77.9, 18.6, 0.9, 47.2],
    after: [0, 77.9, 27.0, 1.2, 47.2],
  },
  {
    name: "水着ミオリーダー +24（黄 0、青は 09-08）",
    group: "noCostume+24",
    leaderId: ML,
    members: [OKAYU2, KORONE2, MIO2, FUBUKI2, PEKORA1],
    blue: BLUE_2026_09_08,
    songBonus: 0,
    xBefore: 28.1,
    xAfter: 52.1,
    before: [0, 77.0, 38.2, 3.1, 46.0],
    after: [0, 77.0, 59.1, 3.3, 46.0],
  },
  {
    name: "水着ミオリーダー +24（黄 10%、青は 09-08）",
    group: "noCostume+24",
    leaderId: ML,
    members: [OKAYU2, KORONE2, MIO2, FUBUKI2, PEKORA1],
    blue: BLUE_2026_09_08,
    songBonus: 0.1,
    xBefore: 28.1,
    xAfter: 52.1,
    before: [0, 77.0, 60.9, 3.1, 46.0],
    after: [0, 77.0, 81.8, 3.3, 46.0],
  },
  {
    name: "exploratory 恒常みこ0（Lv 約 20）/ 水着フブキ0 / 恒常マリン1",
    group: "exploratory",
    leaderId: FL,
    members: [MIKO1, FUBUKI2, FUWAWA2, OKAYU2, MARINE1],
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [0, 61.0, 46.2, 2.6, 37.5],
    after: [0, 61.0, 62.4, 2.8, 37.5],
  },
];

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
