// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h } from "vue";

import CardPicker from "./CardPicker.vue";
import { cardById, cards } from "../data";
import { BLOOM_MAX, UNKNOWN_SKILL_TEXT, cardAtBloom } from "../data/bloom";
import { isBloomTextVerified } from "../data/bloomEvidence";
import type { BloomMap } from "../data/bloom";

/**
 * ピッカーのタイルがどの開花段階の文言を出すかを固定する(2026-09-15 ユーザー指示)。
 * `blooms` を渡さないカード一覧は 5凸、渡す入口(メンバーピッカー)はその段階。
 * 0凸へ落ちると記録のない段階が「未確認」ばかりになるので、壊れたら気づけるようにテストで押さえる
 */

function mount(
  blooms?: BloomMap,
  opts: { dimUnverified?: boolean; cardId?: string } = {},
): { texts: string[]; dimmed: number; unmount: () => void } {
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(CardPicker, {
        title: "カード一覧",
        mode: "pick",
        skillView: "member",
        pool: [card(opts.cardId ?? "nekomata-okayu-02")],
        ...(opts.dimUnverified === true ? { dimUnverified: true } : {}),
        ...(blooms ? { blooms } : {}),
      }),
  });
  app.mount(host);
  const texts = [...host.querySelectorAll(".skill-text")].map((e) => e.textContent?.trim() ?? "");
  const dimmed = host.querySelectorAll(".skills.dim .skill-text").length;
  return {
    texts,
    dimmed,
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

/**
 * 実機確認（開花文言フォーム）をまだ通していないカードは、カード一覧でスキル文言を淡色にする
 * （2026-09-15 ユーザー指示。確認を通したカードは淡くしない）
 */
describe("CardPicker の淡色表示", () => {
  // まだ確認していないカードは確認が進むたびに減るので、id を固定せず先頭の 1 枚を使う
  const unverifiedId = (): string => {
    const found = cards.find((c) => !isBloomTextVerified(c.id));
    if (!found) throw new Error("確認がまだのカードがない");
    return found.id;
  };

  it("dimUnverified を立てると、確認がまだのカードだけ淡色になる", () => {
    const unverified = mount(undefined, { dimUnverified: true, cardId: unverifiedId() });
    expect(unverified.dimmed).toBeGreaterThan(0);
    unverified.unmount();

    const verified = mount(undefined, { dimUnverified: true, cardId: "nekomata-okayu-02" });
    expect(verified.dimmed).toBe(0);
    verified.unmount();
  });

  it("dimUnverified を立てない入口（メンバーピッカーなど）では淡色にしない", () => {
    const { dimmed, unmount } = mount(undefined, { cardId: unverifiedId() });
    expect(dimmed).toBe(0);
    unmount();
  });
});
