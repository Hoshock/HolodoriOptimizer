// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h } from "vue";

import CardPicker from "./CardPicker.vue";
import { cardById } from "../data";
import { BLOOM_MAX, UNKNOWN_SKILL_TEXT, cardAtBloom } from "../data/bloom";
import type { BloomMap } from "../data/bloom";

/**
 * ピッカーのタイルがどの開花段階の文言を出すかを固定する(2026-09-15 ユーザー指示)。
 * `blooms` を渡さないカード一覧は 5凸、渡す入口(メンバーピッカー)はその段階。
 * 0凸へ落ちると記録のない段階が「未確認」ばかりになるので、壊れたら気づけるようにテストで押さえる
 */

function mount(blooms?: BloomMap): { texts: string[]; unmount: () => void } {
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(CardPicker, {
        title: "カード一覧",
        mode: "pick",
        skillView: "member",
        pool: [card("nekomata-okayu-02")],
        ...(blooms ? { blooms } : {}),
      }),
  });
  app.mount(host);
  const texts = [...host.querySelectorAll(".skill-text")].map((e) => e.textContent?.trim() ?? "");
  return {
    texts,
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

const card = (id: string) => {
  const c = cardById.get(id);
  if (!c) throw new Error(`${id} がない`);
  return c;
};

describe("CardPicker のタイルが出す開花段階", () => {
  it("blooms を渡さない入口(カード一覧)は 5凸の文言を出す", () => {
    const { texts, unmount } = mount();
    const max = cardAtBloom(card("nekomata-okayu-02"), BLOOM_MAX);
    expect(texts).toContain(max.specialSkill.raw);
    expect(texts).not.toContain(UNKNOWN_SKILL_TEXT);
    unmount();
  });

  it("blooms を渡す入口(メンバーピッカー)はその段階の文言を出す", () => {
    const { texts, unmount } = mount({ "nekomata-okayu-02": 0 });
    // 水着おかゆ 0凸 の SP / アクティブ / パッシブは実機未確認
    expect(texts).toContain(UNKNOWN_SKILL_TEXT);
    unmount();
  });
});
