import { describe, expect, it } from "vite-plus/test";

import { cardById } from "./index";

describe("authoritative card corrections", () => {
  it("水着フワワの衣装2効果はどちらもピュア2人以上の条件付き", () => {
    const card = cardById.get("fuwawa-abyssgard-02");
    expect(card).toBeDefined();
    if (!card) return;

    expect(card.costumeSkill.raw).toBe(
      "ピュアタイプ2人以上で全員の全パラメータ30%UP\n" +
        "ピュアタイプ2人以上で全員のスコアサポート25%",
    );
    expect(card.costumeSkill.structured?.condition).toEqual({
      kind: "typeCount",
      type: "pure",
      min: 2,
    });
    const support = card.costumeSkill.structured?.effects.find((e) => e.kind === "scoreSupport");
    expect(support).toEqual({ kind: "scoreSupport", target: { kind: "all" }, percent: 25 });
  });
});
