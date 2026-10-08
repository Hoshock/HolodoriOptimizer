import { describe, expect, it } from "vite-plus/test";

import { cardById, songs } from "../data";
import { readAccountSnapshot, snapshotConnectPlacements } from "../data/accountSnapshot.fixture";
import { CONNECT_EXTENT_IDS } from "../data/connect";
import type { HolomenBoards } from "../data/boardState";
import type { ConnectPlacementMap } from "../storage/connect";
import { requestBoardMaps } from "./boardPlan";
import { createTeamScorer, runOptimize } from "./request";
import type { OptimizeRunRequest, TeamIds } from "./request";

/**
 * 最適化の各段が使う編成の評価器(`createTeamScorer`。2026-10-08「計算の高速化」)が、覚えた値を使っても
 * **6 枠固定の `runOptimize` と 1 点も違わない**ことを固定する。盤面・配置・曲を変えながら評価し、前に測った状態にも戻る
 * (覚えた値を使う経路を通す)。コネクトの最適化は配置の器をその場で書き換えるので、同じ器の中身を変えた場合も確かめる。
 * スナップショットの盤面とここで外すマスはテスト用の入力(実機の値ではない)
 */
const acc = readAccountSnapshot("2026-09-15");
const all: Record<string, HolomenBoards> = {};
for (const r of acc.holomen) {
  all[r.holomenId] = {
    red: r.red ?? [],
    blue: r.blue ?? [],
    yellow: r.yellow ?? [],
    green: r.green ?? [],
    connects: [],
  };
}
const ownedIds = acc.members.map((m) => m.cardId);
const holomenOf = (id: string): string => cardById.get(id)?.holomenId ?? "";
/** 所持カードから、メンバーのホロメンが重ならない編成を作る */
function teamFrom(offset: number): TeamIds {
  const leaderId = ownedIds[offset % ownedIds.length] ?? "";
  const seen = new Set<string>();
  const memberIds: string[] = [];
  for (let i = 0; i < ownedIds.length && memberIds.length < 5; i++) {
    const id = ownedIds[(offset + 1 + i * 3) % ownedIds.length] ?? "";
    if (seen.has(holomenOf(id))) continue;
    seen.add(holomenOf(id));
    memberIds.push(id);
  }
  return { leaderId, memberIds };
}
const base = (songId: string | null, team: TeamIds): OptimizeRunRequest => ({
  leaderId: team.leaderId,
  fixedMemberIds: [...team.memberIds],
  excludedCardIds: [],
  excludedLeaderCardIds: [],
  excludedMemberCardIds: [],
  leaderCandidateIds: null,
  requiredMemberHolomenIds: [],
  songId,
  blooms: Object.fromEntries(acc.members.map((m) => [m.cardId, m.bloom])),
  ...requestBoardMaps(all, false),
  connectPlacements: snapshotConnectPlacements(acc),
  account: { memoryPercent: acc.memoryPercent, enhancementPercent: acc.enhancementPercent },
  topN: 1,
});
/** いまの方式(依頼を作って 6 枠固定の探索にかける)での値 */
const reference = (
  request: OptimizeRunRequest,
  boards: Record<string, HolomenBoards>,
  placements: ConnectPlacementMap,
  withoutFrequency: boolean,
) =>
  runOptimize({
    ...request,
    ...requestBoardMaps(boards, withoutFrequency),
    connectPlacements: placements,
  }).candidates[0];

/** 決まった並びの乱数(テストを毎回同じ入力にする) */
function random(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}
/** マスの一部を外した盤面(葉かどうかは見ない。評価は届かないマスもそのまま数えるので、比べるには十分) */
const thinned = (b: HolomenBoards, rand: () => number): HolomenBoards => ({
  ...b,
  red: b.red.filter(() => rand() > 0.3),
  blue: b.blue.filter(() => rand() > 0.3),
  yellow: b.yellow.filter(() => rand() > 0.3),
  green: b.green.filter(() => rand() > 0.3),
});

const song = songs.find((s) => s.durationSeconds !== null) ?? null;

describe("編成の評価器(createTeamScorer)", () => {
  for (const songId of [null, song?.id ?? null]) {
    it(`盤面を変えながら測っても、6 枠固定の runOptimize と同じ値(曲 ${songId ?? "なし"})`, () => {
      const rand = random(songId === null ? 7 : 11);
      for (const offset of [0, 5]) {
        const team = teamFrom(offset);
        const request = base(songId, team);
        const scorer = createTeamScorer(request, team);
        const placements = request.connectPlacements ?? {};
        const teamHolomen = [team.leaderId, ...team.memberIds].map(holomenOf);
        const others = Object.keys(all)
          .filter((h) => !teamHolomen.includes(h))
          .slice(0, 6);
        const states: Record<string, HolomenBoards>[] = [all];
        for (let i = 0; i < 6; i++) {
          const next = { ...(states.at(-1) ?? all) };
          for (const h of [...teamHolomen, ...others])
            if (rand() < 0.5 && next[h]) next[h] = thinned(next[h], rand);
          states.push(next);
        }
        // 前に測った状態へ戻っても(覚えた値を使っても)同じ
        for (const state of [...states, states[2] ?? all, all, states[4] ?? all])
          for (const withoutFrequency of [false, true])
            expect(scorer.evaluate(state, placements, withoutFrequency)).toEqual(
              reference(request, state, placements, withoutFrequency),
            );
      }
    });
  }

  it("配置の器をその場で書き換えても、中身で見分ける(コネクトの最適化の使い方)", () => {
    const team = teamFrom(3);
    const request = base(song?.id ?? null, team);
    const scorer = createTeamScorer(request, team);
    const placements: ConnectPlacementMap = structuredClone(request.connectPlacements ?? {});
    const leaderH = holomenOf(team.leaderId);
    const memberH = holomenOf(team.memberIds[0] ?? "");
    const check = (): void => {
      expect(scorer.evaluateMaps(request, placements)).toEqual(
        runOptimize({ ...request, connectPlacements: structuredClone(placements) }).candidates[0],
      );
    };
    check();
    for (const [i, extent] of CONNECT_EXTENT_IDS.slice(0, 4).entries()) {
      const target = i % 2 === 0 ? leaderH : memberH;
      placements[target] = placements[target] ?? {};
      const entry = placements[target];
      entry.center = { extent, permil: 1200 + i * 100 };
      check();
      delete entry.center;
      check();
    }
  });
});
