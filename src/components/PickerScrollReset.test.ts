// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test";
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
  const kindChecks = (host: HTMLElement): (string | null)[] =>
    [...(host.querySelectorAll<HTMLElement>(".segment")[0]?.querySelectorAll("button") ?? [])].map(
      (b) => b.getAttribute("aria-checked"),
    );

  // 曲ピッカーは絞り込み・並び順をモジュールで覚えるので、既定値の確認は最初のテストに置く
  it("曲: 並び順は左が Lv・右が五十音順で既定は五十音順、絞り込みの既定はイベントの開催中なら「イベント」", () => {
    // イベント 7(2026-09-29〜10-05)の開催中
    const { host, unmount } = mountPicker(SongPicker, {
      selectedId: null,
      now: new Date("2026-09-30T12:00:00+09:00"),
    });
    const seg = [...host.querySelectorAll<HTMLElement>(".segment")].at(-1);
    const buttons = [...(seg?.querySelectorAll<HTMLElement>("button") ?? [])];
    expect(buttons.map((b) => b.textContent.replace(/[▼▲]/g, "").trim())).toEqual([
      "Lv 高い順",
      "五十音順",
    ]);
    expect(buttons.map((b) => b.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    // 2026-10-10 ユーザー指示「イベント期間はイベントをデフォルトに」
    expect(kindChecks(host)).toEqual(["false", "false", "false", "true"]);
    expect(host.querySelectorAll("[role=listitem]")).toHaveLength(4);
    unmount();
  });

  it("曲: 開催中でなければ、絞り込みの既定は「すべて」", async () => {
    // 前の部品には「オリジナル」を覚えさせておき、モジュールを読み直して覚えていない状態から開く
    const before = mountPicker(SongPicker, { selectedId: null });
    before.host
      .querySelectorAll<HTMLElement>(".segment")[0]
      ?.querySelectorAll("button")[1]
      ?.click();
    await nextTick();
    expect(kindChecks(before.host)).toEqual(["false", "true", "false", "false"]);
    before.unmount();
    vi.resetModules();
    const { default: FreshPicker } = await import("./SongPicker.vue");
    const { host, unmount } = mountPicker(FreshPicker, {
      selectedId: null,
      now: new Date("2026-09-29T11:59:59+09:00"),
    });
    expect(kindChecks(host)).toEqual(["true", "false", "false", "false"]);
    unmount();
  });

  it("曲: 「イベント」は開催中のイベントの課題曲だけを出し、開催中でなければ選べない", async () => {
    // イベント 7(2026-09-29〜10-05)の課題曲 4 曲
    const during = mountPicker(SongPicker, {
      selectedId: null,
      now: new Date("2026-09-30T12:00:00+09:00"),
    });
    const kindButtons = () => [
      ...(during.host
        .querySelectorAll<HTMLButtonElement>(".segment")[0]
        ?.querySelectorAll("button") ?? []),
    ];
    expect(kindButtons().map((b) => b.textContent.trim())).toEqual([
      "すべて",
      "オリジナル",
      "カバー",
      "イベント",
    ]);
    kindButtons()[3]?.click();
    await nextTick();
    expect(during.host.querySelectorAll("[role=listitem]")).toHaveLength(4);
    kindButtons()[0]?.click();
    await nextTick();
    during.unmount();

    const outside = mountPicker(SongPicker, {
      selectedId: null,
      now: new Date("2026-09-29T11:59:59+09:00"),
    });
    const eventButton = outside.host
      .querySelectorAll<HTMLElement>(".segment")[0]
      ?.querySelectorAll<HTMLButtonElement>("button")[3];
    expect(eventButton?.disabled).toBe(true);
    outside.unmount();
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
