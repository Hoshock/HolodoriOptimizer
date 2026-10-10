// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createApp, h } from "vue";

import type { OptimizePlanResult } from "../engine/optimizePlan";
import type { ProxyBoards, TrueRankingInput, TrueRankingItem } from "../engine/trueRanking";
import { clearTrueRankingCache, useTrueRanking } from "./useTrueRanking";
import { MAX_WORKERS, workerCount } from "./workerCount";

/**
 * 結果の「組み直すと」の裏の計算(Worker と、段の仕事の並び・まとめ方は差し替え)。Worker を何本か立て、空いたものから仕事を 1 件ずつ渡す。
 * 段の仕事が全部そろうと次の段へ進み、最適化の結果は届いた順に `items` が埋まり、全件そろって `done`。
 * 計算し直すと前の Worker を捨てて結果も空から。見込みのボードは鍵が同じなら使い回す。そろった結果は依頼が同じなら
 * サイトを更新するまで使い回す(2026-10-10 ユーザー指示)
 */
const proxy = { M: {}, LM: {}, L: {} } as ProxyBoards;
const team = (n: number) => ({ leaderId: `L${String(n)}`, memberIds: [] });
vi.mock("../engine/trueRanking", () => ({
  rankingWorkload: () => ({ proxy: 3, search: 2, optimize: 4 }),
  proxyJobs: () => [{ h: "a" }, { h: "b" }, { h: "c" }],
  assembleProxyBoards: () => proxy,
  searchJobs: () => [{ h: "a" }, { h: "b" }],
  // 見つけた編成を仕事の順に並べるだけ(まとめ方そのものは trueRanking.test.ts)
  pickRankingTeams: (_input: unknown, found: { team: unknown }[][]) =>
    found.flat().map((f) => f.team),
}));
class FakeWorker {
  static all: FakeWorker[] = [];
  posted: { kind: string; index?: number }[] = [];
  terminated = false;
  private listeners: Record<string, ((event: { data: unknown }) => void)[]> = {};
  constructor() {
    FakeWorker.all.push(this);
  }
  addEventListener(type: string, fn: (event: { data: unknown }) => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  postMessage(data: { kind: string; index?: number }): void {
    this.posted.push(data);
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(data: unknown): void {
    for (const fn of this.listeners.message ?? []) fn({ data });
  }
  /** 最後に受けた仕事の添字 */
  get lastIndex(): number {
    return this.posted.at(-1)?.index ?? -1;
  }
  kinds(): string[] {
    return this.posted.map((m) => (m.index === undefined ? m.kind : `${m.kind}${String(m.index)}`));
  }
}
vi.stubGlobal("Worker", FakeWorker);
// コア 3 → Worker 2 本
vi.stubGlobal("navigator", { hardwareConcurrency: 3 });

const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  for (const app of mounted.splice(0)) app.unmount();
  FakeWorker.all = [];
  clearTrueRankingCache();
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
/** 見込みのボードの段を 3 件とも返す(Worker 2 本: 0 と 1 を先に、空いた方へ 2) */
function finishProxy(): void {
  const [w0, w1] = FakeWorker.all;
  w0!.emit({ kind: "proxy", index: 0, proxy: {} });
  expect(w0!.lastIndex).toBe(2);
  w1!.emit({ kind: "proxy", index: 1, proxy: {} });
  w0!.emit({ kind: "proxy", index: 2, proxy: {} });
}

describe("useTrueRanking", () => {
  it("Worker の本数は コア数 − 1(1〜6)", () => {
    // 端末のコア数(ここでは 3)
    expect(workerCount()).toBe(2);
    expect(workerCount(1)).toBe(1);
    expect(workerCount(4)).toBe(3);
    expect(workerCount(16)).toBe(MAX_WORKERS);
  });

  it("空いた Worker へ仕事を 1 件ずつ渡し、段が全部そろうと次の段へ。結果が全件そろって done", () => {
    const ranking = setup();
    expect(ranking.status.value).toBe("idle");
    ranking.run(input, "a");
    const [w0, w1] = FakeWorker.all;
    expect(FakeWorker.all).toHaveLength(2);
    expect(w0!.kinds()).toEqual(["start", "proxy0"]);
    expect(w1!.kinds()).toEqual(["start", "proxy1"]);
    expect(ranking.status.value).toBe("running");
    expect(ranking.workload.value).toEqual({ proxy: 3, search: 2, optimize: 4 });
    finishProxy();
    // 見込みのボードがそろったら、全 Worker に配ってから探索の段
    expect(w0!.kinds().slice(2)).toEqual(["proxy2", "useProxy", "search0"]);
    expect(w1!.kinds().slice(2)).toEqual(["useProxy", "search1"]);
    expect(ranking.progress.value).toEqual({ phase: "search", done: 0 });
    w1!.emit({ kind: "search", index: 1, found: [{ team: team(2) }, { team: team(3) }] });
    expect(ranking.progress.value).toEqual({ phase: "search", done: 1 });
    w0!.emit({ kind: "search", index: 0, found: [{ team: team(0) }, { team: team(1) }] });
    // 見つけた編成は仕事の順にまとめる(届いた順ではない)。最適化の段は 4 件
    expect(ranking.workload.value.optimize).toBe(4);
    expect(w0!.posted.at(-1)).toEqual({ kind: "optimize", index: 0, team: team(0) });
    expect(w1!.posted.at(-1)).toEqual({ kind: "optimize", index: 1, team: team(1) });
    w1!.emit({ kind: "item", index: 1, item: item(20) });
    expect(ranking.items.value.map((i) => i?.result.recommended ?? null)).toEqual([null, 20]);
    expect(w1!.posted.at(-1)).toEqual({ kind: "optimize", index: 2, team: team(2) });
    w0!.emit({ kind: "item", index: 0, item: item(30) });
    w1!.emit({ kind: "item", index: 2, item: item(10) });
    expect(ranking.status.value).toBe("running");
    w0!.emit({ kind: "item", index: 3, item: item(5) });
    expect(ranking.status.value).toBe("done");
    expect(ranking.items.value.map((i) => i?.result.recommended ?? null)).toEqual([30, 20, 10, 5]);
    expect(w0!.terminated && w1!.terminated).toBe(true);
    const other = { limit: 1 } as unknown as TrueRankingInput;
    ranking.run(other, "a");
    expect(FakeWorker.all).toHaveLength(4);
    expect(ranking.status.value).toBe("running");
    expect(ranking.items.value).toEqual([]);
    ranking.cancel();
    expect(FakeWorker.all.slice(2).every((w) => w.terminated)).toBe(true);
    expect(ranking.status.value).toBe("idle");
  });

  it("そろった結果は、同じ依頼ならほかの依頼のあとでも計算し直さずにすぐ done で出す(Worker を立てない)", () => {
    const ranking = setup();
    const finishAll = (): void => {
      finishProxy();
      const [w0, w1] = FakeWorker.all.slice(-2);
      w0!.emit({ kind: "search", index: 0, found: [{ team: team(0) }, { team: team(1) }] });
      w1!.emit({ kind: "search", index: 1, found: [{ team: team(2) }, { team: team(3) }] });
      for (const [i, w] of [w0, w1, w0, w1].entries())
        w!.emit({ kind: "item", index: i, item: item(40 - i) });
    };
    ranking.run(input, "a");
    finishAll();
    expect(ranking.status.value).toBe("done");
    // 別の依頼(曲を変えて探し直した)は計算する
    const song = { songId: "x" } as unknown as TrueRankingInput;
    ranking.run(song, "b");
    expect(ranking.status.value).toBe("running");
    expect(FakeWorker.all).toHaveLength(4);
    // 元の依頼へ戻すと、計算せずにそろった結果
    ranking.run(input, "a");
    expect(FakeWorker.all).toHaveLength(4);
    expect(ranking.status.value).toBe("done");
    expect(ranking.items.value.map((i) => i?.result.recommended ?? null)).toEqual([40, 39, 38, 37]);
    expect(ranking.workload.value).toEqual({ proxy: 3, search: 2, optimize: 4 });
  });

  it("見込みのボードは鍵が同じなら使い回し(最初の段は 0 件)、鍵が違えば作り直す", () => {
    const ranking = setup();
    ranking.run(input, "a");
    finishProxy();
    ranking.cancel();
    expect(ranking.plannedWorkload(input, "a").proxy).toBe(0);
    expect(ranking.plannedWorkload(input, "b").proxy).toBe(3);
    ranking.run(input, "a");
    expect(FakeWorker.all[2]!.kinds()).toEqual(["start", "useProxy", "search0"]);
    expect(ranking.workload.value.proxy).toBe(0);
    ranking.run(input, "b");
    expect(FakeWorker.all[4]!.kinds()).toEqual(["start", "proxy0"]);
  });

  it("どれかの Worker が失敗したら error で止まり、全部捨てる", () => {
    const ranking = setup();
    ranking.run(input, "a");
    FakeWorker.all[1]!.emit({ kind: "error", message: "boom" });
    expect(ranking.status.value).toBe("error");
    expect(ranking.error.value).toBe("boom");
    expect(FakeWorker.all.every((w) => w.terminated)).toBe(true);
  });

  it("裏に回って止まっていた時間を pausedMs に数える。裏でも Worker から届いていれば、最後に届くまでは数えない", () => {
    vi.useFakeTimers();
    let hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    const toggle = (next: boolean): void => {
      hidden = next;
      document.dispatchEvent(new Event("visibilitychange"));
    };
    try {
      const ranking = setup();
      ranking.run(input, "a");
      vi.advanceTimersByTime(5000);
      toggle(true);
      vi.advanceTimersByTime(60_000);
      toggle(false);
      expect(ranking.pausedMs.value).toBe(60_000);
      toggle(true);
      vi.advanceTimersByTime(10_000);
      FakeWorker.all[0]!.emit({ kind: "proxy", index: 0, proxy: {} });
      vi.advanceTimersByTime(2000);
      toggle(false);
      expect(ranking.pausedMs.value).toBe(62_000);
      ranking.run(input, "a");
      expect(ranking.pausedMs.value).toBe(0);
    } finally {
      hidden = false;
      vi.useRealTimers();
    }
  });
});
