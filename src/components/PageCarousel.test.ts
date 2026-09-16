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

/** 指 1 本ぶんのイベント。y を省くと左右だけ動かす(= 横のジェスチャ) */
function fire(area: HTMLElement, type: string, x: number, pointerId: number, y = 100): void {
  area.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
      button: 0,
      pointerType: "touch",
      pointerId,
    }),
  );
}

/** ブラウザの縦スクロールを止めているか(横と決まったジェスチャのあいだだけ止める) */
function touchMovePrevented(area: HTMLElement): boolean {
  const event = new Event("touchmove", { bubbles: true, cancelable: true });
  area.dispatchEvent(event);
  return event.defaultPrevented;
}

/** 右から左へ 1 本指で振る(次のページへ送るジェスチャ) */
function swipeLeft(area: HTMLElement, pointerId = 1): void {
  fire(area, "pointerdown", 300, pointerId);
  fire(area, "pointermove", 280, pointerId);
  fire(area, "pointermove", 100, pointerId);
  fire(area, "pointerup", 100, pointerId);
}

/** 実時間を進める(速さの判定は performance.now() で測るので、テストでも実際に待つ) */
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

  it("速く払えば、距離が短くても送る(フリック)", async () => {
    const m = await mount();
    fire(m.area, "pointerdown", 300, 1);
    await wait(16);
    fire(m.area, "pointermove", 285, 1);
    await wait(16);
    // 合計 30px で、ゆっくりなら送らない距離。離す直前が速いので送る
    fire(m.area, "pointermove", 270, 1);
    fire(m.area, "pointerup", 270, 1);
    await nextTick();
    expect(m.index.value).toBe(1);
    m.unmount();
  });

  it("ゆっくり少し動かしただけでは送らない(押し間違いで送らない)", async () => {
    const m = await mount();
    fire(m.area, "pointerdown", 300, 1);
    await wait(50);
    fire(m.area, "pointermove", 285, 1);
    await wait(200);
    fire(m.area, "pointermove", 275, 1);
    fire(m.area, "pointerup", 275, 1);
    await nextTick();
    expect(m.index.value).toBe(0);
    m.unmount();
  });

  it("ゆっくりでも 40px 以上動かせば送る", async () => {
    const m = await mount();
    fire(m.area, "pointerdown", 300, 1);
    await wait(50);
    fire(m.area, "pointermove", 270, 1);
    await wait(200);
    fire(m.area, "pointermove", 250, 1);
    fire(m.area, "pointerup", 250, 1);
    await nextTick();
    expect(m.index.value).toBe(1);
    m.unmount();
  });

  it("速く払ったあとブラウザに取り消されても送る(スクロールとみなされたとき)", async () => {
    const m = await mount();
    fire(m.area, "pointerdown", 300, 1);
    await wait(16);
    fire(m.area, "pointermove", 285, 1);
    await wait(16);
    fire(m.area, "pointermove", 270, 1);
    // 取り消しの座標は当てにならないので、最後に動いた位置で測る
    fire(m.area, "pointercancel", 999, 1);
    await nextTick();
    expect(m.index.value).toBe(1);
    m.unmount();
  });

  it("少し斜めでも横として送る(縦が横の 1.3 倍を超えたときだけ縦へ譲る)", async () => {
    const m = await mount();
    fire(m.area, "pointerdown", 300, 1, 100);
    // 横 30 / 縦 35。1:1 で見ると縦が勝つが、指は横に払っても弧を描くので横のまま続ける
    fire(m.area, "pointermove", 270, 1, 135);
    fire(m.area, "pointermove", 240, 1, 140);
    fire(m.area, "pointerup", 240, 1, 140);
    await nextTick();
    expect(m.index.value).toBe(1);
    m.unmount();
  });

  it("横と決まったら touchmove を止める(ブラウザの縦スクロールを混ぜない)", async () => {
    const m = await mount();
    expect(touchMovePrevented(m.area)).toBe(false);

    fire(m.area, "pointerdown", 300, 1);
    fire(m.area, "pointermove", 280, 1);
    expect(touchMovePrevented(m.area)).toBe(true);

    fire(m.area, "pointerup", 280, 1);
    expect(touchMovePrevented(m.area)).toBe(false);
    m.unmount();
  });

  it("縦と決まったジェスチャの touchmove は止めない(縦スクロールを邪魔しない)", async () => {
    const m = await mount();
    fire(m.area, "pointerdown", 300, 1, 100);
    fire(m.area, "pointermove", 295, 1, 200);
    expect(touchMovePrevented(m.area)).toBe(false);
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
