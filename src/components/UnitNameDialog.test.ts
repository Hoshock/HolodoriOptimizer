// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import UnitNameDialog from "./UnitNameDialog.vue";
import { UNIT_NAME_MAX_LENGTH } from "../storage/units";

/**
 * ユニット名のダイアログ（2026-09-15 ユーザー指示）。
 * **ここは自動フォーカスする** — 「モーダルで自動フォーカスしない」規則の例外なので、
 * 戻ってしまわないようにテストで固定する
 */
function mount(value: string): { host: HTMLElement; unmount: () => void } {
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp({
    render: () => h(UnitNameDialog, { value, slotNumber: 2 }),
  });
  app.mount(host);
  return {
    host,
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

describe("ユニット名のダイアログ", () => {
  it("開いた直後に入力欄へフォーカスし、カーソルを末尾に置く", async () => {
    const { host, unmount } = mount("推し編成");
    await nextTick();
    await nextTick();
    const input = host.querySelector("input");
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(input?.selectionStart).toBe("推し編成".length);
    unmount();
  });

  it("上限は入力の時点で止める（maxlength）。既定は「ユニット{番号}」をプレースホルダに出す", () => {
    const { host, unmount } = mount("");
    const input = host.querySelector("input");
    expect(input?.getAttribute("maxlength")).toBe(String(UNIT_NAME_MAX_LENGTH));
    expect(input?.getAttribute("placeholder")).toBe("ユニット2");
    unmount();
  });
});
