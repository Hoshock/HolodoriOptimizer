// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import NoticeDialog from "./NoticeDialog.vue";

/**
 * 知らせるだけのダイアログ(2026-10-02 ユーザー指示のコネクトの所持不足のエラーに使う)。
 * 文言をそのまま出し、出口は「閉じる」1 つ(キャンセル / 実行の 2 択ではない)
 */
function mount(message: string) {
  const events: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp({
    render: () => h(NoticeDialog, { message, onClose: () => events.push("close") }),
  });
  app.mount(host);
  return {
    events,
    host,
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

describe("NoticeDialog", () => {
  it("文言を出し、ボタンは「閉じる」だけで、押すと close を出す", async () => {
    const message =
      "所持しているコネクトにないものがボードに置かれています。所持コネクトを正しく登録してください。";
    const { events, host, unmount } = mount(message);
    expect(host.querySelector(".message")?.textContent).toBe(message);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>("button")];
    expect(buttons.map((b) => b.textContent.trim())).toEqual(["閉じる"]);
    buttons[0]?.click();
    await nextTick();
    expect(events).toEqual(["close"]);
    unmount();
  });
});
