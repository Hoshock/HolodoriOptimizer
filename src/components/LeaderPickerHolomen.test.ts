// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import CardPicker from "./CardPicker.vue";
import { cards } from "../data";

/**
 * リーダーピッカーの「ホロメン」表示（2026-09-30 ユーザー指示）。
 * 左半分 = タイプ（すべて / C / H / P）、右半分 = すべて / ホロメン。「ホロメン」のあいだタイプは効かず disabled（値は保つ）で、
 * タイプを選んでいても「ホロメン」は押せる（2026-10-09 ユーザー指示）。ホロメンは同じホロメンの別カードを区別せず 1 人 1 行
 */
function mount(extra: Record<string, unknown> = {}) {
  const picked: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  createApp({
    render: () =>
      h(CardPicker, {
        title: "リーダー",
        mode: "pick",
        skillView: "costume",
        holomenOption: true,
        onPickHolomen: (id: string) => picked.push(id),
        ...extra,
      }),
  }).mount(host);
  const segs = () => [...host.querySelectorAll<HTMLElement>(".filter-row .segment")];
  const buttons = (i: number) => [
    ...(segs()[i]?.querySelectorAll<HTMLButtonElement>("button") ?? []),
  ];
  return {
    host,
    picked,
    typeButtons: () => buttons(0),
    viewButtons: () => buttons(1),
    rows: () => [...host.querySelectorAll<HTMLButtonElement>(".holomen-row")],
    tiles: () => host.querySelectorAll(".grid [role='listitem']").length,
  };
}

const tick = async () => {
  await nextTick();
  await nextTick();
};
const checked = (b: HTMLElement | undefined) => b?.getAttribute("aria-checked") === "true";

describe("リーダーピッカーのホロメン表示", () => {
  it("左にタイプ（すべて / C / H / P）、右に すべて / ホロメン があり、最初はカードの一覧", () => {
    const v = mount();
    expect(v.typeButtons().map((b) => b.textContent.trim())).toEqual(["すべて", "C", "H", "P"]);
    expect(v.viewButtons().map((b) => b.textContent.trim())).toEqual(["すべて", "ホロメン"]);
    expect(v.rows()).toHaveLength(0);
    expect(v.tiles()).toBeGreaterThan(0);
  });

  it("タイプを選んでいても「ホロメン」は押せ、1 人 1 行になる。そのあいだタイプは値を保ったまま無効", async () => {
    const v = mount();
    v.typeButtons()[1]?.click(); // C
    await tick();
    expect(v.rows()).toHaveLength(0);
    expect(v.viewButtons().every((b) => !b.disabled)).toBe(true);
    v.viewButtons()[1]?.click(); // ホロメン
    await tick();
    expect(v.rows()).toHaveLength(new Set(cards.map((c) => c.holomenId)).size);
    expect(v.typeButtons().every((b) => b.disabled)).toBe(true);
    expect(checked(v.typeButtons()[1])).toBe(true); // C は保ったまま
    expect(checked(v.viewButtons()[1])).toBe(true);
  });

  it("「すべて」へ戻すとタイプが効き直す（C のカードだけになる）", async () => {
    const v = mount();
    v.typeButtons()[1]?.click(); // C
    await tick();
    const cuteTiles = v.tiles();
    v.viewButtons()[1]?.click();
    await tick();
    v.viewButtons()[0]?.click();
    await tick();
    expect(v.typeButtons().some((b) => b.disabled)).toBe(false);
    expect(v.tiles()).toBe(cuteTiles);
    expect(v.tiles()).toBeGreaterThan(0);
  });

  it("行を押すとそのホロメンの ID を返す。選べるカードがないホロメンは無効", async () => {
    const target = cards[0];
    if (!target) throw new Error("カードがない");
    const disabled = new Map(
      cards.filter((c) => c.holomenId === target.holomenId).map((c) => [c.id, "除外中"]),
    );
    const v = mount({ disabled });
    v.viewButtons()[1]?.click();
    await tick();
    const rows = v.rows();
    expect(rows.filter((r) => r.disabled)).toHaveLength(1);
    rows.find((r) => !r.disabled)?.click();
    await tick();
    expect(v.picked).toHaveLength(1);
    expect(v.picked[0]).not.toBe(target.holomenId);
  });

  it("選択中のホロメンがあれば、ホロメンの表示で開く", () => {
    const target = cards[0];
    if (!target) throw new Error("カードがない");
    const v = mount({ selectedHolomenId: target.holomenId });
    expect(v.rows().length).toBeGreaterThan(0);
    expect(checked(v.viewButtons()[1])).toBe(true);
    expect(v.typeButtons().every((b) => b.disabled)).toBe(true);
  });
});
