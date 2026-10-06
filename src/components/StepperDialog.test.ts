// @vitest-environment happy-dom
import { createApp, h, nextTick } from "vue";
import { describe, expect, it } from "vite-plus/test";

import StepperDialog from "./StepperDialog.vue";

/** +/- ダイアログ(2026-10-06 ユーザー指示。ランク 30 の 1・10 刻み / メモリー 3.0 の 0.1・1.0 刻み / 強化ボーナス 2.00 の 0.01・0.1 刻み) */

function mount(props: Record<string, unknown>) {
  const events: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(StepperDialog, {
        label: "テスト",
        value: null,
        initial: 30,
        unit: "",
        decimals: 0,
        min: 1,
        max: 50,
        fine: 1,
        coarse: 10,
        ...props,
        onSubmit: (v: number) => events.push(`submit:${String(v)}`),
        onClear: () => events.push("clear"),
        onCancel: () => events.push("cancel"),
      }),
  });
  app.mount(host);
  const press = async (text: string): Promise<void> => {
    const el = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent.trim() === text,
    );
    if (!el) throw new Error(`button not found: ${text}`);
    el.click();
    await nextTick();
  };
  return {
    events,
    press,
    labels: () => [...host.querySelectorAll(".keys .key")].map((e) => e.textContent.trim()),
    num: () => host.querySelector(".num")?.textContent ?? "",
    disabled: (text: string) =>
      [...host.querySelectorAll<HTMLButtonElement>(".keys .key")].find(
        (b) => b.textContent.trim() === text,
      )?.disabled,
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

describe("StepperDialog", () => {
  it("ランク: 未登録は 30 から始まり、1 ずつと 10 ずつ動く。範囲(1〜50)の端では押せない", async () => {
    const m = mount({});
    expect(m.num()).toBe("30");
    expect(m.labels()).toEqual(["−10", "−1", "+1", "+10"]);
    await m.press("+10");
    await m.press("+10");
    expect(m.num()).toBe("50");
    expect(m.disabled("+1")).toBe(true);
    expect(m.disabled("+10")).toBe(true);
    await m.press("−1");
    expect(m.num()).toBe("49");
    await m.press("決定");
    expect(m.events).toEqual(["submit:49"]);
    m.unmount();
  });

  it("登録済みは現在値から始まり、下限 1 より下へは行かない", async () => {
    const m = mount({ value: 8 });
    expect(m.num()).toBe("8");
    await m.press("−10");
    expect(m.num()).toBe("1");
    expect(m.disabled("−1")).toBe(true);
    m.unmount();
  });

  it("メモリー: 3.0 から 0.1 と 1.0 刻み(小数の誤差を出さない)", async () => {
    const m = mount({
      value: 3,
      initial: 3,
      unit: "%",
      decimals: 1,
      min: 0,
      max: 50,
      fine: 0.1,
      coarse: 1,
    });
    expect(m.labels()).toEqual(["−1.0", "−0.1", "+0.1", "+1.0"]);
    for (let i = 0; i < 3; i += 1) await m.press("+0.1");
    expect(m.num()).toBe("3.3");
    await m.press("+1.0");
    expect(m.num()).toBe("4.3");
    await m.press("決定");
    expect(m.events).toEqual(["submit:4.3"]);
    m.unmount();
  });

  it("強化ボーナス: 2.00 から 0.01 と 0.1 刻み。0 より下へは行かない", async () => {
    const m = mount({
      value: 2,
      initial: 2,
      unit: "%",
      decimals: 2,
      min: 0,
      max: 50,
      fine: 0.01,
      coarse: 0.1,
    });
    expect(m.labels()).toEqual(["−0.10", "−0.01", "+0.01", "+0.10"]);
    await m.press("+0.01");
    await m.press("+0.01");
    await m.press("+0.01");
    expect(m.num()).toBe("2.03");
    for (let i = 0; i < 25; i += 1) await m.press("−0.10");
    expect(m.num()).toBe("0.00");
    expect(m.disabled("−0.01")).toBe(true);
    m.unmount();
  });

  it("キャンセルと「未登録に戻す」(clearLabel があるときだけ)", async () => {
    const m = mount({ clearLabel: "未登録に戻す" });
    await m.press("キャンセル");
    await m.press("未登録に戻す");
    expect(m.events).toEqual(["cancel", "clear"]);
    m.unmount();
    const plain = mount({});
    await expect(plain.press("未登録に戻す")).rejects.toThrow();
    plain.unmount();
  });
});
