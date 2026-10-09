import { describe, expect, it } from "vite-plus/test";

import tierJson from "../data/tierList.json";
import { star5Cards } from "../data";
import { runOptimize } from "./request";
import {
  ACCOUNT_DESIGN,
  adoptionHalfWidth,
  assembleTierDataset,
  evaluateTier,
  evaluateTierCard,
  fingerprintOf,
  TIER_RANKS,
  TIER_THRESHOLDS,
  tierAccounts,
  tierCardJobs,
  tierFingerprint,
  tierJobRequest,
  tierJobs,
  tierRankOf,
} from "./tier";
import type { TierDataset } from "./tier";

const dataset = tierJson as TierDataset;

/**
 * ティア表(ADR-024)。事前計算のデータが現在のカード・ボード・モデルの版・仮想アカウントの設計と合っていること、
 * 記録した最良編成の値がいまのエンジンで同じ値になることを固定する(探索そのものは重いので再実行しない)
 */
describe("ティア表のデータ", () => {
  it("指紋が現在のデータと一致する(違えば `pnpm tier` で作り直す)", () => {
    expect(dataset.fingerprint).toBe(tierFingerprint());
  });

  it("★5 全枚の 3 観点と採用の集計がそろっていて、どの結果も固定したカードを含む", () => {
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
      // 均衡配置: どのカードもラウンド数だけ所持される。採用は所持を超えない
      expect(r.adoption.owned).toBe(dataset.accounts.rounds);
      expect(r.adoption.member).toBeLessThanOrEqual(r.adoption.owned);
      expect(r.adoption.leader).toBeLessThanOrEqual(r.adoption.owned);
    }
    // 1 アカウントにメンバー 5 人・リーダー 1 人
    const members = Object.values(dataset.cards).reduce((s, r) => s + r.adoption.member, 0);
    const leaders = Object.values(dataset.cards).reduce((s, r) => s + r.adoption.leader, 0);
    expect(members).toBe(dataset.accounts.count * 5);
    expect(leaders).toBe(dataset.accounts.count);
    expect(dataset.accounts.count).toBe(tierAccounts().length);
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

describe("仮想アカウント", () => {
  it("設計どおり: 所持数は範囲内、どのカードも各ラウンドにちょうど 1 回、同じ種なら同じ並び", () => {
    const accounts = tierAccounts();
    const owned = new Map<string, number>();
    for (const a of accounts) {
      expect(a.cardIds.length).toBeGreaterThanOrEqual(ACCOUNT_DESIGN.minSize);
      expect(a.cardIds.length).toBeLessThanOrEqual(ACCOUNT_DESIGN.maxSize);
      expect(new Set(a.cardIds).size).toBe(a.cardIds.length);
      for (const id of a.cardIds) owned.set(id, (owned.get(id) ?? 0) + 1);
    }
    expect(owned.size).toBe(star5Cards.length);
    for (const n of owned.values()) expect(n).toBe(ACCOUNT_DESIGN.rounds);
    expect(tierAccounts()).toEqual(accounts);
    expect(tierAccounts({ ...ACCOUNT_DESIGN, seed: 1 })[0]!.cardIds).not.toEqual(
      accounts[0]!.cardIds,
    );
  });

  it("ラウンド数は 95% 信頼区間の半幅 3 pt 以内(p = 0.5 で n ≥ 1,068)を満たす", () => {
    expect(ACCOUNT_DESIGN.rounds).toBeGreaterThanOrEqual(Math.ceil(0.25 * (1.96 / 0.03) ** 2));
    expect(adoptionHalfWidth(ACCOUNT_DESIGN.rounds / 2, ACCOUNT_DESIGN.rounds)).toBeLessThanOrEqual(
      0.03,
    );
    expect(adoptionHalfWidth(0, 0)).toBe(0);
  });

  it("アカウントの仕事は、持っていない ★5 を除外したおまかせの依頼になる", () => {
    const [job] = tierJobs().filter((j) => j.kind === "account");
    if (!job || job.kind !== "account") throw new Error("account job がない");
    const request = tierJobRequest(job);
    expect(request.leaderId).toBeNull();
    expect(request.fixedMemberIds).toEqual([]);
    const excluded = new Set(request.excludedCardIds);
    for (const id of job.cardIds) expect(excluded.has(id)).toBe(false);
    expect(excluded.size).toBe(star5Cards.length - job.cardIds.length);
  });

  it("仮想アカウント 1 件の探索は、記録した設計で動く(所持の中だけで編成が組まれる)", () => {
    const [job] = tierJobs().filter((j) => j.kind === "account");
    if (!job || job.kind !== "account") throw new Error("account job がない");
    const result = runOptimize(tierJobRequest(job));
    const owned = new Set(job.cardIds);
    const top = result.candidates[0]!;
    expect(owned.has(top.leader.id)).toBe(true);
    for (const m of top.members) expect(owned.has(m.id)).toBe(true);
  }, 60_000);
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
    expect(tierRankOf("member", 0)).toBe("D");
  });

  it("評価は採用率の高い順で、採用率と半幅はデータの集計から出る", () => {
    for (const role of ["member", "leader"] as const) {
      const list = evaluateTier(dataset, role);
      expect(list).toHaveLength(star5Cards.length);
      for (let i = 1; i < list.length; i++)
        expect(list[i]!.adoptionRate).toBeLessThanOrEqual(list[i - 1]!.adoptionRate);
      const top = list[0]!;
      const rec = dataset.cards[top.cardId]!;
      const count = role === "member" ? rec.adoption.member : rec.adoption.leader;
      expect(top.adoptionRate).toBe(count / rec.adoption.owned);
      expect(top.adoptionHalfWidth).toBe(adoptionHalfWidth(count, rec.adoption.owned));
      expect(top.rank).toBe(tierRankOf(role, top.adoptionRate));
    }
  });

  it("全体の最良のメンバーは比 1 で inBest、リーダーは 0凸を持たない", () => {
    for (const id of dataset.best.memberIds) {
      const e = evaluateTierCard(dataset, id, "member")!;
      expect(e.inBest).toBe(true);
      expect(e.ratio).toBe(1);
    }
    const l = evaluateTierCard(dataset, dataset.best.leaderId, "leader")!;
    expect(l.bloom0Ratio).toBeNull();
    expect(l.ratio).toBe(1);
    expect(l.inBest).toBe(true);
    expect(evaluateTierCard(dataset, "no-such-card", "leader")).toBeNull();
  });
});

describe("事前計算の仕事", () => {
  it("仕事は 全体の最良 1 + ★5 × 3 観点 + 仮想アカウント で、依頼は観点どおり", () => {
    expect(tierCardJobs()).toHaveLength(star5Cards.length * 3 + 1);
    expect(tierJobs()).toHaveLength(star5Cards.length * 3 + 1 + tierAccounts().length);
    const id = star5Cards[0]!.id;
    expect(tierJobRequest({ kind: "best" }).leaderId).toBeNull();
    expect(tierJobRequest({ kind: "member", cardId: id }).fixedMemberIds).toEqual([id]);
    expect(tierJobRequest({ kind: "memberBloom0", cardId: id }).blooms[id]).toBe(0);
    expect(tierJobRequest({ kind: "member", cardId: id }).blooms[id]).toBe(5);
    expect(tierJobRequest({ kind: "leader", cardId: id }).leaderId).toBe(id);
  });

  it("結果をまとめると指紋つきのデータになり、足りなければ失敗する", () => {
    const design = { ...ACCOUNT_DESIGN, rounds: 2 };
    const team = { unitScore: 1, leaderId: "l", memberIds: ["m"] };
    const results = tierJobs(design).map((job) => ({ job, team }));
    const built = assembleTierDataset(results, design);
    expect(built.fingerprint).toBe(tierFingerprint(design));
    expect(Object.keys(built.cards)).toHaveLength(star5Cards.length);
    expect(built.accounts.count).toBe(tierAccounts(design).length);
    for (const r of Object.values(built.cards)) expect(r.adoption.owned).toBe(2);
    expect(() => assembleTierDataset(results.slice(1), design)).toThrow();
    expect(() => assembleTierDataset(results.slice(0, -1), design)).toThrow();
  });

  it("指紋は入力が 1 文字でも違えば変わり、設計にも依る", () => {
    expect(fingerprintOf("a")).not.toBe(fingerprintOf("b"));
    expect(fingerprintOf("a")).toBe(fingerprintOf("a"));
    expect(fingerprintOf("a")).toHaveLength(32);
    expect(tierFingerprint({ ...ACCOUNT_DESIGN, rounds: 1 })).not.toBe(tierFingerprint());
  });
});
