// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import InfoDialog from "./InfoDialog.vue";
import { PREMISE_INFO, RESULT_TAB_INFO } from "../ui/infoContent";

/**
 * 見出しの行の ⓘ から開くダイアログ(2026-10-08 ユーザー指示)。さがすの 3 択は表(列 = 選択肢、行 = 違い。いま選んでいる列の見出しは
 * aria-current)、結果のタブは名前と短い文の組。どちらも 見出し → 中身 →「閉じる」
 */
const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

function mount(props: Record<string, unknown>) {
  const events: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  createApp({
    render: () => h(InfoDialog, { ...props, onClose: () => events.push("close") }),
  }).mount(host);
  return { host, events };
}

describe("InfoDialog", () => {
  it("表: 見出し・列見出し・行見出しと枡を表の通りに出す", () => {
    const { host } = mount({ table: PREMISE_INFO, current: "current" });
    expect(host.querySelector("h3")?.textContent).toBe("育成の前提");
    expect([...host.querySelectorAll("thead th")].map((th) => th.textContent.trim())).toEqual(
      PREMISE_INFO.columns.map((c) => c.label),
    );
    expect([...host.querySelectorAll("tbody th")].map((th) => th.textContent.trim())).toEqual(
      PREMISE_INFO.rows.map((r) => r.label),
    );
    const firstRow = [...host.querySelectorAll("tbody tr")][0];
    expect([...firstRow.querySelectorAll("td")].map((td) => td.textContent.trim())).toEqual([
      ...PREMISE_INFO.rows[0].cells,
    ]);
    expect(host.querySelector("dl")).toBeNull();
    expect([...host.querySelectorAll("button")].map((b) => b.textContent.trim())).toEqual([
      "閉じる",
    ]);
  });

  it("表: いま選んでいる列の見出しだけが aria-current", () => {
    const { host } = mount({ table: PREMISE_INFO, current: "maxed" });
    const current = [...host.querySelectorAll("thead th")].filter(
      (th) => th.getAttribute("aria-current") === "true",
    );
    expect(current.map((th) => th.textContent.trim())).toEqual(["育てきったら"]);
  });

  it("名前と文: タブの名前の下に 1 文 1 行で出し、表は出さない", () => {
    const { host } = mount({ terms: RESULT_TAB_INFO });
    expect(host.querySelector("h3")?.textContent).toBe("結果の並び");
    expect([...host.querySelectorAll("dt")].map((dt) => dt.textContent.trim())).toEqual([
      "いまのまま",
      "組み直すと",
    ]);
    expect([...host.querySelectorAll("dd")].map((dd) => dd.textContent.trim())).toEqual(
      RESULT_TAB_INFO.terms.flatMap((t) => t.lines),
    );
    expect(host.querySelector("table")).toBeNull();
  });

  it("「閉じる」・外側のタップ・Escape で閉じる", async () => {
    const { host, events } = mount({ terms: RESULT_TAB_INFO });
    host.querySelector<HTMLButtonElement>(".close")?.click();
    host.querySelector<HTMLElement>(".overlay")?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(events).toEqual(["close", "close", "close"]);
  });
});
