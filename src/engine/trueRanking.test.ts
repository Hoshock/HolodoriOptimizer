import { describe, expect, it } from "vite-plus/test";

import { cardById, cards } from "../data";
import { readAccountSnapshot, snapshotConnectPlacements } from "../data/accountSnapshot.fixture";
import { UNLOCKABLE_ANCHORS } from "../data/boardState";
import { emptyBoardResources } from "../storage/boardResources";
import { runOptimize } from "./request";
import type { OptimizeRunRequest } from "./request";
import {
  optimizeRankingTeam,
  proxyBoards,
  proxySearch,
  rankingPool,
  rankingWorkload,
} from "./trueRanking";
import type { TrueRankingInput } from "./trueRanking";

/**
 * 「最適化順」の 3 段(`trueRanking.ts`)を本物の評価経路で確かめる。見込みは近似なので値そのものは固定せず、
 * **探すの条件を守ること**(固定・除外・使えるカード)と、最適化の値が最適化のシートと同じ計算であることを固定する。
 * スナップショットの盤面とこのテストで決めたランク・カードの絞り込みはテスト用の入力(実機の値ではない)
 */
const acc = readAccountSnapshot("2026-09-15");
const boards: Record<"red" | "blue" | "yellow" | "green", Record<string, string[]>> = {
  red: {},
  blue: {},
  yellow: {},
  green: {},
};
const ranks: Record<string, number> = {};
for (const r of acc.holomen) {
  ranks[r.holomenId] = 25;
  for (const c of ["red", "blue", "yellow", "green"] as const) {
    const nodes = r[c];
    if (nodes?.length) boards[c][r.holomenId] = nodes;
  }
}
// 計算を軽くするため、ホロメンの違う所持カード 7 枚だけを使えるカードにする
const pool: string[] = [];
const seen = new Set<string>();
for (const m of acc.members) {
  const h = cardById.get(m.cardId)?.holomenId ?? "";
  if (seen.has(h)) continue;
  seen.add(h);
  pool.push(m.cardId);
  if (pool.length === 7) break;
}
const fixed = pool[1] ?? "";
const excludedMember = pool[6] ?? "";
const request: OptimizeRunRequest = {
  leaderId: null,
  fixedMemberIds: [fixed],
  excludedCardIds: cards.map((c) => c.id).filter((id) => !pool.includes(id)),
  excludedLeaderCardIds: [],
  excludedMemberCardIds: [excludedMember],
  leaderCandidateIds: null,
  requiredMemberHolomenIds: [],
  songId: null,
  blooms: Object.fromEntries(acc.members.map((m) => [m.cardId, m.bloom])),
  boards: boards.blue,
  greenBoards: boards.green,
  yellowBoards: boards.yellow,
  redBoards: boards.red,
  connectPlacements: snapshotConnectPlacements(acc),
  account: { memoryPercent: acc.memoryPercent, enhancementPercent: acc.enhancementPercent },
  topN: 1,
};
const connects: Record<string, ("leader" | "card" | "content")[]> = {};
for (const [id, placed] of Object.entries(request.connectPlacements ?? {}))
  connects[id] = UNLOCKABLE_ANCHORS.filter((a) => placed[a] !== undefined);
const top = runOptimize(request).candidates[0];
const input: TrueRankingInput = {
  request,
  reference: { leaderId: top?.leader.id ?? "", memberIds: top?.members.map((m) => m.id) ?? [] },
  connects,
  ranks,
  resources: emptyBoardResources(),
  items: [],
  connect: false,
  horizonSeconds: 120,
  limit: 3,
  perLeader: 2,
  includeTeams: top ? [{ leaderId: top.leader.id, memberIds: top.members.map((m) => m.id) }] : [],
};

describe("最適化順(trueRanking)", () => {
  it("使えるカードは探すの条件どおり(リーダーは除外・選択、メンバーは固定を含めて除外を除く)", () => {
    const p = rankingPool(request);
    expect(new Set(p.leaders)).toEqual(new Set(pool));
    expect(p.members).toContain(fixed);
    expect(p.members).not.toContain(excludedMember);
    expect(rankingPool({ ...request, leaderId: pool[0] ?? "" }).leaders).toEqual([pool[0]]);
  });

  it(
    "見込みのボード → 見込みでの探索 → 最適化。候補は探すの条件を守り、最適化の値は登録の値を下回らない",
    { timeout: 900_000 },
    () => {
      const workload = rankingWorkload(input);
      const steps: number[] = [];
      const proxy = proxyBoards(input, (done) => steps.push(done));
      expect(steps.at(-1)).toBe(workload.proxy);
      const count = Object.values(proxy).reduce((sum, m) => sum + Object.keys(m).length, 0);
      expect(count).toBe(workload.proxy);

      const searches: number[] = [];
      const teams = proxySearch(input, proxy, (done) => searches.push(done));
      expect(searches.at(-1)).toBe(workload.search);
      expect(teams.length).toBeGreaterThan(0);
      expect(teams.length).toBeLessThanOrEqual(input.limit + input.includeTeams.length);
      // 探索の上位は見込みに関係なく入る
      const included = input.includeTeams[0]!;
      expect(
        teams.some(
          (t) =>
            t.leaderId === included.leaderId &&
            [...t.memberIds].sort().join() === [...included.memberIds].sort().join(),
        ),
      ).toBe(true);
      for (const team of teams) {
        expect(pool).toContain(team.leaderId);
        expect(team.memberIds).toContain(fixed);
        expect(team.memberIds).not.toContain(excludedMember);
        for (const id of team.memberIds) expect(pool).toContain(id);
      }

      const team = teams[0]!;
      const { candidate, result } = optimizeRankingTeam(input, team);
      expect(candidate.leaderId).toBe(team.leaderId);
      expect([...candidate.memberIds].sort()).toEqual([...team.memberIds].sort());
      // 登録している状態の値は、その編成を固定して探索した値と同じ
      const registered = runOptimize({
        ...request,
        leaderId: team.leaderId,
        fixedMemberIds: [...team.memberIds],
        excludedCardIds: [],
        excludedMemberCardIds: [],
      }).candidates[0];
      expect(candidate.modifiers.adjustedUnitScore).toBe(registered?.modifiers.adjustedUnitScore);
      expect(result.current).toBe(candidate.modifiers.adjustedUnitScore);
      expect(result.recommended).toBeGreaterThanOrEqual(result.current);
    },
  );
});
