// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import UnitActionFoot from "./UnitActionFoot.vue";

/**
 * 結果詳細・お気に入りの下端の固定エリア。1 行に 2 つ: 左から「ボードの最適化」「頻度の最適化」
 * （2026-10-07 ユーザー指示。それまでの「コネクトの最適化」はボードの最適化の中の選択肢にした。前後へ送る三角は置かない — 送りはスワイプだけ）。
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
        onFrequency: () => events.push("frequency"),
        onBoard: () => events.push("board"),
      }),
  }).mount(host);
  return { events, buttons: () => [...host.querySelectorAll<HTMLButtonElement>("button")] };
}

describe("UnitActionFoot", () => {
  it("左「ボードの最適化」・右「頻度の最適化」の 2 つだけ(1 行)で、「コネクトの最適化」も「検索画面に入力」も三角のボタンもない", () => {
    const { buttons } = mount();
    expect(buttons().map((b) => b.textContent.trim())).toEqual(["ボードの最適化", "頻度の最適化"]);
  });

  it("それぞれ対応するイベントを出す(検索画面に入力のイベントは出ない)", async () => {
    const { events, buttons } = mount();
    buttons()[0]?.click();
    buttons()[1]?.click();
    await nextTick();
    expect(events).toEqual(["board", "frequency"]);
  });

  it("開ける編成がないときは 2 つとも disabled", () => {
    const { buttons } = mount({ disabled: true });
    expect(buttons().every((b) => b.disabled)).toBe(true);
  });
});
