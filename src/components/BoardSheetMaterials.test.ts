// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import BoardSheet from "./BoardSheet.vue";
import {
  replaceBoardResources,
  spendBoardResources,
  useBoardResources,
} from "../composables/useBoardResources";
import { emptyHolomenBoards } from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import { emptyBoardResources } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import { BOARD_COLOR_ORDER } from "../storage/boards";
import { materialDelta, shortageLabels, spendResources } from "../ui/boardSpend";

/**
 * ボード画面の手動の解放・解除は余りのリソースを増減する(2026-10-10 ユーザー指示「ボードで解放すると資材が減るべきなのに減らない。
 * 資材以上を解放するときはモーダルで確認しつつ − にする余地を残す」。2026-10-07 の「手動の編集で余りを増減しない」を置き換えた)。
 * 開けたマスの資材を引き、外したマスの資材は戻す。未登録(∞)は増減しない。足りないときはボードのシートで確認し、「解放する」で負のまま開ける
 */
const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.remove();
  replaceBoardResources(emptyBoardResources());
});

const filled = (n: number): BoardResources => {
  const r = emptyBoardResources();
  for (const color of BOARD_COLOR_ORDER) r[color] = { cube: n, core: n };
  return r;
};
const red = (ids: string[]): HolomenBoards => ({ ...emptyHolomenBoards(), red: ids });

function mount(resources?: BoardResources, redNodes: string[] = []) {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const changes: HolomenBoards[] = [];
  createApp({
    render: () =>
      h(BoardSheet, {
        holomenId: "nekomata-okayu",
        redNodes,
        nodes: [],
        yellowNodes: [],
        greenNodes: [],
        resources,
        onChange: (_id: string, b: HolomenBoards) => changes.push(b),
      }),
  }).mount(host);
  const click = async (el: Element | null | undefined): Promise<void> => {
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
  };
  const dialog = (): HTMLElement | null =>
    host.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="リソースが足りないまま解放しますか？"]',
    );
  const button = (label: string): HTMLButtonElement | undefined =>
    [...(dialog()?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
      (b) => b.textContent.trim() === label,
    );
  return { host, changes, click, dialog, button };
}

describe("使う資材の差分(materialDelta)", () => {
  it("開けたマスの資材は正、外したマスの資材は負。コネクトマスは 0", () => {
    const opened = materialDelta(emptyHolomenBoards(), red(["R-001"]));
    expect(opened.red).toEqual({ cube: 20, core: 0 }); // R-001 は cube 20 / core 0
    expect(materialDelta(red(["R-001"]), emptyHolomenBoards()).red).toEqual({ cube: -20, core: 0 });
    const connect = materialDelta(emptyHolomenBoards(), {
      ...emptyHolomenBoards(),
      connects: ["card"],
    });
    for (const color of BOARD_COLOR_ORDER) expect(connect[color]).toEqual({ cube: 0, core: 0 });
  });
});

describe("余りの増減(spendResources)", () => {
  it("引き・戻し、未登録(∞)は変えず、足りなければ負のまま残す", () => {
    const r = emptyBoardResources();
    r.red = { cube: 10, core: 3 };
    const opened = materialDelta(emptyHolomenBoards(), red(["R-001"]));
    const next = spendResources(r, opened);
    expect(next.red).toEqual({ cube: -10, core: 3 });
    expect(next.blue).toEqual({ cube: null, core: null });
    expect(spendResources(next, materialDelta(red(["R-001"]), emptyHolomenBoards())).red).toEqual({
      cube: 10,
      core: 3,
    });
  });

  it("不足の文は負の余りの大きさ。only を渡すとその操作で使う項目だけ(前からの不足では聞かない)", () => {
    const r = emptyBoardResources();
    r.red = { cube: -10, core: 3 };
    r.blue = { cube: -5, core: 0 };
    expect(shortageLabels(r)).toEqual(["赤のキューブ 10", "青のキューブ 5"]);
    const opened = materialDelta(emptyHolomenBoards(), red(["R-001"]));
    expect(shortageLabels(r, opened)).toEqual(["赤のキューブ 10"]);
  });

  it("spendBoardResources は登録の余りに反映する", () => {
    replaceBoardResources(filled(100));
    spendBoardResources(materialDelta(emptyHolomenBoards(), red(["R-001"])));
    expect(useBoardResources().value.red).toEqual({ cube: 80, core: 100 });
  });
});

describe("ボードのシート: 余りを超えて開けるときだけ確認する", () => {
  it("足りるときは確認せずに開ける", async () => {
    const { host, changes, click, dialog } = mount(filled(1000));
    await click(host.querySelector('.node[data-node="red:R-002"]'));
    expect(dialog()).toBeNull();
    expect(changes).toHaveLength(1);
    expect(changes[0]?.red).toContain("R-002");
  });

  it("未登録(∞)なら確認しない", async () => {
    const { host, changes, click, dialog } = mount(emptyBoardResources());
    await click(host.querySelector('.node[data-node="red:R-002"]'));
    expect(dialog()).toBeNull();
    expect(changes).toHaveLength(1);
  });

  it("足りないときは確認を出し、不足を添える。「キャンセル」なら何も変えない", async () => {
    const { host, changes, click, dialog, button } = mount(filled(0));
    await click(host.querySelector('.node[data-node="red:R-002"]'));
    expect(changes).toHaveLength(0);
    // R-002(cube 25 / core 5)は R-001(cube 20)の先なので、経路ごと開ける
    expect(dialog()?.querySelector(".note")?.textContent).toBe(
      "赤のキューブ 45・赤のコアキューブ 5 が不足します",
    );
    await click(button("キャンセル"));
    expect(dialog()).toBeNull();
    expect(changes).toHaveLength(0);
  });

  it("「解放する」で足りないまま開ける(余りを負にするのは受け側)", async () => {
    const { host, changes, click, button } = mount(filled(0));
    await click(host.querySelector('.node[data-node="red:R-002"]'));
    await click(button("解放する"));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.red).toContain("R-002");
  });

  it("「すべて解放」も同じ確認を通す", async () => {
    const { host, changes, click, dialog, button } = mount(filled(0));
    await click(
      [...host.querySelectorAll<HTMLButtonElement>(".bulk-row button")].find(
        (b) => b.textContent.trim() === "すべて解放",
      ),
    );
    expect(dialog()).not.toBeNull();
    await click(button("解放する"));
    const b = changes[0];
    expect(
      (b?.red.length ?? 0) +
        (b?.blue.length ?? 0) +
        (b?.yellow.length ?? 0) +
        (b?.green.length ?? 0),
    ).toBe(150);
    expect(b?.connects).toEqual(["leader", "card", "content"]);
  });

  it("外す操作では聞かない(余りが 0 でも、前から負でも)", async () => {
    const r = filled(0);
    r.red = { cube: -50, core: -5 };
    const { host, changes, click, dialog } = mount(r, ["R-001"]);
    await click(host.querySelector('.node[data-node="red:R-001"]'));
    expect(dialog()).toBeNull();
    expect(changes).toHaveLength(1);
    expect(changes[0]?.red).not.toContain("R-001");
  });
});

describe("replaceBoardResources(推奨の反映・戻る / 進むで写しへ戻す)", () => {
  it("余りを丸ごと置き換える(未登録は未登録のまま、負は不足としてそのまま、範囲外は ±上限へ丸める)", () => {
    const next = emptyBoardResources();
    next.green = { cube: 961, core: 452 };
    replaceBoardResources(next);
    expect(useBoardResources().value.green).toEqual({ cube: 961, core: 452 });
    expect(useBoardResources().value.red).toEqual({ cube: null, core: null });
    const bad = emptyBoardResources();
    bad.blue = { cube: -5, core: 1e9 };
    replaceBoardResources(bad);
    expect(useBoardResources().value.blue).toEqual({ cube: -5, core: 999999 });
  });
});
