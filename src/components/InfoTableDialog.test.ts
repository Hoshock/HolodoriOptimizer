// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import InfoTableDialog from "./InfoTableDialog.vue";
import { PREMISE_INFO } from "../ui/infoTables";

/**
 * 選択肢の違いの表のダイアログ(2026-10-08 ユーザー指示。さがすの 3 択・結果のタブの横の ⓘ から開く)。
 * 見出し → 表(列 = 選択肢、行 = 違い。いま選んでいる列の見出しは aria-current)→「閉じる」。説明の文は置かない
 */
const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

function mount(current: string) {
  const events: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  createApp({
    render: () =>
      h(InfoTableDialog, { table: PREMISE_INFO, current, onClose: () => events.push("close") }),
  }).mount(host);
  return { host, events };
}

describe("InfoTableDialog", () => {
  it("見出し・列見出し・行見出しと枡を表の通りに出し、ほかの文は置かない", () => {
    const { host } = mount("current");
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
    expect(host.querySelectorAll("p")).toHaveLength(0);
    expect([...host.querySelectorAll("button")].map((b) => b.textContent.trim())).toEqual([
      "閉じる",
    ]);
  });

  it("いま選んでいる列の見出しだけが aria-current", () => {
    const { host } = mount("maxed");
    const current = [...host.querySelectorAll("thead th")].filter(
      (th) => th.getAttribute("aria-current") === "true",
    );
    expect(current.map((th) => th.textContent.trim())).toEqual(["育てきったら"]);
  });

  it("「閉じる」・外側のタップ・Escape で閉じる", async () => {
    const { host, events } = mount("current");
    host.querySelector<HTMLButtonElement>(".close")?.click();
    host.querySelector<HTMLElement>(".overlay")?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(events).toEqual(["close", "close", "close"]);
  });
});
