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
 * 絞り込みの形（2026-10-11 ユーザー指示）: 1 行目 = 左半分に検索欄・右半分に状態（すべて / 登録中など）か「すべて / ホロメン」、
 * 2 行目 = 所属、3 行目 = 左半分にレアリティ・右半分にタイプ（すべて / C / H / P）。切り替えのない入口は検索欄が 1 行を占め、
 * レアリティのない入口はタイプが 1 行を占めて名前のまま
 */
describe("CardPicker の絞り込みの形", () => {
  const rowsOf = (host: HTMLElement) => [
    ...host.querySelectorAll<HTMLElement>(".controls > .filter-row"),
  ];

  it("所持の登録: 1 行目に検索欄と すべて / 登録中、3 行目にレアリティと C / H / P", () => {
    const { host, unmount } = mountList({
      mode: "multi",
      rarities: true,
      selectedIds: [],
      selectedLabel: "登録中",
    });
    const [first, third] = rowsOf(host);
    expect(first?.querySelector("input[type=search]")).not.toBeNull();
    expect(
      [...(first?.querySelectorAll(".state-segment button") ?? [])].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(["すべて", "登録中"]);
    expect(third?.querySelector(".rarity-segment")).not.toBeNull();
    expect(
      [...(third?.querySelectorAll(".type-segment button") ?? [])].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(["すべて", "C", "H", "P"]);
    // 2 行目は所属
    expect(first?.nextElementSibling?.classList.contains("chip-scroll-wrap")).toBe(true);
    unmount();
  });

  it("切り替えもレアリティもない入口（ガチャのピックアップ）: 検索欄とタイプがそれぞれ 1 行を占め、タイプは名前のまま", () => {
    const { host, unmount } = mountList();
    const [first, third] = rowsOf(host);
    expect(first?.classList.contains("single")).toBe(true);
    expect(first?.querySelector(".state-segment")).toBeNull();
    expect(third?.classList.contains("single")).toBe(true);
    expect(
      [...(third?.querySelectorAll(".type-segment button") ?? [])].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(["すべて", "キュート", "ハッピー", "ピュア"]);
    unmount();
  });

  it("検索欄はホロメン名・カード名・読みで絞る", async () => {
    const { host, unmount } = mountList({
      pool: [card("nekomata-okayu-02"), card("usada-pekora-01"), card("inugami-korone-01")],
    });
    const input = host.querySelector<HTMLInputElement>("input[type=search]");
    if (!input) throw new Error("検索欄がない");
    const tiles = () => host.querySelectorAll("[role=listitem]").length;
    input.value = "ぺこら";
    input.dispatchEvent(new Event("input"));
    await nextTick();
    expect(tiles()).toBe(1);
    input.value = "";
    input.dispatchEvent(new Event("input"));
    await nextTick();
    expect(tiles()).toBe(3);
    unmount();
  });

  it("並びはホロメン順（五十音順ではない）→ 同じホロメンは ★5 が先", async () => {
    const { host, unmount } = mountList({
      rarities: true,
      pool: [
        card("akai-haato-01"),
        card("nekomata-okayu-star4-01"),
        card("tokino-sora-01"),
        card("nekomata-okayu-02"),
        card("roboco-san-01"),
      ],
    });
    // 既定の ★5 をすべてにする
    host.querySelectorAll<HTMLElement>(".rarity-segment button")[0]?.click();
    await nextTick();
    const order = [...host.querySelectorAll<HTMLElement>("[role=listitem] .card-name")].map((e) =>
      e.textContent?.trim(),
    );
    expect(order).toEqual(
      [
        "tokino-sora-01", // 0期生
        "roboco-san-01",
        "akai-haato-01", // 1期生
        "nekomata-okayu-02", // ゲーマーズ。★5 が先
        "nekomata-okayu-star4-01",
      ].map((id) => card(id).name),
    );
    unmount();
  });
});

/**
 * レアリティ（★5 / ★4）の絞り込み（2026-10-09 ユーザー指示 — ADR-022）。
 * `rarities` を立てた入口（リーダー・メンバーの固定・所持の登録・カード一覧）だけ出し、既定は ★5。
 * 立てない入口（除外・候補の選択・ガチャ・開花文言）は ★5 だけを並べる
 */
describe("CardPicker のレアリティ", () => {
  const pool = [card("nekomata-okayu-02"), card("nekomata-okayu-star4-01")];
  const names = (host: HTMLElement) =>
    [...host.querySelectorAll(".card-name")].map((e) => e.textContent?.trim() ?? "");

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
 * 連動して効かない絞り込み（2026-10-11 ユーザー指示）: 止めているあいだは**効いている値（検索は空・ほかは「すべて」）を見せて
 * disabled** にし、止める理由が外れたら選んでいた値に戻す。状態で止めるのはメンバーの固定（たかだか 5 枚）だけで、
 * 所持の登録などはほかの絞り込みと重ねて効かせる。リーダーピッカーの「ホロメン」のあいだはレアリティとタイプを止める
 */
describe("CardPicker の連動して効かない絞り込み", () => {
  // ★5 はタイプごとに 1 枚ずつ(ピュア = はあと / ハッピー = ロボ子 / キュート = そら)、★4 はピュアのおかゆ
  const pool = [
    card("akai-haato-01"),
    card("roboco-san-01"),
    card("tokino-sora-01"),
    card("nekomata-okayu-star4-01"),
  ];
  const tiles = (host: HTMLElement) => host.querySelectorAll("[role=listitem]").length;
  const typeButtons = (host: HTMLElement) => [
    ...host.querySelectorAll<HTMLButtonElement>(".type-segment button"),
  ];
  const stateButtons = (host: HTMLElement) => [
    ...host.querySelectorAll<HTMLButtonElement>(".state-segment button"),
  ];
  const checkedLabels = (buttons: HTMLElement[]) =>
    buttons
      .filter((b) => b.getAttribute("aria-checked") === "true")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim());
  const pure = (host: HTMLElement) =>
    typeButtons(host)
      .find((b) => b.getAttribute("aria-label") === "ピュア")
      ?.click();

  it("メンバーの固定: 固定中に絞ると検索・所属・レアリティ・タイプが「すべて」の見た目で disabled になり、戻すと選んでいた値が効き直す", async () => {
    const { host, unmount } = mountList({
      mode: "multi",
      rarities: true,
      pool,
      selectedIds: ["nekomata-okayu-star4-01", "roboco-san-01"],
      selectedLabel: "固定中",
      stateLocksFilters: true,
    });
    const input = host.querySelector<HTMLInputElement>("input[type=search]");
    if (!input) throw new Error("検索欄がない");
    input.value = "あかい";
    input.dispatchEvent(new Event("input"));
    pure(host);
    await nextTick();
    expect(tiles(host)).toBe(1); // ★5 のピュア = はあと
    stateButtons(host)[1]?.click();
    await nextTick();
    expect(tiles(host)).toBe(2); // 固定中を全部(★4 も)
    expect(input.disabled).toBe(true);
    expect(input.value).toBe("");
    const rarity = [...host.querySelectorAll<HTMLButtonElement>(".rarity-segment button")];
    const chips = [...host.querySelectorAll<HTMLButtonElement>(".chip-scroll .chip")];
    for (const buttons of [rarity, chips, typeButtons(host)]) {
      expect(buttons.every((b) => b.disabled)).toBe(true);
      expect(checkedLabels(buttons)).toEqual(["すべて"]);
    }
    // すべてに戻すと検索・タイプ(ピュア)・レアリティ(★5)が戻る
    stateButtons(host)[0]?.click();
    await nextTick();
    expect(input.disabled).toBe(false);
    expect(input.value).toBe("あかい");
    expect(checkedLabels(typeButtons(host))).toEqual(["ピュア"]);
    expect(checkedLabels(rarity)).toEqual(["★5"]);
    expect(tiles(host)).toBe(1);
    unmount();
  });

  it("所持の登録: 登録中に絞ってもほかの絞り込みは止めず、重ねて効く", async () => {
    const { host, unmount } = mountList({
      mode: "multi",
      rarities: true,
      pool,
      selectedIds: ["akai-haato-01", "roboco-san-01", "nekomata-okayu-star4-01"],
      selectedLabel: "登録中",
    });
    stateButtons(host)[1]?.click();
    await nextTick();
    expect(tiles(host)).toBe(2); // 登録中の ★5
    expect(typeButtons(host).some((b) => b.disabled)).toBe(false);
    pure(host);
    await nextTick();
    expect(tiles(host)).toBe(1); // 登録中の ★5 のピュア = はあと
    unmount();
  });

  it("リーダーピッカー: タイプを選んでいても「ホロメン」は押せ、そのあいだタイプは「すべて」の見た目で disabled。戻すと効き直す", async () => {
    const { host, unmount } = mountList({ holomenOption: true, pool });
    pure(host);
    await nextTick();
    expect(tiles(host)).toBe(1);
    expect(stateButtons(host)[1]?.disabled).toBe(false);
    stateButtons(host)[1]?.click();
    await nextTick();
    expect(typeButtons(host).every((b) => b.disabled)).toBe(true);
    expect(checkedLabels(typeButtons(host))).toEqual(["すべて"]);
    expect(host.querySelectorAll(".holomen-row").length).toBe(3); // ★5 を持つホロメン全員
    stateButtons(host)[0]?.click();
    await nextTick();
    expect(checkedLabels(typeButtons(host))).toEqual(["ピュア"]);
    expect(tiles(host)).toBe(1);
    unmount();
  });

  it("リーダーピッカー: 「ホロメン」のあいだレアリティは「すべて」の見た目で disabled（★4 だけのホロメンも出る）。戻すと ★5 が効き直す", async () => {
    const { host, unmount } = mountList({ holomenOption: true, rarities: true, pool });
    const rarityButtons = [...host.querySelectorAll<HTMLButtonElement>(".rarity-segment button")];
    expect(rarityButtons.every((b) => b.disabled)).toBe(false);
    expect(tiles(host)).toBe(3); // 既定の ★5
    stateButtons(host)[1]?.click();
    await nextTick();
    expect(rarityButtons.every((b) => b.disabled)).toBe(true);
    expect(host.querySelector(".rarity-segment")?.classList.contains("is-disabled")).toBe(true);
    expect(checkedLabels(rarityButtons)).toEqual(["すべて"]);
    expect(host.querySelectorAll(".holomen-row").length).toBe(4); // ★4 のおかゆも
    stateButtons(host)[0]?.click();
    await nextTick();
    expect(rarityButtons.every((b) => b.disabled)).toBe(false);
    expect(checkedLabels(rarityButtons)).toEqual(["★5"]);
    expect(tiles(host)).toBe(3);
    unmount();
  });

  it("リーダーピッカー: 「ホロメン」の行はホロメン順で、検索と所属が効く", async () => {
    const { host, unmount } = mountList({ holomenOption: true, pool });
    stateButtons(host)[1]?.click();
    await nextTick();
    const names = () =>
      [...host.querySelectorAll(".holomen-row .holomen-name")].map((e) => e.textContent?.trim());
    expect(names()).toEqual(["ときのそら", "ロボ子さん", "赤井はあと"]);
    const input = host.querySelector<HTMLInputElement>("input[type=search]");
    if (!input) throw new Error("検索欄がない");
    input.value = "ろぼ";
    input.dispatchEvent(new Event("input"));
    await nextTick();
    expect(names()).toEqual(["ロボ子さん"]);
    unmount();
  });
});
