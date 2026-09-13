import { describe, expect, it } from "vite-plus/test";

import { computeDisplayScoreBonus, displayUnitScore, round1 } from "./displayScore";
import {
  FREQUENCY_TRANSFER_HOLOMEN,
  FREQUENCY_TRANSFER_MEMBERS,
  FREQUENCY_TRANSFER_STATES,
  frequencyTransferBlue,
  holomenMap,
  LEADER_CONTRASTS,
  LEADER_SUPPORT_ID,
  LEADER_SUPPORT_PERCENT,
  memberFor,
  rateFrequencyBlue,
  RATE_FREQUENCY_STATES,
  realCard,
} from "./displayScoreCategoryCorpus.fixture";
import type { BlueTable, Five, Slot } from "./displayScoreCategoryCorpus.fixture";
import { buildSourceEnvironment } from "./displayScoreSourceAttributionExperimental";
import type { SourceEnvironment } from "./displayScoreSourceAttributionExperimental";
import {
  kernelValue,
  memberKernel,
  SPEC_BASE,
  SPEC_P0_ONLY,
} from "./displayScoreProjectiveWeightExperimental";

/**
 * **青ボードの raw weight `W_blue` の Golden（2026-09-13 ユーザー実機観測。9 状態）。**
 * 観測値の全文は [docs/human/repro/display-score-20260913-blue-weight.md]、解釈は
 * [docs/human/display-score.md]「`W_blue` の決定式」。
 *
 * 同じ 5 人（F0〜F3 / K3 と同じ）・リーダー 典獄クロニー 0凸（衣装 60%）・曲なし・赤 0・黄 0 のまま、
 * 青のマスを 1 つずつだけ開閉した 9 状態。**発動率だけを 3pt 動かす組 3 つ・発動頻度だけを 4pt 動かす組 2 つ・
 * ΣR も ΣF も変えずに所有者だけを移す組 2 つ**が同時に取れるので、`W_blue` の形が決まる。
 *
 * この系列が決めたこと:
 * 1. **青は「実効スコアサポート %」としてしか配分に効かない**（`blueSupportPercentOf`）。旧 production の
 *    member-local 型（`H_C` のメンバー取り分に % を掛ける）は 20 状態中 2 状態しか通らない。
 * 2. 重みはメンバーの**単独寄与**（`スコア UP × p0 × 発動候補秒 / T`。同時候補の正規化を入れない量）で、
 *    青がどちらのホロメンに乗っているかにはよらない。
 * 3. 発動率側の分母は `Σ 単独寄与`、発動頻度側は**アクティブ欄 raw**。両者を同じ分母にすると通らない。
 */
describe("青ボードの raw weight W_blue(2026-09-13 実機 9 状態)", () => {
  const envOf = (members: Slot[], blue: BlueTable): SourceEnvironment =>
    buildSourceEnvironment(
      realCard(LEADER_SUPPORT_ID),
      members.map((s) => memberFor(s, blue)),
      holomenMap,
    );

  it("青の実効値は snapshot の raw マスから導出でき、状態名 F16 / F12 / F8 が ΣF と一致する", () => {
    const expected: Record<
      string,
      { miko: [number, number]; fuwawa: [number, number]; sum: [number, number] }
    > = {
      S1: { miko: [42, 12], fuwawa: [30, 0], sum: [122.1, 12] },
      S2: { miko: [42, 12], fuwawa: [30, 0], sum: [122.1, 12] },
      S3: { miko: [39, 12], fuwawa: [30, 0], sum: [119.1, 12] },
      "S3'": { miko: [39, 12], fuwawa: [30, 0], sum: [119.1, 12] },
      F16: { miko: [39, 12], fuwawa: [30, 4], sum: [119.1, 16] },
      F12: { miko: [39, 8], fuwawa: [30, 4], sum: [119.1, 12] },
      RmF: { miko: [39, 8], fuwawa: [27, 4], sum: [116.1, 12] },
      RtM: { miko: [42, 8], fuwawa: [27, 4], sum: [119.1, 12] },
      F8: { miko: [42, 8], fuwawa: [27, 0], sum: [119.1, 8] },
    };
    for (const state of RATE_FREQUENCY_STATES) {
      const blue = rateFrequencyBlue(state);
      const e = expected[state.name];
      if (!e) throw new Error(state.name);
      expect(blue["sakura-miko"], state.name).toEqual(e.miko);
      expect(blue["fuwawa-abyssgard"], state.name).toEqual(e.fuwawa);
      // フブキ 15 / 0、おかゆ 35.1 / 0、マリン 0 / 0 は 9 状態とも動かない
      expect(blue["shirakami-fubuki"], state.name).toEqual([15, 0]);
      expect(blue["nekomata-okayu"], state.name).toEqual([35.1, 0]);
      expect(blue["houshou-marine"], state.name).toEqual([0, 0]);
      const sr = FREQUENCY_TRANSFER_HOLOMEN.reduce((s, id) => s + (blue[id]?.[0] ?? 0), 0);
      const sf = FREQUENCY_TRANSFER_HOLOMEN.reduce((s, id) => s + (blue[id]?.[1] ?? 0), 0);
      expect([round1(sr), sf], state.name).toEqual(e.sum);
    }
  });

  it("ユニットスコア = ceil(総合力 × (1 + 表示合計/100) × 2.03734) が 9 状態すべてで成り立つ", () => {
    for (const state of RATE_FREQUENCY_STATES) {
      const total = round1(state.support.reduce((a, b) => a + b, 0));
      expect(displayUnitScore(state.power, total), state.name).toBe(state.unitScore);
    }
  });

  it("アクティブ欄 70.8 と SP 欄 42.8 は 9 状態とも不変(青はこの 2 欄に効かない)", () => {
    for (const state of RATE_FREQUENCY_STATES) {
      expect([state.support[1], state.support[4]], state.name).toEqual([70.8, 42.8]);
    }
  });

  it("パラメータ割合のマス(みこ B-015)は総合力だけを動かし、5 欄は完全に不変(S1 → S2)", () => {
    const s1 = RATE_FREQUENCY_STATES[0];
    const s2 = RATE_FREQUENCY_STATES[1];
    if (!s1 || !s2) throw new Error("S1 / S2 がない");
    expect(s1.support).toEqual(s2.support);
    expect(s1.power - s2.power).toBe(367);
  });

  /** 実測が要求する `W_blue / H_C`(= 支援% /100 × ボード欄 / 衣装欄)。表示は 0.1 刻みなので区間で持つ */
  const requiredRatio = (five: Five | readonly number[]): { lo: number; hi: number } => {
    const c = five[0] ?? 0;
    const b = five[2] ?? 0;
    const k = LEADER_SUPPORT_PERCENT / 100;
    return { lo: (k * (b - 0.05)) / (c + 0.05), hi: (k * (b + 0.05)) / (c - 0.05) };
  };

  it("所有者だけを移した 2 組では、実測が要求する W_blue / H_C が変わらない", () => {
    const byName = (name: string) => {
      const s = RATE_FREQUENCY_STATES.find((x) => x.name === name);
      if (!s) throw new Error(name);
      return s;
    };
    // 発動頻度 4pt を みこ → フワワ へ（S3' → F12。ΣR も ΣF も一定）
    // 発動率 3pt を フワワ → みこ へ（F12 → RtM。ΣR も ΣF も一定）
    for (const [a, b] of [
      ["S3'", "F12"],
      ["F12", "RtM"],
    ] as const) {
      const x = requiredRatio(byName(a).support);
      const y = requiredRatio(byName(b).support);
      expect(Math.max(x.lo, y.lo), `${a} vs ${b}`).toBeLessThanOrEqual(Math.min(x.hi, y.hi));
    }
  });

  /** 20 状態のコーパス（F0〜F3・今回の 9・K1〜K7）。どれもリーダー 60%・赤 0・黄 0・曲なし */
  const corpus: { name: string; env: SourceEnvironment; lo: number; hi: number }[] = [];
  for (const s of FREQUENCY_TRANSFER_STATES) {
    const r = requiredRatio(s.support);
    corpus.push({
      name: s.name,
      env: envOf(FREQUENCY_TRANSFER_MEMBERS, frequencyTransferBlue(s)),
      ...r,
    });
  }
  for (const s of RATE_FREQUENCY_STATES) {
    const r = requiredRatio(s.support);
    corpus.push({
      name: s.name,
      env: envOf(FREQUENCY_TRANSFER_MEMBERS, rateFrequencyBlue(s)),
      ...r,
    });
  }
  for (const k of LEADER_CONTRASTS) {
    const r = requiredRatio(k.support);
    corpus.push({ name: k.name.slice(0, 2), env: envOf(k.members, k.blue), ...r });
  }

  /** メンバー単独の基準寄与 `スコア UP × p0 × 発動候補秒 / T`（同時候補の正規化を入れない） */
  const soloOf = (env: SourceEnvironment, ups: "resolved" | "unconditional"): number[] => {
    const u = ups === "resolved" ? env.ups : env.unconditionalUps;
    return [0, 1, 2, 3, 4].map((i) => {
      let sec = 0;
      for (let s = 1; s <= env.T; s++) if (env.onBase[i]?.[s]) sec++;
      return (u[i] ?? 0) * (env.p0[i] ?? 0) * (sec / env.T);
    });
  };
  const weighted = (env: SourceEnvironment, solo: number[], kind: "rate" | "frequency"): number => {
    const percent = kind === "rate" ? env.blueRatePercent : env.blueFrequencyPercent;
    return [0, 1, 2, 3, 4].reduce((s, i) => s + ((percent[i] ?? 0) * (solo[i] ?? 0)) / 100, 0);
  };

  const candidates: Record<string, (env: SourceEnvironment) => number> = {
    採用: (env) => {
      const solo = soloOf(env, "resolved");
      const total = solo.reduce((a, b) => a + b, 0);
      const base = kernelValue(env, SPEC_BASE);
      if (total <= 0 || base <= 0) return 0;
      return weighted(env, solo, "rate") / total + weighted(env, solo, "frequency") / base;
    },
    "分母をそろえる(両方 Σ 単独寄与)": (env) => {
      const solo = soloOf(env, "resolved");
      const total = solo.reduce((a, b) => a + b, 0);
      if (total <= 0) return 0;
      return (weighted(env, solo, "rate") + weighted(env, solo, "frequency")) / total;
    },
    "分母をそろえる(両方 アクティブ欄 raw)": (env) => {
      const solo = soloOf(env, "resolved");
      const base = kernelValue(env, SPEC_BASE);
      if (base <= 0) return 0;
      return (weighted(env, solo, "rate") + weighted(env, solo, "frequency")) / base;
    },
    "条件つきスコア UP を解決しない": (env) => {
      const solo = soloOf(env, "unconditional");
      const total = solo.reduce((a, b) => a + b, 0);
      const base = kernelValue(env, SPEC_BASE);
      if (total <= 0 || base <= 0) return 0;
      return weighted(env, solo, "rate") / total + weighted(env, solo, "frequency") / base;
    },
    "旧 production: H_C のメンバー取り分 × (発動率 + 発動頻度)": (env) => {
      const share = memberKernel(env, {
        window: "blue",
        numerator: "p0",
        denominator: "blueMultiplicative",
      });
      const hc = kernelValue(env, SPEC_P0_ONLY);
      if (hc <= 0) return 0;
      return (
        [0, 1, 2, 3, 4].reduce(
          (s, i) =>
            s +
            (((env.blueRatePercent[i] ?? 0) + (env.blueFrequencyPercent[i] ?? 0)) / 100) *
              (share[i] ?? 0),
          0,
        ) / hc
      );
    },
  };

  const scoreOf = (fn: (env: SourceEnvironment) => number) => {
    let inside = 0;
    let worst = 0;
    for (const row of corpus) {
      const v = fn(row.env);
      if (v >= row.lo - 1e-9 && v <= row.hi + 1e-9) inside++;
      else worst = Math.max(worst, row.lo - v, v - row.hi);
    }
    return { inside, worst };
  };

  it("採用式は 20 状態の要求区間からの逸脱が 0.003 以内で、対立候補はどれも 0.011 以上外す", () => {
    const adopted = scoreOf(candidates["採用"] ?? (() => 0));
    expect(adopted.worst).toBeLessThan(0.003);
    for (const [name, fn] of Object.entries(candidates)) {
      if (name === "採用") continue;
      expect(scoreOf(fn).worst, name).toBeGreaterThan(0.011);
    }
    // 青なしの negative control K5 / K6 はどの候補でも 0（要求区間も 0 を含む）
    for (const name of ["K5", "K6"]) {
      const row = corpus.find((r) => r.name === name);
      if (!row) throw new Error(name);
      for (const [label, fn] of Object.entries(candidates))
        expect(fn(row.env), `${name} ${label}`).toBe(0);
    }
  });

  it("発動率側の分母は Σ 単独寄与、発動頻度側は アクティブ欄 raw 付近に分かれる(同じ分母では通らない)", () => {
    // 発動頻度側の分母だけを連続値で振り、13 状態(同じ 5 人・同じリーダー)の要求区間からの最大逸脱を見る。
    // Σ 単独寄与 = 89.12 と アクティブ欄 raw = 70.78 は 26% 違い、通るのは後者の側だけ。
    // ただし最大逸脱を最小にする分母は 68 台で、アクティブ欄 raw はその 3% 上にある — **分母の同定は ±3% 止まり**で、
    // 「なぜ発動頻度側だけ競合込みの合計で割るのか」は導けていない(docs/human/display-score.md)
    const same = corpus.filter((r) => !r.name.startsWith("K"));
    const worstOf = (denominator: number): number => {
      let worst = 0;
      for (const row of same) {
        const solo = soloOf(row.env, "resolved");
        const total = solo.reduce((a, b) => a + b, 0);
        const v =
          weighted(row.env, solo, "rate") / total +
          weighted(row.env, solo, "frequency") / denominator;
        worst = Math.max(worst, row.lo - v, v - row.hi, 0);
      }
      return worst;
    };
    const f0 = corpus.find((r) => r.name === "F0");
    if (!f0) throw new Error("F0");
    const solo = soloOf(f0.env, "resolved");
    expect(round1(solo.reduce((a, b) => a + b, 0))).toBe(89.1);
    expect(round1(kernelValue(f0.env, SPEC_BASE))).toBe(70.8);
    // アクティブ欄 raw は逸脱 0.006 以内、Σ 単独寄与 はその 1.5 倍以上外す
    expect(worstOf(70.78)).toBeLessThan(0.006);
    expect(worstOf(89.12)).toBeGreaterThan(worstOf(70.78) * 1.5);
    // 最大逸脱を最小にする分母は 66〜72 の帯にあり、Σ 単独寄与(89.12)ではない
    let best = 0;
    let bestWorst = Infinity;
    for (let d = 40; d <= 120; d += 0.02) {
      const w = worstOf(d);
      if (w < bestWorst) {
        bestWorst = w;
        best = d;
      }
    }
    expect(best).toBeGreaterThan(66);
    expect(best).toBeLessThan(72);
  });

  /** モデルの 5 欄。衣装 / ボード は 9 状態とも実機と完全一致、パッシブだけ 0.1 低い */
  const model: Record<string, Five> = {
    S1: [34.9, 70.8, 16.1, 0.7, 42.8],
    S2: [34.9, 70.8, 16.1, 0.7, 42.8],
    S3: [35.0, 70.8, 15.7, 0.7, 42.8],
    "S3'": [35.0, 70.8, 15.7, 0.7, 42.8],
    F16: [36.8, 70.8, 17.1, 0.8, 42.8],
    F12: [38.4, 70.8, 17.2, 0.8, 42.8],
    RmF: [38.6, 70.8, 16.9, 0.8, 42.8],
    RtM: [38.6, 70.8, 17.3, 0.8, 42.8],
    F8: [35.0, 70.8, 15.2, 0.7, 42.8],
  };
  for (const state of RATE_FREQUENCY_STATES) {
    const expected = model[state.name];
    if (!expected) throw new Error(state.name);
    it(`${state.name}: 実機 ${state.support.join(" / ")} → モデル ${expected.join(" / ")}`, () => {
      const members = FREQUENCY_TRANSFER_MEMBERS.map((s) => memberFor(s, rateFrequencyBlue(state)));
      const d = computeDisplayScoreBonus(
        { leader: realCard(LEADER_SUPPORT_ID), members },
        holomenMap,
        state.power,
      );
      expect([d.costume, d.active, d.board, d.passive, d.special]).toEqual(expected);
      // アクティブ欄・SP 欄は完全一致、衣装 / ボード / パッシブ は 0.2 以内
      expect(d.active).toBe(state.support[1]);
      expect(d.special).toBe(state.support[4]);
      expect(Math.abs(d.costume - state.support[0])).toBeLessThanOrEqual(0.2 + 1e-9);
      expect(Math.abs(d.board - state.support[2])).toBeLessThanOrEqual(0.2 + 1e-9);
      expect(Math.abs(d.passive - state.support[3])).toBeLessThanOrEqual(0.2 + 1e-9);
    });
  }
});
