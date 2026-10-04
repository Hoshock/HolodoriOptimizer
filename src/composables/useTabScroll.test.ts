import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it } from "vite-plus/test";

import { useTabScroll } from "./useTabScroll";

describe("useTabScroll", () => {
  it("切替先ごとにスクロール位置を別々に覚え、初めての切替先は先頭から始める", async () => {
    const el = { scrollTop: 0 } as HTMLElement;
    const key = ref("unit");
    effectScope().run(() => useTabScroll(ref(el), () => key.value));

    el.scrollTop = 300;
    key.value = "all";
    await nextTick();
    expect(el.scrollTop).toBe(0);

    el.scrollTop = 80;
    key.value = "unit";
    await nextTick();
    expect(el.scrollTop).toBe(300);

    key.value = "all";
    await nextTick();
    expect(el.scrollTop).toBe(80);
  });
});
