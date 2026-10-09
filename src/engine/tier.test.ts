import { describe, expect, it } from "vite-plus/test";

import tierJson from "../data/tierList.json";
import { star5Cards } from "../data";
import { runOptimize } from "./request";
import {
  assembleTierDataset,
  evaluateTier,
  evaluateTierCard,
  fingerprintOf,
  TIER_RANKS,
  TIER_THRESHOLDS,
  tierFingerprint,
  tierJobRequest,
  tierJobs,
  tierRankOf,
} from "./tier";
import type { TierDataset } from "./tier";

const dataset = tierJson as TierDataset;

/**
 * ティア表(ADR-024)。事前計算のデータが現在のカード・ボード・モデルの版と合っていること、
 * 記録した最良編成の値がいまのエンジンで同じ値になることを固定する(探索そのものは重いので再実行しない)
 */
describe("ティア表のデータ", () => {
  it("指紋が現在のデータと一致する(違えば `pnpm tier` で作り直す)", () => {
    expect(dataset.fingerprint).toBe(tierFingerprint());
  });

  it("★5 全枚の 3 観点がそろっていて、どの結果も固定したカードを含む", () => {
    expect(Object.keys(dataset.cards).sort()).toEqual(star5Cards.map((c) => c.id).sort());
    for (const c of star5Cards) {
      const r = dataset.cards[c.id]!;
      expect(r.member.memberIds).toContain(c.id);
      expect(r.memberBloom0.memberIds).toContain(c.id);
      expect(r.leader.leaderId).toBe(c.id);
      expect(r.member.memberIds).toHaveLength(5);
      expect(r.leader.memberIds).toHaveLength(5);
      // 固定した最良は全体の最良を超えない。0凸は最大開花を超えない
      expect(r.member.unitScore).toBeLessThanOrEqual(dataset.best.unitScore);
      expect(r.leader.unitScore).toBeLessThanOrEqual(dataset.best.unitScore);
      expect(r.memberBloom0.unitScore).toBeLessThanOrEqual(r.member.unitScore);
    }
  });

  it("記録した最良編成を 6 枠固定で評価し直すと、記録したユニットスコアになる(全体の最良と先頭のカードの 3 観点)", () => {
    const check = (job: Parameters<typeof tierJobRequest>[0], team: TierDataset["best"]) => {
      const request = {
        ...tierJobRequest(job),
        leaderId: team.leaderId,
        fixedMemberIds: [...team.memberIds],
      };
      const result = runOptimize(request);
      expect(result.candidates[0]?.display.unitScore).toBe(team.unitScore);
    };
    check({ kind: "best" }, dataset.best);
    const first = star5Cards[0]!;
    const rec = dataset.cards[first.id]!;
    check({ kind: "member", cardId: first.id }, rec.member);
    check({ kind: "memberBloom0", cardId: first.id }, rec.memberBloom0);
    check({ kind: "leader", cardId: first.id }, rec.leader);
  });

  it("全体の最良は、どのカードを固定した最良よりも低くない", () => {
    const max = Math.max(
      ...Object.values(dataset.cards).flatMap((r) => [r.member.unitScore, r.leader.unitScore]),
    );
    expect(dataset.best.unitScore).toBeGreaterThanOrEqual(max);
  });
});

describe("ティア表の評価", () => {
  it("段の下限は SS → D の順に下がり、D は 0", () => {
    for (const role of ["member", "leader"] as const) {
      const t = TIER_THRESHOLDS[role];
      for (let i = 1; i < TIER_RANKS.length; i++)
        expect(t[TIER_RANKS[i]!]).toBeLessThan(t[TIER_RANKS[i - 1]!]);
      expect(t.D).toBe(0);
    }
    expect(tierRankOf("member", 1)).toBe("SS");
    expect(tierRankOf("member", TIER_THRESHOLDS.member.A)).toBe("A");
    expect(tierRankOf("member", 0.5)).toBe("D");
  });

  it("メンバーの評価は比の高い順で、全体の最良のメンバーは比 1 で SS", () => {
    const list = evaluateTier(dataset, "member");
    expect(list).toHaveLength(star5Cards.length);
    for (let i = 1; i < list.length; i++)
      expect(list[i]!.ratio).toBeLessThanOrEqual(list[i - 1]!.ratio);
    for (const id of dataset.best.memberIds) {
      const e = evaluateTierCard(dataset, id, "member")!;
      expect(e.inBest).toBe(true);
      expect(e.ratio).toBe(1);
      expect(e.rank).toBe("SS");
    }
  });

  it("採用数は、リーダー固定の最良編成にそのカードが入る数", () => {
    const id = dataset.best.memberIds[0]!;
    const e = evaluateTierCard(dataset, id, "member")!;
    const expected = Object.values(dataset.cards).filter((r) =>
      r.leader.memberIds.includes(id),
    ).length;
    expect(e.adoption).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it("リーダーの評価は採用数・0凸を持たず、全体の最良のリーダーは比 1", () => {
    const e = evaluateTierCard(dataset, dataset.best.leaderId, "leader")!;
    expect(e.adoption).toBeNull();
    expect(e.bloom0Ratio).toBeNull();
    expect(e.ratio).toBe(1);
    expect(e.inBest).toBe(true);
    expect(evaluateTierCard(dataset, "no-such-card", "leader")).toBeNull();
  });
});

describe("事前計算の仕事", () => {
  it("仕事は 全体の最良 1 + ★5 × 3 観点 で、依頼は観点どおり", () => {
    const jobs = tierJobs();
    expect(jobs).toHaveLength(star5Cards.length * 3 + 1);
    const id = star5Cards[0]!.id;
    expect(tierJobRequest({ kind: "best" }).leaderId).toBeNull();
    expect(tierJobRequest({ kind: "member", cardId: id }).fixedMemberIds).toEqual([id]);
    expect(tierJobRequest({ kind: "memberBloom0", cardId: id }).blooms[id]).toBe(0);
    expect(tierJobRequest({ kind: "member", cardId: id }).blooms[id]).toBe(5);
    expect(tierJobRequest({ kind: "leader", cardId: id }).leaderId).toBe(id);
  });

  it("結果をまとめると指紋つきのデータになり、足りなければ失敗する", () => {
    const team = { unitScore: 1, leaderId: "l", memberIds: ["m"] };
    const results = tierJobs().map((job) => ({ job, team }));
    const built = assembleTierDataset(results);
    expect(built.fingerprint).toBe(tierFingerprint());
    expect(Object.keys(built.cards)).toHaveLength(star5Cards.length);
    expect(() => assembleTierDataset(results.slice(1))).toThrow();
  });

  it("指紋は入力が 1 文字でも違えば変わる", () => {
    expect(fingerprintOf("a")).not.toBe(fingerprintOf("b"));
    expect(fingerprintOf("a")).toBe(fingerprintOf("a"));
    expect(fingerprintOf("a")).toHaveLength(32);
  });
});
