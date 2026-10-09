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
  it("ホロメン名の読みであいうえお順に並ぶ(英字・カナ・漢字の表記に依らない)", () => {
    // 表記順(文字コード順)なら AZKi / IRyS / アーニャ / アイラニ / アキ / 赤井 だが、読みでは以下になる
    const sorted = sortCards(
      pick(
        "azki-01",
        "akai-haato-01",
        "aki-rosenthal-01",
        "airani-iofifteen-01",
        "irys-01",
        "anya-melfissa-01",
      ),
    );
    expect(sorted.map((c) => c.holomenId)).toEqual([
      "anya-melfissa", // あーにゃ → ああにゃ
      "airani-iofifteen", // あいらに
      "irys", // あいりす
      "akai-haato", // あかい
      "aki-rosenthal", // あき
      "azki", // あずき
    ]);
  });

  it("同じホロメンのカードはカード名の読みであいうえお順", () => {
    // 白上フブキ: 01「狐のお宮で…」(きつね) / 02「渚で魅せる…」(なぎさで) → 01 が先
    const sorted = sortCards(pick("shirakami-fubuki-02", "shirakami-fubuki-01"));
    expect(sorted.map((c) => c.id)).toEqual(["shirakami-fubuki-01", "shirakami-fubuki-02"]);
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
