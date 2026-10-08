// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createApp, h } from "vue";

import { cards } from "../data";
import { readAccountSnapshot, snapshotConnectPlacements } from "../data/accountSnapshot.fixture";
import { runOptimize } from "../engine/request";
import type { OptimizeRunRequest } from "../engine/request";
import { createSearchHandler } from "../engine/searchWorkerHandler";
import type { SearchWorkerRequest, SearchWorkerResponse } from "../engine/searchWorkerHandler";
import { useOptimizer } from "./useOptimizer";

/**
 * さがすの探索を Worker 何本かで分担しても(2026-10-08「計算の高速化」)、1 本の `runOptimize` と同じ候補が同じ並びで返ることを、
 * 本物の受け答え(`searchWorkerHandler.ts`)を Worker の代わりにこのスレッドで動かして確かめる。
 * スナップショットの所持カード・盤面はテスト用の入力(実機の値ではない)
 */
class InProcessWorker {
  static all: InProcessWorker[] = [];
  terminated = false;
  private listeners: Record<string, ((event: { data: unknown }) => void)[]> = {};
  private handle = createSearchHandler((response: SearchWorkerResponse) => {
    // 本物の Worker と同じく、答えは後から届く
    setTimeout(() => {
      if (this.terminated) return;
      for (const fn of this.listeners.message ?? []) fn({ data: response });
    }, 0);
  });
  constructor() {
    InProcessWorker.all.push(this);
  }
  addEventListener(type: string, fn: (event: { data: unknown }) => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  postMessage(message: SearchWorkerRequest): void {
    this.handle(structuredClone(message));
  }
  terminate(): void {
    this.terminated = true;
  }
}
vi.stubGlobal("Worker", InProcessWorker);

const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  for (const app of mounted.splice(0)) app.unmount();
  InProcessWorker.all = [];
  vi.unstubAllGlobals();
  vi.stubGlobal("Worker", InProcessWorker);
});
function setup() {
  let api: ReturnType<typeof useOptimizer> | null = null;
  const app = createApp({
    setup() {
      api = useOptimizer();
      return () => h("div");
    },
  });
  app.mount(document.createElement("div"));
  mounted.push(app);
  return api!;
}

const acc = readAccountSnapshot("2026-09-15");
const owned = acc.members.map((m) => m.cardId).slice(0, 16);
const boards: Record<"red" | "blue" | "yellow" | "green", Record<string, string[]>> = {
  red: {},
  blue: {},
  yellow: {},
  green: {},
};
for (const r of acc.holomen)
  for (const c of ["red", "blue", "yellow", "green"] as const) {
    const nodes = r[c];
    if (nodes?.length) boards[c][r.holomenId] = nodes;
  }
const request: OptimizeRunRequest = {
  leaderId: null,
  fixedMemberIds: [],
  excludedCardIds: cards.map((c) => c.id).filter((id) => !owned.includes(id)),
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
  topN: 20,
};
const view = (c: {
  leaderId: string;
  memberIds: string[];
  modifiers: { adjustedUnitScore: number };
}) => [c.leaderId, c.memberIds, c.modifiers.adjustedUnitScore];

describe("useOptimizer(探索の分担)", () => {
  for (const cores of [1, 3, 5]) {
    it(`Worker ${String(Math.max(1, cores - 1))} 本で探しても、1 本の runOptimize と同じ候補・並び・評価数`, async () => {
      vi.stubGlobal("navigator", { hardwareConcurrency: cores });
      const expected = runOptimize(request);
      const optimizer = setup();
      optimizer.run(request);
      expect(InProcessWorker.all).toHaveLength(Math.max(1, cores - 1));
      await vi.waitFor(() => {
        expect(optimizer.running.value).toBe(false);
      });
      expect(optimizer.error.value).toBeNull();
      expect(optimizer.candidates.value?.map(view)).toEqual(
        expected.candidates.map((c) =>
          view({
            leaderId: c.leader.id,
            memberIds: c.members.map((m) => m.id),
            modifiers: c.modifiers,
          }),
        ),
      );
      expect(optimizer.evaluated.value).toBe(expected.evaluated);
      expect(optimizer.progress.value?.done).toBe(expected.evaluated);
      expect(InProcessWorker.all.every((w) => w.terminated)).toBe(true);
    });
  }

  it("探し直すと前の Worker を捨てる。失敗したら候補を消して文言を出す", async () => {
    vi.stubGlobal("navigator", { hardwareConcurrency: 3 });
    const optimizer = setup();
    optimizer.run(request);
    const first = [...InProcessWorker.all];
    optimizer.run({ ...request, leaderId: "存在しないカード" });
    expect(first.every((w) => w.terminated)).toBe(true);
    await vi.waitFor(() => {
      expect(optimizer.running.value).toBe(false);
    });
    expect(optimizer.error.value).toContain("存在しないカード");
    expect(optimizer.candidates.value).toBeNull();
  });
});
