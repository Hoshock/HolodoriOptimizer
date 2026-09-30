import { describe, expect, it } from "vite-plus/test";
import { nextTick, ref, shallowRef } from "vue";

import { useScrollTopOnChange } from "./useScrollTopOnChange";

/** 一覧の要素の代わり（scrollTop だけ見る） */
const fakeList = (scrollTop: number) => shallowRef({ scrollTop } as HTMLElement | null);

describe("useScrollTopOnChange", () => {
  it("渡した絞り込みの値が変わったら、一覧を先頭へ戻す", async () => {
    const list = fakeList(320);
    const affiliation = ref<string | null>(null);
    useScrollTopOnChange(list, [affiliation]);
    affiliation.value = "gen1";
    await nextTick();
    expect(list.value?.scrollTop).toBe(0);
  });

  it("どの値が変わっても戻す（複数の絞り込み・並び替えのゲッターも）", async () => {
    const list = fakeList(0);
    const query = ref("");
    const direction = ref({ name: "asc" });
    useScrollTopOnChange(list, [query, () => direction.value.name]);
    for (const change of [
      () => (query.value = "ぺこ"),
      () => (direction.value = { name: "desc" }),
    ]) {
      if (list.value) list.value.scrollTop = 200;
      change();
      await nextTick();
      expect(list.value?.scrollTop).toBe(0);
    }
  });

  it("絞り込みに関わらない変化では動かさない（渡していない値の変化）", async () => {
    const list = fakeList(200);
    const affiliation = ref<string | null>(null);
    const selected = ref<string[]>([]);
    useScrollTopOnChange(list, [affiliation]);
    selected.value = ["a"]; // タイルのタップによる選択の切り替え相当
    await nextTick();
    expect(list.value?.scrollTop).toBe(200);
  });

  it("値が変わらなければ動かさず、一覧の要素がまだなくても落ちない", async () => {
    const list = fakeList(150);
    const affiliation = ref<string | null>("gen1");
    useScrollTopOnChange(list, [affiliation]);
    affiliation.value = "gen1";
    await nextTick();
    expect(list.value?.scrollTop).toBe(150);

    list.value = null;
    affiliation.value = "gen2";
    await nextTick();
    expect(list.value).toBeNull();
  });
});
