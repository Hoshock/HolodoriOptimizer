import { describe, expect, it } from "vite-plus/test";

import cardsJson from "./cards.json";
import { cardById } from "./index";
import type { Card } from "./types";

const expectedRaw =
  "ピュアタイプ2人以上で全員の全パラメータ30%UP\n" + "ピュアタイプ2人以上で全員のスコアサポート25%";

function expectFuwawaCostume(card: Card | undefined): void {
  expect(card).toBeDefined();
  if (!card) return;

  expect(card.costumeSkill.raw).toBe(expectedRaw);
  expect(card.costumeSkill.structured?.condition).toEqual({
    kind: "typeCount",
    type: "pure",
    min: 2,
  });
  const support = card.costumeSkill.structured?.effects.find((e) => e.kind === "scoreSupport");
  expect(support).toEqual({ kind: "scoreSupport", target: { kind: "all" }, percent: 25 });
}

describe("authoritative card corrections", () => {
  it("水着フワワの取り込み元cards.json自体が訂正済み", () => {
    const source = (cardsJson as Card[]).find((card) => card.id === "fuwawa-abyssgard-02");
    expectFuwawaCostume(source);
  });

  it("ランタイム正典でも衣装2効果はどちらもピュア2人以上の条件付き", () => {
    expectFuwawaCostume(cardById.get("fuwawa-abyssgard-02"));
  });
});
