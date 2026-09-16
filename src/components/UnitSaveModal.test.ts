// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import UnitSaveModal from "./UnitSaveModal.vue";
import { UNIT_SLOT_COUNT } from "../storage/units";
import type { SavedUnit } from "../storage/units";

/**
 * お気に入りの番号選び。**押せるのは「登録済みの番号」と「先頭の空き 1 つ」だけ**で、
 * それ以外は disabled になる(2026-09-16 ユーザー指示「1 が登録されてたら 1 か 2 のみ、と
 * 隣接するところにしか置けないように」)。壊れたら気づきにくい構造なのでテストで固定する
 */

const FIVE = ["m1", "m2", "m3", "m4", "m5"];
const unit = (slot: number): SavedUnit => ({ slot, leaderId: `l${String(slot)}`, memberIds: FIVE });

function mount(units: SavedUnit[]) {
  const saved: number[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(UnitSaveModal, {
        units,
        onSave: (slot: number) => saved.push(slot),
        onClose: () => undefined,
      }),
  });
  app.mount(host);
  return {
    host,
    saved,
    /** 1〜10 の星のボタン(番号の順) */
    slots(): HTMLButtonElement[] {
      return [...host.querySelectorAll<HTMLButtonElement>(".slot-grid .slot")];
    },
    slot(n: number): HTMLButtonElement {
      const button = this.slots()[n - 1];
      if (!button) throw new Error(`番号が見つからない: ${String(n)}`);
      return button;
    },
    unmount(): void {
      app.unmount();
      host.remove();
    },
  };
}

/** 押せる番号の一覧(1 始まり) */
function enabled(m: ReturnType<typeof mount>): number[] {
  return m
    .slots()
    .map((b, i) => (b.disabled ? null : i + 1))
    .filter((n): n is number => n !== null);
}

describe("お気に入りの番号選び", () => {
  it("枠は常に 1〜10 の 10 個を並べる(押せない番号も消さない)", () => {
    const m = mount([unit(1)]);
    expect(m.slots()).toHaveLength(UNIT_SLOT_COUNT);
    m.unmount();
  });

  it("1 件も登録がなければ 1 だけ押せる", () => {
    const m = mount([]);
    expect(enabled(m)).toEqual([1]);
    m.unmount();
  });

  it("1, 2, 3 が登録済みなら 1〜4 だけ押せる(5 以降は disabled)", () => {
    const m = mount([unit(1), unit(2), unit(3)]);
    expect(enabled(m)).toEqual([1, 2, 3, 4]);
    m.unmount();
  });

  it("いっぱいなら登録済みの 10 個すべてが押せる(上書きだけできる)", () => {
    const m = mount(Array.from({ length: UNIT_SLOT_COUNT }, (_, i) => unit(i + 1)));
    expect(enabled(m)).toHaveLength(UNIT_SLOT_COUNT);
    m.unmount();
  });

  it("空いている先頭の番号は確認なしでそのまま登録する", () => {
    const m = mount([unit(1)]);
    m.slot(2).click();
    expect(m.saved).toEqual([2]);
    m.unmount();
  });

  it("登録済みの番号は上書きの確認を挟んでから登録する", async () => {
    const m = mount([unit(1)]);
    m.slot(1).click();
    await nextTick();
    expect(m.saved).toEqual([]);
    expect(m.host.textContent).toContain("上書き");

    m.host.querySelector<HTMLButtonElement>(".confirm")?.click();
    await nextTick();
    expect(m.saved).toEqual([1]);
    m.unmount();
  });

  it("押せない番号は押しても登録も確認もしない", async () => {
    const m = mount([unit(1)]);
    m.slot(5).click();
    await nextTick();
    expect(m.saved).toEqual([]);
    expect(m.host.querySelector(".confirm")).toBeNull();
    m.unmount();
  });
});
