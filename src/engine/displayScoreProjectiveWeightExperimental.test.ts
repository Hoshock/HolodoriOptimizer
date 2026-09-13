import { describe, expect, it } from "vite-plus/test";
import type { Card } from "../data/types";
import type {
  CategoryContrast,
  Five,
  LeaderContrast,
  Slot,
} from "./displayScoreCategoryCorpus.fixture";
import {
  CATEGORY_CONTRASTS,
  holomenMap,
  LEADER_BASELINE_ID,
  LEADER_CONTRASTS,
  LEADER_SUPPORT_ID,
  LEADER_SUPPORT_PERCENT,
  memberFor,
  realCard,
} from "./displayScoreCategoryCorpus.fixture";
import {
  blueWeightCandidates,
  kernelValue,
  leaderKernelCandidates,
  MEMBER_KERNEL_SPECS,
  memberKernel,
  memberKernelName,
  memberLocalBlueWeight,
  memberLocalFrequencyCandidates,
  memberLocalRateCandidates,
  passiveKernel,
  passiveKernelCandidates,
  projectiveColumns,
  projectivePrimitives,
  projectiveWeights,
  redKernelCandidates,
  SPEC_BASE,
  SPEC_BLUE_ADD,
  SPEC_BLUE_MULT,
  SPEC_P0_ONLY,
  weightRatioToCostume,
  yellowBoardIncrement,
} from "./displayScoreProjectiveWeightExperimental";
import type { SourceEnvironment } from "./displayScoreSourceAttributionExperimental";
import {
  buildSourceEnvironment,
  evaluateTotal,
  sourceErrorStats,
} from "./displayScoreSourceAttributionExperimental";

/**
 * **これはゲーム仕様の Golden ではなく、`(C, B, P) = T × W / ΣW` という source 分離型の projective weight
 * 仮説の回帰評価（解析用・production 未採用）。** 実測値はモデルに合わせて変えない。固定するのは
 * 2026-09-13 時点の支持・反証で、式ではない。
 *
 * **評価は比が先**（`W` は全体を定数倍しても同じ表示になるので、gauge を固定しない比の方が強い制約）:
 * 1. `H_B / H_C`: 同じ 5 人で「リーダーだけ替えた組」と「赤だけ替えた組」を突き合わせる cross-source の比
 * 2. `C / (L × P)`: リーダーの重みが `L` に比例するか（赤が違っても同じ値になるはず）
 * 3. `B / C` が赤 `X` に対して affine か
 * 4. 生き残った候補だけで `T × W / ΣW` の完全予測
 *
 * 黄の楽曲スコアボーナスは既知の後段のボード加算なので normalization に混ぜず、pre-yellow のボード欄へ戻す。
 */

const kronii = realCard(LEADER_SUPPORT_ID);
const miko1 = realCard(LEADER_BASELINE_ID);
const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;
const slotKey = (ss: readonly Slot[]): string =>
  ss
    .map((s) => `${s[0]}@${String(s[1])}`)
    .sort()
    .join(",");
const envOf = (
  leader: Card,
  c: { members: readonly Slot[]; blue: Parameters<typeof memberFor>[1] },
) =>
  buildSourceEnvironment(
    leader,
    c.members.map((s) => memberFor(s, c.blue)),
    holomenMap,
  );
/** 表示 5 欄から黄の後段加算を外した pre-yellow のボード欄 */
const preYellowBoard = (five: Five, songBonus: number): number =>
  five[2] -
  yellowBoardIncrement(songBonus, {
    costume: five[0],
    active: five[1],
    passive: five[3],
    special: five[4],
  });

/** 赤の matched pair がある 2026-09-12 の 4 組（K1〜K4）。cross-source の比はこの 4 組でしか測れない */
const interacting = LEADER_CONTRASTS.filter(
  (c) => !c.cleanControl && c.blueSnapshot === "2026-09-12",
);
const cleanControls = LEADER_CONTRASTS.filter((c) => c.cleanControl);
/** K の 5 人と同じメンバーの 水着フワワリーダー（L = 25）+24 行 */
const redTwinOf = (k: LeaderContrast): CategoryContrast => {
  const r = CATEGORY_CONTRASTS.find(
    (x) => x.group === "fuwawa+24" && slotKey(x.members) === slotKey(k.members),
  );
  if (!r) throw new Error(`${k.name} に対応する赤の matched pair がない`);
  return r;
};

describe("1. H_B / H_C（gauge によらない source 間の比）", () => {
  /** `B/C` の差から `H_B/H_C = (L/ΔX) × [(B/C)_after − (B/C)_before]` */
  const observedRatio = (k: LeaderContrast): number => {
    const red = redTwinOf(k);
    const env = envOf(realCard(red.leaderId), red);
    const before = preYellowBoard(red.before, red.songBonus) / red.before[0];
    const after = preYellowBoard(red.after, red.songBonus) / red.after[0];
    return (env.supportPercent / (red.xAfter - red.xBefore)) * (after - before);
  };

  it("kernel はメンバーと青だけで決まり、リーダーが違っても同じ（cross-source の比較が成立する前提）", () => {
    for (const k of interacting) {
      const red = redTwinOf(k);
      const a = projectivePrimitives(envOf(kronii, k));
      const b = projectivePrimitives(envOf(realCard(red.leaderId), red));
      expect(a.eBase).toBeCloseTo(b.eBase, 12);
      expect(a.hP0Only).toBeCloseTo(b.hP0Only, 12);
      expect(a.eBlueMultiplicative).toBeCloseTo(b.eBlueMultiplicative, 12);
      // 青も同じ 2026-09-12 のスナップショット
      expect(red.blue).toBe(k.blue);
    }
  });

  it("実測の H_B / H_C は K1〜K4 で 1.349 / 1.280 / 1.209 / 1.294", () => {
    expect(interacting.map((k) => round4(observedRatio(k)))).toEqual([
      1.3489, 1.2798, 1.2092, 1.2935,
    ]);
  });

  it("最良候補は E_blue(乗算) / p0Only リーダー kernel で RMSE 0.031 / 最大 0.049", () => {
    const observed = interacting.map(observedRatio);
    const scored = new Map<string, number[]>();
    for (const [i, k] of interacting.entries()) {
      const env = envOf(kronii, k);
      const hb = redKernelCandidates(env);
      const hc = leaderKernelCandidates(env);
      for (const [nb, vb] of Object.entries(hb))
        for (const [nc, vc] of Object.entries(hc)) {
          const name = `${nb} / ${nc}`;
          const list = scored.get(name) ?? [];
          list.push(vb / vc - (observed[i] ?? 0));
          scored.set(name, list);
        }
    }
    const ranked = [...scored.entries()]
      .map(([name, errs]) => ({ name, ...sourceErrorStats(errs) }))
      .sort((a, b) => a.rmse - b.rmse);
    const best = ranked[0];
    if (!best) throw new Error("候補がない");
    expect(best.name).toBe("E_blue(mult) / H_p0Only");
    expect(best.rmse).toBeCloseTo(0.0307, 3);
    expect(best.maxAbsError).toBeCloseTo(0.0494, 3);
    const by = Object.fromEntries(ranked.map((r) => [r.name, round4(r.rmse)]));
    // 対照（いずれも自由係数なし）
    expect(by["E_blue(mult) / C* 基礎量"]).toBeCloseTo(0.0804, 3);
    expect(by["E_blue(mult) / E_base"]).toBeCloseTo(0.1614, 3);
    expect(by["E_blue(add) / H_p0Only"]).toBeCloseTo(0.0535, 3);
  });
});

describe("2. リーダーの重みは L に比例するか（C / (L × P) は赤が違っても同じ）", () => {
  /** 表示 ±0.05 から `C / (L × P)` の区間。パッシブ欄 0.0 の組は使えない */
  const interval = (five: Five, L: number): [number, number] | null => {
    const pLo = five[3] - 0.05;
    if (pLo <= 0) return null;
    return [(five[0] - 0.05) / (L * (five[3] + 0.05)), (five[0] + 0.05) / (L * pLo)];
  };

  it("典獄クロニー L=60 と 水着フワワ L=25（X=26 / 50）の共通部分が K1 / K3 / K4 で空でない", () => {
    const got: [string, [number, number] | null][] = [];
    for (const k of interacting) {
      const red = redTwinOf(k);
      const L = envOf(realCard(red.leaderId), red).supportPercent;
      const ivs = [
        interval(k.support, LEADER_SUPPORT_PERCENT),
        interval(red.before, L),
        interval(red.after, L),
      ];
      if (ivs.some((x) => x === null)) {
        got.push([k.name.slice(0, 2), null]);
        continue;
      }
      const lo = Math.max(...ivs.map((x) => (x as [number, number])[0]));
      const hi = Math.min(...ivs.map((x) => (x as [number, number])[1]));
      got.push([k.name.slice(0, 2), lo <= hi ? [round4(lo), round4(hi)] : null]);
    }
    expect(got).toEqual([
      ["K1", [0.2988, 0.3059]],
      // K2 はパッシブ欄 0.0 でこの試験に使えない（共通部分が空なのではなく、値が定義できない）
      ["K2", null],
      ["K3", [0.6988, 0.7539]],
      ["K4", [0.2088, 0.2136]],
    ]);
    expect(interval(interacting[1]?.support ?? [0, 0, 0, 0, 0], 60)).toBeNull();
  });
});

describe("3. B / C は赤 X に対して affine か（K1 の 5 人、X = 23 / 26 / 50）", () => {
  it("X=26 は曲なしの R-061 と 黄 10% の +24 行で独立に 2 回測れて、pre-yellow ボードが 0.03 以内で一致する", () => {
    const k1 = interacting[0];
    if (!k1) throw new Error("K1 がない");
    const rows = CATEGORY_CONTRASTS.filter(
      (r) => slotKey(r.members) === slotKey(k1.members) && r.group !== "exploratory",
    );
    expect(rows.map((r) => r.group)).toEqual(["fuwawa+24", "r061+3"]);
    const plus24 = rows[0];
    const r061 = rows[1];
    if (!plus24 || !r061) throw new Error("行がない");
    expect(plus24.songBonus).toBe(0.1);
    expect(r061.songBonus).toBe(0);
    const fromYellowRow = preYellowBoard(plus24.before, plus24.songBonus);
    const fromSongless = preYellowBoard(r061.after, r061.songBonus);
    expect(round4(fromYellowRow)).toBe(40.73);
    expect(fromSongless).toBe(40.7);
    expect(Math.abs(fromYellowRow - fromSongless)).toBeLessThanOrEqual(0.03);
  });

  it("Red 1pt あたりの B/C の傾きは 0.054〜0.056 でほぼ一定（3 区間）", () => {
    const k1 = interacting[0];
    if (!k1) throw new Error("K1 がない");
    const rows = CATEGORY_CONTRASTS.filter(
      (r) => slotKey(r.members) === slotKey(k1.members) && r.group !== "exploratory",
    );
    const plus24 = rows[0];
    const r061 = rows[1];
    if (!plus24 || !r061) throw new Error("行がない");
    const at = (five: Five, y: number): number => preYellowBoard(five, y) / five[0];
    const x23 = at(r061.before, 0);
    const x26songless = at(r061.after, 0);
    const x26yellow = at(plus24.before, plus24.songBonus);
    const x50 = at(plus24.after, plus24.songBonus);
    // 曲なし行の中だけで測った 23 → 26
    expect(round4((x26songless - x23) / 3)).toBe(0.055);
    // 黄行の pre-yellow を使った 23 → 26
    expect(round4((x26yellow - x23) / 3)).toBe(0.0557);
    // 黄行の中だけで測った 26 → 50
    expect(round4((x50 - x26yellow) / 24)).toBe(0.054);
  });
});

describe("4. baseline の W_blue : H_P と kernel 候補", () => {
  /** 典獄クロニー側（L = 60、X = 0）の実測から逆算した `W_blue` / `H_P`（H_C = p0Only kernel） */
  const required = (c: LeaderContrast) => {
    const env = envOf(kronii, c);
    const wC = (LEADER_SUPPORT_PERCENT / 100) * kernelValue(env, SPEC_P0_ONLY);
    const cost = c.support[0];
    return {
      env,
      wC,
      wBlue: cost > 0 ? (wC * c.support[2]) / cost : 0,
      hP: cost > 0 ? (wC * c.support[3]) / cost : 0,
    };
  };

  it("逆算した W_blue / H_P（K1〜K7）", () => {
    const rows = LEADER_CONTRASTS.map((c) => {
      const r = required(c);
      return [c.name.slice(0, 2), round4(r.wBlue), round4(r.hP)];
    });
    expect(rows).toEqual([
      ["K1", 24.4303, 2.1647],
      ["K2", 19.9092, 0],
      ["K3", 14.2712, 0.9045],
      ["K4", 19.1811, 2.8971],
      ["K5", 0, 0],
      ["K6", 0, 2.8945],
      ["K7", 1.8443, 2.1517],
    ]);
  });

  it("H_P は「静的」が最良で、供給側の確率を掛けない gated 版は青なしの K6 が棄却する", () => {
    const errs = new Map<string, number[]>();
    for (const c of LEADER_CONTRASTS) {
      const r = required(c);
      for (const [name, v] of Object.entries(passiveKernelCandidates(r.env))) {
        const list = errs.get(name) ?? [];
        list.push(v - r.hP);
        errs.set(name, list);
      }
    }
    const ranked = [...errs.entries()]
      .map(([name, e]) => ({ name, ...sourceErrorStats(e) }))
      .sort((a, b) => a.rmse - b.rmse);
    const best = ranked[0];
    if (!best) throw new Error("候補がない");
    expect(best.name).toBe("p0Only × 静的");
    expect(best.rmse).toBeCloseTo(0.1192, 3);
    expect(best.maxAbsError).toBeCloseTo(0.2145, 3);
    // 供給側の p0 を掛けない gated 版（今回の追加候補）は K6 を 1.02 外す
    const k6 = LEADER_CONTRASTS.find((c) => c.cleanControl && c.passiveSupport);
    if (!k6) throw new Error("K6 がない");
    const r6 = required(k6);
    const cand6 = passiveKernelCandidates(r6.env);
    expect(cand6["gated（供給側の確率を掛けない）"] ?? 0).toBeCloseTo(1.8755, 3);
    expect(r6.hP).toBeCloseTo(2.8945, 3);
    // K6 は青がないので「静的」だけが要求値に一致する
    expect(cand6["静的（青乗算型）"] ?? 0).toBeCloseTo(2.8525, 3);
    expect(cand6["gated p0（production 相当）"] ?? 0).toBeLessThan(2);
  });

  it("K7 は H_P / H_C を gauge によらず測れて、`p0Only × 静的` が量子化区間に入る", () => {
    const k7 = LEADER_CONTRASTS.find((c) => c.blueSnapshot === "2026-09-13");
    if (!k7) throw new Error("K7 がない");
    const env = envOf(kronii, k7);
    // 実測: H_P / H_C = (L/100) × パッシブ欄 / 衣装欄。表示 ±0.05 で区間にする
    const iv = weightRatioToCostume(LEADER_SUPPORT_PERCENT, k7.support[0], k7.support[3]);
    if (!iv) throw new Error("区間がない");
    expect([round4(iv.lo), round4(iv.hi), round4(iv.point)]).toEqual([0.0313, 0.033, 0.0321]);
    const modelled = passiveKernel(env, SPEC_P0_ONLY, "static") / kernelValue(env, SPEC_P0_ONLY);
    expect(round4(modelled)).toBe(0.0328);
    expect(modelled).toBeGreaterThanOrEqual(iv.lo);
    expect(modelled).toBeLessThanOrEqual(iv.hi);
  });

  it("W_blue は E_blue(加算) − H_C が K1 / K2 を当て、K3 / K4 を 3.5 / 3.7 過大・K7 を 1.1 過小にする", () => {
    const errs = new Map<string, number[]>();
    for (const c of LEADER_CONTRASTS) {
      const r = required(c);
      for (const [name, v] of Object.entries(blueWeightCandidates(r.env))) {
        const list = errs.get(name) ?? [];
        list.push(v - r.wBlue);
        errs.set(name, list);
      }
    }
    const pre = errs.get("E_blue(add) − H_p0Only");
    if (!pre) throw new Error("候補がない");
    expect(pre.map((e) => round4(e))).toEqual([0.7051, 0.0602, 3.5129, 3.6837, 0, 0, -1.0974]);
    // 青がなければどの候補も 0（K5 / K6 の negative control）
    for (const c of cleanControls) {
      const r = required(c);
      for (const v of Object.values(blueWeightCandidates(r.env))) expect(v).toBeCloseTo(0, 9);
    }
    // 対照: 従来使っていた「青の純増分」は K1 / K3 / K4 を 15 / 8 / 11 も外す
    const old = errs.get("E_blue(mult) − E_base");
    if (!old) throw new Error("候補がない");
    expect(sourceErrorStats(old).maxAbsError).toBeGreaterThan(10);
  });

  it("K7 が「編成全体の評価値どうしの差」型の W_blue を 1 群として棄却する（要求 0.0268〜0.0284 に対し最大 0.0112）", () => {
    const k7 = LEADER_CONTRASTS.find((c) => c.blueSnapshot === "2026-09-13");
    if (!k7) throw new Error("K7 がない");
    const env = envOf(kronii, k7);
    const hC = kernelValue(env, SPEC_P0_ONLY);
    // 実測の要求区間: W_blue / H_C = (L/100) × ボード欄 / 衣装欄
    const iv = weightRatioToCostume(LEADER_SUPPORT_PERCENT, k7.support[0], k7.support[2]);
    if (!iv) throw new Error("区間がない");
    expect([round4(iv.lo), round4(iv.hi), round4(iv.point)]).toEqual([0.0268, 0.0284, 0.0276]);
    // baseline 側（L = 0 なので W_C = 0）からも同じ量が出る: ボード : パッシブ = W_blue : H_P
    const fromBaseline = {
      lo: (k7.baseline[2] - 0.05) / (k7.baseline[3] + 0.05),
      hi: (k7.baseline[2] + 0.05) / (k7.baseline[3] - 0.05),
    };
    expect([round4(fromBaseline.lo), round4(fromBaseline.hi)]).toEqual([0.8519, 1.0]);
    // 候補は 7 つとも要求区間の下限に届かない（いちばん大きい E_blue(加算) − H_C でも 0.0112 = 要求の 4 割）
    const ratios = Object.entries(blueWeightCandidates(env)).map(
      ([name, v]) => [name, round4(v / hC)] as const,
    );
    for (const [name, r] of ratios) expect(r, name).toBeLessThan(iv.lo);
    expect(Math.max(...ratios.map(([, r]) => r))).toBeCloseTo(0.0112, 4);
    // 青がない K5 / K6 では 0 のままで、この棄却は「青なしで 0」という性質とは独立
    for (const c of cleanControls)
      for (const v of Object.values(blueWeightCandidates(envOf(kronii, c))))
        expect(v).toBeCloseTo(0, 9);
  });
});

describe("6. member-local な W_blue（青を持つメンバー本人の量に % を掛けて足す）", () => {
  const required = (c: LeaderContrast) => {
    const env = envOf(kronii, c);
    const wC = (LEADER_SUPPORT_PERCENT / 100) * kernelValue(env, SPEC_P0_ONLY);
    const cost = c.support[0];
    return {
      env,
      value: cost > 0 ? (wC * c.support[2]) / cost : 0,
      lo: cost > 0 ? (wC * (c.support[2] - 0.05)) / (cost + 0.05) : 0,
      hi: cost > 0 ? (wC * (c.support[2] + 0.05)) / (cost - 0.05) : 0,
    };
  };
  const k7 = LEADER_CONTRASTS.find((c) => c.blueSnapshot === "2026-09-13");
  if (!k7) throw new Error("K7 がない");

  it("K7 は青が 1 人・発動頻度 0 なので、発動率側の kernel を単独で拘束する", () => {
    const env = envOf(kronii, k7);
    expect(Array.from(env.blueRatePercent)).toEqual([0, 0, 0, 0, 6]);
    expect(Array.from(env.blueFrequencyPercent)).toEqual([0, 0, 0, 0, 0]);
    // 発動頻度側の項はどの kernel でも 0（kernel は非負なので、頻度項は W_blue を減らせない）
    for (const v of Object.values(memberLocalFrequencyCandidates(env))) expect(v).toBe(0);
    for (const v of Object.values(memberLocalRateCandidates(env))) expect(v).toBeGreaterThan(0);
  });

  it("K7 の要求区間に入る kernel は「確率を掛けず、競合で割らない」2 つだけ", () => {
    const r7 = required(k7);
    expect([round4(r7.lo), round4(r7.value), round4(r7.hi)]).toEqual([1.7908, 1.8443, 1.898]);
    const inside = Object.entries(memberLocalRateCandidates(r7.env))
      .filter(([, v]) => v >= r7.lo && v <= r7.hi)
      .map(([name, v]) => [name, round4(v)]);
    expect(inside).toEqual([
      ["base|one|none", 1.8525],
      ["blue|one|none", 1.8525],
    ]);
    // 最良の K1〜K4 用（`blue|p0|p0`）は K7 を 0.68 しか出せず、要求の 4 割を切る
    expect(round4(memberLocalRateCandidates(r7.env)["blue|p0|p0"] ?? 0)).toBe(0.6755);
  });

  it("その 2 つは K1〜K4 を 2.19〜2.63 倍に過大評価し、頻度項では戻せない（member-local 型は全滅）", () => {
    // 青があり衣装欄も出ている行（K5 / K6 は青なしで W_blue = 0）
    const rows = LEADER_CONTRASTS.filter((c) => c.support[0] > 0 && c.support[2] > 0);
    const ratios = rows.map((c) => {
      const r = required(c);
      const rate = memberLocalBlueWeight(r.env, "rate", {
        window: "base",
        numerator: "one",
        denominator: "none",
      });
      const freq = memberLocalBlueWeight(r.env, "frequency", {
        window: "base",
        numerator: "one",
        denominator: "none",
      });
      // 頻度項は非負なので、発動率だけで超過していれば足しても戻らない
      expect(freq).toBeGreaterThanOrEqual(0);
      return [c.name.slice(0, 2), round4(rate / r.value)];
    });
    expect(ratios).toEqual([
      ["K1", 2.4033],
      ["K2", 2.1853],
      ["K3", 2.3883],
      ["K4", 2.5698],
      ["K7", 1.0044],
    ]);
  });

  it("この族の kernel は編成に依存しないので、K1〜K4 だけでも棄却できる（同じ 水着ころね2 の青の寄与が 2 通りに出る）", () => {
    const by = (prefix: string): LeaderContrast => {
      const c = LEADER_CONTRASTS.find((x) => x.name.startsWith(prefix));
      if (!c) throw new Error(`${prefix} がない`);
      return c;
    };
    const spec = { window: "base", numerator: "one", denominator: "none" } as const;
    // A_j = up_j × 発動候補秒 / T で、ほかのメンバーに依存しない
    const k1 = memberKernel(envOf(kronii, by("K1")), spec);
    const k4 = memberKernel(envOf(kronii, by("K4")), spec);
    expect(round4(k1[0] ?? 0)).toBe(round4(k4[0] ?? 0));
    // K1 − K2 と K4 − K3 はどちらも「水着ころね2 の青 39.6 を足す」差分なので、同じ値でなければならない
    const iv = (c: LeaderContrast) => required(c);
    const d1 = [iv(by("K1")).lo - iv(by("K2")).hi, iv(by("K1")).hi - iv(by("K2")).lo];
    const d2 = [iv(by("K4")).lo - iv(by("K3")).hi, iv(by("K4")).hi - iv(by("K3")).lo];
    expect(d1.map((x) => round4(x))).toEqual([4.3703, 4.6719]);
    expect(d2.map((x) => round4(x))).toEqual([4.7652, 5.0546]);
    // 量子化込みでも共通部分がない = 編成非依存の member-local 重みでは説明できない
    expect(Math.max(d1[0] ?? 0, d2[0] ?? 0)).toBeGreaterThan(Math.min(d1[1] ?? 0, d2[1] ?? 0));
  });

  it("K1〜K7 を通した member-local の最良は `blue|p0|blueMultiplicative`（発動率 + 頻度）で RMSE 0.63 / 最大 1.18 — K7 が外れる", () => {
    const rows = LEADER_CONTRASTS.map(required);
    const scored: { name: string; rmse: number; maxAbsError: number; k7: number }[] = [];
    for (const spec of MEMBER_KERNEL_SPECS) {
      const name = memberKernelName(spec);
      for (const withFreq of [false, true]) {
        const errs = rows.map(
          (r) =>
            memberLocalBlueWeight(r.env, "rate", spec) +
            (withFreq ? memberLocalBlueWeight(r.env, "frequency", spec) : 0) -
            r.value,
        );
        const last = errs[errs.length - 1] ?? 0;
        scored.push({
          name: withFreq ? `${name}（発動率 + 頻度）` : `${name}（発動率のみ）`,
          ...sourceErrorStats(errs),
          k7: last,
        });
      }
    }
    scored.sort((a, b) => a.rmse - b.rmse);
    const best = scored[0];
    if (!best) throw new Error("候補がない");
    expect(best.name).toBe("blue|p0|blueMultiplicative（発動率 + 頻度）");
    expect(best.rmse).toBeCloseTo(0.627, 2);
    expect(best.maxAbsError).toBeCloseTo(1.182, 2);
    // 最良でも K7 を 1.18 下に外す（= 成功条件 0.2 の 6 倍）
    expect(best.k7).toBeCloseTo(-1.182, 2);
    expect(scored.every((c) => c.rmse > 0.2)).toBe(true);
  });
});

describe("5. 完全予測 `(C, B, P) = T × W / ΣW`", () => {
  interface Row {
    label: string;
    primary: boolean;
    hasFubuki2: boolean;
    env: SourceEnvironment;
    redPercent: number;
    observed: { costume: number; board: number; passive: number };
  }
  const FUBUKI2 = "shirakami-fubuki-02@0";
  const rows: Row[] = [];
  for (const c of LEADER_CONTRASTS) {
    const has = slotKey(c.members).includes(FUBUKI2);
    rows.push({
      label: `${c.name.slice(0, 2)} みこ`,
      primary: true,
      hasFubuki2: has,
      env: envOf(miko1, c),
      redPercent: 0,
      observed: { costume: c.baseline[0], board: c.baseline[2], passive: c.baseline[3] },
    });
    rows.push({
      label: `${c.name.slice(0, 2)} クロニー`,
      primary: true,
      hasFubuki2: has,
      env: envOf(kronii, c),
      redPercent: 0,
      observed: { costume: c.support[0], board: c.support[2], passive: c.support[3] },
    });
  }
  for (const r of CATEGORY_CONTRASTS) {
    // 2026-09-12 の青が確定している行だけを primary にする（旧 blue の R-002 / 水着ミオリーダー と exploratory は別）
    const primary = r.group === "fuwawa+24" || r.group === "r061+3";
    const has = slotKey(r.members).includes(FUBUKI2);
    const env = envOf(realCard(r.leaderId), r);
    for (const [five, x] of [
      [r.before, r.xBefore],
      [r.after, r.xAfter],
    ] as const) {
      rows.push({
        label: `${r.name.slice(0, 20)} X=${String(x)}`,
        primary,
        hasFubuki2: has,
        env,
        redPercent: x,
        observed: {
          costume: five[0],
          board: preYellowBoard(five, r.songBonus),
          passive: five[3],
        },
      });
    }
  }

  /** 第一候補の組: H_C = p0Only kernel / H_B = E_blue(乗算) / W_blue = E_blue(加算) − H_C / H_P = p0Only × 静的 */
  const predict = (row: Row) => {
    const env = row.env;
    const hC = kernelValue(env, SPEC_P0_ONLY);
    const hB = kernelValue(env, SPEC_BLUE_MULT);
    const wBlue = kernelValue(env, SPEC_BLUE_ADD) - hC;
    const hP = passiveKernel(env, SPEC_P0_ONLY, "static");
    const total =
      evaluateTotal(env, {
        freq: true,
        rate: true,
        passive: "static",
        leaderPercent: env.supportPercent,
        redPercent: row.redPercent,
        combine: "additive",
      }) - kernelValue(env, SPEC_BASE);
    return projectiveColumns(
      total,
      projectiveWeights({
        leaderPercent: env.supportPercent,
        redPercent: row.redPercent,
        hC,
        hB,
        hP,
        wBlue,
      }),
    );
  };
  const errorsOf = (subset: readonly Row[]) => {
    const c: number[] = [];
    const b: number[] = [];
    const p: number[] = [];
    for (const row of subset) {
      const pred = predict(row);
      c.push(pred.costume - row.observed.costume);
      b.push(pred.board - row.observed.board);
      p.push(pred.passive - row.observed.passive);
    }
    return {
      costume: sourceErrorStats(c),
      board: sourceErrorStats(b),
      passive: sourceErrorStats(p),
    };
  };

  it("K5 / K6 は negative control として厳密に通る（青なし → W_blue = 0、リーダー増分は全量衣装欄）", () => {
    for (const c of cleanControls) {
      for (const [label, five] of [
        ["みこ", c.baseline],
        ["クロニー", c.support],
      ] as const) {
        const row = rows.find((r) => r.label === `${c.name.slice(0, 2)} ${label}`);
        if (!row) throw new Error(`${c.name} ${label} がない`);
        const pred = predict(row);
        expect(Math.abs(pred.costume - five[0]), `${c.name} ${label} 衣装`).toBeLessThanOrEqual(
          0.1,
        );
        expect(pred.board, `${c.name} ${label} ボード`).toBe(0);
        expect(Math.abs(pred.passive - five[3]), `${c.name} ${label} パッシブ`).toBeLessThanOrEqual(
          0.06,
        );
      }
    }
  });

  it("primary 34 点（K7 の 2 点を含む）で 衣装 RMSE 0.64 / ボード 0.69 / パッシブ 0.18（0.2 には届かない）", () => {
    const primary = rows.filter((r) => r.primary);
    expect(primary.length).toBe(34);
    const e = errorsOf(primary);
    expect(e.costume.rmse).toBeCloseTo(0.64, 2);
    expect(e.costume.maxAbsError).toBeCloseTo(2.339, 2);
    expect(e.board.rmse).toBeCloseTo(0.69, 2);
    expect(e.board.maxAbsError).toBeCloseTo(2.417, 2);
    expect(e.passive.rmse).toBeCloseTo(0.178, 2);
    expect(e.passive.maxAbsError).toBeCloseTo(0.391, 2);
  });

  it("残差は一様でなく、水着フブキ 0凸 を含む 10 点に集中する（外すと 0.21 / 0.21 / 0.10）", () => {
    const primary = rows.filter((r) => r.primary);
    const withFubuki = primary.filter((r) => r.hasFubuki2);
    expect(withFubuki.length).toBe(10);
    const e = errorsOf(primary.filter((r) => !r.hasFubuki2));
    expect(e.costume.rmse).toBeCloseTo(0.215, 2);
    expect(e.costume.maxAbsError).toBeCloseTo(0.605, 2);
    expect(e.board.rmse).toBeCloseTo(0.208, 2);
    expect(e.board.maxAbsError).toBeCloseTo(0.436, 2);
    expect(e.passive.rmse).toBeCloseTo(0.102, 2);
    // 水着フブキ 0凸 側だけ取り出すと衣装・ボードが 1 以上ずれる
    const only = errorsOf(withFubuki);
    expect(only.costume.maxAbsError).toBeGreaterThan(1);
    expect(only.board.maxAbsError).toBeGreaterThan(1);
  });

  it("旧 blue（2026-09-08 前提）と exploratory を含めるとボードの最大誤差がさらに広がる（primary と分ける理由）", () => {
    const rest = rows.filter((r) => !r.primary);
    expect(rest.length).toBe(12);
    const e = errorsOf(rest);
    expect(e.board.maxAbsError).toBeGreaterThan(2.4);
  });
});
