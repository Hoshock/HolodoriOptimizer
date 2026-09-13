import { describe, expect, it } from "vite-plus/test";

import { computeDisplayScoreRaw } from "./displayScore";
import type { Five, Slot } from "./displayScoreCategoryCorpus.fixture";
import {
  CATEGORY_CONTRASTS,
  FREQUENCY_TRANSFER_MEMBERS,
  FREQUENCY_TRANSFER_STATES,
  frequencyTransferBlue,
  holomenMap,
  LEADER_BASELINE_ID,
  LEADER_CONTRASTS,
  LEADER_SUPPORT_ID,
  memberFor,
  realCard,
} from "./displayScoreCategoryCorpus.fixture";

/**
 * **衣装 / ボード / パッシブ 欄の 0.1% 量子化規則の機械比較（2026-09-13）。**
 *
 * アクティブ欄と SP 欄は 0.1% 単位の**切り上げ**で確定している（実機 20 ケースで四捨五入 15/20 → 切り上げ 20/20）。
 * 残る 3 欄は raw 式が変わったので、切り上げ / 四捨五入 / 切り捨て を同じコーパスで数え直す。
 *
 * **結論: 切り捨ては棄却できるが、切り上げと四捨五入は決着しない。** production は「5 欄で規則を 2 つ持たない」ほうを
 * 採って切り上げにそろえてある。最小の矛盾集合は {K5, K6} で、raw 側の残差が 0.1% を切るまでこの 2 件は両立しない
 * （docs/human/display-score.md「量子化」）。
 */
describe("衣装 / ボード / パッシブ の量子化規則(2026-09-13 の機械比較)", () => {
  interface Row {
    label: string;
    leaderId: string;
    members: Slot[];
    blue: ReturnType<typeof frequencyTransferBlue>;
    red: number;
    song: number;
    observed: Five;
  }
  const rows: Row[] = [];
  for (const c of LEADER_CONTRASTS) {
    for (const [role, leaderId, observed] of [
      ["base", LEADER_BASELINE_ID, c.baseline],
      ["kro", LEADER_SUPPORT_ID, c.support],
    ] as const) {
      rows.push({
        label: `${c.name.slice(0, 2)}-${role}`,
        leaderId,
        members: c.members,
        blue: c.blue,
        red: 0,
        song: 0,
        observed,
      });
    }
  }
  for (const state of FREQUENCY_TRANSFER_STATES) {
    const blue = frequencyTransferBlue(state);
    for (const [role, leaderId, observed] of [
      ["base", LEADER_BASELINE_ID, state.baseline],
      ["kro", LEADER_SUPPORT_ID, state.support],
    ] as const) {
      rows.push({
        label: `${state.name}-${role}`,
        leaderId,
        members: FREQUENCY_TRANSFER_MEMBERS,
        blue,
        red: 0,
        song: 0,
        observed,
      });
    }
  }
  // 赤の直接対照のうち、青の観測時点が 2026-09-12 の構造化データで確定している行だけ（09-08 の青と exploratory は除く）
  for (const c of CATEGORY_CONTRASTS) {
    if (c.group !== "fuwawa+24" && c.group !== "r061+3") continue;
    rows.push({
      label: `${c.name.slice(0, 12)}/before`,
      leaderId: c.leaderId,
      members: c.members,
      blue: c.blue,
      red: c.xBefore,
      song: c.songBonus,
      observed: c.before,
    });
    rows.push({
      label: `${c.name.slice(0, 12)}/after`,
      leaderId: c.leaderId,
      members: c.members,
      blue: c.blue,
      red: c.xAfter,
      song: c.songBonus,
      observed: c.after,
    });
  }

  const raws = rows.map((r) => ({
    ...r,
    raw: computeDisplayScoreRaw(
      { leader: realCard(r.leaderId), members: r.members.map((s) => memberFor(s, r.blue)) },
      holomenMap,
      {
        red: r.red
          ? {
              fixed: { performance: 0, technique: 0, sense: 0 },
              percent: { performance: 0, technique: 0, sense: 0 },
              scoreSupportPercent: r.red,
            }
          : null,
        songBonus: r.song,
      },
    ),
  }));

  type Mode = "ceil" | "round" | "floor";
  const quantize = (value: number, mode: Mode): number => {
    const scaled = value * 10;
    const q =
      mode === "ceil"
        ? Math.ceil(scaled - 1e-9)
        : mode === "round"
          ? Math.round(scaled + 1e-9)
          : Math.floor(scaled + 1e-9);
    return (q === 0 ? 0 : q) / 10;
  };
  const statsOf = (mode: Mode) => {
    let exact = 0;
    let total = 0;
    const errors: Record<string, number[]> = { costume: [], board: [], passive: [] };
    for (const r of raws) {
      const pairs: [string, number, number][] = [
        ["costume", r.raw.costume, r.observed[0]],
        ["board", r.raw.board, r.observed[2]],
        ["passive", r.raw.passive, r.observed[3]],
      ];
      for (const [key, value, obs] of pairs) {
        const q = quantize(value, mode);
        total++;
        if (Math.abs(q - obs) < 1e-9) exact++;
        errors[key]?.push(q - obs);
      }
    }
    const stat = (e: number[]) => ({
      rmse: Math.round(Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length) * 100) / 100,
      max: Math.round(Math.max(...e.map(Math.abs)) * 10) / 10,
    });
    return {
      exact,
      total,
      costume: stat(errors.costume ?? []),
      board: stat(errors.board ?? []),
      passive: stat(errors.passive ?? []),
    };
  };

  it("コーパスは 42 行 × 3 欄 = 126 列(青の観測時点が確定している行だけ)", () => {
    expect(rows.length).toBe(42);
    expect(statsOf("ceil").total).toBe(126);
    // 切り上げ: 完全一致 43/126、衣装 RMSE 0.28 / 最大 0.8、ボード 0.36 / 0.9、パッシブ 0.09 / 0.2
    expect(statsOf("ceil").exact).toBe(43);
    expect(statsOf("round").exact).toBe(42);
  });

  it("切り捨ては棄却できる(完全一致が 9 列少ない)", () => {
    expect(statsOf("floor").exact).toBeLessThan(statsOf("ceil").exact - 5);
  });

  it("切り上げと四捨五入は 126 列中 1 列しか違わず決着しない(切り上げのほうが ボード / パッシブ の誤差は小さい)", () => {
    const ceil = statsOf("ceil");
    const round = statsOf("round");
    expect(ceil.exact - round.exact).toBe(1);
    expect(ceil.board.rmse).toBeLessThan(round.board.rmse);
    expect(ceil.passive.rmse).toBeLessThan(round.passive.rmse);
    // 衣装欄だけは四捨五入のほうがわずかに良い
    expect(round.costume.rmse).toBeLessThanOrEqual(ceil.costume.rmse);
  });

  it("最小の矛盾集合は {K5, K6}: K5 は切り上げで、K6 は四捨五入・切り捨てで必ず 0.1 ずれる", () => {
    const k5 = raws.find((r) => r.label === "K5-kro");
    const k6 = raws.find((r) => r.label === "K6-kro");
    if (!k5 || !k6) throw new Error("K5 / K6 がない");
    // K5: raw 衣装欄は (37.92, 37.98) の中にしか来ない → 切り上げは必ず 38.0(実機 37.9)
    expect(k5.raw.costume).toBeGreaterThan(37.92);
    expect(k5.raw.costume).toBeLessThan(37.98);
    expect(quantize(k5.raw.costume, "ceil")).toBe(38.0);
    expect(quantize(k5.raw.costume, "round")).toBe(37.9);
    expect(k5.observed[0]).toBe(37.9);
    // K6: raw 衣装欄は (44.16, 44.22] → 四捨五入・切り捨ては必ず 44.2(実機 44.3)
    expect(k6.raw.costume).toBeGreaterThan(44.16);
    expect(k6.raw.costume).toBeLessThanOrEqual(44.22);
    expect(quantize(k6.raw.costume, "ceil")).toBe(44.3);
    expect(quantize(k6.raw.costume, "round")).toBe(44.2);
    expect(k6.observed[0]).toBe(44.3);
  });

  it("production は切り上げを採用している(5 欄で規則を 2 つ持たない)", () => {
    const ceil = statsOf("ceil");
    expect(ceil.costume.max).toBeLessThanOrEqual(0.8);
    expect(ceil.board.max).toBeLessThanOrEqual(0.9);
    expect(ceil.passive.max).toBeLessThanOrEqual(0.3);
  });
});
