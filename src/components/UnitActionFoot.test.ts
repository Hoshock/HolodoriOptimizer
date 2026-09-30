// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import UnitActionFoot from "./UnitActionFoot.vue";

/**
 * 結果詳細・お気に入りの下端の固定エリア（2026-09-30 ユーザー指示）。
 * 左が「検索画面に入力」、右が「発動頻度の最適化」。前後へ送る三角は置かない（送りはスワイプだけ）
 */
function mount(disabled = false) {
  const events: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  createApp({
    render: () =>
      h(UnitActionFoot, {
        disabled,
        onLoad: () => events.push("load"),
        onFrequency: () => events.push("frequency"),
      }),
  }).mount(host);
  return { events, buttons: () => [...host.querySelectorAll<HTMLButtonElement>("button")] };
}

describe("UnitActionFoot", () => {
  it("左「検索画面に入力」・右「発動頻度の最適化」の 2 つだけで、三角のボタンはない", () => {
    const { buttons } = mount();
    expect(buttons().map((b) => b.textContent.trim())).toEqual([
      "検索画面に入力",
      "発動頻度の最適化",
    ]);
  });

  it("それぞれ対応するイベントを出す", async () => {
    const { events, buttons } = mount();
    buttons()[0]?.click();
    buttons()[1]?.click();
    await nextTick();
    expect(events).toEqual(["load", "frequency"]);
  });

  it("開ける編成がないときは両方 disabled", () => {
    const { buttons } = mount(true);
    expect(buttons().every((b) => b.disabled)).toBe(true);
  });
});
