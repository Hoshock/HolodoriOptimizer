import { describe, expect, it } from "vite-plus/test";

import {
  computeDisplayScoreBonus,
  computeDisplayScoreRaw,
  displayUnitScore,
  round1,
} from "./displayScore";
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
  SPEC_BLUE_ADD,
  SPEC_BLUE_MULT,
  SPEC_P0_ONLY,
} from "./displayScoreProjectiveWeightExperimental";

/**
 * **青ボードの raw weight `W_blue` の Golden と候補比較（2026-09-13 ユーザー実機観測。9 状態）。**
 * 観測値の全文は [docs/human/repro/display-score-20260913-blue-weight.md]、解釈は
 * [docs/human/display-score.md]「`W_blue` の決定式」。
 *
 * 同じ 5 人（F0〜F3 / K3 と同じ）・リーダー 典獄クロニー 0凸（衣装 60%）・曲なし・赤 0・黄 0 のまま、
 * 青のマスを 1 つずつだけ開閉した 9 状態。**発動率だけを 3pt 動かす組 3 つ・発動頻度だけを 4pt 動かす組 2 つ・
 * ΣR も ΣF も変えずに所有者だけを移す組 2 つ**が同時に取れる。
 *
 * **量子化規則は未確定なので、要求区間は切り上げ / 四捨五入を分けて作る**（`requiredRatio`）。表示値 `d` の raw は
 * 切り上げなら `(d − 0.1, d]`、四捨五入なら `[d − 0.05, d + 0.05)` で、**対称区間は四捨五入を仮定したもの**になる。
 *
 * この系列で分かること:
 * 1. production の `blueSupportPercentOf` は、対立候補すべてより明確に良い（inside 12/20・最大逸脱 0.0026 対 0.011 以上）。
 * 2. 重みは**青の状態に依存しない**（基準タイムライン由来）。ただし**所有者には依存する** — 実測の要求区間が
 *    ownership 対で重なるのは、その差が量子化の区間幅より小さいから。
 * 3. **確定ではない。** 20 状態のうち 8 状態は切り上げ区間の外（最大 0.0026）で、発動頻度側の分母は
 *    `アクティブ欄 raw` と `表示アクティブ欄` を分離できない。
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
      expect(blue["shirakami-fubuki"], state.name).toEqual([15, 0]);
      expect(blue["nekomata-okayu"], state.name).toEqual([35.1, 0]);
      expect(blue["houshou-marine"], state.name).toEqual([0, 0]);
      const sr = FREQUENCY_TRANSFER_HOLOMEN.reduce((s, id) => s + (blue[id]?.[0] ?? 0), 0);
      const sf = FREQUENCY_TRANSFER_HOLOMEN.reduce((s, id) => s + (blue[id]?.[1] ?? 0), 0);
      expect([round1(sr), sf], state.name).toEqual(e.sum);
    }
  });

  it("ユニットスコア = ceil(総合力 × (1 + 表示合計/100) × 2.03734) が 9 状態すべてで成り立つ", () => {
    // これは**観測の整合性の確認**（実機の 総合力・5 欄・ユニットスコアが互いに矛盾しない）であって、
    // 内部 5 欄モデルが実機と一致することの証明ではない
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

  /**
   * 実測が要求する `W_blue / H_C`（= 支援%/100 × ボード欄 / 衣装欄）の区間。
   * **量子化規則が未確定なので仮定ごとに分ける**: 切り上げなら表示 `d` の raw は `(d − 0.1, d]`、
   * 四捨五入なら `[d − 0.05, d + 0.05)`。境界は閉じた側で評価する（保守的）。
   */
  type Mode = "ceil" | "round";
  const rawRange = (d: number, mode: Mode): [number, number] =>
    mode === "ceil" ? [d - 0.1, d] : [d - 0.05, d + 0.05];
  const requiredRatio = (five: Five | readonly number[], mode: Mode): [number, number] => {
    const [cLo, cHi] = rawRange(five[0] ?? 0, mode);
    const [bLo, bHi] = rawRange(five[2] ?? 0, mode);
    const k = LEADER_SUPPORT_PERCENT / 100;
    return [(k * Math.max(bLo, 0)) / cHi, (k * bHi) / Math.max(cLo, 1e-9)];
  };

  it("要求区間は量子化規則で変わる(対称 ±0.05 は四捨五入を仮定したもの)", () => {
    // S1: 衣装 34.8 / ボード 16.1。切り上げなら raw は (34.7, 34.8] と (16.0, 16.1]
    const s1 = RATE_FREQUENCY_STATES[0];
    if (!s1) throw new Error("S1");
    const c = requiredRatio(s1.support, "ceil");
    const r = requiredRatio(s1.support, "round");
    expect(c.map((x) => Math.round(x * 10000) / 10000)).toEqual([0.2759, 0.2784]);
    expect(r.map((x) => Math.round(x * 10000) / 10000)).toEqual([0.2763, 0.2788]);
    // 切り上げ区間のほうが下にずれる(ボードの下限が 0.1 低く、衣装の上限が 0.05 低い)
    expect(c[0]).toBeLessThan(r[0]);
    expect(c[1]).toBeLessThan(r[1]);
  });

  /** 20 状態のコーパス（F0〜F3・今回の 9・K1〜K7）。どれもリーダー 60%・赤 0・黄 0・曲なし */
  const corpus: { name: string; env: SourceEnvironment; five: readonly number[] }[] = [];
  for (const s of FREQUENCY_TRANSFER_STATES)
    corpus.push({
      name: s.name,
      env: envOf(FREQUENCY_TRANSFER_MEMBERS, frequencyTransferBlue(s)),
      five: s.support,
    });
  for (const s of RATE_FREQUENCY_STATES)
    corpus.push({
      name: s.name,
      env: envOf(FREQUENCY_TRANSFER_MEMBERS, rateFrequencyBlue(s)),
      five: s.support,
    });
  for (const k of LEADER_CONTRASTS)
    corpus.push({ name: k.name.slice(0, 2), env: envOf(k.members, k.blue), five: k.support });

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
  /** 自由係数なしで作れる自然な正規化量（分母の候補） */
  const normsOf = (env: SourceEnvironment): Record<string, number> => {
    const solo = soloOf(env, "resolved");
    const soloBlue = [0, 1, 2, 3, 4].map((i) => {
      let sec = 0;
      for (let s = 1; s <= env.T; s++) if (env.onBlue[i]?.[s]) sec++;
      return (env.ups[i] ?? 0) * (env.pBlue[i] ?? 0) * (sec / env.T);
    });
    const eBase = kernelValue(env, SPEC_BASE);
    return {
      "Σ 単独寄与": solo.reduce((a, b) => a + b, 0),
      "Σ 単独寄与(青の窓)": soloBlue.reduce((a, b) => a + b, 0),
      アクティブ欄raw: eBase,
      表示アクティブ欄: Math.ceil(eBase * 10 - 1e-9) / 10,
      H_C: kernelValue(env, SPEC_P0_ONLY),
      "E_blue(乗算)": kernelValue(env, SPEC_BLUE_MULT),
      "E_blue(加算)": kernelValue(env, SPEC_BLUE_ADD),
    };
  };

  /** production と同じ式（`blueSupportPercentOf` の比。W_blue / H_C になる） */
  const adopted = (env: SourceEnvironment): number => {
    const solo = soloOf(env, "resolved");
    const total = solo.reduce((a, b) => a + b, 0);
    const base = kernelValue(env, SPEC_BASE);
    if (total <= 0 || base <= 0) return 0;
    return weighted(env, solo, "rate") / total + weighted(env, solo, "frequency") / base;
  };
  const candidates: Record<string, (env: SourceEnvironment) => number> = {
    採用: adopted,
    "分母をそろえる(両方 Σ 単独寄与)": (env) => {
      const solo = soloOf(env, "resolved");
      const total = solo.reduce((a, b) => a + b, 0);
      if (total <= 0) return 0;
      return (weighted(env, solo, "rate") + weighted(env, solo, "frequency")) / total;
    },
    "分母をそろえる(両方 アクティブ欄raw)": (env) => {
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
    "編成全体の評価値どうしの差(E_blue(加算) − H_C)": (env) => {
      const hc = kernelValue(env, SPEC_P0_ONLY);
      return hc > 0 ? (kernelValue(env, SPEC_BLUE_ADD) - hc) / hc : 0;
    },
  };

  /** 候補の成績: 区間に入った数と、外れたぶんの最大 */
  const scoreOf = (fn: (env: SourceEnvironment) => number, mode: Mode | "union") => {
    let inside = 0;
    let worst = 0;
    for (const row of corpus) {
      const v = fn(row.env);
      const violation = (m: Mode): number => {
        const [lo, hi] = requiredRatio(row.five, m);
        return Math.max(0, lo - v, v - hi);
      };
      const w =
        mode === "union" ? Math.min(violation("ceil"), violation("round")) : violation(mode);
      if (w <= 1e-9) inside++;
      else worst = Math.max(worst, w);
    }
    return { inside, worst };
  };

  it("採用式は切り上げ / 四捨五入のどちらの仮定でも対立候補より明確に良い", () => {
    // 切り上げ: 採用 12/20・最大逸脱 0.0026、四捨五入: 10/20・0.0029。対立候補はどれも inside 3 以下・逸脱 0.010 以上
    for (const mode of ["ceil", "round", "union"] as const) {
      const a = scoreOf(adopted, mode);
      expect(a.inside, mode).toBeGreaterThanOrEqual(10);
      expect(a.worst, mode).toBeLessThan(0.003);
      for (const [name, fn] of Object.entries(candidates)) {
        if (name === "採用") continue;
        const s = scoreOf(fn, mode);
        expect(s.inside, `${mode} ${name}`).toBeLessThan(a.inside);
        expect(s.worst, `${mode} ${name}`).toBeGreaterThan(0.01);
      }
    }
    // 切り上げ仮定での実数（値が変われば式が変わったと分かる）
    expect(scoreOf(adopted, "ceil").inside).toBe(12);
    expect(Math.round(scoreOf(adopted, "ceil").worst * 10000) / 10000).toBe(0.0026);
    expect(scoreOf(adopted, "round").inside).toBe(10);
    expect(Math.round(scoreOf(adopted, "round").worst * 10000) / 10000).toBe(0.0029);
    // 青なしの negative control K5 / K6 はどの候補でも 0
    for (const name of ["K5", "K6"]) {
      const row = corpus.find((r) => r.name === name);
      if (!row) throw new Error(name);
      for (const [label, fn] of Object.entries(candidates))
        expect(fn(row.env), `${name} ${label}`).toBe(0);
    }
  });

  it("分母は自然量 7 つの中で一意ではない: 発動率側は Σ 単独寄与 が決定的、発動頻度側は アクティブ欄raw と 表示アクティブ欄 を分離できない", () => {
    const names = Object.keys(normsOf(corpus[0]!.env));
    const withDenominators = (rateName: string, freqName: string) => (env: SourceEnvironment) => {
      const solo = soloOf(env, "resolved");
      const n = normsOf(env);
      const dr = n[rateName] ?? 0;
      const df = n[freqName] ?? 0;
      if (dr <= 0 || df <= 0) return 0;
      return weighted(env, solo, "rate") / dr + weighted(env, solo, "frequency") / df;
    };
    // 発動率側（発動頻度側は アクティブ欄raw に固定）: Σ 単独寄与 が次点の 20 倍良い
    const rate = names.map((n) => ({
      n,
      s: scoreOf(withDenominators(n, "アクティブ欄raw"), "ceil"),
    }));
    const bestRate = rate.find((r) => r.n === "Σ 単独寄与");
    if (!bestRate) throw new Error("Σ 単独寄与");
    for (const r of rate) {
      if (r.n === "Σ 単独寄与") continue;
      expect(r.s.worst, r.n).toBeGreaterThan(bestRate.s.worst * 20);
    }
    // 発動頻度側（発動率側は Σ 単独寄与 に固定）: アクティブ欄raw と 表示アクティブ欄 は区別できない
    const freq = names.map((n) => ({ n, s: scoreOf(withDenominators("Σ 単独寄与", n), "ceil") }));
    const raw = freq.find((r) => r.n === "アクティブ欄raw");
    const shown = freq.find((r) => r.n === "表示アクティブ欄");
    if (!raw || !shown) throw new Error("アクティブ欄");
    expect(Math.abs(raw.s.worst - shown.s.worst)).toBeLessThan(0.0001);
    expect(raw.s.inside).toBe(shown.s.inside);
    // 次点は H_C で、アクティブ欄raw の 2.5 倍外す（= 明確に優位だが「一意」ではない）
    const others = freq.filter((r) => r.n !== "アクティブ欄raw" && r.n !== "表示アクティブ欄");
    const runnerUp = others.reduce((a, b) => (a.s.worst <= b.s.worst ? a : b));
    expect(runnerUp.n).toBe("H_C");
    expect(runnerUp.s.worst).toBeGreaterThan(raw.s.worst * 2);
  });

  it("重みは青の状態に依存しないが、所有者には依存する(ownership 対で一定になるのは区間幅より小さいから)", () => {
    const byName = (name: string) => {
      const row = corpus.find((r) => r.name === name);
      if (!row) throw new Error(name);
      return row;
    };
    // 単独寄与は基準タイムラインだけで決まるので、同じ 5 人なら 13 状態で完全に同じ
    const reference = soloOf(byName("F0").env, "resolved");
    for (const name of ["F1", "F2", "F3", "S1", "S3'", "F16", "F12", "RmF", "RtM", "F8"]) {
      const solo = soloOf(byName(name).env, "resolved");
      for (let i = 0; i < 5; i++)
        expect(Math.abs((solo[i] ?? 0) - (reference[i] ?? 0)), `${name} ${i}`).toBeLessThan(1e-9);
    }
    // ただし所有者を移すとモデルの値は動く（単独寄与がメンバーで違うため）
    for (const [a, b] of [
      ["F0", "F3"],
      ["S3'", "F12"],
      ["F12", "RtM"],
    ] as const) {
      const delta = Math.abs(adopted(byName(b).env) - adopted(byName(a).env));
      expect(delta, `${a} → ${b}`).toBeGreaterThan(0);
      // 動く量は表示 0.1 刻みの区間幅より小さいので、実測の要求区間は重なる
      const [lo, hi] = requiredRatio(byName(a).five, "ceil");
      expect(delta, `${a} → ${b}`).toBeLessThan(hi - lo);
    }
  });

  /**
   * モデルの 5 欄。**完全一致ではない**: 切り上げ量子化で 27 列中 8 列が一致、
   * 衣装 3/9・ボード 5/9・パッシブ 0/9（パッシブは 9 状態とも 0.1 低い）。誤差はどの欄も最大 0.1
   */
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
      // アクティブ欄・SP 欄だけが完全一致。衣装 / ボード / パッシブ は 0.1 以内（一致とは限らない）
      expect(d.active).toBe(state.support[1]);
      expect(d.special).toBe(state.support[4]);
      expect(Math.abs(d.costume - state.support[0])).toBeLessThanOrEqual(0.1 + 1e-9);
      expect(Math.abs(d.board - state.support[2])).toBeLessThanOrEqual(0.1 + 1e-9);
      expect(Math.abs(d.passive - state.support[3])).toBeLessThanOrEqual(0.1 + 1e-9);
    });
  }

  it("今回の 9 状態 × 3 欄 = 27 列の成績(切り上げ 8 / 四捨五入 7 / 切り捨て 6。完全一致ではない)", () => {
    const quantize = (v: number, mode: "ceil" | "round" | "floor"): number => {
      const x = v * 10;
      const q =
        mode === "ceil"
          ? Math.ceil(x - 1e-9)
          : mode === "round"
            ? Math.round(x + 1e-9)
            : Math.floor(x + 1e-9);
      return (q === 0 ? 0 : q) / 10;
    };
    const statsOf = (mode: "ceil" | "round" | "floor") => {
      let exact = 0;
      let total = 0;
      let max = 0;
      const perColumn = [0, 0, 0];
      for (const state of RATE_FREQUENCY_STATES) {
        const raw = computeDisplayScoreRaw(
          {
            leader: realCard(LEADER_SUPPORT_ID),
            members: FREQUENCY_TRANSFER_MEMBERS.map((s) => memberFor(s, rateFrequencyBlue(state))),
          },
          holomenMap,
          { red: null, songBonus: 0 },
        );
        const pairs: [number, number][] = [
          [raw.costume, state.support[0]],
          [raw.board, state.support[2]],
          [raw.passive, state.support[3]],
        ];
        pairs.forEach(([v, o], i) => {
          const q = quantize(v, mode);
          total++;
          if (Math.abs(q - o) < 1e-9) {
            exact++;
            perColumn[i] = (perColumn[i] ?? 0) + 1;
          }
          max = Math.max(max, Math.abs(q - o));
        });
      }
      return { exact, total, max: Math.round(max * 10) / 10, perColumn };
    };
    expect(statsOf("ceil")).toEqual({ exact: 8, total: 27, max: 0.1, perColumn: [3, 5, 0] });
    expect(statsOf("round").exact).toBe(7);
    expect(statsOf("floor").exact).toBe(6);
    // どの規則でも欄ごとの誤差は 0.2 以内
    for (const mode of ["ceil", "round", "floor"] as const)
      expect(statsOf(mode).max, mode).toBeLessThanOrEqual(0.2);
  });
});
