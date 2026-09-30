// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import HolomenPicker from "./HolomenPicker.vue";
import SongPicker from "./SongPicker.vue";

/**
 * 曲・ホロメンのピッカーも、絞り込み・並び替えを切り替えたら一覧を先頭へ戻す
 * （カードのピッカーは CardPicker.test.ts。2026-09-30 ユーザー指摘「スクロール位置が保存されてるの使いづらい」）
 */
function mountPicker(component: object, props: Record<string, unknown>) {
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp({ render: () => h(component, props) });
  app.mount(host);
  return {
    host,
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

async function switchAndExpectTop(host: HTMLElement): Promise<void> {
  const list = host.querySelector<HTMLElement>(".list");
  if (!list) throw new Error(".list がない");
  list.scrollTop = 250;
  expect(list.scrollTop).toBe(250);
  host.querySelectorAll<HTMLElement>(".chip-scroll .chip")[1]?.click();
  await nextTick();
  expect(list.scrollTop).toBe(0);

  list.scrollTop = 250;
  // 並び替えのセグメント（キーの切り替え）
  const seg = [...host.querySelectorAll<HTMLElement>(".segment")].at(-1);
  const buttons = seg?.querySelectorAll<HTMLElement>("button") ?? [];
  const other = [...buttons].find((b) => b.getAttribute("aria-checked") === "false");
  other?.click();
  await nextTick();
  expect(list.scrollTop).toBe(0);
}

describe("曲・ホロメンのピッカー", () => {
  // 曲ピッカーは絞り込み・並び順をモジュールで覚えるので、既定値の確認は最初のテストに置く
  it("曲: 並び順は左が Lv・右が五十音順で、既定は五十音順", () => {
    const { host, unmount } = mountPicker(SongPicker, { selectedId: null });
    const seg = [...host.querySelectorAll<HTMLElement>(".segment")].at(-1);
    const buttons = [...(seg?.querySelectorAll<HTMLElement>("button") ?? [])];
    expect(buttons.map((b) => b.textContent.replace(/[▼▲]/g, "").trim())).toEqual([
      "Lv 高い順",
      "五十音順",
    ]);
    expect(buttons.map((b) => b.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    unmount();
  });

  it("曲: 所属や並び替えを切り替えたら一覧を先頭へ戻す", async () => {
    const { host, unmount } = mountPicker(SongPicker, { selectedId: null });
    await switchAndExpectTop(host);
    unmount();
  });

  it("ホロメン: 所属や並び替えを切り替えたら一覧を先頭へ戻す", async () => {
    const { host, unmount } = mountPicker(HolomenPicker, {
      redBoards: {},
      boards: {},
      yellowBoards: {},
      greenBoards: {},
    });
    await switchAndExpectTop(host);
    unmount();
  });
});
