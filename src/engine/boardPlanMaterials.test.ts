import { describe, expect, it } from "vite-plus/test";

import { cardById } from "../data";
import { readAccountSnapshot, snapshotConnectPlacements } from "../data/accountSnapshot.fixture";
import { BOARD_MATERIAL_COLORS } from "../data/boardMaterials";
import { emptyHolomenBoards, spentBoardMaterials, UNLOCKABLE_ANCHORS } from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import { BOARD_RESOURCE_KINDS, emptyBoardResources } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import { planBoards } from "./boardPlan";
import { recoverableMaterials } from "./boardOptimize";
import type { OptimizeRunRequest } from "./request";

/**
 * 「ホロメンボードの最適化」の資材(2026-10-07 ユーザー指示)を、本物の評価経路(`planBoards`)で確かめる。
 * 登録の余りは「いまのボードを開けた上での余り」なので、推奨のあとの余り = (いまの全ホロメンの投入済み + 余り) − 推奨での全体の使用量。
 * ユニットのみでは、変えないホロメンのこの編成に効かないマス(外して回せる — `recoverableMaterials`)も使えるので、その量までは余りが負になる
 * (2026-10-08 ユーザー指示)。全ホロメンを変える範囲では負にならない。
 * 資材の数字は外部 master 由来で、スナップショットの盤面・登録した余りはこのテスト用の入力(実機の値ではない)
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
// 旧スナップショットはコネクトの解放状態がないので、配置のあるコネクトを解放済みとして渡す(移行と同じ規則 B)
const connects: Record<string, ("leader" | "card" | "content")[]> = {};
for (const [id, placed] of Object.entries(request.connectPlacements ?? {}))
  connects[id] = UNLOCKABLE_ANCHORS.filter((a) => placed[a] !== undefined);
for (const [id, c] of Object.entries(connects)) if (all[id]) all[id] = { ...all[id], connects: c };

const spentBefore = spentBoardMaterials(all);
const remaining = (cube: number, core: number): BoardResources => {
  const r = emptyBoardResources();
  for (const color of BOARD_MATERIAL_COLORS) r[color] = { cube, core };
  return r;
};
const plan = (resources: BoardResources | undefined, scope: "minimal" | "all") =>
  planBoards({
    request,
    team,
    connects,
    ranks: {},
    scope,
    ...(resources ? { resources } : {}),
  });
const after = (boardsAfter: Record<string, HolomenBoards>) =>
  spentBoardMaterials({ ...all, ...boardsAfter });
const holomenOf = (id: string): string => cardById.get(id)?.holomenId ?? "";
/** 推奨のあとの盤面で、この編成に効かないマスに入っている資材(外して回せる量) */
const freeAfter = (boardsAfter: Record<string, HolomenBoards>) =>
  recoverableMaterials({
    boards: { ...all, ...boardsAfter },
    placements: request.connectPlacements ?? {},
    leaderHolomenId: holomenOf(leader),
    memberHolomenIds: members.map(holomenOf),
    song: null,
  });

describe("planBoards と資材", () => {
  it("余りが未登録(省略・null)なら、資材の制限なし。推奨のあとの余りも未登録のまま", () => {
    const omitted = plan(undefined, "minimal");
    const nulls = plan(emptyBoardResources(), "minimal");
    expect(nulls.boards).toEqual(omitted.boards);
    expect(omitted.remainingAfter).toEqual(emptyBoardResources());
    expect(omitted.recommended).toBeGreaterThanOrEqual(omitted.current);
  });

  it(
    "推奨のあとの余りの負は外して回せる量まで(all は負にならない)。全 8 資材で 投入済み + 余り が保存される(unit / all)",
    { timeout: 120_000 },
    () => {
      const resources = remaining(300, 40);
      for (const scope of ["minimal", "all"] as const) {
        const result = plan(resources, scope);
        const used = after(result.boards);
        const free = freeAfter(result.boards);
        for (const color of BOARD_MATERIAL_COLORS)
          for (const kind of BOARD_RESOURCE_KINDS) {
            const left = result.remainingAfter[color][kind];
            expect(left, `${scope} ${color} ${kind}`).not.toBeNull();
            const allowance = scope === "minimal" ? free[color][kind] : 0;
            expect((left ?? -1) + allowance, `${scope} ${color} ${kind}`).toBeGreaterThanOrEqual(0);
            // 総量(いまの投入済み + 登録した余り)は推奨の前後で変わらない
            expect((left ?? 0) + used[color][kind], `${scope} ${color} ${kind}`).toBe(
              spentBefore[color][kind] +
                300 * (kind === "cube" ? 1 : 0) +
                40 * (kind === "core" ? 1 : 0),
            );
          }
        expect(result.recommended).toBeGreaterThanOrEqual(result.current);
      }
    },
  );

  it(
    "余りが 0 でも、いまの投入済み(と外して回せる量)の範囲で再配分できる",
    { timeout: 120_000 },
    () => {
      for (const scope of ["minimal", "all"] as const) {
        const result = plan(remaining(0, 0), scope);
        const used = after(result.boards);
        const free = freeAfter(result.boards);
        for (const color of BOARD_MATERIAL_COLORS)
          for (const kind of BOARD_RESOURCE_KINDS) {
            // 外して回すぶんは、そのマスを外したあとの全体で数える
            const borrowed = scope === "minimal" ? free[color][kind] : 0;
            expect(used[color][kind] - borrowed, `${scope} ${color} ${kind}`).toBeLessThanOrEqual(
              spentBefore[color][kind],
            );
          }
      }
    },
  );

  it("minimal: ユニット外のホロメンは赤・青・コネクトを変えない(変えるのは緑の所属マス・曲に効く黄だけ)。その使用分を含む全体で余りを出す", () => {
    const result = plan(remaining(100, 10), "minimal");
    const unitHolomen = new Set(
      [leader, ...members].map((id) => cardById.get(id)?.holomenId ?? ""),
    );
    for (const id of result.changed) {
      if (unitHolomen.has(id)) continue;
      const before = all[id] ?? emptyHolomenBoards();
      const after = result.boards[id];
      expect(after?.red, id).toEqual([...before.red].sort());
      expect(after?.blue, id).toEqual([...before.blue].sort());
      expect(after?.connects, id).toEqual(before.connects);
    }
  });

  it("資材を絞っても、推奨は制限なしの結果を超えず、登録を下回らない", { timeout: 120_000 }, () => {
    const free = plan(undefined, "all");
    const tight = plan(remaining(0, 0), "all");
    expect(tight.recommended).toBeLessThanOrEqual(free.recommended);
    expect(tight.recommended).toBeGreaterThanOrEqual(tight.current);
  });
});
