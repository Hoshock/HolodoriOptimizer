// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import UnitActionFoot from "./UnitActionFoot.vue";

/**
 * 結果詳細・お気に入りの下端の固定エリア。左が「コネクトの最適化」、右が「発動頻度の最適化」
 * （2026-10-02 ユーザー指示で左を「検索画面に入力」から差し替え。前後へ送る三角は置かない — 送りはスワイプだけ）。
 * 「検索画面に入力」はボタンを外し、`load` のイベントだけ残してある
 */
function mount(props: { disabled?: boolean; connectDisabled?: boolean } = {}) {
  const events: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  createApp({
    render: () =>
      h(UnitActionFoot, {
        ...props,
        onLoad: () => events.push("load"),
        onConnect: () => events.push("connect"),
        onFrequency: () => events.push("frequency"),
      }),
  }).mount(host);
  return { events, buttons: () => [...host.querySelectorAll<HTMLButtonElement>("button")] };
}

describe("UnitActionFoot", () => {
  it("左「コネクトの最適化」・右「発動頻度の最適化」の 2 つだけで、「検索画面に入力」も三角のボタンもない", () => {
    const { buttons } = mount();
    expect(buttons().map((b) => b.textContent.trim())).toEqual([
      "コネクトの最適化",
      "発動頻度の最適化",
    ]);
  });

  it("それぞれ対応するイベントを出す(検索画面に入力のイベントは出ない)", async () => {
    const { events, buttons } = mount();
    buttons()[0]?.click();
    buttons()[1]?.click();
    await nextTick();
    expect(events).toEqual(["connect", "frequency"]);
  });

  it("開ける編成がないときは両方 disabled", () => {
    const { buttons } = mount({ disabled: true });
    expect(buttons().every((b) => b.disabled)).toBe(true);
  });

  it("持っているコネクトの登録がないときは、コネクトの最適化だけ disabled(発動頻度は押せる)", () => {
    const { buttons } = mount({ connectDisabled: true });
    expect(buttons().map((b) => b.disabled)).toEqual([true, false]);
  });
});
