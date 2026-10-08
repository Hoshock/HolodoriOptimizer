// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createApp, h } from "vue";

import type { OptimizePlanResult } from "../engine/optimizePlan";
import type { ProxyBoards, TrueRankingInput, TrueRankingItem } from "../engine/trueRanking";
import { useTrueRanking } from "./useTrueRanking";

/**
 * 結果一覧の「最適化順」の裏の計算(Worker は差し替え)。始めると段ごとの進み具合と、届いた順に `items` が埋まり、全件そろって `done`。
 * 計算し直すと前の Worker を捨てて結果も空から。見込みのボードは鍵が同じなら使い回す
 */
vi.mock("../engine/trueRanking", () => ({
  rankingWorkload: () => ({ proxy: 3, search: 2, optimize: 4 }),
}));
class FakeWorker {
  static last: FakeWorker | null = null;
  posted: unknown[] = [];
  terminated = false;
  private listeners: Record<string, ((event: { data: unknown }) => void)[]> = {};
  constructor() {
    FakeWorker.last = this;
  }
  addEventListener(type: string, fn: (event: { data: unknown }) => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  postMessage(data: unknown): void {
    this.posted.push(data);
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(data: unknown): void {
    for (const fn of this.listeners.message ?? []) fn({ data });
  }
}
vi.stubGlobal("Worker", FakeWorker);

const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  for (const app of mounted.splice(0)) app.unmount();
});
function setup() {
  let api: ReturnType<typeof useTrueRanking> | null = null;
  const app = createApp({
    setup() {
      api = useTrueRanking();
      return () => h("div");
    },
  });
  app.mount(document.createElement("div"));
  mounted.push(app);
  return api!;
}
const input = {} as TrueRankingInput;
const item = (recommended: number) =>
  ({ candidate: {}, result: { recommended } as OptimizePlanResult }) as TrueRankingItem;
const proxy = { M: {}, LM: {}, L: {} } as ProxyBoards;

describe("useTrueRanking", () => {
  it("始めると段の進み具合と届いた結果が埋まり、全件そろって done。計算し直すと前の Worker を捨てる", () => {
    const ranking = setup();
    expect(ranking.status.value).toBe("idle");
    ranking.run(input, "a");
    const first = FakeWorker.last!;
    expect(first.posted).toEqual([{ input, proxy: null }]);
    expect(ranking.status.value).toBe("running");
    expect(ranking.workload.value).toEqual({ proxy: 3, search: 2, optimize: 4 });
    first.emit({ kind: "progress", phase: "search", done: 1, total: 5 });
    expect(ranking.progress.value).toEqual({ phase: "search", done: 1 });
    expect(ranking.workload.value.search).toBe(5);
    first.emit({ kind: "item", index: 1, item: item(20) });
    expect(ranking.items.value.map((i) => i?.result.recommended ?? null)).toEqual([null, 20]);
    first.emit({ kind: "item", index: 0, item: item(30) });
    first.emit({ kind: "done" });
    expect(ranking.status.value).toBe("done");
    expect(first.terminated).toBe(true);
    ranking.run(input, "a");
    expect(FakeWorker.last).not.toBe(first);
    expect(ranking.status.value).toBe("running");
    expect(ranking.items.value).toEqual([]);
    ranking.cancel();
    expect(FakeWorker.last!.terminated).toBe(true);
    expect(ranking.status.value).toBe("idle");
  });

  it("見込みのボードは鍵が同じなら使い回し(最初の段は 0 件)、鍵が違えば作り直す", () => {
    const ranking = setup();
    ranking.run(input, "a");
    FakeWorker.last!.emit({ kind: "proxy", proxy });
    FakeWorker.last!.emit({ kind: "done" });
    expect(ranking.plannedWorkload(input, "a").proxy).toBe(0);
    expect(ranking.plannedWorkload(input, "b").proxy).toBe(3);
    ranking.run(input, "a");
    expect(FakeWorker.last!.posted).toEqual([{ input, proxy }]);
    expect(ranking.workload.value.proxy).toBe(0);
    ranking.run(input, "b");
    expect(FakeWorker.last!.posted).toEqual([{ input, proxy: null }]);
  });

  it("失敗したら error で止まる", () => {
    const ranking = setup();
    ranking.run(input, "a");
    FakeWorker.last!.emit({ kind: "error", message: "boom" });
    expect(ranking.status.value).toBe("error");
    expect(ranking.error.value).toBe("boom");
    expect(FakeWorker.last!.terminated).toBe(true);
  });
});
