// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createApp, h } from "vue";

import type { OptimizePlanInput, OptimizePlanResult } from "../engine/optimizePlan";
import { useTrueRanking } from "./useTrueRanking";

/**
 * 結果一覧の「最適化順」の裏の計算(Worker は差し替え)。届いた順に `results` が埋まり、全件そろって `done`。
 * 計算し直すと前の Worker を捨てて結果も空から
 */
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
const input = {} as OptimizePlanInput;
const result = (recommended: number) => ({ recommended }) as OptimizePlanResult;

describe("useTrueRanking", () => {
  it("届いた順に埋まり、全件そろって done。計算し直すと前の Worker を捨てる", () => {
    const ranking = setup();
    ranking.run([input, input]);
    const first = FakeWorker.last!;
    expect(first.posted).toEqual([{ inputs: [input, input] }]);
    expect(ranking.running.value).toBe(true);
    first.emit({ kind: "item", index: 1, result: result(20) });
    expect(ranking.results.value.map((r) => r?.recommended ?? null)).toEqual([null, 20]);
    expect(ranking.done.value).toBe(false);
    first.emit({ kind: "item", index: 0, result: result(10) });
    first.emit({ kind: "done" });
    expect(ranking.done.value).toBe(true);
    expect(ranking.running.value).toBe(false);
    ranking.run([input]);
    expect(FakeWorker.last).not.toBe(first);
    expect(ranking.done.value).toBe(false);
    expect(ranking.results.value).toEqual([null]);
    ranking.cancel();
    expect(FakeWorker.last!.terminated).toBe(true);
    expect(ranking.running.value).toBe(false);
  });
});
