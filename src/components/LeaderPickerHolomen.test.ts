// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import CardPicker from "./CardPicker.vue";
import { cards } from "../data";

/**
 * リーダーピッカーの「ホロメン」表示（2026-09-30 ユーザー指示）。
 * 左半分 = タイプ（すべて / C / H / P）、右半分 = すべて / ホロメン。片方を選ぶともう片方は「すべて」に戻って無効になる。
 * ホロメンは同じホロメンの別カードを区別せず 1 人 1 行
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

  it("ホロメンを選ぶと 1 人 1 行になり、左のタイプは「すべて」に戻って無効になる", async () => {
    const v = mount();
    v.typeButtons()[1]?.click(); // C
    await tick();
    v.viewButtons()[1]?.click(); // ホロメン（タイプ選択中は無効なので何も起きない）
    await tick();
    expect(v.rows()).toHaveLength(0);

    v.typeButtons()[0]?.click(); // すべて に戻す
    await tick();
    v.viewButtons()[1]?.click();
    await tick();
    expect(v.rows()).toHaveLength(new Set(cards.map((c) => c.holomenId)).size);
    expect(v.typeButtons().every((b) => b.disabled)).toBe(true);
    expect(checked(v.typeButtons()[0])).toBe(true);
    expect(checked(v.viewButtons()[1])).toBe(true);
  });

  it("タイプを選ぶと右は「すべて」のまま無効になる", async () => {
    const v = mount();
    v.typeButtons()[2]?.click(); // H
    await tick();
    expect(v.viewButtons().every((b) => b.disabled)).toBe(true);
    expect(checked(v.viewButtons()[0])).toBe(true);
  });

  it("ホロメンの表示からタイプは選べず、「すべて」へ戻すとタイプが選べる", async () => {
    const v = mount();
    v.viewButtons()[1]?.click();
    await tick();
    v.viewButtons()[0]?.click();
    await tick();
    expect(v.typeButtons().some((b) => b.disabled)).toBe(false);
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
