// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import FrequencyPlanSheet from "./FrequencyPlanSheet.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { cards } from "../data";

/**
 * 発動頻度の最適化シートの「頻度の固定」（2026-09-30 ユーザー指示「頻度を 0, 4, 8, 12 のいずれかで
 * 固定した再探索を許容する」）。表の推奨の値を押すと選択ダイアログが開き、選んだ値がその行で
 * 選択スタイルになる。探索の中身はエンジン側のテスト（`liveFrequencyOptimizer.test.ts`）で固定している
 */

/** ホロメンがすべて違う 5 枚（シートが使うのは編成のカード ID だけ） */
const ids: string[] = [];
const seen = new Set<string>();
for (const c of cards) {
  if (seen.has(c.holomenId)) continue;
  seen.add(c.holomenId);
  ids.push(c.id);
  if (ids.length === 6) break;
}

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const candidate = {
    leaderId: ids[0],
    memberIds: ids.slice(1),
  } as unknown as CandidateView;
  createApp({ render: () => h(FrequencyPlanSheet, { candidate, onClose: () => undefined }) }).mount(
    host,
  );
  return {
    reset: () => host.querySelector<HTMLButtonElement>(".foot-secondary"),
    optimize: () => host.querySelector<HTMLButtonElement>(".foot-primary"),
    buttons: () => [...host.querySelectorAll<HTMLButtonElement>(".fix-btn")],
    dialog: () =>
      document.body.querySelector<HTMLElement>('[role="dialog"][aria-label]:not(.sheet)'),
    /** ダイアログの中の選択肢（シート本体のモード切り替えと区別する） */
    choices: () => [...document.body.querySelectorAll<HTMLButtonElement>('.dialog [role="radio"]')],
  };
}

const tick = async () => {
  await nextTick();
  await nextTick();
};

describe("FrequencyPlanSheet の頻度固定", () => {
  it("最初は 5 人とも未固定で、ダイアログは開いていない", () => {
    const view = mount();
    expect(view.buttons()).toHaveLength(5);
    expect(view.buttons().some((b) => b.classList.contains("fix-active"))).toBe(false);
    expect(view.dialog()).toBeNull();
  });

  it("押すと おまかせ + 頻度の選択が開き、選ぶとその行だけが固定になって閉じる", async () => {
    const view = mount();
    view.buttons()[0]?.click();
    await tick();
    const labels = view.choices().map((b) => b.textContent.trim());
    expect(labels[0]).toBe("おまかせ");
    expect(labels.slice(1)).toEqual(["+0.0%", "+4.0%", "+8.0%", "+12.0%"]);

    view.choices()[4]?.click();
    await tick();
    expect(view.dialog()).toBeNull();
    const first = view.buttons()[0];
    expect(first?.classList.contains("fix-active")).toBe(true);
    expect(first?.textContent.trim()).toBe("+12.0%");
    expect(view.buttons().filter((b) => b.classList.contains("fix-active"))).toHaveLength(1);
  });

  it("おまかせを選ぶと固定が外れる", async () => {
    const view = mount();
    view.buttons()[1]?.click();
    await tick();
    view.choices()[2]?.click();
    await tick();
    expect(view.buttons()[1]?.classList.contains("fix-active")).toBe(true);

    view.buttons()[1]?.click();
    await tick();
    view.choices()[0]?.click();
    await tick();
    expect(view.buttons()[1]?.classList.contains("fix-active")).toBe(false);
  });

  it("下端のボタン: 固定がないうちは両方 disabled、固定すると最適化だけ押せ、反映後はリセットだけ押せる", async () => {
    const view = mount();
    expect(view.reset()?.disabled).toBe(true);
    expect(view.optimize()?.disabled).toBe(true);

    view.buttons()[2]?.click();
    await tick();
    view.choices()[3]?.click();
    await tick();
    // 選んだだけでは探索し直さない（最適化を押すまで、反映済みの固定と違う）
    expect(view.optimize()?.disabled).toBe(false);
    expect(view.reset()?.disabled).toBe(false);

    view.optimize()?.click();
    await tick();
    expect(view.optimize()?.disabled).toBe(true);
    expect(view.reset()?.disabled).toBe(false);
    expect(view.buttons()[2]?.classList.contains("fix-active")).toBe(true);

    view.reset()?.click();
    await tick();
    expect(view.buttons().some((b) => b.classList.contains("fix-active"))).toBe(false);
    expect(view.reset()?.disabled).toBe(true);
    expect(view.optimize()?.disabled).toBe(true);
  });

  it("反映したあとで固定を外すと、その状態でも最適化を押せる（固定なしで探索し直す）", async () => {
    const view = mount();
    view.buttons()[0]?.click();
    await tick();
    view.choices()[1]?.click();
    await tick();
    view.optimize()?.click();
    await tick();

    view.buttons()[0]?.click();
    await tick();
    view.choices()[0]?.click();
    await tick();
    expect(view.optimize()?.disabled).toBe(false);
  });
});
