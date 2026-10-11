import { describe, expect, it } from "vite-plus/test";

import { cards, holomen, holomenById } from "../data";
import { AFFILIATION_ORDER, HOLOMEN_ORDER, readingSortKey, sortCards } from "./labels";

function pick(...ids: string[]) {
  return ids.map((id) => {
    const card = cards.find((c) => c.id === id);
    if (!card) throw new Error(`unknown card ${id}`);
    return card;
  });
}

describe("readingSortKey", () => {
  it("長音「ー」を直前の母音に置き換える", () => {
    expect(readingSortKey("あーにゃ")).toBe("ああにゃ");
    expect(readingSortKey("くれいじーおりー")).toBe("くれいじいおりい");
    expect(readingSortKey("ふぃーるど")).toBe("ふぃいるど");
    expect(readingSortKey("ごーごー")).toBe("ごおごお");
  });

  it("長音以外はそのまま", () => {
    expect(readingSortKey("あかいはあと")).toBe("あかいはあと");
  });
});

describe("sortCards", () => {
  it("ホロメン順（所属のデビュー順）に並ぶ — 読みの五十音順ではない（2026-10-11 ユーザー指示）", () => {
    // 読みの五十音順なら アーニャ / アイラニ / IRyS / 赤井 / アキ / AZKi
    const sorted = sortCards(
      pick(
        "anya-melfissa-01",
        "airani-iofifteen-01",
        "irys-01",
        "akai-haato-01",
        "aki-rosenthal-01",
        "azki-01",
      ),
    );
    expect(sorted.map((c) => c.holomenId)).toEqual([
      "azki", // 0期生
      "aki-rosenthal", // 1期生
      "akai-haato",
      "airani-iofifteen", // ID 1期生
      "anya-melfissa", // ID 2期生
      "irys", // Promise
    ]);
  });

  it("同じホロメンのカードは ★5 → ★4、同じレアリティはカード名の読みであいうえお順", () => {
    // 白上フブキ: 01「狐のお宮で…」(きつね) / 02「渚で魅せる…」(なぎさで) / ★4「ギアあげる…」(ぎあ)
    const sorted = sortCards(
      pick("shirakami-fubuki-star4-01", "shirakami-fubuki-02", "shirakami-fubuki-01"),
    );
    expect(sorted.map((c) => c.id)).toEqual([
      "shirakami-fubuki-01",
      "shirakami-fubuki-02",
      "shirakami-fubuki-star4-01",
    ]);
  });

  it("元の配列を変更しない", () => {
    const input = pick("azki-01", "akai-haato-01");
    sortCards(input);
    expect(input.map((c) => c.id)).toEqual(["azki-01", "akai-haato-01"]);
  });
});

describe("HOLOMEN_ORDER", () => {
  it("全ホロメンを 1 回ずつ含む", () => {
    expect(new Set(HOLOMEN_ORDER).size).toBe(HOLOMEN_ORDER.length);
    expect([...HOLOMEN_ORDER].sort()).toEqual(holomen.map((h) => h.id).sort());
  });

  it("所属のデビュー順（AFFILIATION_ORDER）に並び、複数所属は先の所属の位置", () => {
    const groupOf = (id: string): number => {
      const affs = holomenById.get(id)?.affiliations ?? [];
      return Math.min(...affs.map((a) => AFFILIATION_ORDER.indexOf(a)));
    };
    const groups = HOLOMEN_ORDER.map(groupOf);
    for (let i = 1; i < groups.length; i++) expect(groups[i]).toBeGreaterThanOrEqual(groups[i - 1]);
    expect(HOLOMEN_ORDER.indexOf("shirakami-fubuki")).toBeLessThan(
      HOLOMEN_ORDER.indexOf("nakiri-ayame"),
    );
  });
});
