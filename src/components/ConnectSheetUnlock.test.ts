// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import ConnectSheet from "./ConnectSheet.vue";
import type { ConnectAnchor, ConnectPlacement } from "../data/connect";

/**
 * コネクトマスの解放(2026-10-04 ユーザー指示): 赤 / 青 / 黄のコネクトは通常マスと同じく解放が必要(1 Pt)。解放の状態は効果の配置とは別。
 * 未解放のあいだは形・倍率を入れられず、「コネクトマスを解放」を出す(直前まで解放していて予算が足りるときだけ押せる)。
 * 解放済みの非中心は「コネクトマスを解除」ができる。2 つは左右に等幅で並べ、Pt の表記は置かない(2026-10-10 ユーザー指示)。中心は常に解放済みで、解放・解除の対象ではない
 */
interface Props {
  anchor?: ConnectAnchor;
  placement?: ConnectPlacement | null;
  unlocked?: boolean;
  canUnlock?: boolean;
}
function mount(props: Props) {
  const host = document.createElement("div");
  document.body.append(host);
  const events: string[] = [];
  const app = createApp({
    render: () =>
      h(ConnectSheet, {
        holomenId: "nekomata-okayu",
        anchor: props.anchor ?? "card",
        color: "blue",
        placement: props.placement ?? null,
        allPlacements: {},
        inventory: [],
        unlocked: props.unlocked,
        canUnlock: props.canUnlock,
        onSubmit: () => events.push("submit"),
        onClear: () => events.push("clear"),
        onUnlock: () => events.push("unlock"),
        onLock: () => events.push("lock"),
      }),
  });
  app.mount(host);
  const button = (text: string): HTMLButtonElement | undefined =>
    [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      b.textContent.includes(text),
    );
  return {
    host,
    events,
    button,
    shapes: () => [...host.querySelectorAll<HTMLButtonElement>("button.shape:not(.remove)")],
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

describe("未解放のコネクトマス", () => {
  it("「コネクトマスを解放」と(押せない)「コネクトマスを解除」だけを置き(見出し・説明文・Pt は出さない)、形のタイルは選べない(配置は禁止)", async () => {
    const { host, button, shapes, events, unmount } = mount({ unlocked: false, canUnlock: true });
    expect(host.textContent).not.toContain("未解放");
    expect(host.querySelector(".locked-box")?.querySelectorAll("p")).toHaveLength(0);
    const unlock = button("コネクトマスを解放");
    expect(unlock?.textContent).not.toContain("Pt");
    expect(unlock?.disabled).toBe(false);
    expect(button("コネクトマスを解除")?.disabled).toBe(true);
    expect(shapes().every((b) => b.disabled)).toBe(true);
    shapes()[0]?.click();
    await nextTick();
    expect(host.querySelector('[role="radiogroup"]')).toBeNull(); // 倍率のダイアログは開かない
    expect(events).toEqual([]);
    unlock?.click();
    await nextTick();
    expect(events).toEqual(["unlock"]);
    unmount();
  });

  it("解放できないとき(直前まで解放していない・予算不足)は disabled で、理由の文は出さない", () => {
    const { host, button, unmount } = mount({ unlocked: false, canUnlock: false });
    expect(button("コネクトマスを解放")?.disabled).toBe(true);
    expect(
      [...(host.querySelector(".locked-box")?.querySelectorAll("button") ?? [])].map((b) =>
        b.textContent.trim(),
      ),
    ).toEqual(["コネクトマスを解除", "コネクトマスを解放"]); // 解放は右
    unmount();
  });
});

describe("解放済みのコネクトマス", () => {
  it("形を選べ(従来どおり)、解放済みで配置なしでも「コネクトマスを解除」ができる", async () => {
    const { button, shapes, events, unmount } = mount({ unlocked: true });
    expect(button("コネクトマスを解放")?.disabled).toBe(true); // 解放済みのときも出し、disabled
    expect(shapes().every((b) => !b.disabled)).toBe(true);
    button("コネクトマスを解除")?.click();
    await nextTick();
    expect(events).toEqual(["lock"]);
    unmount();
  });

  it("配置があっても確認を挟まずに解除する(ボード画面の戻るで配置ごと戻せる — 2026-10-10)", async () => {
    const placed = { extent: "card-3" as const, permil: 1600 };
    const { button, events, unmount } = mount({ unlocked: true, placement: placed });
    button("コネクトマスを解除")?.click();
    await nextTick();
    expect(events).toEqual(["lock"]);
    expect(document.body.textContent).not.toContain("解除しますか");
    unmount();
  });

  it("中心は常に解放済みで、解放・解除のボタンは出ない(従来どおり配置できる)", () => {
    const { button, shapes, unmount } = mount({ anchor: "center" });
    expect(button("コネクトマスを解除")).toBeUndefined();
    expect(button("コネクトマスを解放")).toBeUndefined();
    expect(shapes().every((b) => !b.disabled)).toBe(true);
    unmount();
  });
});
