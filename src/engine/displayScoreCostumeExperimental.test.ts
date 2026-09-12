import { describe, expect, it } from "vite-plus/test";

import { round1 } from "./displayScore";
import type { BlueTable, CategoryContrast } from "./displayScoreCategoryCorpus.fixture";
import {
  CATEGORY_CONTRASTS,
  holomenMap,
  memberFor,
  realCard,
} from "./displayScoreCategoryCorpus.fixture";
import type {
  CostumeEnvironment,
  CostumeEvaluatorOptions,
  CostumeQuantization,
} from "./displayScoreCostumeExperimental";
import {
  buildCostumeEnvironment,
  costumeErrorStats,
  experimentalCostumeEvaluate,
  experimentalCostumeFeatures,
  quantizeTenth,
} from "./displayScoreCostumeExperimental";

/**
 * **これはゲーム仕様の Golden ではなく、衣装欄（by_live_leader_skill 相当）の絶対値を独立に算出する候補評価器の回帰評価
 * （解析用・production 未採用）。** 実測値はモデルに合わせて変えない。ここで固定するのは 2026-09-12 時点の**反証と観測された構造**で、式ではない。
 *
 * コーパス（docs/human/repro/display-score-20260912.md）: 水着フワワ 0凸リーダー、衣装条件（ピュア 2 人以上）成立。
 * - 9 編成の衣装欄（Gamers X=26 / FUWAMOCO X=50）: reported + cross-checked
 * - 同一編成（水着ミオ1 / 水着ころね2）の X = 23 / 26 / 50 系列: 14.0 / 14.1 / 14.6
 * - negative control: 恒常みこ入替でピュア 1 人（条件不成立）→ 衣装欄は非表示（0）
 */

const nine = CATEGORY_CONTRASTS.filter((c) => c.group === "fuwawa+24");
const r061 = CATEGORY_CONTRASTS.find((c) => c.group === "r061+3");
const exploratory = CATEGORY_CONTRASTS.find((c) => c.group === "exploratory");
if (!r061 || !exploratory) throw new Error("コーパスが足りない");
const SERIES: CategoryContrast = r061;
const NEGATIVE_CONTROL: CategoryContrast = exploratory;

function environment(c: CategoryContrast, fuwawaBlue?: [number, number]): CostumeEnvironment {
  const table: BlueTable = fuwawaBlue ? { ...c.blue, "fuwawa-abyssgard": fuwawaBlue } : c.blue;
  return buildCostumeEnvironment(
    realCard(c.leaderId),
    c.members.map((s) => memberFor(s, table)),
    holomenMap,
  );
}
const envs = nine.map((c) => environment(c));
const obs = nine.map((c) => c.before[0]);
const obsAfter = nine.map((c) => c.after[0]);

/** 同じコア 3 枚で A / B 枠のカード 1 枚だけが違う編成の組（index は nine の順） */
const SWAP_PAIRS: readonly (readonly [number, number, string])[] = [
  [0, 3, "水着ミオ1 → 恒常マリン1（水着ころね2 固定）"],
  [0, 4, "水着ころね2 → 恒常マリン1（水着ミオ1 固定）"],
  [1, 5, "水着ころね2 → 恒常マリン1（水着フブキ0 固定）"],
  [7, 6, "水着ころね2 → 恒常マリン1（恒常フブキ1 固定）"],
  [7, 8, "水着ころね2 → 恒常ころね3（恒常フブキ1 固定）"],
  [0, 1, "水着ミオ1 → 水着フブキ0（水着ころね2 固定）"],
  [0, 2, "水着ミオ1 → 水着ノエル0（水着ころね2 固定）"],
  [0, 7, "水着ミオ1 → 恒常フブキ1（水着ころね2 固定）"],
  [4, 5, "水着ミオ1 → 水着フブキ0（恒常マリン1 固定）"],
  [4, 6, "水着ミオ1 → 恒常フブキ1（恒常マリン1 固定）"],
];

interface Scored {
  label: string;
  options: CostumeEvaluatorOptions;
  rmse: number;
  maxAbsError: number;
  bias: number;
  deltaRmse: number;
  seriesMaxError: number;
  swapSigns: number;
}
function score(
  label: string,
  options: CostumeEvaluatorOptions,
  quantization: CostumeQuantization = "round",
  environments: CostumeEnvironment[] = envs,
): Scored {
  const before = nine.map((c, i) =>
    quantizeTenth(
      experimentalCostumeEvaluate(environments[i] as CostumeEnvironment, c.xBefore, options),
      quantization,
    ),
  );
  const after = nine.map((c, i) =>
    quantizeTenth(
      experimentalCostumeEvaluate(environments[i] as CostumeEnvironment, c.xAfter, options),
      quantization,
    ),
  );
  const abs = costumeErrorStats(before.map((v, i) => v - (obs[i] ?? 0)));
  const delta = costumeErrorStats(
    before.map((v, i) => round1((after[i] ?? 0) - v) - round1((obsAfter[i] ?? 0) - (obs[i] ?? 0))),
  );
  const envR = environment(SERIES);
  const series = [23, 26, 50].map((x) =>
    quantizeTenth(experimentalCostumeEvaluate(envR, x, options), quantization),
  );
  const seriesMaxError = Math.max(
    Math.abs(round1((series[1] ?? 0) - (series[0] ?? 0)) - 0.1),
    Math.abs(round1((series[2] ?? 0) - (series[1] ?? 0)) - 0.5),
  );
  const swapSigns = SWAP_PAIRS.filter(
    ([a, b]) =>
      Math.sign((obs[b] ?? 0) - (obs[a] ?? 0)) === Math.sign((before[b] ?? 0) - (before[a] ?? 0)),
  ).length;
  return {
    label,
    options,
    rmse: abs.rmse,
    maxAbsError: abs.maxAbsError,
    bias: abs.bias,
    deltaRmse: delta.rmse,
    seriesMaxError,
    swapSigns,
  };
}

/** 自由係数なしの候補族（ゲーム上の意味を持つ選択肢の直積。support は記載の 25 のまま） */
function candidateFamily(): { label: string; options: CostumeEvaluatorOptions }[] {
  const out: { label: string; options: CostumeEvaluatorOptions }[] = [];
  for (const ups of ["resolved", "unconditional"] as const)
    for (const timeline of ["base", "blue"] as const)
      for (const probability of ["p0", "blueAdditive", "blueMultiplicative"] as const)
        for (const effect of ["multiplier", "additive", "presence"] as const)
          for (const normalization of ["maxOne", "none", "sumP", "count"] as const)
            for (const red of ["none", "upsScaled"] as const)
              for (const candidateCount of [undefined, { min: 1, max: 1 }, { min: 2, max: 5 }]) {
                if (effect !== "multiplier" && (ups === "unconditional" || red === "upsScaled"))
                  continue;
                const options: CostumeEvaluatorOptions = {
                  ups,
                  timeline,
                  probability,
                  effect,
                  normalization,
                  red,
                  ...(candidateCount ? { candidateCount } : {}),
                };
                out.push({
                  label: `${ups} ${timeline} ${probability} ${effect} ${normalization} red:${red} k:${candidateCount ? `${candidateCount.min}-${candidateCount.max}` : "all"}`,
                  options,
                });
              }
  return out;
}

describe("衣装欄（by_live_leader_skill 相当）の独立評価器: 候補族の回帰評価（解析用。仕様の Golden ではなく反証と観測構造の固定）", () => {
  it("コーパス: 9 編成の衣装欄は 13.4〜17.4、同一編成の X 系列は 14.0 / 14.1 / 14.6、アクティブ欄は 9 編成とも評価器の E_base と 0.1 以内で一致する", () => {
    expect(Math.min(...obs)).toBe(13.4);
    expect(Math.max(...obs)).toBe(17.4);
    expect(SERIES.before[0]).toBe(14.0);
    expect(SERIES.after[0]).toBe(14.1);
    expect(nine[0]?.after[0]).toBe(14.6);
    // タイムライン入力（カード ID・開花・条件解決）が正しいことの cross-check: アクティブ欄
    nine.forEach((c, i) => {
      const f = experimentalCostumeFeatures(envs[i] as CostumeEnvironment);
      expect(Math.abs(Math.ceil(f.eBase * 10) / 10 - c.before[1]), c.name).toBeLessThanOrEqual(0.1);
    });
  });

  it("negative control: 衣装条件（ピュア 2 人以上）が不成立なら、どの候補評価器でも衣装欄は 0", () => {
    const env = environment(NEGATIVE_CONTROL);
    expect(env.supportPercent).toBe(0);
    for (const { options } of candidateFamily()) {
      expect(experimentalCostumeEvaluate(env, 26, options)).toBe(0);
    }
    const met = envs[0] as CostumeEnvironment;
    expect(met.supportPercent).toBe(25);
  });

  it("実機の衣装欄は「アクティブ × 一様な 0.25」ではない: 0.25 × E_base / E_blue / 線形和 はどれも +3.9 pt 以上の系統的過大で、上限 0.25 × E_base を 9 編成すべてが下回る", () => {
    const uniform = [
      score("0.25×E_base", {}),
      score("0.25×E_blueAdd", { timeline: "blue", probability: "blueAdditive" }),
      score("0.25×E_blueMul", { timeline: "blue", probability: "blueMultiplicative" }),
      score("0.25×linBase", { normalization: "none" }),
    ];
    for (const s of uniform) {
      expect(s.bias, s.label).toBeGreaterThan(3.8);
      expect(s.rmse, s.label).toBeGreaterThan(4);
    }
    nine.forEach((c, i) => {
      const f = experimentalCostumeFeatures(envs[i] as CostumeEnvironment);
      expect(0.25 * f.eBase, c.name).toBeGreaterThan(c.before[0] + 0.5);
    });
    // 同時比例 C = k × Active の否定（係数探索はしない）: Active が低い編成の方が衣装欄が高い対照
    expect(nine[4]?.before[1]).toBeLessThan(nine[0]?.before[1] ?? 0);
    expect(nine[4]?.before[0]).toBeGreaterThan(nine[0]?.before[0] ?? 0);
  });

  it("自由係数なしの候補族（up 2 × タイムライン 2 × 確率 3 × 効き方 3 × 正規化 4 × 赤 2 × 候補人数 3）に、9 編成の絶対値を RMSE 0.8 以下で再現するものはない（2026-09-12 の反証）", () => {
    const scored = candidateFamily().map(({ label, options }) => score(label, options));
    expect(scored.length).toBeGreaterThan(200);
    const best = scored.reduce((a, b) => (b.rmse < a.rmse ? b : a));
    // 2026-09-12: 最良は count 正規化 + 青タイムライン + 赤で up を増幅 の RMSE 1.00 / 最大 1.8（X 系列は 2.4 外す）
    expect(best.rmse).toBeGreaterThan(0.8);
    for (const s of scored) {
      const fits = s.rmse <= 0.5 && s.deltaRmse <= 0.3 && s.seriesMaxError <= 0.2;
      expect(fits, s.label).toBe(false);
    }
  });

  it("赤 X との交差: 評価器の up を ×(1 + X/100) すると +24 の衣装増分が 2 pt 以上過大（実機 +0.3〜+0.5）、赤を入れなければ増分 0 で実機の小さな増分が残る", () => {
    for (const label of ["multiplier maxOne", "multiplier none", "multiplier count"] as const) {
      const normalization = label.split(" ")[1] as CostumeEvaluatorOptions["normalization"];
      const scaled = score(`red×ups ${label}`, { normalization, red: "upsScaled" });
      const none = score(`red none ${label}`, { normalization });
      expect(scaled.deltaRmse, scaled.label).toBeGreaterThan(1.5);
      expect(scaled.seriesMaxError, scaled.label).toBeGreaterThan(1.5);
      expect(none.deltaRmse, none.label).toBeLessThan(0.5);
      expect(none.seriesMaxError, none.label).toBeCloseTo(0.5, 1);
    }
    // 実機の増分そのもの: +24 で −0.1〜+0.5、R-061 +3 で +0.1
    const observedDeltas = nine.map((c) => round1(c.after[0] - c.before[0]));
    expect(Math.min(...observedDeltas)).toBe(-0.1);
    expect(Math.max(...observedDeltas)).toBe(0.5);
    expect(round1(SERIES.after[0] - SERIES.before[0])).toBe(0.1);
  });

  it("メンバー 1 枚差: 条件解決済み up の一様評価器は 10 組の入替方向を 7 組以下しか当てないが、条件つきスコア UP を基準値のまま扱う評価器は 9 組以上当てる（構造の観測。絶対値は RMSE 1.4 で合わない）", () => {
    const resolved = score("resolved 0.25×E_base", {});
    const unconditional = score("unconditional 0.25×E_base", { ups: "unconditional" });
    expect(resolved.swapSigns).toBeLessThanOrEqual(7);
    expect(unconditional.swapSigns).toBeGreaterThanOrEqual(9);
    expect(unconditional.rmse).toBeGreaterThan(1.2);
    // 入替効果は相手枠に強く依存する（加法ではない）: 水着ころね2 → 恒常マリン1 は 水着ミオ1 と組むと +3.3、水着フブキ0 と組むと +0.8、恒常フブキ1 と組むと +2.0
    const delta = (a: number, b: number) => round1((obs[b] ?? 0) - (obs[a] ?? 0));
    expect(delta(0, 4)).toBe(3.3);
    expect(delta(1, 5)).toBe(0.8);
    expect(delta(7, 6)).toBe(2.0);
    // 水着ミオ1 と 恒常マリン1 は周期 23 秒・効果 8 秒が同一で候補窓が完全に重なる
    const e = envs[4] as CostumeEnvironment;
    expect(e.views[1]?.active?.intervalSeconds).toBe(23);
    expect(e.views[4]?.active?.intervalSeconds).toBe(23);
    expect(e.views[1]?.active?.durationSeconds).toBe(8);
    expect(e.views[4]?.active?.durationSeconds).toBe(8);
  });

  it("量子化（round / ceil / floor）の差は RMSE で 0.1 以下: 候補族の 1〜5 pt の破綻は量子化では説明できない", () => {
    const representatives: [string, CostumeEvaluatorOptions][] = [
      ["0.25×E_base", {}],
      ["presence base", { effect: "presence" }],
      ["unconditional 0.25×E_base", { ups: "unconditional" }],
      ["count blue red×ups", { timeline: "blue", normalization: "count", red: "upsScaled" }],
    ];
    for (const [label, options] of representatives) {
      const r = score(label, options, "round").rmse;
      const c = score(label, options, "ceil").rmse;
      const f = score(label, options, "floor").rmse;
      expect(Math.max(r, c, f) - Math.min(r, c, f), label).toBeLessThanOrEqual(0.1);
    }
  });

  it("水着フワワの青 45/0 と 0/0（provenance 未解決）: 基準タイムラインの候補は不変、青を使う候補も RMSE の差は 0.5 以下で、どちらも衣装欄を説明しない（裁定には使わない）", () => {
    const reported = nine.map((c) => environment(c, [45, 0]));
    const cases: [string, CostumeEvaluatorOptions][] = [
      ["0.25×E_base", {}],
      ["0.25×E_blueMul", { timeline: "blue", probability: "blueMultiplicative" }],
      [
        "presence blueMul",
        { effect: "presence", timeline: "blue", probability: "blueMultiplicative" },
      ],
      [
        "unconditional blue blueAdd k2-5",
        {
          ups: "unconditional",
          timeline: "blue",
          probability: "blueAdditive",
          candidateCount: { min: 2, max: 5 },
        },
      ],
    ];
    for (const [label, options] of cases) {
      const zero = score(label, options, "round", envs).rmse;
      const fortyFive = score(label, options, "round", reported).rmse;
      if (options.probability === undefined || options.probability === "p0") {
        expect(fortyFive, label).toBeCloseTo(zero, 6);
      } else {
        expect(Math.abs(fortyFive - zero), label).toBeLessThanOrEqual(0.5);
      }
      expect(Math.min(zero, fortyFive), label).toBeGreaterThan(1);
    }
  });
});
