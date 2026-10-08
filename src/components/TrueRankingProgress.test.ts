// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createApp, h } from "vue";

import TrueRankingProgress from "./TrueRankingProgress.vue";

/**
 * 結果の「育成すると」のタブの中の進み具合(2026-10-08 ユーザー指示でダイアログからタブの中へ移した)。
 * 計算中はリングの中に % と残り時間・3 段だけで、ボタンは置かない(中止はない)。始める前は「開始」、失敗は文言と「やり直す」
 */
const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});
const workload = { proxy: 10, search: 4, optimize: 20 };
function mount(status: "idle" | "running" | "error") {
  const events: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  createApp({
    render: () =>
      h(TrueRankingProgress, {
        status,
        progress: status === "running" ? { phase: "search", done: 2 } : null,
        workload,
        planned: status === "idle" ? workload : null,
        startedAt: status === "idle" ? null : Date.now(),
        finishedAt: null,
        pausedMs: 0,
        error: status === "error" ? "boom" : null,
        onStart: () => events.push("start"),
      }),
  }).mount(host);
  return { host, events };
}
const buttons = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].map((b) => b.textContent.trim());

describe("TrueRankingProgress", () => {
  it("計算中は % と残り時間と 3 段だけで、ボタンは置かない", () => {
    const { host } = mount("running");
    expect(host.querySelector(".big")?.textContent).toContain("%");
    expect(host.querySelector(".sub")?.textContent).toContain("残り");
    expect([...host.querySelectorAll(".step-label")].map((e) => e.textContent)).toEqual([
      "見込みのボード",
      "候補の絞り込み",
      "最適化",
    ]);
    expect(buttons(host)).toEqual([]);
  });

  it("始める前は「開始」、失敗は文言と「やり直す」。押すと start", () => {
    const idle = mount("idle");
    expect(buttons(idle.host)).toEqual(["開始"]);
    idle.host.querySelector<HTMLButtonElement>("button")?.click();
    expect(idle.events).toEqual(["start"]);
    const failed = mount("error");
    expect(failed.host.querySelector(".message")?.textContent).toContain("boom");
    expect(buttons(failed.host)).toEqual(["やり直す"]);
  });
});
