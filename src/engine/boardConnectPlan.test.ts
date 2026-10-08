import { describe, expect, it } from "vite-plus/test";

import { cardById } from "../data";
import { readAccountSnapshot, snapshotConnectPlacements } from "../data/accountSnapshot.fixture";
import { BOARD_MATERIAL_COLORS } from "../data/boardMaterials";
import {
  isFrequencyNode,
  spentBoardMaterials,
  UNLOCKABLE_ANCHORS,
  withoutFrequencyNodes,
} from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import type { ConnectPlacement } from "../data/connect";
import { BOARD_RESOURCE_KINDS, emptyBoardResources } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import { MAX_ROUNDS, planBoardConnect } from "./boardConnectPlan";
import { recoverableMaterials } from "./boardOptimize";
import type { BoardConnectPlanInput } from "./boardConnectPlan";
import { runOptimize } from "./request";
import type { OptimizeRunRequest } from "./request";

/**
 * 「ボードの最適化」(ホロメンボード + コネクト。2026-10-07 ユーザー指示)を、本物の評価経路で確かめる。
 * - ボード・コネクトは独立に選べ、選ばなかったものは変えない(ボードだけ → 配置は登録のまま / コネクトだけ → ボードは変えない)
 * - 青の発動頻度マスは OFF の世界で評価し、ボードを選んだときだけ、登録している頻度マスが外れる(コネクトだけでは外さない)
 * - 結果は「頻度マスを外した登録」を下回らない。推奨のスコアは、推奨のボード・配置で画面の評価(`runOptimize`)をした値と一致する
 * - 両方を選ぶと ボード → コネクト を最大 `MAX_ROUNDS` 周回す。資材の総量(投入済み + 余り)は保存される
 * スナップショットの盤面・登録した余り・コネクトの所持はこのテスト用の入力(実機の値ではない)
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

/** 所持のコネクト: 登録の配置にある 形 × ％ を 1 種ずつ、各 4 枚(配置を組み替えられる余裕をつくる) */
const kinds = new Map<string, ConnectPlacement>();
for (const byAnchor of Object.values(request.connectPlacements ?? {}))
  for (const p of Object.values(byAnchor)) kinds.set(`${p.extent}/${String(p.permil)}`, p);
const items = [...kinds.values()].map((placement) => ({ placement, count: 4 }));

const spentBefore = spentBoardMaterials(all);
const remaining = (cube: number, core: number): BoardResources => {
  const r = emptyBoardResources();
  for (const color of BOARD_MATERIAL_COLORS) r[color] = { cube, core };
  return r;
};
const plan = (
  options: Partial<BoardConnectPlanInput> & Pick<BoardConnectPlanInput, "board" | "connect">,
) => planBoardConnect({ request, team, connects, ranks: {}, scope: "unit", items, ...options });
/** 推奨のボード・配置を画面の評価で出す(頻度マスは外した盤面で。ボードの最適化は頻度マスを含めない) */
const screenScore = (
  result: { boards: Record<string, HolomenBoards>; placements: typeof request.connectPlacements },
  strip: boolean,
): number => {
  const merged = { ...all, ...result.boards };
  const map = (color: keyof HolomenBoards): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const [id, b] of Object.entries(merged)) {
      const nodes = [...((strip ? withoutFrequencyNodes(b) : b)[color] as string[])];
      if (nodes.length > 0) out[id] = nodes;
    }
    return out;
  };
  return (
    runOptimize({
      ...request,
      boards: map("blue"),
      greenBoards: map("green"),
      yellowBoards: map("yellow"),
      redBoards: map("red"),
      connectPlacements: result.placements ?? {},
    }).candidates[0]?.modifiers.adjustedUnitScore ?? 0
  );
};

describe("planBoardConnect", () => {
  it(
    "ボードだけ: 配置は登録のまま・1 周。変えたボードに頻度マスはなく、推奨は画面の評価と一致し、現在を下回らない",
    { timeout: 300_000 },
    () => {
      const result = plan({ board: true, connect: false });
      expect(result.rounds).toBe(1);
      expect(result.placements).toEqual(request.connectPlacements);
      expect(result.recommended).toBeGreaterThanOrEqual(result.current);
      for (const b of Object.values(result.boards))
        expect(b.blue.some(isFrequencyNode)).toBe(false);
      expect(result.recommended).toBe(screenScore(result, true));
      // 「現在」は登録から頻度マスを外した値
      expect(result.current).toBe(
        screenScore({ boards: {}, placements: request.connectPlacements }, true),
      );
    },
  );

  it(
    "コネクトだけ: ボードは変えない(登録している頻度マスも外さない)。配置は現在を下回らず、画面の評価と一致する",
    { timeout: 300_000 },
    () => {
      const result = plan({ board: false, connect: true });
      expect(result.rounds).toBe(1);
      expect(result.changed).toEqual([]);
      expect(result.boards).toEqual({});
      expect(result.recommended).toBeGreaterThanOrEqual(result.current);
      expect(result.recommended).toBe(screenScore(result, true));
      // 資材の余りは触らない(未登録は未登録のまま)
      expect(result.remainingAfter).toEqual(emptyBoardResources());
    },
  );

  it(
    "両方: ボード → コネクトを最大 MAX_ROUNDS 周。ボードだけより下回らず、結果は現在を下回らない。画面の評価と一致する",
    { timeout: 600_000 },
    () => {
      const both = plan({ board: true, connect: true });
      const boardOnly = plan({ board: true, connect: false });
      expect(both.rounds).toBeGreaterThanOrEqual(1);
      expect(both.rounds).toBeLessThanOrEqual(MAX_ROUNDS);
      // 1 周目のボードはボードだけと同じで、その上にコネクトを重ねる(改善だけ採る)ので、下回らない
      expect(both.recommended).toBeGreaterThanOrEqual(boardOnly.recommended);
      expect(both.recommended).toBeGreaterThanOrEqual(both.current);
      expect(both.recommended).toBe(screenScore(both, true));
      for (const b of Object.values(both.boards)) expect(b.blue.some(isFrequencyNode)).toBe(false);
    },
  );

  it(
    "資材の総量(いまの投入済み + 登録した余り)は両方の最適化のあとも保存され、余りの負はこの編成に効かない赤・青(外して回せる)の量まで",
    { timeout: 600_000 },
    () => {
      const resources = remaining(300, 40);
      const result = plan({ board: true, connect: true, resources });
      const after = { ...all, ...result.boards };
      const used = spentBoardMaterials(after);
      const holomenOf = (id: string): string => cardById.get(id)?.holomenId ?? "";
      const free = recoverableMaterials(
        after,
        result.placements,
        holomenOf(team.leaderId),
        team.memberIds.map(holomenOf),
      );
      for (const color of BOARD_MATERIAL_COLORS)
        for (const kind of BOARD_RESOURCE_KINDS) {
          const left = result.remainingAfter[color][kind];
          expect(left, `${color} ${kind}`).not.toBeNull();
          expect((left ?? -1) + free[color][kind], `${color} ${kind}`).toBeGreaterThanOrEqual(0);
          // 黄・緑は外して回さない
          if (color === "yellow" || color === "green")
            expect(left ?? -1, `${color} ${kind}`).toBeGreaterThanOrEqual(0);
          expect((left ?? 0) + used[color][kind], `${color} ${kind}`).toBe(
            spentBefore[color][kind] + (kind === "cube" ? 300 : 40),
          );
        }
    },
  );

  it(
    "変更のあるホロメンの before は、登録している(頻度マスつきの)ボードそのもの",
    { timeout: 300_000 },
    () => {
      const result = plan({ board: true, connect: false });
      for (const id of result.changed) expect(result.before[id]).toEqual(all[id]);
      expect(Object.keys(result.boards)).toEqual(result.changed);
    },
  );
});
