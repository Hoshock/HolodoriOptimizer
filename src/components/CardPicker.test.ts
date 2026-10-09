// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick } from "vue";

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

/**
 * 絞り込みを切り替えたら一覧を先頭へ戻す（2026-09-30 ユーザー指摘「スクロール位置が保存されてるの使いづらい」）。
 * 0期生のあとに 1期生を選んだら、1期生の途中ではなく先頭から始まる
 */
function mountList(props: Record<string, unknown> = {}): {
  host: HTMLElement;
  unmount: () => void;
} {
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(CardPicker, { title: "カード", mode: "pick", skillView: "member", pool: cards, ...props }),
  });
  app.mount(host);
  return {
    host,
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

describe("CardPicker の絞り込み", () => {
  it("所属を切り替えたら、一覧のスクロール位置を先頭へ戻す", async () => {
    const { host, unmount } = mountList();
    const grid = host.querySelector<HTMLElement>(".grid");
    if (!grid) throw new Error(".grid がない");
    grid.scrollTop = 250;
    expect(grid.scrollTop).toBe(250);
    const chips = host.querySelectorAll<HTMLElement>(".chip-scroll .chip");
    chips[1]?.click();
    await nextTick();
    expect(grid.scrollTop).toBe(0);
    unmount();
  });

  it("1 枚選ぶピッカーは既定ではタイプだけで、所持の絞り込みは出ない", () => {
    const { host, unmount } = mountList();
    expect(host.querySelector(".state-segment")).toBeNull();
    unmount();
  });

  // 開発用の開花文言は ownedIds を渡して「所持」の絞り込みを出す
  it("ownedIds を渡すと「すべて / 所持」が出て、所持カードだけに絞れる", async () => {
    const owned = [card("nekomata-okayu-02"), card("usada-pekora-01")];
    const { host, unmount } = mountList({
      pool: [...owned, card("inugami-korone-01")],
      ownedIds: owned.map((c) => c.id),
      selectedLabel: "所持",
    });
    const tiles = () => host.querySelectorAll("[role=listitem]").length;
    expect(tiles()).toBe(3);
    const seg = host.querySelector(".state-segment");
    if (!seg) throw new Error("状態の絞り込みが出ていない");
    expect(seg.getAttribute("aria-label")).toBe("所持で絞り込み（1つ選択）");
    const buttons = [...seg.querySelectorAll<HTMLElement>("button")];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(["すべて", "所持"]);
    buttons[1]?.click();
    await nextTick();
    expect(tiles()).toBe(2);
    buttons[0]?.click();
    await nextTick();
    expect(tiles()).toBe(3);
    unmount();
  });
});

/**
 * レアリティ（★5 / ★4）の絞り込み（2026-10-09 ユーザー指示 — ADR-022）。カード名の検索はこれに置き換えて廃止した。
 * `rarities` を立てた入口（リーダー・メンバーの固定・所持の登録・カード一覧）だけ出し、既定は ★5。
 * 立てない入口（除外・候補の選択・ガチャ・開花文言）は ★5 だけを並べる
 */
describe("CardPicker のレアリティ", () => {
  const pool = [card("nekomata-okayu-02"), card("nekomata-okayu-star4-01")];
  const names = (host: HTMLElement) =>
    [...host.querySelectorAll(".card-name")].map((e) => e.textContent?.trim() ?? "");

  it("カード名の検索欄はない", () => {
    const { host, unmount } = mountList({ pool, rarities: true });
    expect(host.querySelector("input[type=search]")).toBeNull();
    unmount();
  });

  it("rarities を立てると すべて / ★5 / ★4 の切り替えが出て、既定は ★5。★4 にするとその枚だけ、すべてで両方", async () => {
    const { host, unmount } = mountList({ pool, rarities: true });
    const seg = host.querySelector(".rarity-segment");
    if (!seg) throw new Error("レアリティの絞り込みが出ていない");
    const buttons = [...seg.querySelectorAll<HTMLElement>("button")];
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["すべて", "★5", "★4"]);
    expect(buttons.map((b) => b.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(names(host)).toEqual([card("nekomata-okayu-02").name]);
    buttons[2]?.click();
    await nextTick();
    expect(names(host)).toEqual([card("nekomata-okayu-star4-01").name]);
    buttons[0]?.click();
    await nextTick();
    expect(names(host)).toHaveLength(2);
    unmount();
  });

  it("タイルの右上は 開花 → 星 の順で、星は開花の有無で動かない", () => {
    const { host, unmount } = mountList({ pool, rarities: true, bloomBadge: true, blooms: {} });
    const corner = host.querySelector("[role=listitem] .corner");
    const kids = corner
      ? [...corner.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label"))
      : [];
    expect(kids).toEqual(["開花0", "★5"]);
    unmount();
  });

  it("rarities を立てない入口は切り替えを出さず、★5 だけを並べる", () => {
    const { host, unmount } = mountList({ pool });
    expect(host.querySelector(".rarity-segment")).toBeNull();
    expect(names(host)).toEqual([card("nekomata-okayu-02").name]);
    unmount();
  });

  it("タイルにはレアリティの星が出る", () => {
    const { host, unmount } = mountList({ pool, rarities: true });
    expect(host.querySelector('[role=listitem] [aria-label="★5"]')).not.toBeNull();
    unmount();
  });
});

/**
 * 状態（固定中 / 登録済み / 除外中）に絞っているあいだは、レアリティ・所属・タイプの絞り込みを効かせず disabled にする
 * （2026-10-09 ユーザー指示）。リーダーピッカーの「ホロメン」も同じ扱いで、タイプを選んでいても押せる
 */
describe("CardPicker の絞り込みの排他", () => {
  // ★5 はタイプごとに 1 枚ずつ(ピュア = はあと / ハッピー = ロボ子 / キュート = そら)、★4 はピュアのおかゆ
  const pool = [
    card("akai-haato-01"),
    card("roboco-san-01"),
    card("tokino-sora-01"),
    card("nekomata-okayu-star4-01"),
  ];
  const tiles = (host: HTMLElement) => host.querySelectorAll("[role=listitem]").length;

  it("固定中に絞ると、タイプ・所属・レアリティが disabled になり、固定中のカードを全部（★4 も）出す", async () => {
    const { host, unmount } = mountList({
      mode: "multi",
      rarities: true,
      pool,
      selectedIds: ["nekomata-okayu-star4-01", "roboco-san-01"],
      selectedLabel: "固定中",
    });
    // 先にタイプ(ピュア)で絞っておく
    const typeSeg = host.querySelector(".filter-row .segment:not(.state-segment)");
    [...(typeSeg?.querySelectorAll<HTMLElement>("button") ?? [])]
      .find((b) => b.getAttribute("aria-label") === "ピュア")
      ?.click();
    await nextTick();
    expect(tiles(host)).toBe(1); // ★5 のピュア = はあと
    const state = host.querySelector(".state-segment");
    const fixed = [...(state?.querySelectorAll<HTMLButtonElement>("button") ?? [])][1];
    expect(fixed?.disabled).toBe(false);
    fixed?.click();
    await nextTick();
    expect(tiles(host)).toBe(2);
    expect(
      [...host.querySelectorAll<HTMLButtonElement>(".rarity-segment button")].every(
        (b) => b.disabled,
      ),
    ).toBe(true);
    expect(
      [...host.querySelectorAll<HTMLButtonElement>(".chip-scroll .chip")].every((b) => b.disabled),
    ).toBe(true);
    expect(
      [...(typeSeg?.querySelectorAll<HTMLButtonElement>("button") ?? [])].every((b) => b.disabled),
    ).toBe(true);
    // すべてに戻すとタイプ(ピュア)が効き直す
    [...(state?.querySelectorAll<HTMLElement>("button") ?? [])][0]?.click();
    await nextTick();
    expect(tiles(host)).toBe(1);
    unmount();
  });

  it("リーダーピッカー: タイプを選んでいても「ホロメン」は押せ、そのあいだタイプは disabled。すべてに戻すと効き直す", async () => {
    const { host, unmount } = mountList({ holomenOption: true, pool });
    const row = host.querySelector(".filter-row");
    const typeButtons = [
      ...(row
        ?.querySelector(".segment:not(.state-segment)")
        ?.querySelectorAll<HTMLButtonElement>("button") ?? []),
    ];
    const viewButtons = [
      ...(row?.querySelector(".state-segment")?.querySelectorAll<HTMLButtonElement>("button") ??
        []),
    ];
    typeButtons.find((b) => b.getAttribute("aria-label") === "ピュア")?.click();
    await nextTick();
    expect(tiles(host)).toBe(1);
    expect(viewButtons[1]?.disabled).toBe(false);
    viewButtons[1]?.click();
    await nextTick();
    expect(typeButtons.every((b) => b.disabled)).toBe(true);
    expect(host.querySelectorAll(".holomen-row").length).toBe(3); // ★5 を持つホロメン全員
    viewButtons[0]?.click();
    await nextTick();
    expect(tiles(host)).toBe(1);
    unmount();
  });
});
