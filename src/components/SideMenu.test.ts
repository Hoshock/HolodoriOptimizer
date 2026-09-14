// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick, reactive } from "vue";

import SideMenu from "./SideMenu.vue";

/**
 * サイドメニューの並びと設定のトグルを固定する(2026-09-14 ユーザー指示)。
 * DOM が要る唯一のテストなので、このファイルだけ happy-dom を要求する(先頭の docblock)
 */

interface Emitted {
  close: number;
  dark: number;
  okayu: number;
  gacha: number;
  tune: number;
}

function mount(initial: { open?: boolean; dark?: boolean; okayu?: boolean } = {}) {
  const state = reactive({
    open: initial.open ?? true,
    top: 0,
    dark: initial.dark ?? false,
    okayu: initial.okayu ?? false,
  });
  const emitted: Emitted = { close: 0, dark: 0, okayu: 0, gacha: 0, tune: 0 };
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(SideMenu, {
        open: state.open,
        top: state.top,
        dark: state.dark,
        okayu: state.okayu,
        onClose: () => {
          emitted.close += 1;
        },
        onDark: () => {
          emitted.dark += 1;
          state.dark = !state.dark;
        },
        onOkayu: () => {
          emitted.okayu += 1;
          state.okayu = !state.okayu;
        },
        onGacha: () => {
          emitted.gacha += 1;
        },
        onTune: () => {
          emitted.tune += 1;
        },
      }),
  });
  app.mount(host);
  return {
    state,
    emitted,
    host,
    unmount(): void {
      app.unmount();
      host.remove();
    },
  };
}

function labels(host: HTMLElement, selector: string): string[] {
  return [...host.querySelectorAll(selector)].map((el) => el.textContent?.trim() ?? "");
}

/** トップレベルの行(折り畳みの中の行は含めない) */
function topLevelLabels(host: HTMLElement): string[] {
  return labels(host, ".drawer > ul.items > li > .item .item-label");
}

/** その折り畳みの中の行 */
function groupLabels(host: HTMLElement, id: string): string[] {
  return labels(host, `#${id} .sub-item .item-label`);
}

function rowByLabel(host: HTMLElement, label: string): HTMLElement {
  const row = [...host.querySelectorAll<HTMLElement>(".item, .sub-item")].find(
    (el) => el.querySelector(".item-label")?.textContent?.trim() === label,
  );
  if (!row) throw new Error(`行が見つからない: ${label}`);
  return row;
}

describe("サイドメニューの構成", () => {
  it("トップレベルは 使い方 → お気に入り → カード一覧 → 曲一覧 → 仮想ガチャ → 設定 → 開発用 の順で、開発用は設定の下にある", () => {
    const m = mount();
    const top = topLevelLabels(m.host);
    expect(top).toEqual([
      "使い方",
      "お気に入り",
      "カード一覧",
      "曲一覧",
      "仮想ガチャ",
      "設定",
      "開発用",
    ]);
    expect(top.indexOf("開発用")).toBeGreaterThan(top.indexOf("設定"));
    m.unmount();
  });

  it("一番上の「使い方」は解説ページへのリンクで、押すと戻る位置を覚える", () => {
    const m = mount();
    const row = rowByLabel(m.host, "使い方");
    expect(row.tagName).toBe("A");
    expect(row.getAttribute("href")?.endsWith("/guides/simulator/")).toBe(true);

    sessionStorage.removeItem("holodori-optimizer:return-scroll");
    row.click();
    expect(sessionStorage.getItem("holodori-optimizer:return-scroll")).not.toBeNull();
    m.unmount();
  });

  it("仮想ガチャは折り畳みの中ではなくトップレベルの行で、押すと gacha を出す", () => {
    const m = mount();
    expect(topLevelLabels(m.host)).toContain("仮想ガチャ");
    expect(groupLabels(m.host, "group-settings")).not.toContain("仮想ガチャ");
    expect(groupLabels(m.host, "group-dev")).not.toContain("仮想ガチャ");
    rowByLabel(m.host, "仮想ガチャ").click();
    expect(m.emitted.gacha).toBe(1);
    m.unmount();
  });

  it("「おまけ機能」のグループは存在しない", () => {
    const m = mount();
    expect(m.host.textContent).not.toContain("おまけ機能");
    m.unmount();
  });

  it("削除済みの「ホロメンボード」「ペルソナ風UI」の入口は復活していない", () => {
    const m = mount();
    const text = m.host.textContent ?? "";
    expect(text).not.toContain("ホロメンボード");
    expect(text).not.toContain("ペルソナ");
    m.unmount();
  });

  it("設定は初期状態で閉じていて、中身は 取り込み → 出力 → ダークモード → 絶対おかゆんモード の順", () => {
    const m = mount();
    const trigger = rowByLabel(m.host, "設定");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(m.host.querySelector("#group-settings")?.classList.contains("open")).toBe(false);
    expect(groupLabels(m.host, "group-settings")).toEqual([
      "データの取り込み",
      "データの出力",
      "ダークモード",
      "絶対おかゆんモード",
    ]);
    m.unmount();
  });

  it("開発用も初期状態で閉じていて、中身は GitHub → カラー確認 → 文言・配置", () => {
    const m = mount();
    expect(rowByLabel(m.host, "開発用").getAttribute("aria-expanded")).toBe("false");
    expect(groupLabels(m.host, "group-dev")).toEqual(["GitHub", "カラー確認", "文言・配置"]);
    m.unmount();
  });

  it("「文言・配置」を押すと tune を出す(開発用の調整パネルの入口)", () => {
    const m = mount();
    rowByLabel(m.host, "文言・配置").click();
    expect(m.emitted.tune).toBe(1);
    m.unmount();
  });

  it("片方を開いてももう片方は閉じたままで、メニューを閉じると両方畳み直す", async () => {
    const m = mount();
    rowByLabel(m.host, "設定").click();
    await nextTick();
    expect(rowByLabel(m.host, "設定").getAttribute("aria-expanded")).toBe("true");
    expect(rowByLabel(m.host, "開発用").getAttribute("aria-expanded")).toBe("false");

    rowByLabel(m.host, "開発用").click();
    await nextTick();
    expect(rowByLabel(m.host, "設定").getAttribute("aria-expanded")).toBe("true");
    expect(rowByLabel(m.host, "開発用").getAttribute("aria-expanded")).toBe("true");

    m.state.open = false;
    await nextTick();
    expect(rowByLabel(m.host, "設定").getAttribute("aria-expanded")).toBe("false");
    expect(rowByLabel(m.host, "開発用").getAttribute("aria-expanded")).toBe("false");
    m.unmount();
  });
});

describe("設定のモード切り替え(トグル)", () => {
  it("ダークモードは role=switch で、aria-checked が現在値と一致する", async () => {
    const m = mount({ dark: false });
    const row = rowByLabel(m.host, "ダークモード");
    expect(row.getAttribute("role")).toBe("switch");
    expect(row.getAttribute("aria-checked")).toBe("false");

    row.click();
    await nextTick();
    expect(m.emitted.dark).toBe(1);
    expect(rowByLabel(m.host, "ダークモード").getAttribute("aria-checked")).toBe("true");
    m.unmount();
  });

  it("絶対おかゆんモードも role=switch で、aria-checked が現在値と一致する", async () => {
    const m = mount({ okayu: true });
    const row = rowByLabel(m.host, "絶対おかゆんモード");
    expect(row.getAttribute("role")).toBe("switch");
    expect(row.getAttribute("aria-checked")).toBe("true");

    row.click();
    await nextTick();
    expect(m.emitted.okayu).toBe(1);
    expect(rowByLabel(m.host, "絶対おかゆんモード").getAttribute("aria-checked")).toBe("false");
    m.unmount();
  });

  it("トグルを切り替えてもメニューは閉じない", async () => {
    const m = mount();
    rowByLabel(m.host, "ダークモード").click();
    rowByLabel(m.host, "絶対おかゆんモード").click();
    await nextTick();
    expect(m.emitted.close).toBe(0);
    m.unmount();
  });

  it("行とトグルの見た目は同じ 1 つのボタンなので、トグルを押しても二重に切り替わらない", async () => {
    const m = mount();
    for (const label of ["ダークモード", "絶対おかゆんモード"]) {
      const row = rowByLabel(m.host, label);
      // 行の中に押せる要素は 1 つだけ(トグルは aria-hidden の見た目で、独立したボタンではない)
      expect(row.querySelectorAll("button, a, input, [role]")).toHaveLength(0);
      expect(row.querySelector(".switch")?.getAttribute("aria-hidden")).toBe("true");
    }

    // トグルの見た目をクリックしても、発火するのは行のハンドラ 1 回だけ
    rowByLabel(m.host, "ダークモード").querySelector<HTMLElement>(".switch")?.click();
    await nextTick();
    expect(m.emitted.dark).toBe(1);

    rowByLabel(m.host, "絶対おかゆんモード").querySelector<HTMLElement>(".knob")?.click();
    await nextTick();
    expect(m.emitted.okayu).toBe(1);
    m.unmount();
  });
});
