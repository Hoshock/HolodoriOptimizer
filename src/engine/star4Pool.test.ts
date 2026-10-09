import { describe, expect, it } from "vite-plus/test";

import { cards } from "../data";
import { runOptimize } from "./request";
import type { OptimizeRunRequest } from "./request";
import { autoExcludedStar4Ids } from "./star4Pool";
import { rankingPool } from "./trueRanking";

/**
 * ★4 は自分で枠に置いたときだけ編成に入り、おまかせでは ★5 だけから探す（2026-10-09 ユーザー指示 — ADR-022）
 */
const STAR4 = cards.filter((c) => c.rarity === 4).map((c) => c.id);
const base: OptimizeRunRequest = {
  leaderId: "tokino-sora-01",
  fixedMemberIds: ["nekomata-okayu-02", "inugami-korone-01", "ookami-mio-01", "sakura-miko-01"],
  excludedCardIds: [],
  excludedLeaderCardIds: [],
  excludedMemberCardIds: [],
  leaderCandidateIds: null,
  requiredMemberHolomenIds: [],
  songId: null,
  blooms: {},
  boards: {},
  greenBoards: {},
  yellowBoards: {},
  redBoards: {},
  account: { memoryPercent: 0, enhancementPercent: 0 },
  topN: 10,
};

describe("★4 の探索プール", () => {
  it("固定していない ★4 は全部おまかせの候補から外す。リーダー・固定メンバーに置いた ★4 は外さない", () => {
    expect(
      autoExcludedStar4Ids({ leaderId: null, fixedMemberIds: [], leaderCandidateIds: null }),
    ).toEqual({ both: STAR4, members: [] });
    const kept = autoExcludedStar4Ids({
      leaderId: "tokino-sora-star4-01",
      fixedMemberIds: ["nekomata-okayu-star4-01"],
      leaderCandidateIds: null,
    });
    expect(kept.both).toHaveLength(STAR4.length - 2);
    expect(kept.both).not.toContain("tokino-sora-star4-01");
    expect(kept.both).not.toContain("nekomata-okayu-star4-01");
    expect(kept.members).toEqual([]);
  });

  it("リーダーをホロメンで指定したときは、そのホロメンの ★4 はリーダーの候補に残し、メンバーからだけ外す", () => {
    const out = autoExcludedStar4Ids({
      leaderId: null,
      fixedMemberIds: [],
      leaderCandidateIds: ["tokino-sora-01", "tokino-sora-star4-01"],
    });
    expect(out.members).toEqual(["tokino-sora-star4-01"]);
    expect(out.both).not.toContain("tokino-sora-star4-01");
    expect(out.both).toHaveLength(STAR4.length - 1);
  });

  it("おまかせの枠には ★4 が入らない", () => {
    const { candidates } = runOptimize(base);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      for (const m of c.members) expect(STAR4).not.toContain(m.id);
    }
  });

  it("メンバーに固定した ★4 は編成に入り、ほかの枠は ★5 のまま", () => {
    const fixedStar4 = "usada-pekora-star4-01";
    const { candidates } = runOptimize({
      ...base,
      fixedMemberIds: [...base.fixedMemberIds.slice(0, 3), fixedStar4],
    });
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      const ids = c.members.map((m) => m.id);
      expect(ids).toContain(fixedStar4);
      expect(ids.filter((id) => STAR4.includes(id))).toEqual([fixedStar4]);
    }
  });

  it("リーダーに置いた ★4 でも試算できる（衣装スキルと赤ボードだけが効く）", () => {
    const { candidates } = runOptimize({ ...base, leaderId: "tokino-sora-star4-01" });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.leader.id).toBe("tokino-sora-star4-01");
  });

  it("ホロメンで指定したリーダーは ★4 も含めて探す（メンバーの枠には入らない）", () => {
    const { candidates } = runOptimize({
      ...base,
      leaderId: null,
      leaderCandidateIds: ["tokino-sora-01", "tokino-sora-star4-01"],
    });
    const leaders = new Set(candidates.map((c) => c.leader.id));
    expect(leaders.has("tokino-sora-star4-01")).toBe(true);
    expect(leaders.has("tokino-sora-01")).toBe(true);
    for (const c of candidates) {
      for (const m of c.members) expect(STAR4).not.toContain(m.id);
    }
  });

  it("「組み直すと」の候補プールも ★5 だけ（固定した ★4 はメンバーに残る）", () => {
    const pool = rankingPool({ ...base, leaderId: null, fixedMemberIds: [] });
    for (const id of [...pool.leaders, ...pool.members]) expect(STAR4).not.toContain(id);
    const fixed = rankingPool({ ...base, fixedMemberIds: ["usada-pekora-star4-01"] });
    expect(fixed.members).toContain("usada-pekora-star4-01");
    expect(fixed.members.filter((id) => STAR4.includes(id))).toEqual(["usada-pekora-star4-01"]);
    const byHolomen = rankingPool({
      ...base,
      leaderId: null,
      fixedMemberIds: [],
      leaderCandidateIds: ["tokino-sora-01", "tokino-sora-star4-01"],
    });
    expect(byHolomen.leaders).toEqual(["tokino-sora-01", "tokino-sora-star4-01"]);
    for (const id of byHolomen.members) expect(STAR4).not.toContain(id);
  });
});
