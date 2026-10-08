// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import UnitActionFoot from "./UnitActionFoot.vue";

/**
 * 結果詳細・お気に入りの下端の固定エリア。「最適化」の 1 つだけ（2026-10-08 ユーザー指示。それまでの「ボードの最適化」「頻度の最適化」の 2 つを
 * まとめ、頻度は最適化の中の選択肢にした。前後へ送る三角は置かない — 送りはスワイプだけ）。
 * 「検索画面に入力」はボタンを外し、`load` のイベントだけ残してある
 */
function mount(props: { disabled?: boolean } = {}) {
  const events: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  createApp({
    render: () =>
      h(UnitActionFoot, {
        ...props,
        onLoad: () => events.push("load"),
        onOptimize: () => events.push("optimize"),
      }),
  }).mount(host);
  return { events, buttons: () => [...host.querySelectorAll<HTMLButtonElement>("button")] };
}

describe("UnitActionFoot", () => {
  it("「最適化」の 1 つだけで、「頻度の最適化」も「検索画面に入力」も三角のボタンもない", () => {
    const { buttons } = mount();
    expect(buttons().map((b) => b.textContent.trim())).toEqual(["最適化"]);
  });

  it("押すと optimize を出す(検索画面に入力のイベントは出ない)", async () => {
    const { events, buttons } = mount();
    buttons()[0]?.click();
    await nextTick();
    expect(events).toEqual(["optimize"]);
  });

  it("開ける編成がないときは disabled", () => {
    const { buttons } = mount({ disabled: true });
    expect(buttons().every((b) => b.disabled)).toBe(true);
  });
});
