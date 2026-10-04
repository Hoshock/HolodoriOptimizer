// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import UnitActionFoot from "./UnitActionFoot.vue";

/**
 * 結果詳細・お気に入りの下端の固定エリア。1 行に 3 つ: 左から「ボードの最適化」「コネクトの最適化」「頻度の最適化」
 * （2026-10-04 ユーザー指示。前後へ送る三角は置かない — 送りはスワイプだけ）。
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
        onBoard: () => events.push("board"),
      }),
  }).mount(host);
  return { events, buttons: () => [...host.querySelectorAll<HTMLButtonElement>("button")] };
}

describe("UnitActionFoot", () => {
  it("左「コネクトの最適化」・右「発動頻度の最適化」・下に「ホロメンボードの最適化」の 3 つだけ(1 行)で、「検索画面に入力」も三角のボタンもない", () => {
    const { buttons } = mount();
    expect(buttons().map((b) => b.textContent.trim())).toEqual([
      "ボードの最適化",
      "コネクトの最適化",
      "頻度の最適化",
    ]);
  });

  it("それぞれ対応するイベントを出す(検索画面に入力のイベントは出ない)", async () => {
    const { events, buttons } = mount();
    buttons()[0]?.click();
    buttons()[1]?.click();
    buttons()[2]?.click();
    await nextTick();
    expect(events).toEqual(["board", "connect", "frequency"]);
  });

  it("開ける編成がないときは 3 つとも disabled", () => {
    const { buttons } = mount({ disabled: true });
    expect(buttons().every((b) => b.disabled)).toBe(true);
  });

  it("持っているコネクトの登録がないときは、コネクトの最適化だけ disabled(発動頻度は押せる)", () => {
    const { buttons } = mount({ connectDisabled: true });
    expect(buttons().map((b) => b.disabled)).toEqual([false, true, false]);
  });
});
