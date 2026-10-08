import { describe, expect, it } from "vite-plus/test";

import { cardById } from "../data";
import { readAccountSnapshot, snapshotConnectPlacements } from "../data/accountSnapshot.fixture";
import { BOARD_MATERIAL_COLORS } from "../data/boardMaterials";
import { boardPointsForRank, HOLOMEN_RANK_MAX } from "../data/boardPoints";
import {
  isFrequencyNode,
  spentBoardMaterials,
  spentBoardPoints,
  UNLOCKABLE_ANCHORS,
  withoutFrequencyNodes,
} from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import type { ConnectPlacementMap } from "../storage/connect";
import { BOARD_RESOURCE_KINDS, emptyBoardResources } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import { planOptimize } from "./optimizePlan";
import type { OptimizePlanInput } from "./optimizePlan";
import { runOptimize } from "./request";
import type { OptimizeRunRequest } from "./request";

/**
 * 「最適化」の頻度の段(2026-10-08 ユーザー指示。`frequencyStage.ts`)を、本物の評価経路で確かめる。
 * - ボード → コネクトのあと(または登録のまま)の盤面から頻度マスを選び、推奨のスコアは同じ盤面を画面の評価(`runOptimize`)にかけた値と一致する
 * - ホロメンランクの Pt は超えない(足りなければ、そのホロメンのマスを外して空ける)。資材は不足してよく、総量(投入済み + 余り)は保存される
 * - 固定した頻度は守る。ユニットスコア重視は頻度マスなしの案を下回らない
 * - 「現在」は登録そのまま(頻度マス込み)の値。頻度を選ばないときは登録の頻度マスを残す
 * スナップショットの盤面・ランク・余りはこのテスト用の入力(実機の値ではない)
 */
const acc = readAccountSnapshot("2026-09-15");
const boards: Record<"red" | "blue" | "yellow" | "green", Record<string, string[]>> = {
  red: {},
  blue: {},
  yellow: {},
  green: {},
};
const all: Record<string, HolomenBoards> = {};
for (const r of acc.holomen) {
  all[r.holomenId] = {
    red: r.red ?? [],
    blue: r.blue ?? [],
    yellow: r.yellow ?? [],
    green: r.green ?? [],
    connects: [],
  };
  for (const c of ["red", "blue", "yellow", "green"] as const) {
    const nodes = r[c];
    if (nodes?.length) boards[c][r.holomenId] = nodes;
  }
}
const owned = acc.members.map((m) => m.cardId);
const leader = owned[0] ?? "";
const seen = new Set<string>();
const members: string[] = [];
for (const id of owned) {
  const h = cardById.get(id)?.holomenId ?? "";
  if (id === leader || seen.has(h)) continue;
  seen.add(h);
  members.push(id);
  if (members.length === 5) break;
}
const memberHolomenIds = members.map((id) => cardById.get(id)?.holomenId ?? "");
const request: OptimizeRunRequest = {
  leaderId: leader,
  fixedMemberIds: members,
  excludedCardIds: [],
  excludedLeaderCardIds: [],
  excludedMemberCardIds: [],
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
const team = { leaderId: leader, memberIds: members };
const connects: Record<string, ("leader" | "card" | "content")[]> = {};
for (const [id, placed] of Object.entries(request.connectPlacements ?? {}))
  connects[id] = UNLOCKABLE_ANCHORS.filter((a) => placed[a] !== undefined);
for (const [id, c] of Object.entries(connects)) if (all[id]) all[id] = { ...all[id], connects: c };

const remaining = (cube: number, core: number): BoardResources => {
  const r = emptyBoardResources();
  for (const color of BOARD_MATERIAL_COLORS) r[color] = { cube, core };
  return r;
};
/** そのホロメンのいまの盤面(頻度マスを外したもの)が収まる最小のランク(頻度マスを開けると Pt が足りなくなる) */
const tightRank = (id: string): number => {
  const need = spentBoardPoints(withoutFrequencyNodes(all[id] ?? all[""]!));
  for (let rank = 1; rank <= HOLOMEN_RANK_MAX; rank += 1)
    if (boardPointsForRank(rank) >= need) return rank;
  return HOLOMEN_RANK_MAX;
};
const plan = (
  options: Partial<OptimizePlanInput> & Pick<OptimizePlanInput, "board" | "connect" | "frequency">,
) =>
  planOptimize({
    request,
    team,
    connects,
    ranks: {},
    scope: "unit",
    items: [],
    objective: "perfect",
    fixedFrequencyNodes: {},
    horizonSeconds: 120,
    ...options,
  });
/** 推奨の盤面と配置を画面の評価にかけた値(頻度マス込み) */
const screenScore = (result: {
  boards: Record<string, HolomenBoards>;
  placements: ConnectPlacementMap;
}): number => {
  const merged = { ...all, ...result.boards };
  const map = (color: "red" | "blue" | "yellow" | "green"): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const [id, b] of Object.entries(merged)) if (b[color].length > 0) out[id] = [...b[color]];
    return out;
  };
  return (
    runOptimize({
      ...request,
      boards: map("blue"),
      greenBoards: map("green"),
      yellowBoards: map("yellow"),
      redBoards: map("red"),
      connectPlacements: result.placements,
    }).candidates[0]?.modifiers.adjustedUnitScore ?? 0
  );
};

describe("planOptimize の頻度の段", () => {
  it(
    "頻度だけ: 変えるのはメンバーのホロメンだけ。推奨は画面の評価と一致し、現在は登録そのまま(頻度マス込み)の値",
    { timeout: 300_000 },
    () => {
      const result = plan({ board: false, connect: false, frequency: true });
      for (const id of result.changed) expect(memberHolomenIds).toContain(id);
      expect(result.recommended).toBe(screenScore(result));
      expect(result.current).toBe(
        screenScore({ boards: {}, placements: request.connectPlacements ?? {} }),
      );
      expect(result.frequency?.rows.map((r) => r.holomenId)).toEqual(
        memberHolomenIds.filter((id, i, a) => a.indexOf(id) === i),
      );
    },
  );

  it(
    "ランクの Pt は超えない: いまの盤面ちょうどのランクでも、外して空けて頻度マスを開けられる",
    { timeout: 300_000 },
    () => {
      const ranks = Object.fromEntries(memberHolomenIds.map((id) => [id, tightRank(id)]));
      const result = plan({ board: false, connect: false, frequency: true, ranks });
      for (const id of memberHolomenIds) {
        const after = result.boards[id] ?? all[id];
        if (!after) continue;
        const cap = Math.max(
          boardPointsForRank(ranks[id] ?? HOLOMEN_RANK_MAX),
          spentBoardPoints(withoutFrequencyNodes(all[id] ?? after)),
        );
        expect(spentBoardPoints(after), id).toBeLessThanOrEqual(cap);
      }
      // 頻度マスを開けたメンバーがいる(Pt を空けて届いた)
      expect(
        Object.values(result.boards).some((b) => b.blue.some(isFrequencyNode)),
        "頻度マスを開けたメンバーがいない",
      ).toBe(true);
      expect(result.recommended).toBe(screenScore(result));
    },
  );

  it(
    "資材は不足してよい: 余りが 0 でも頻度マスを開け、総量(投入済み + 余り)は保存される(余りは負になりうる)",
    { timeout: 300_000 },
    () => {
      const resources = remaining(0, 0);
      const result = plan({ board: false, connect: false, frequency: true, resources });
      const before = spentBoardMaterials(all);
      const after = spentBoardMaterials({ ...all, ...result.boards });
      for (const color of BOARD_MATERIAL_COLORS)
        for (const kind of BOARD_RESOURCE_KINDS)
          expect(
            (result.remainingAfter[color][kind] ?? 0) + after[color][kind],
            `${color} ${kind}`,
          ).toBe(before[color][kind]);
      // 未登録の項目は未登録(制限なし)のまま
      const unregistered = plan({ board: false, connect: false, frequency: true });
      expect(unregistered.remainingAfter).toEqual(emptyBoardResources());
    },
  );

  it("固定した頻度マスの数は守る(届く数だけ)", { timeout: 300_000 }, () => {
    const target = memberHolomenIds[0] ?? "";
    const free = plan({ board: false, connect: false, frequency: true });
    const counts =
      free.frequency?.rows.find((r) => r.holomenId === target)?.reachableNodeCounts ?? [];
    expect(counts.length).toBeGreaterThan(0);
    for (const count of counts) {
      const fixed = plan({
        board: false,
        connect: false,
        frequency: true,
        fixedFrequencyNodes: { [target]: count },
      });
      const row = fixed.frequency?.rows.find((r) => r.holomenId === target);
      expect(row?.recommendedNodeCount).toBe(count);
      // 開けた頻度マスの数と一致する
      const blue = (fixed.boards[target] ?? all[target])?.blue ?? [];
      expect(blue.filter(isFrequencyNode).length).toBe(count);
    }
  });

  it(
    "頻度を選ばないとき: 登録している頻度マスは残し、現在は登録そのまま(頻度マス込み)の値。推奨は画面の評価と一致する",
    { timeout: 300_000 },
    () => {
      const registered = memberHolomenIds.filter((id) => all[id]?.blue.some(isFrequencyNode));
      expect(registered.length, "登録に頻度マスのあるメンバーがいない").toBeGreaterThan(0);
      const result = plan({ board: true, connect: false, frequency: false });
      expect(result.current).toBe(
        screenScore({ boards: {}, placements: request.connectPlacements ?? {} }),
      );
      expect(result.recommended).toBe(screenScore(result));
      expect(result.recommended).toBeGreaterThanOrEqual(result.current);
      for (const id of Object.keys(all)) {
        const before = (all[id]?.blue ?? []).filter(isFrequencyNode).sort();
        const after = (result.boards[id] ?? all[id])?.blue.filter(isFrequencyNode).sort();
        expect(after, id).toEqual(before);
      }
    },
  );

  it(
    "ボード → コネクト → 頻度: ユニットスコア重視は、頻度を選ばないとき(頻度マスなし)を下回らない。推奨は画面の評価と一致する",
    { timeout: 600_000 },
    () => {
      const withoutFrequency = plan({ board: true, connect: false, frequency: false });
      const unit = plan({ board: true, connect: false, frequency: true, objective: "unit" });
      expect(unit.recommended).toBeGreaterThanOrEqual(withoutFrequency.recommended);
      expect(unit.recommended).toBe(screenScore(unit));
    },
  );
});
