// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

import ConnectSheet from "./ConnectSheet.vue";
import type { ConnectAnchor, ConnectPlacement } from "../data/connect";

/**
 * コネクトマスの解放(2026-10-04 ユーザー指示): 赤 / 青 / 黄のコネクトは通常マスと同じく解放が必要(1 Pt)。解放の状態は効果の配置とは別。
 * 未解放のあいだは形・倍率を入れられず、「コネクトマスを解放 1 Pt」を出す(直前まで解放していて予算が足りるときだけ押せる)。
 * 解放済みの非中心は「コネクトマスを解除」ができる。中心は常に解放済みで、解放・解除の対象ではない
 */
interface Props {
  anchor?: ConnectAnchor;
  placement?: ConnectPlacement | null;
  unlocked?: boolean;
  canUnlock?: boolean;
  lockImpact?: number;
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
        lockImpact: props.lockImpact,
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
    shapes: () => [...host.querySelectorAll<HTMLButtonElement>("button.shape")],
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

describe("未解放のコネクトマス", () => {
  it("「コネクトマスを解放 1 Pt」のボタンだけを置き(見出し・説明文は出さない)、形のタイルは選べない(配置は禁止)", async () => {
    const { host, button, shapes, events, unmount } = mount({ unlocked: false, canUnlock: true });
    expect(host.textContent).not.toContain("未解放");
    expect(host.querySelector(".locked-box")?.querySelectorAll("p")).toHaveLength(0);
    const unlock = button("コネクトマスを解放");
    expect(unlock?.textContent).toContain("1 Pt");
    expect(unlock?.disabled).toBe(false);
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
    expect(host.querySelector(".locked-box")?.textContent.trim()).toBe("コネクトマスを解放 1 Pt");
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
    expect(events).toEqual(["lock"]); // 配置も先のマスもないので確認なしで解除
    unmount();
  });

  it("配置がある・先のマスがあるときは、解除の前に確認を挟む(確認するまで解除しない)", async () => {
    const placed = { extent: "card-3" as const, permil: 1600 };
    const { host, button, events, unmount } = mount({ unlocked: true, placement: placed });
    button("コネクトマスを解除")?.click();
    await nextTick();
    expect(events).toEqual([]);
    expect(document.body.textContent).toContain("置いているコネクト効果");
    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent.trim() === "解除する",
    );
    confirm?.click();
    await nextTick();
    expect(events).toEqual(["lock"]);
    unmount();
    host.remove();
  });

  it("先の解放済みのマスが一緒に外れる数を確認の文に出す", async () => {
    const { button, unmount } = mount({ unlocked: true, lockImpact: 5 });
    button("コネクトマスを解除")?.click();
    await nextTick();
    expect(document.body.textContent).toContain("先の解放済みのマス 5 個");
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
