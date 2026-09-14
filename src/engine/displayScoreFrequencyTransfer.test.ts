import { describe, expect, it } from "vite-plus/test";

import { computeDisplayScoreBonus, displayUnitScore, round1 } from "./displayScore";
import {
  FREQUENCY_TRANSFER_HOLOMEN,
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
 * **発動頻度 ownership 系列の Golden（2026-09-13 ユーザー実機観測。F0〜F3 × リーダー 2 通り = 8 点）。**
 * 観測値の全文は [docs/human/repro/display-score-20260913-frequency.md]。
 *
 * 同じ 5 人（水着みこ 1凸 / 水着フブキ 0凸 / 水着フワワ 0凸 / 水着おかゆ 5凸 / 恒常マリン 1凸）・曲なし・赤 0・黄 0 で、
 * **青の発動率の合計 92.1% と発動頻度の合計 12% を固定したまま**、発動頻度マス 3 つ（`B-013` / `B-020` / `B-031`）の
 * 所有者だけを 水着みこ → 水着おかゆ へ 1 つずつ移した 4 状態。リーダーは 恒常みこ 0凸（支援 0）と
 * 典獄クロニー 0凸（支援 60%）。
 *
 * この系列が決めること:
 * 1. **F2 の落ち込みは入力事故ではない。** 総量（pre-yellow の 3 欄合計）の増分は 45.7 / 46.4 / 39.3 / 46.2 と
 *    F2 だけ大きく落ちる。`周期 ÷ (1 + f/100)` + 同時候補の正規化 `max(1, Σp)` はこれを自由係数なしで再現する。
 * 2. **projective direction は発動頻度の所有者を移してもほぼ変わらない(実測の観測)。** クロニー側の 衣装 : ボード : パッシブ は
 *    4 状態でほぼ一定（約 71.8% : 26.5% : 1.7%）で、総量が 27% 落ちる F2 でも変わらない。
 * 3. **F3 = 2026-09-12 の K3。** 5 欄が両リーダーとも完全一致するので、K3 の historical-input uncertainty は下がる。
 */
describe("発動頻度 ownership 系列 F0〜F3(2026-09-13 実機観測)", () => {
  const blueOf = (name: string) => {
    const state = FREQUENCY_TRANSFER_STATES.find((s) => s.name === name);
    if (!state) throw new Error(name);
    return frequencyTransferBlue(state);
  };

  it("青の実効値は snapshot の raw マスから導出でき、ΣR = 92.1 / ΣF = 12 が 4 状態とも固定", () => {
    const expected: Record<string, [number, number]> = {
      F0: [12, 0],
      F1: [8, 4],
      F2: [4, 8],
      F3: [0, 12],
    };
    for (const state of FREQUENCY_TRANSFER_STATES) {
      const blue = frequencyTransferBlue(state);
      const [mikoF, okayuF] = expected[state.name] ?? [0, 0];
      expect(blue["sakura-miko"], state.name).toEqual([42, mikoF]);
      expect(blue["nekomata-okayu"], state.name).toEqual([35.1, okayuF]);
      expect(blue["shirakami-fubuki"], state.name).toEqual([15, 0]);
      expect(blue["fuwawa-abyssgard"], state.name).toEqual([0, 0]);
      expect(blue["houshou-marine"], state.name).toEqual([0, 0]);
      const rates = FREQUENCY_TRANSFER_HOLOMEN.reduce((s, id) => s + (blue[id]?.[0] ?? 0), 0);
      const freqs = FREQUENCY_TRANSFER_HOLOMEN.reduce((s, id) => s + (blue[id]?.[1] ?? 0), 0);
      expect(round1(rates), state.name).toBe(92.1);
      expect(freqs, state.name).toBe(12);
    }
  });

  it("ユニットスコア = ceil(総合力 × (1 + 表示合計/100) × 2.03734) が 8 点すべてで成り立ち、合計は 5 欄の和", () => {
    for (const state of FREQUENCY_TRANSFER_STATES) {
      for (const [five, power, unitScore] of [
        [state.baseline, state.baselinePower, state.baselineUnitScore],
        [state.support, state.supportPower, state.supportUnitScore],
      ] as const) {
        const total = round1(five.reduce((a, b) => a + b, 0));
        expect(displayUnitScore(power, total), `${state.name} ${String(power)}`).toBe(unitScore);
      }
    }
  });

  it("総合力は 4 状態で不変(青の発動頻度は総合力に効かない): 恒常みこ側 236,486 / クロニー側 189,502", () => {
    for (const state of FREQUENCY_TRANSFER_STATES) {
      expect(state.baselinePower, state.name).toBe(236486);
      expect(state.supportPower, state.name).toBe(189502);
    }
  });

  it("アクティブ欄 70.8 と SP 欄 42.8 は 8 点とも不変(青ボードはこの 2 欄に効かない)", () => {
    for (const state of FREQUENCY_TRANSFER_STATES) {
      expect([state.baseline[1], state.baseline[4]], state.name).toEqual([70.8, 42.8]);
      expect([state.support[1], state.support[4]], state.name).toEqual([70.8, 42.8]);
    }
  });

  it("F3 は 2026-09-12 の K3 の 5 欄を両リーダーとも完全再現する", () => {
    const k3 = LEADER_CONTRASTS.find((c) => c.name.startsWith("K3"));
    const f3 = FREQUENCY_TRANSFER_STATES.find((s) => s.name === "F3");
    if (!k3 || !f3) throw new Error("K3 / F3 がない");
    expect(f3.baseline).toEqual(k3.baseline);
    expect(f3.support).toEqual(k3.support);
    // 同じメンバー 5 人・同じ青の実効値
    expect(k3.members).toEqual(FREQUENCY_TRANSFER_MEMBERS);
    const blue = blueOf("F3");
    for (const id of FREQUENCY_TRANSFER_HOLOMEN) {
      expect(blue[id], id).toEqual(k3.blue[id]);
    }
  });

  it("pre-yellow の総量(衣装 + ボード + パッシブ)は F2 だけ大きく落ちる(45.7 / 46.4 / 39.3 / 46.2)", () => {
    const gains = FREQUENCY_TRANSFER_STATES.map((s) => {
      const t = (five: readonly number[]) =>
        round1((five[0] ?? 0) + (five[2] ?? 0) + (five[3] ?? 0));
      return round1(t(s.support) - t(s.baseline));
    });
    expect(gains).toEqual([45.7, 46.4, 39.3, 46.2]);
    // F2 は支援なし側が ボード 0 / パッシブ 0 まで落ちる(raw が負で 0 表示)
    expect(FREQUENCY_TRANSFER_STATES[2]?.baseline).toEqual([0, 70.8, 0, 0, 42.8]);
  });

  it("クロニー側の 衣装 : ボード : パッシブ の向きは 4 状態でほぼ一定(総量が 27% 落ちる F2 でも変わらない)", () => {
    const shares = FREQUENCY_TRANSFER_STATES.map((s) => {
      const total = (s.support[0] ?? 0) + (s.support[2] ?? 0) + (s.support[3] ?? 0);
      return [s.support[0] / total, s.support[2] / total, s.support[3] / total];
    });
    for (const [c, b, p] of shares) {
      expect(c).toBeGreaterThan(0.7175);
      expect(c).toBeLessThan(0.719);
      expect(b).toBeGreaterThan(0.2635);
      expect(b).toBeLessThan(0.266);
      expect(p).toBeGreaterThan(0.0165);
      expect(p).toBeLessThan(0.018);
    }
  });

  /** モデルの 5 欄 [衣装, アクティブ, ボード, パッシブ, SP]。アクティブ欄・SP 欄は 8 点とも実機と完全一致 */
  const model: Record<string, { baseline: number[]; support: number[] }> = {
    F0: { baseline: [0, 70.8, 5.8, 0.4, 42.8], support: [37.3, 70.8, 13.7, 0.8, 42.8] },
    F1: { baseline: [0, 70.8, 6.8, 0.4, 42.8], support: [38.5, 70.8, 14.2, 0.8, 42.8] },
    F2: { baseline: [0, 70.8, 0, 0, 42.8], support: [28.2, 70.8, 10.4, 0.7, 42.8] },
    F3: { baseline: [0, 70.8, 6.8, 0.4, 42.8], support: [38.5, 70.8, 14.3, 0.8, 42.8] },
  };

  for (const state of FREQUENCY_TRANSFER_STATES) {
    const blue = frequencyTransferBlue(state);
    const members = FREQUENCY_TRANSFER_MEMBERS.map((slot) => memberFor(slot, blue));
    for (const [role, leaderId, five, power] of [
      ["恒常みこ", LEADER_BASELINE_ID, state.baseline, state.baselinePower],
      ["クロニー", LEADER_SUPPORT_ID, state.support, state.supportPower],
    ] as const) {
      const expected = model[state.name]?.[role === "恒常みこ" ? "baseline" : "support"];
      if (!expected) throw new Error(state.name);
      it(`${state.name} ${role}: 実機 ${five.join(" / ")} → モデル ${expected.join(" / ")}`, () => {
        const d = computeDisplayScoreBonus(
          { leader: realCard(leaderId), members },
          holomenMap,
          power,
        );
        expect([d.costume, d.active, d.board, d.passive, d.special]).toEqual(expected);
        // アクティブ欄は完全一致。衣装 / ボード / パッシブ は 0.1 以内
        // (2026-09-13 に `W_blue` を `blueSupportPercentOf` へ替えて 1.0 → 0.1 になった。F2 の残差 0.023 も消えた)
        expect(d.active).toBe(five[1]);
        expect(Math.abs(d.costume - (five[0] ?? 0))).toBeLessThanOrEqual(0.1 + 1e-9);
        expect(Math.abs(d.board - (five[2] ?? 0))).toBeLessThanOrEqual(0.1 + 1e-9);
        expect(Math.abs(d.passive - (five[3] ?? 0))).toBeLessThanOrEqual(0.1 + 1e-9);
        // SP 欄も完全一致(発動率 UP の閉じた形 — displayScoreSpecialColumn.test.ts)
        expect(d.special).toBe(five[4]);
      });
    }
  }

  it("モデルも F2 だけ総量が落ちる(非単調性の再現)", () => {
    const totals = FREQUENCY_TRANSFER_STATES.map((state) => {
      const blue = frequencyTransferBlue(state);
      const members = FREQUENCY_TRANSFER_MEMBERS.map((slot) => memberFor(slot, blue));
      const base = computeDisplayScoreBonus(
        { leader: realCard(LEADER_BASELINE_ID), members },
        holomenMap,
        state.baselinePower,
      );
      const sup = computeDisplayScoreBonus(
        { leader: realCard(LEADER_SUPPORT_ID), members },
        holomenMap,
        state.supportPower,
      );
      const t = (d: { costume: number; board: number; passive: number }) =>
        d.costume + d.board + d.passive;
      return round1(t(sup) - t(base));
    });
    expect(totals[2]).toBeLessThan(totals[1] ?? 0);
    expect(totals[2]).toBeLessThan(totals[3] ?? 0);
    // 実機の落ち込み(46.4 → 39.3 = −7.1)と同じ向き・同じ桁
    expect(round1((totals[1] ?? 0) - (totals[2] ?? 0))).toBeGreaterThan(6);
  });
});
