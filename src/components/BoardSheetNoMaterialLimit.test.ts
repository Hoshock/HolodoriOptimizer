// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import BoardSheet from "./BoardSheet.vue";
import boardSheetSource from "./BoardSheet.vue?raw";
import useBoardsSource from "../composables/useBoards.ts?raw";
import boardStateSource from "../data/boardState.ts?raw";
import {
  replaceBoardResources,
  setResourceCount,
  useBoardResources,
} from "../composables/useBoardResources";
import type { HolomenBoards } from "../data/boardState";
import { BOARD_RESOURCE_KINDS, emptyBoardResources } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import { BOARD_COLOR_ORDER } from "../storage/boards";

/**
 * 手動のボード操作はキューブ・コアキューブで制限しない(2026-10-07 ユーザー指示)。資材は「ホロメンボードの最適化」だけの共有制約で、
 * 「リソース」の余りが 0 でも、通常マス・コネクトマス・すべて解放は従来どおりできる。また手動の編集で余りを自動で増減しない
 * (ゲームの実際の余りをユーザーが登録する入力のため。自動で書き換えるのは最適化の推奨を反映するときだけ)
 */
const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.remove();
  replaceBoardResources(emptyBoardResources());
});

const zero = (): BoardResources => {
  const r = emptyBoardResources();
  for (const color of BOARD_COLOR_ORDER) r[color] = { cube: 0, core: 0 };
  return r;
};

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const changes: HolomenBoards[] = [];
  createApp({
    render: () =>
      h(BoardSheet, {
        holomenId: "nekomata-okayu",
        redNodes: [],
        nodes: [],
        yellowNodes: [],
        greenNodes: [],
        onChange: (_id: string, b: HolomenBoards) => changes.push(b),
      }),
  }).mount(host);
  const click = async (el: Element | null | undefined): Promise<void> => {
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
  };
  return { host, changes, click };
}

describe("手動のボード操作は資材で制限しない", () => {
  it("余りがすべて 0 でも、通常マスを開けられる", async () => {
    replaceBoardResources(zero());
    const { host, changes, click } = mount();
    await click(host.querySelector('.node[data-node="red:R-002"]'));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.red).toContain("R-002"); // R-002 は cube 25 / core 5 だが、0 でも開く
  });

  it("余りがすべて 0 でも、コネクトマスを(その先のマスごと)開けられる", async () => {
    replaceBoardResources(zero());
    const { host, changes, click } = mount();
    await click(host.querySelector('.node[data-node="blue:B-023"]'));
    expect(changes[0]?.connects).toEqual(["card"]);
    expect(changes[0]?.blue).toContain("B-023");
  });

  it("余りがすべて 0 でも、「すべて解放」で全部(通常マス 150 + コネクト 3)開けられる", async () => {
    replaceBoardResources(zero());
    const { host, changes, click } = mount();
    await click(
      [...host.querySelectorAll<HTMLButtonElement>(".bulk-row button")].find(
        (b) => b.textContent.trim() === "すべて解放",
      ),
    );
    const b = changes[0];
    expect(
      (b?.red.length ?? 0) +
        (b?.blue.length ?? 0) +
        (b?.yellow.length ?? 0) +
        (b?.green.length ?? 0),
    ).toBe(150);
    expect(b?.connects).toEqual(["leader", "card", "content"]);
  });

  it("手動で開けても、登録している余りは自動で増減しない", async () => {
    replaceBoardResources(zero());
    setResourceCount("red", "cube", 123);
    const { host, click } = mount();
    await click(host.querySelector('.node[data-node="red:R-002"]'));
    await click(host.querySelector('.node[data-node="blue:B-023"]'));
    const r = useBoardResources().value;
    expect(r.red).toEqual({ cube: 123, core: 0 });
    for (const color of BOARD_COLOR_ORDER) {
      if (color === "red") continue;
      for (const kind of BOARD_RESOURCE_KINDS) expect(r[color][kind]).toBe(0);
    }
  });

  it("手動操作の経路(BoardSheet・boardState・useBoards)はリソースの登録を参照しない(制限を漏らさない)", () => {
    const sources: Record<string, string> = {
      "src/components/BoardSheet.vue": boardSheetSource,
      "src/data/boardState.ts": boardStateSource,
      "src/composables/useBoards.ts": useBoardsSource,
    };
    for (const [file, text] of Object.entries(sources))
      expect(text, file).not.toMatch(/boardResources|useBoardResources|BoardResources/);
  });
});

describe("replaceBoardResources(最適化の推奨を反映するときだけ使う)", () => {
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
