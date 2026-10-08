// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import PoolFilterDialog from "./PoolFilterDialog.vue";

/**
 * さがすの「絞り込み」のダイアログ(2026-10-08 ユーザー指示でオプションの枠から移した)。
 * 上から 除外 / 選択 のセグメント、「リーダー n枚」「メンバー n枚」(ピッカーを開く)、「閉じる」。説明文は置かない
 */
const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});
function mount(mode: "exclude" | "select") {
  const events: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  createApp({
    render: () =>
      h(PoolFilterDialog, {
        mode,
        leaderCount: "0枚",
        memberCount: "すべて",
        onMode: (m: string) => events.push(`mode:${m}`),
        onLeader: () => events.push("leader"),
        onMember: () => events.push("member"),
        onClose: () => events.push("close"),
      }),
  }).mount(host);
  return { host, events };
}

describe("PoolFilterDialog", () => {
  it("並びは 見出し(右端に ⓘ)→ 除外 / 選択 → リーダー → メンバー → 閉じる。選んでいる種類は aria-checked", () => {
    const { host } = mount("select");
    expect(host.querySelector("h3")?.textContent).toBe("絞り込み");
    expect(host.querySelector(".head .info")?.getAttribute("aria-label")).toBe("絞り込みの説明");
    expect(
      [...host.querySelectorAll("button:not(.info)")].map((b) => b.textContent.replace(/\s+/g, "")),
    ).toEqual(["除外", "選択", "リーダー0枚", "メンバーすべて", "閉じる"]);
    expect([...host.querySelectorAll(".seg")].map((b) => b.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
    ]);
  });

  it("押したものを親へ伝える(種類の切り替え・ピッカーの入口・閉じる)", async () => {
    const { host, events } = mount("exclude");
    const buttons = [...host.querySelectorAll<HTMLButtonElement>("button:not(.info)")];
    for (const b of buttons) b.click();
    await nextTick();
    expect(events).toEqual(["mode:exclude", "mode:select", "leader", "member", "close"]);
  });

  it("ⓘ で 除外 / 選択 の説明を重ねて開き、その「閉じる」では絞り込みは閉じない", async () => {
    const { host, events } = mount("exclude");
    host.querySelector<HTMLButtonElement>(".head .info")?.click();
    await nextTick();
    expect([...host.querySelectorAll("dt")].map((dt) => dt.textContent.trim())).toEqual([
      "除外",
      "選択",
    ]);
    const closes = [...host.querySelectorAll<HTMLButtonElement>(".close")];
    closes[closes.length - 1].click();
    await nextTick();
    expect(host.querySelector("dl")).toBeNull();
    expect(events).toEqual([]);
  });
});
