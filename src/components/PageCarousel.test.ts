// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick, ref } from "vue";

import PageCarousel from "./PageCarousel.vue";

/**
 * 横送りのジェスチャ。**1 本指は送る / 2 本指(ピンチ)は送らずブラウザへ譲る**
 * (2026-09-16 ユーザー報告「ピンチインするとスワイプも競合してできない」)。
 * 指の本数で分かれる壊れやすい所なので、`PointerEvent` を直接流して固定する
 */

const ITEMS = ["a", "b", "c", "d", "e"];

async function mount() {
  const index = ref(0);
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(PageCarousel, {
        items: ITEMS,
        label: "テスト",
        modelValue: index.value,
        "onUpdate:modelValue": (v: number) => (index.value = v),
      }),
  });
  app.mount(host);
  // スワイプを拾う要素へのクラス付けは flush: "post" の watch なので、1 ティック待つ
  await nextTick();
  const area = host.querySelector<HTMLElement>(".swipe-area");
  if (!area) throw new Error("スワイプを拾う要素が見つからない");
  return {
    index,
    area,
    unmount(): void {
      app.unmount();
      host.remove();
    },
  };
}

/** 指 1 本ぶんのイベント。座標は左右だけ動かす(縦は 0 のまま = 横のジェスチャ) */
function fire(area: HTMLElement, type: string, x: number, pointerId: number): void {
  area.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: 100,
      button: 0,
      pointerType: "touch",
      pointerId,
    }),
  );
}

/** 右から左へ 1 本指で振る(次のページへ送るジェスチャ) */
function swipeLeft(area: HTMLElement, pointerId = 1): void {
  fire(area, "pointerdown", 300, pointerId);
  fire(area, "pointermove", 280, pointerId);
  fire(area, "pointermove", 100, pointerId);
  fire(area, "pointerup", 100, pointerId);
}

describe("横送りのジェスチャ", () => {
  it("1 本指の横スワイプで次のページへ送る", async () => {
    const m = await mount();
    swipeLeft(m.area);
    await nextTick();
    expect(m.index.value).toBe(1);
    m.unmount();
  });

  it("2 本目の指が触れたら送らない(ピンチをブラウザへ譲る)", async () => {
    const m = await mount();
    fire(m.area, "pointerdown", 300, 1);
    fire(m.area, "pointermove", 270, 1);
    // ここで 2 本目。以降はどれだけ動かしても送らない
    fire(m.area, "pointerdown", 150, 2);
    fire(m.area, "pointermove", 100, 1);
    fire(m.area, "pointermove", 200, 2);
    fire(m.area, "pointerup", 100, 1);
    fire(m.area, "pointerup", 200, 2);
    await nextTick();
    expect(m.index.value).toBe(0);
    m.unmount();
  });

  it("ピンチのあとでも 1 本指のスワイプは効く(指が離れたら元に戻る)", async () => {
    const m = await mount();
    fire(m.area, "pointerdown", 300, 1);
    fire(m.area, "pointerdown", 150, 2);
    fire(m.area, "pointerup", 300, 1);
    fire(m.area, "pointerup", 150, 2);
    await nextTick();
    expect(m.index.value).toBe(0);

    swipeLeft(m.area, 3);
    await nextTick();
    expect(m.index.value).toBe(1);
    m.unmount();
  });

  it("縦の動きが勝つジェスチャは送らない(縦スクロールに譲る)", async () => {
    const m = await mount();
    m.area.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 300,
        clientY: 100,
        button: 0,
        pointerType: "touch",
        pointerId: 1,
      }),
    );
    m.area.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: 280,
        clientY: 300,
        button: 0,
        pointerType: "touch",
        pointerId: 1,
      }),
    );
    fire(m.area, "pointerup", 100, 1);
    await nextTick();
    expect(m.index.value).toBe(0);
    m.unmount();
  });
});
