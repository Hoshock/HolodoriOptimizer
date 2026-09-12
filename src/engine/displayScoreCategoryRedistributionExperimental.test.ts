import { describe, expect, it } from "vite-plus/test";
import type { Card } from "../data/types";
import { round1 } from "./displayScore";
import type { CategoryContrast, Five, LeaderContrast } from "./displayScoreCategoryCorpus.fixture";
import {
  CATEGORY_CONTRASTS,
  holomenMap,
  LEADER_CONTRASTS,
  LEADER_SUPPORT_ID,
  LEADER_SUPPORT_PERCENT,
  memberFor,
  realCard,
} from "./displayScoreCategoryCorpus.fixture";
import type {
  CategoryTriple,
  DisplayCategory,
  Interval,
  ResidualRouting,
} from "./displayScoreCategoryRedistributionExperimental";
import {
  categoryTriple,
  commonNormalization,
  deltaTriple,
  displayInterval,
  DISPLAY_CATEGORIES,
  impliedScale,
  NON_NATIVE,
  nonNativeCommonScale,
  nonNativeResidual,
  nonNativeWeightRatio,
  redistributionErrors,
} from "./displayScoreCategoryRedistributionExperimental";
import type { CostumeEvaluatorOptions } from "./displayScoreCostumeExperimental";
import {
  buildCostumeEnvironment,
  experimentalCostumeEvaluate,
} from "./displayScoreCostumeExperimental";
import {
  buildLeaderSupportEnvironment,
  expectedActive,
  expectedActiveCStar,
} from "./displayScoreLeaderSupportExperimental";
import {
  attributeColumns,
  buildSourceEnvironment,
  evaluateTotal,
  sourceErrorStats,
} from "./displayScoreSourceAttributionExperimental";

/**
 * **これはゲーム仕様の Golden ではなく、「1 つの source を変えた matched pair では native カテゴリ以外の 2 欄が
 * 共通倍率で scale する」という構造仮説の回帰評価（解析用・production 未採用）。** 実測値はモデルに合わせて変えない。
 * 固定するのは 2026-09-13 時点の支持・反証で、式ではない。
 *
 * 計算は 1 つで、source ごとに違うのは native カテゴリ（リーダー衣装 → 衣装、赤 → ボード、パッシブ → パッシブ）だけ。
 * ケース ID や Leader / Red 固有の分岐は置かない。
 */

const S = LEADER_SUPPORT_PERCENT;
const kronii = realCard(LEADER_SUPPORT_ID);
const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;
const asPair = (iv: Interval | null): [number, number] | null =>
  iv ? [round4(iv.lo), round4(iv.hi)] : null;

const leaderMembers = (c: LeaderContrast): Card[] => c.members.map((s) => memberFor(s, c.blue));
const redMembers = (c: CategoryContrast): Card[] => c.members.map((s) => memberFor(s, c.blue));
const leaderByName = (prefix: string): LeaderContrast => {
  const c = LEADER_CONTRASTS.find((x) => x.name.startsWith(prefix));
  if (!c) throw new Error(`${prefix} がない`);
  return c;
};
const K1 = leaderByName("K1");
const K2 = leaderByName("K2");
const K3 = leaderByName("K3");
const K4 = leaderByName("K4");
const K5 = leaderByName("K5");
const K6 = leaderByName("K6");
/** 青ありの 4 組（K5 / K6 は青なしの negative control） */
const interacting = [K1, K2, K3, K4];

/** matched pair 1 件を native 非依存の形にしたもの */
interface Pair {
  name: string;
  native: DisplayCategory;
  before: Five;
  after: Five;
}
const leaderPair = (c: LeaderContrast): Pair => ({
  name: c.name,
  native: "costume",
  before: c.baseline,
  after: c.support,
});
const redPair = (c: CategoryContrast): Pair => ({
  name: c.name,
  native: "board",
  before: c.before,
  after: c.after,
});

/** oracle: 非 native 2 欄の実測 Δ の和だけを与え、分け方を評価する */
const oracleErrors = (p: Pair, routing: ResidualRouting) => {
  const deltas = deltaTriple(p.before, p.after);
  return redistributionErrors(
    p.native,
    categoryTriple(p.before),
    nonNativeResidual(p.native, deltas),
    deltas,
    routing,
  );
};
/** 非 native 2 欄がどちらも 0.1 の刻みで情報を持つ（= 共通倍率の支持ケースに数えてよい）行 */
const twoInformative = (p: Pair): boolean =>
  nonNativeCommonScale(p.native, p.before, p.after).informative === 2;

describe("native カテゴリの一般則（source ごとに変わるのは native の選び方だけ）", () => {
  it("native 以外の 2 カテゴリの組は 3 通りで、計算はどれも同じ 1 本", () => {
    expect(NON_NATIVE.costume).toEqual(["board", "passive"]);
    expect(NON_NATIVE.board).toEqual(["costume", "passive"]);
    expect(NON_NATIVE.passive).toEqual(["costume", "board"]);
    expect(DISPLAY_CATEGORIES).toEqual(["costume", "board", "passive"]);
  });

  it("共通 normalization `C = λW_C / B = λW_B / P = λW_P` なら、native の W だけ変えたとき残り 2 欄の比は保存される", () => {
    // 代数的な確認（実測ではない）。どの native でも同じ結論になることを 3 通りとも見る
    const weights: CategoryTriple = { costume: 3, board: 7, passive: 2 };
    for (const native of DISPLAY_CATEGORIES) {
      const before = commonNormalization(weights, 24);
      const bumped: CategoryTriple = { ...weights, [native]: weights[native] + 5 };
      const after = commonNormalization(bumped, 40);
      const [x, y] = NON_NATIVE[native];
      // 非 native の raw weight は変えていないので比はそのまま
      expect(nonNativeWeightRatio(native, bumped)).toBe(nonNativeWeightRatio(native, weights));
      // 表示値の比も保存され、2 欄は同じ倍率 λ'/λ で動く
      expect(after.predicted[x] / after.predicted[y]).toBeCloseTo(
        before.predicted[x] / before.predicted[y],
        12,
      );
      expect(after.predicted[x] / before.predicted[x]).toBeCloseTo(
        after.predicted[y] / before.predicted[y],
        12,
      );
      // λ は「合計 = targetTotal」から決まるので fit する係数ではない
      expect(after.lambda * (bumped.costume + bumped.board + bumped.passive)).toBeCloseTo(40, 12);
    }
  });

  it("アクティブ欄 / SP 欄はこの normalization の対象外（どの matched pair でも動かない）", () => {
    for (const c of LEADER_CONTRASTS) {
      expect(c.support[1]).toBe(c.baseline[1]);
      expect(c.support[4]).toBe(c.baseline[4]);
    }
    for (const c of CATEGORY_CONTRASTS) {
      expect(c.after[1]).toBe(c.before[1]);
      expect(c.after[4]).toBe(c.before[4]);
    }
  });
});

describe("リーダー衣装を変える（native = 衣装 → ボード : パッシブ が保存）", () => {
  it("K1 / K3 / K4 は 2 欄とも情報があり、共通倍率の区間は空でない", () => {
    expect(asPair(nonNativeCommonScale("costume", K1.baseline, K1.support).interval)).toEqual([
      2.1211, 2.1493,
    ]);
    expect(asPair(nonNativeCommonScale("costume", K3.baseline, K3.support).interval)).toEqual([
      2.0657, 2.1111,
    ]);
    expect(asPair(nonNativeCommonScale("costume", K4.baseline, K4.support).interval)).toEqual([
      1.9641, 1.9948,
    ]);
    for (const c of [K1, K3, K4]) expect(twoInformative(leaderPair(c))).toBe(true);
  });

  it("K2 はパッシブ欄 0.0、K6 はボード欄 0.0 で 1 列だけの diagnostic、K5 は情報なし", () => {
    const k2 = nonNativeCommonScale("costume", K2.baseline, K2.support);
    expect(k2.informative).toBe(1);
    expect(asPair(k2.interval)).toEqual([1.4039, 1.4197]);
    const k6 = nonNativeCommonScale("costume", K6.baseline, K6.support);
    expect(k6.informative).toBe(1);
    expect(asPair(k6.interval)).toEqual([0.9661, 1.0351]);
    const k5 = nonNativeCommonScale("costume", K5.baseline, K5.support);
    expect(k5.informative).toBe(0);
    expect(k5.interval).toBeNull();
  });

  it("oracle の ボード : パッシブ 比例は K1〜K4 で RMSE 0.075 / 最大 0.134、対照の boardOnly は最大 1.4", () => {
    const prop = interacting.map((c) => oracleErrors(leaderPair(c), "proportionalBaseline"));
    const st = sourceErrorStats(prop.map((e) => e.errors.passive));
    expect(st.rmse).toBeCloseTo(0.0752, 3);
    expect(st.maxAbsError).toBeCloseTo(0.1342, 3);
    for (const e of prop) expect(e.errors.board + e.errors.passive).toBeCloseTo(0, 9);
    const boardOnly = interacting.map((c) => oracleErrors(leaderPair(c), "boardOnly"));
    expect(sourceErrorStats(boardOnly.map((e) => e.errors.passive)).maxAbsError).toBeCloseTo(
      1.4,
      6,
    );
    // oracle 残差から求めた k は 4 組とも区間の中
    for (const c of interacting) {
      const p = leaderPair(c);
      const k = impliedScale(
        "costume",
        categoryTriple(p.before),
        nonNativeResidual("costume", deltaTriple(p.before, p.after)),
      );
      const iv = nonNativeCommonScale("costume", p.before, p.after).interval;
      if (k === null || !iv) throw new Error(`${c.name} の k / 区間がない`);
      expect(k).toBeGreaterThanOrEqual(iv.lo);
      expect(k).toBeLessThanOrEqual(iv.hi);
    }
  });
});

describe("赤スコアサポートを変える（native = ボード → 衣装 : パッシブ が保存）", () => {
  const pairs = CATEGORY_CONTRASTS.map(redPair);
  const primary = CATEGORY_CONTRASTS.filter((c) => c.group !== "exploratory").map(redPair);
  const twoCol = pairs.filter(twoInformative);

  it("衣装欄・パッシブ欄がどちらも情報を持つ 8 行すべてで、共通倍率の区間が空でない", () => {
    expect(twoCol.length).toBe(8);
    const intervals = twoCol.map((p) => [
      p.name.slice(0, 24),
      asPair(nonNativeCommonScale(p.native, p.before, p.after).interval),
    ]);
    expect(intervals).toEqual([
      ["+24 水着ミオ1 / 水着ころね2", [1.0283, 1.0427]],
      ["+24 水着フブキ0 / 水着ころね2", [1.0218, 1.0366]],
      ["+24 水着ノエル0 / 水着ころね2", [1.0223, 1.0375]],
      ["+24 恒常マリン1 / 水着ころね2", [1.0128, 1.0257]],
      ["+24 水着フブキ0 / 恒常マリン1", [1.0206, 1.0346]],
      ["+24 恒常フブキ1 / 水着ころね2", [1.0275, 1.0415]],
      ["+24 恒常フブキ1 / 恒常ころね3", [1.0198, 1.0332]],
      ["R-061 +3 水着ミオ1 / 水着ころね2（曲なし）".slice(0, 24), [1.0, 1.0143]],
    ]);
    // exploratory（恒常みこ Lv 約 20）は衣装欄 0.0 なので 1 列だけ。primary fit には入らないし入れても結論は変わらない
    const exploratory = pairs.find((p) => p.name.startsWith("exploratory"));
    if (!exploratory) throw new Error("exploratory 行がない");
    expect(
      nonNativeCommonScale(exploratory.native, exploratory.before, exploratory.after).informative,
    ).toBe(1);
    expect(twoCol.every((p) => primary.some((q) => q.name === p.name))).toBe(true);
  });

  it("残り 8 行は 1 列しか拘束しない one-dimensional diagnostic（支持ケースに数えない）", () => {
    const oneCol = pairs.filter(
      (p) => nonNativeCommonScale(p.native, p.before, p.after).informative === 1,
    );
    expect(oneCol.length).toBe(8);
    // 衣装欄 0.0 の 6 行（赤だけを変えた無衣装編成）とパッシブ欄 0.0 の 2 行
    expect(oneCol.filter((p) => categoryTriple(p.before).costume === 0).length).toBe(6);
    expect(oneCol.filter((p) => categoryTriple(p.before).passive === 0).length).toBe(2);
  });

  it("oracle の 衣装 : パッシブ 比例は 8 行で RMSE 0.043 / 最大 0.059", () => {
    const e = twoCol.map((p) => oracleErrors(p, "proportionalBaseline"));
    const st = sourceErrorStats(e.map((x) => x.errors.passive));
    expect(st.rmse).toBeCloseTo(0.0429, 4);
    expect(st.maxAbsError).toBeCloseTo(0.0594, 4);
    expect(st.bias).toBeCloseTo(0.0102, 4);
    expect(sourceErrorStats(e.map((x) => x.errors.costume)).rmse).toBeCloseTo(0.0429, 4);
    // 代表 3 行の予測値
    const shown = twoCol
      .filter((p) => [14.1, 13.7, 15.6].includes(categoryTriple(p.before).costume))
      .map((p) => {
        const r = oracleErrors(p, "proportionalBaseline");
        return [round4(r.predicted.costume), round4(r.predicted.passive)];
      });
    expect(shown).toEqual([
      [0.4406, 0.0594],
      [0.4202, 0.0798],
      [0.3545, 0.0455],
    ]);
  });

  it("対照: 全部を衣装へ回すと「パッシブ欄は動かない」を意味し、パッシブ欄が 0.1 上がった 3 行で棄却される", () => {
    // 真値が不変なら表示値は変わりえない。つまり量子化では逃げられない反証
    const moved = twoCol.filter((p) => deltaTriple(p.before, p.after).passive !== 0);
    expect(moved.length).toBe(3);
    expect(moved.map((p) => deltaTriple(p.before, p.after).passive)).toEqual([0.1, 0.1, 0.1]);
    for (const p of moved) {
      expect(oracleErrors(p, "costumeOnly").predicted.passive).toBe(0);
    }
    const st = sourceErrorStats(twoCol.map((p) => oracleErrors(p, "costumeOnly").errors.costume));
    expect(st.rmse).toBeCloseTo(0.0612, 4);
    expect(st.maxAbsError).toBeCloseTo(0.1, 6);
  });

  it("対照: 全部をパッシブへ回す / native をリーダーと取り違えて ボード : パッシブ で分ける は大きく外す", () => {
    const passiveOnly = sourceErrorStats(
      twoCol.map((p) => oracleErrors(p, "passiveOnly").errors.passive),
    );
    expect(passiveOnly.rmse).toBeCloseTo(0.3937, 4);
    expect(passiveOnly.maxAbsError).toBeCloseTo(0.5, 6);
    // native = 衣装 とみなす（cb6b5c6 が赤へ当てていた規則）。同じ関数に別の native を渡すだけ
    const wrong = twoCol.map((p) => {
      const deltas = deltaTriple(p.before, p.after);
      return redistributionErrors(
        "costume",
        categoryTriple(p.before),
        nonNativeResidual("costume", deltas),
        deltas,
        "proportionalBaseline",
      );
    });
    const st = sourceErrorStats(wrong.map((x) => x.errors.passive));
    expect(st.rmse).toBeCloseTo(0.518, 3);
    expect(st.maxAbsError).toBeCloseTo(0.6919, 3);
  });
});

describe("共通 normalization を使った native raw weight の再評価（oracle-baseline stage）", () => {
  /**
   * gauge: 支援なし側の表示値をそのまま raw weight にする（W_C = 0 / W_B = 実測ボード / W_P = 実測パッシブ）。
   * このとき baseline の λ は 1 になる。**baseline を実測で与えているので完全予測ではない** — native の
   * raw weight 評価器だけを isolated に見る段。target は baseline 合計 + 既存の確定扱い総増分 `S/100 × E_blue(乗算)`。
   */
  const stage = (c: LeaderContrast, deltaWeightCostume: number) => {
    const env = buildLeaderSupportEnvironment(kronii, leaderMembers(c), holomenMap);
    const base = categoryTriple(c.baseline);
    const target =
      base.costume +
      base.board +
      base.passive +
      (S / 100) * expectedActive(env, { blue: "multiplicative" });
    return commonNormalization(
      { costume: deltaWeightCostume, board: base.board, passive: base.passive },
      target,
    );
  };
  /** oracle が要求する ΔW_C（実測の 3 欄から逆算した値。候補の当てはめ先） */
  const requiredWeight = (c: LeaderContrast): number | null => {
    const a = categoryTriple(c.support);
    const b = categoryTriple(c.baseline);
    return a.board + a.passive > 0
      ? ((b.board + b.passive) * a.costume) / (a.board + a.passive)
      : null;
  };

  const candidates = (c: LeaderContrast): Record<string, number> => {
    const members = leaderMembers(c);
    const env = buildLeaderSupportEnvironment(kronii, members, holomenMap);
    const cEnv = buildCostumeEnvironment(kronii, members, holomenMap);
    const srcEnv = buildSourceEnvironment(kronii, members, holomenMap);
    const out: Record<string, number> = {
      "C*": (S / 100) * expectedActiveCStar(env),
      p0Only: attributeColumns(srcEnv, { passive: "static", rule: "p0Only" }).costume,
      "S×E_base": (S / 100) * expectedActive(env, { blue: "none" }),
      "S×E_blue": (S / 100) * expectedActive(env, { blue: "multiplicative" }),
    };
    const counts = [
      { label: "all", range: { min: 1, max: 5 } },
      { label: "solo", range: { min: 1, max: 1 } },
      { label: "multi", range: { min: 2, max: 5 } },
    ];
    for (const ups of ["resolved", "unconditional"] as const)
      for (const timeline of ["base", "blue"] as const)
        for (const probability of ["p0", "blueAdditive", "blueMultiplicative"] as const)
          for (const effect of ["multiplier", "additive", "presence"] as const)
            for (const normalization of ["maxOne", "none", "sumP", "count"] as const)
              for (const c2 of counts) {
                const o: CostumeEvaluatorOptions = {
                  ups,
                  timeline,
                  probability,
                  effect,
                  normalization,
                  candidateCount: c2.range,
                };
                out[`${ups}|${timeline}|${probability}|${effect}|${normalization}|${c2.label}`] =
                  experimentalCostumeEvaluate(cEnv, 0, o);
              }
    return out;
  };

  it("oracle が要求する ΔW_C は K1 / K3 / K4 で 18.1〜18.8 とほぼ同じだが、パッシブ支援のない K2 だけ 32.7", () => {
    expect(interacting.map((c) => round4(requiredWeight(c) ?? 0))).toEqual([
      18.1031, 32.725, 18.5642, 18.7511,
    ]);
    // 青なしの K6 は 総増分そのもの（S/100 × E_base）を要求する。青があると 0.35〜0.63 倍に縮む
    expect(round4(requiredWeight(K6) ?? 0)).toBe(44.3);
    const env6 = buildLeaderSupportEnvironment(kronii, leaderMembers(K6), holomenMap);
    expect((S / 100) * expectedActive(env6, { blue: "multiplicative" })).toBeCloseTo(44.216, 2);
    // K5 は ボード・パッシブ とも 0 で、この段では λ が決まらない（情報なし）
    expect(requiredWeight(K5)).toBeNull();
  });

  it("要求どおりの ΔW_C を入れれば 3 欄とも 0.14 以内に再現する（枠組み自体は自己整合）", () => {
    for (const c of interacting) {
      const w = requiredWeight(c);
      if (w === null) throw new Error(`${c.name}`);
      const { predicted } = stage(c, w);
      const obs = categoryTriple(c.support);
      for (const cat of DISPLAY_CATEGORIES) {
        // target は確定扱いの総増分（モデル値、K1〜K4 で最大 0.18 のずれ）を使うので 0.14 まで許す
        expect(Math.abs(predicted[cat] - obs[cat])).toBeLessThanOrEqual(0.14);
      }
    }
  });

  it("既存の衣装候補族（436 個）を raw weight として入れ直しても 0.2 には届かない（最良でも全欄 RMSE 2.4）", () => {
    const names = Object.keys(candidates(K1));
    expect(names.length).toBe(436);
    const scored = names.map((name) => {
      const errs: number[] = [];
      const perCat: Record<DisplayCategory, number[]> = { costume: [], board: [], passive: [] };
      for (const c of interacting) {
        const { predicted } = stage(c, candidates(c)[name] ?? 0);
        const obs = categoryTriple(c.support);
        for (const cat of DISPLAY_CATEGORIES) {
          const e = predicted[cat] - obs[cat];
          errs.push(e);
          perCat[cat].push(e);
        }
      }
      return { name, all: sourceErrorStats(errs), perCat };
    });
    scored.sort((a, b) => a.all.rmse - b.all.rmse);
    const best = scored[0];
    if (!best) throw new Error("候補がない");
    expect(best.name).toBe("unconditional|blue|p0|multiplier|count|all");
    expect(best.all.rmse).toBeCloseTo(2.417, 2);
    expect(best.all.maxAbsError).toBeCloseTo(3.96, 2);
    // 「final Costume」としての従来の最良（C* / p0Only）は raw weight に読み替えても改善しない
    const named = Object.fromEntries(scored.map((s) => [s.name, round4(s.all.rmse)]));
    expect(named["C*"]).toBeCloseTo(6.195, 2);
    expect(named.p0Only).toBeCloseTo(6.108, 2);
    expect(named["S×E_base"]).toBeCloseTo(7.024, 2);
    expect(named["S×E_blue"]).toBeCloseTo(7.9, 2);
    // 成功条件（0.2）に届く候補は 1 つもない
    expect(scored.filter((s) => s.all.rmse <= 0.2).length).toBe(0);
  });
});

describe("パッシブ欄の分割との接続（既存結果と矛盾しないか）", () => {
  /** 支援なし側で、青の純増分と静的パッシブを raw weight 候補に取ったときの λ */
  const gauges = (c: LeaderContrast) => {
    const members = leaderMembers(c);
    const env = buildLeaderSupportEnvironment(kronii, members, holomenMap);
    const src = buildSourceEnvironment(kronii, members, holomenMap);
    const plain = { freq: true, rate: true, leaderPercent: 0 } as const;
    const noPassive = evaluateTotal(src, { ...plain, passive: "none" });
    const staticPassive = evaluateTotal(src, { ...plain, passive: "static" }) - noPassive;
    const blueRaw =
      expectedActive(env, { blue: "multiplicative" }) - expectedActive(env, { blue: "none" });
    const base = categoryTriple(c.baseline);
    return { staticPassive, blueRaw, base };
  };

  it("和は λ = 1 と整合する（ボード + パッシブ = 青の純増分 + 静的パッシブ、比 1.00〜1.03）", () => {
    const ratios = [K1, K2, K3, K4, K6].map((c) => {
      const g = gauges(c);
      return round4((g.base.board + g.base.passive) / (g.blueRaw + g.staticPassive));
    });
    expect(ratios).toEqual([1.0119, 1.0011, 1.0275, 1.0041, 1.0167]);
  });

  it("しかし 2 欄それぞれの λ は一致しない（青の純増分・静的パッシブは W_B / W_P としては棄却）", () => {
    const fromBoard = [K1, K2, K3, K4].map((c) => {
      const g = gauges(c);
      return round4(g.base.board / g.blueRaw);
    });
    const fromPassive = [K1, K3, K4, K6].map((c) => {
      const g = gauges(c);
      return round4(g.base.passive / g.staticPassive);
    });
    expect(fromBoard).toEqual([1.1721, 1.0011, 1.0819, 1.228]);
    expect(fromPassive).toEqual([0.402, 0.61, 0.4609, 1.0167]);
    // 青がある K1 / K3 / K4 では同じ組の 2 つの λ が 1.8〜2.9 倍ずれる（fromBoard は K1 / K2 / K3 / K4、
    // fromPassive は K1 / K3 / K4 / K6 の順なので、同じ組どうしを突き合わせる）
    const pairsBP: [number, number][] = [
      [fromBoard[0] ?? 0, fromPassive[0] ?? 0],
      [fromBoard[2] ?? 0, fromPassive[1] ?? 0],
      [fromBoard[3] ?? 0, fromPassive[2] ?? 0],
    ];
    expect(pairsBP.map(([b, p]) => round4(b / p))).toEqual([2.9157, 1.7736, 2.6644]);
    // 青のない K6 だけパッシブ側の λ が 1 に寄る
    expect(fromPassive[3]).toBeCloseTo(1.0, 1);
  });

  it("非 native 共通 scale の規則とは矛盾しない（規則は支援なし側の表示値を gauge にするだけで W の中身を仮定しない）", () => {
    // K6（青なし・パッシブ支援あり）は native = 衣装 で Δボード = Δパッシブ = 0、残差 0
    const e6 = oracleErrors(leaderPair(K6), "proportionalBaseline");
    expect(e6.residual).toBeCloseTo(0, 9);
    expect(e6.errors.passive).toBeCloseTo(0, 9);
    // K1 / K3 / K4 は上のとおり区間が空でない。パッシブ欄が静的値の 40〜61% でも規則は成立する
    for (const c of [K1, K3, K4]) {
      expect(nonNativeCommonScale("costume", c.baseline, c.support).interval).not.toBeNull();
    }
  });
});

describe("赤側の native raw weight（参考。リーダー側で式が決まっていないので本命ではない）", () => {
  /** oracle が要求する ΔW_B の区間（λ = 衣装欄の比、合計も 0.1 刻みなので区間で持つ） */
  const requiredInterval = (c: CategoryContrast): Interval | null => {
    const b = categoryTriple(c.before);
    const a = categoryTriple(c.after);
    if (b.costume <= 0) return null;
    const lam = {
      lo: displayInterval(a.costume).lo / displayInterval(b.costume).hi,
      hi: displayInterval(a.costume).hi / displayInterval(b.costume).lo,
    };
    const span = 3 * (0.1 / 2);
    const after = a.costume + a.board + a.passive;
    const before = b.costume + b.board + b.passive;
    return {
      lo: (after - span) / lam.hi - (before + span),
      hi: (after + span) / lam.lo - (before - span),
    };
  };

  it("`ΔX/100 × E_base` は 10 行中 3 行で要求区間の外（最も近い候補だが式ではない）", () => {
    const rows = CATEGORY_CONTRASTS.filter((c) => categoryTriple(c.before).costume > 0);
    expect(rows.length).toBe(10);
    let outside = 0;
    for (const c of rows) {
      const iv = requiredInterval(c);
      if (!iv) continue;
      const env = buildLeaderSupportEnvironment(realCard(c.leaderId), redMembers(c), holomenMap);
      const cand = ((c.xAfter - c.xBefore) / 100) * expectedActive(env, { blue: "none" });
      if (cand < iv.lo || cand > iv.hi) outside++;
    }
    expect(outside).toBe(3);
  });

  it("黄ありの行は後段のボード加算を含むので、黄なしの 曲なし R-061 を別に見る（要求 1.60〜3.00、候補 2.33）", () => {
    const r061 = CATEGORY_CONTRASTS.find((c) => c.group === "r061+3");
    if (!r061) throw new Error("R-061 がない");
    expect(r061.songBonus).toBe(0);
    const iv = requiredInterval(r061);
    if (!iv) throw new Error("区間がない");
    expect([round1(iv.lo), round1(iv.hi)]).toEqual([1.6, 3.0]);
    const env = buildLeaderSupportEnvironment(
      realCard(r061.leaderId),
      redMembers(r061),
      holomenMap,
    );
    const cand = ((r061.xAfter - r061.xBefore) / 100) * expectedActive(env, { blue: "none" });
    expect(cand).toBeCloseTo(2.33, 2);
    expect(cand).toBeGreaterThanOrEqual(iv.lo);
    expect(cand).toBeLessThanOrEqual(iv.hi);
  });
});
