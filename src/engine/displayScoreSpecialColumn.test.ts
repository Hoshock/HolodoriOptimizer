import { describe, expect, it } from "vite-plus/test";

import { cardAtBloom } from "../data/bloom";
import type { Card } from "../data/types";
import { triggerMet } from "./displayScore";
import { holomenMap, realCard } from "./displayScoreCategoryCorpus.fixture";
import { kernelValue, SPEC_BASE } from "./displayScoreProjectiveWeightExperimental";
import { buildSourceEnvironment } from "./displayScoreSourceAttributionExperimental";

/**
 * **SP 欄の「スキル発動率 UP」項の構造（2026-09-13。解析用の反証であって式ではない）。**
 *
 * SP 欄のスコアサポート部分 `アクティブ欄 raw × Σ_i 支援_i × 効果時間_i / 12000` は多くのケースで完全一致し、
 * 残差は発動率 UP を持つ SP を含む編成だけに出る。ここで固定するのは、その残差項について実機が要求する 2 つの性質:
 *
 * 1. **SP スキルごとに加法的**（編成の SP 集合を足し合わせた形で説明できる）
 * 2. **係数はデッキ非依存**（同じ `(効果時間, 支援%, 発動率 UP%)` の寄与が編成をまたいで一致する）
 *
 * production の現在の項（`効果時間 / 100 × タイムライン再評価の差分`）は 2 を満たさない — 同じ発動率 UP 50% でも
 * デッキによって差分が 1.2 倍変わるのに、実機が要求する 1 スキルあたりの寄与は 3% 以内にそろう。
 * したがって**形として反証されている**（pending.md「SP 欄の発動率 UP 項」）。
 * 閉じた形はまだ決めない: 観測できている `(効果時間, 支援%, 発動率 UP%)` の組が 2 通りしかなく、3 つの依存を分離できない。
 *
 * 恒常 0凸 のカードを含む編成（K5 / K6 / K7）は使わない — SP のスコアサポート % が `estimated-from-max` の
 * 試算値で、ゲーム事実ではないため（CLAUDE.md「カードデータ」）。
 */
describe("SP 欄の発動率 UP 項(2026-09-13。解析用の反証)", () => {
  const BLOOM: Record<string, number> = {
    "usada-pekora-01": 1,
    "inugami-korone-02": 2,
    "nekomata-okayu-02": 5,
    "shirakami-fubuki-02": 0,
    "ookami-mio-02": 1,
    "sakura-miko-02": 1,
    "houshou-marine-01": 1,
    "fuwawa-abyssgard-02": 0,
  };
  const member = (id: string): Card => {
    const b = cardAtBloom(realCard(id), BLOOM[id] ?? 0);
    return {
      ...b,
      naturalStats: b.stats,
      boardLive: { activeRatePercent: 0, activeFrequencyPercent: 0 },
    };
  };
  /** [名前, メンバー 5 人, 実機の SP 欄]。青は SP 欄に効かない(実機確定)ので 0 で評価する */
  const decks: [string, string[], number][] = [
    [
      "B",
      [
        "usada-pekora-01",
        "inugami-korone-02",
        "nekomata-okayu-02",
        "shirakami-fubuki-02",
        "ookami-mio-02",
      ],
      46.0,
    ],
    [
      "9.7",
      [
        "nekomata-okayu-02",
        "sakura-miko-02",
        "usada-pekora-01",
        "houshou-marine-01",
        "fuwawa-abyssgard-02",
      ],
      44.2,
    ],
    [
      "9.8",
      [
        "nekomata-okayu-02",
        "shirakami-fubuki-02",
        "usada-pekora-01",
        "houshou-marine-01",
        "fuwawa-abyssgard-02",
      ],
      38.6,
    ],
    [
      "9.9",
      [
        "nekomata-okayu-02",
        "shirakami-fubuki-02",
        "usada-pekora-01",
        "houshou-marine-01",
        "inugami-korone-02",
      ],
      41.7,
    ],
    [
      "9.10",
      [
        "nekomata-okayu-02",
        "shirakami-fubuki-02",
        "usada-pekora-01",
        "houshou-marine-01",
        "ookami-mio-02",
      ],
      42.1,
    ],
    [
      "9.11",
      [
        "nekomata-okayu-02",
        "shirakami-fubuki-02",
        "usada-pekora-01",
        "houshou-marine-01",
        "sakura-miko-02",
      ],
      45.2,
    ],
  ];

  interface Row {
    name: string;
    active: number;
    staticPart: number;
    /** 実機の SP 欄から静的部分を引いた残差 / アクティブ欄 raw の区間（表示は 0.1 単位の切り上げ） */
    extraLo: number;
    extraHi: number;
    /** その編成にある「発動率 UP つき SP」の (効果時間, 支援%, 発動率 UP%) */
    entries: [number, number, number][];
  }
  const rows: Row[] = decks.map(([name, ids, observed]) => {
    const members = ids.map(member);
    const env = buildSourceEnvironment(realCard("nekomata-okayu-02"), members, holomenMap);
    const active = kernelValue(env, SPEC_BASE);
    const typeCounts = new Int32Array(3);
    const affCounts = new Int32Array(64);
    for (const v of env.views) {
      typeCounts[v.typeIndex] = (typeCounts[v.typeIndex] ?? 0) + 1;
      for (const a of v.affIndices) affCounts[a] = (affCounts[a] ?? 0) + 1;
    }
    let staticPart = 0;
    const entries: [number, number, number][] = [];
    for (const view of env.views) {
      const sp = view.special;
      if (!sp) continue;
      staticPart += (sp.scoreSupportPercent * sp.durationSeconds) / 12000;
      if (sp.rate && triggerMet(sp.rate.trigger, typeCounts, affCounts)) {
        entries.push([sp.durationSeconds, sp.scoreSupportPercent, sp.rate.percent]);
      }
    }
    const base = staticPart * active;
    return {
      name,
      active,
      staticPart,
      extraLo: (observed - 0.1 - base) / active,
      extraHi: (observed - base) / active,
      entries,
    };
  });

  it("発動率 UP つき SP の組は 3 通りしかなく、条件はすべての編成で成立している", () => {
    const shapes = rows.map((r) =>
      r.entries
        .map((e) => e.join("/"))
        .sort()
        .join(" "),
    );
    expect(shapes).toEqual([
      "11/130/50 12/100/35",
      "12/100/35 12/100/35",
      "11/130/50 12/100/35 12/100/35",
      "11/130/50 12/100/35 12/100/35",
      "11/130/50 12/100/35",
      "11/130/50 12/100/35",
    ]);
  });

  it("残差はスキルごとに加法的で、係数はデッキ非依存(2 つの未知数で 6 編成の区間を同時に満たす解がある)", () => {
    // 残差 / アクティブ欄 = Σ_i (効果時間_i / 120) × (1 + 支援_i/100) × β(発動率 UP_i) とおくと、
    // β(35) ≈ 0.0907 / β(50) ≈ 0.1387 が 6 編成すべての区間に入る(自由度 2、拘束 6)
    const fits = (b35: number, b50: number): boolean =>
      rows.every((r) => {
        const extra = r.entries.reduce(
          (sum, [dur, support, rate]) =>
            sum + (dur / 120) * (1 + support / 100) * (rate === 35 ? b35 : b50),
          0,
        );
        return extra > r.extraLo && extra <= r.extraHi;
      });
    expect(fits(0.0907, 0.1387)).toBe(true);
    // 区間は狭い: どちらの係数も ±5% ずらすと 6 編成のどれかが外れる
    expect(fits(0.0907 * 1.05, 0.1387)).toBe(false);
    expect(fits(0.0907 * 0.95, 0.1387)).toBe(false);
    expect(fits(0.0907, 0.1387 * 1.05)).toBe(false);
    expect(fits(0.0907, 0.1387 * 0.95)).toBe(false);
  });

  it("1 スキルあたりの寄与は編成をまたいでそろう(発動率 UP 35% の 1 本ぶんが 0.018 前後)", () => {
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    const mid = (name: string): number => {
      const r = byName[name];
      if (!r) throw new Error(name);
      return (r.extraLo + r.extraHi) / 2;
    };
    // 9.7 は (12,100,35) が 2 本だけ → 1 本あたり 0.0181
    const one35 = mid("9.7") / 2;
    expect(one35).toBeGreaterThan(0.0176);
    expect(one35).toBeLessThan(0.0186);
    // 9.8 / 9.9 は 9.10 / 9.11 に (12,100,35) を 1 本足したもの → 差が 1 本ぶんに一致する
    for (const [three, two] of [
      ["9.8", "9.10"],
      ["9.9", "9.11"],
    ] as const) {
      expect(Math.abs(mid(three) - mid(two) - one35), three).toBeLessThan(0.0015);
    }
  });

  it("production の現在の項(効果時間 / 100 × タイムライン再評価の差分)はデッキ非依存を満たさない", () => {
    // 同じ発動率 UP 50% でも、タイムライン再評価の差分 / アクティブ欄 は編成で 1.2 倍以上変わる
    // (実機が要求する 1 スキルあたりの寄与は、上のテストのとおり編成をまたいで 3% 以内にそろう)
    const ratios = rows.map((r) => {
      const env = buildSourceEnvironment(
        realCard("nekomata-okayu-02"),
        decks.find(([n]) => n === r.name)?.[1].map(member) ?? [],
        holomenMap,
      );
      const base = kernelValue(env, SPEC_BASE);
      const p = new Float64Array(5);
      env.views.forEach((v, i) => {
        p[i] = v.active ? Math.min(1, v.active.p0 + 0.5) : 0;
      });
      let boosted = 0;
      for (let s = 1; s <= env.T; s++) {
        let mask = 0;
        for (let i = 0; i < env.views.length; i++) if (env.onBase[i]?.[s]) mask |= 1 << i;
        if (mask === 0) continue;
        let den = 0;
        for (let i = 0; i < env.views.length; i++) if (mask & (1 << i)) den += p[i] ?? 0;
        const norm = den > 1 ? den : 1;
        for (let i = 0; i < env.views.length; i++) {
          if (mask & (1 << i)) boosted += ((env.ups[i] ?? 0) * (p[i] ?? 0)) / norm;
        }
      }
      return (boosted / env.T - base) / base;
    });
    expect(Math.max(...ratios) / Math.min(...ratios)).toBeGreaterThan(1.2);
  });
});
