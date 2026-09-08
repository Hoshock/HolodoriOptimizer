import { describe, expect, it } from "vite-plus/test";

import { cards } from "../data";
import {
  eventEndLabel,
  formatEventPercent,
  matchesQuery,
  readingSortKey,
  sortCards,
} from "./labels";

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

describe("matchesQuery", () => {
  it("ホロメン名・カード名の読み(ひらがな)でも一致する", () => {
    const [korone] = pick("inugami-korone-01");
    expect(korone).toBeDefined();
    if (!korone) return;
    expect(matchesQuery(korone, "いぬがみ")).toBe(true);
    expect(matchesQuery(korone, "らふぃんぐ")).toBe(true);
    expect(matchesQuery(korone, "ぺこら")).toBe(false);
  });
});

describe("イベントの表示", () => {
  it("終了時刻は日本時間で「月/日 時:分」", () => {
    expect(eventEndLabel("2026-09-17T19:59:00+09:00")).toBe("9/17 19:59");
    expect(eventEndLabel("2026-08-27T10:59:00Z")).toBe("8/27 19:59"); // UTC でも日本時間に直す
    expect(eventEndLabel("not a date")).toBe("");
  });

  it("獲得ボーナスは整数の +N%(0 も +0%)", () => {
    expect(formatEventPercent(78)).toBe("+78%");
    expect(formatEventPercent(0)).toBe("+0%");
  });
});
