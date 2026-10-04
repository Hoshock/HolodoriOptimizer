// @vitest-environment happy-dom
import { createApp, h } from "vue";
import { describe, expect, it } from "vite-plus/test";

import NumberPad from "./NumberPad.vue";

/** テンキーの ∞ キー(リソースの未登録 = ∞。2026-10-04 ユーザー指示)。小数点のキーの位置に出て、決定すると clear を出す */

function mount(props: Record<string, unknown>) {
  const events: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(NumberPad, {
        label: "赤のキューブ",
        value: 0,
        unit: "個",
        decimals: 0,
        ...props,
        onSubmit: (v: number) => events.push(`submit:${String(v)}`),
        onClear: () => events.push("clear"),
        onCancel: () => events.push("cancel"),
      }),
  });
  app.mount(host);
  const key = (text: string): HTMLButtonElement => {
    const el = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent.trim() === text,
    );
    if (!el) throw new Error(`key not found: ${text}`);
    return el;
  };
  return {
    events,
    key,
    display: () => host.querySelector(".display")?.textContent.replace(/\s+/g, "") ?? "",
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

describe("NumberPad の ∞ キー", () => {
  it("infinityKey のとき小数点のキーが ∞ になり、押すと ∞ と出て、決定で clear を出す", () => {
    const m = mount({ infinityKey: true });
    expect(() => m.key(".")).toThrow();
    m.key("5").click();
    m.key("∞").click();
    return Promise.resolve().then(() => {
      expect(m.display()).toBe("∞");
      m.key("決定").click();
      expect(m.events).toEqual(["clear"]);
      m.unmount();
    });
  });

  it("∞ のあとに数字を打つと ∞ が外れて数値で決定できる", async () => {
    const m = mount({ infinityKey: true, infinite: true });
    expect(m.display()).toBe("∞");
    m.key("7").click();
    await Promise.resolve();
    expect(m.display()).toBe("7個");
    m.key("決定").click();
    expect(m.events).toEqual(["submit:7"]);
    m.unmount();
  });

  it("infinityKey なしでは従来どおり(小数点のキーがあり、∞ は出ない)", () => {
    const m = mount({ decimals: 1 });
    expect(() => m.key("∞")).toThrow();
    expect(m.key(".").disabled).toBe(false);
    m.unmount();
  });
});
