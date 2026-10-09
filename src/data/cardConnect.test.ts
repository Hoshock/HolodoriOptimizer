import { describe, expect, it } from "vite-plus/test";

import {
  CARD_CONNECT_EFFECTS,
  CARD_CONNECT_PROVENANCE,
  cardConnectPermil,
  connectEffectIdOfCard,
  connectEffectOfCard,
  connectEffectRarity,
} from "./cardConnect";
import { CONNECT_EFFECTS, CONNECT_EXTENTS, isConnectEffectId } from "./connect";
import { cards } from "./index";

/**
 * カード固有のコネクト効果の対応表（2026-10-09 に抽出マスターから 138 枚を転記 — ADR-022）。
 * 固定するのは**全カードに対応があること・既存の定義を指していること・レアリティの整合**で、
 * 値そのものは外部解析由来なので実機 Golden とは呼ばない
 */
describe("カード固有のコネクト効果", () => {
  it("全カード（138 枚）に対応があり、対応表にデータにないカードはない", () => {
    const ids = new Set(cards.map((c) => c.id));
    expect(Object.keys(CARD_CONNECT_EFFECTS)).toHaveLength(138);
    for (const id of Object.keys(CARD_CONNECT_EFFECTS)) expect(ids.has(id), id).toBe(true);
    for (const c of cards) expect(connectEffectIdOfCard(c.id), c.id).not.toBeNull();
  });

  it("どの対応も既存の 20 種の効果（17 種の形）を指し、効果の末尾のレアリティがカードのレアリティと一致する", () => {
    for (const c of cards) {
      const id = connectEffectIdOfCard(c.id);
      if (id === null) throw new Error(`${c.id} に対応がない`);
      expect(isConnectEffectId(id)).toBe(true);
      expect(connectEffectRarity(id), c.id).toBe(c.rarity);
      const def = CONNECT_EFFECTS[id];
      expect(Object.hasOwn(CONNECT_EXTENTS, def.extent), c.id).toBe(true);
      // Lv1 / Lv2 は正の整数で Lv2 > Lv1
      expect(Number.isInteger(def.permil[0]) && def.permil[0] > 0, c.id).toBe(true);
      expect(def.permil[1] > def.permil[0], c.id).toBe(true);
    }
  });

  it("同じホロメンでもカードごとに別の効果を持つ（おかゆ: ★5 -01 / ★5 -02 / ★4 で 3 つとも違う）", () => {
    const ids = ["nekomata-okayu-01", "nekomata-okayu-02", "nekomata-okayu-star4-01"].map((id) =>
      connectEffectIdOfCard(id),
    );
    expect(new Set(ids).size).toBe(3);
    const star4 = connectEffectOfCard("nekomata-okayu-star4-01");
    expect(star4?.extent).toBe("center-4");
    expect(cardConnectPermil("nekomata-okayu-star4-01", 1)).toBe(star4?.permil[0]);
    expect(cardConnectPermil("nekomata-okayu-star4-01", 2)).toBe(star4?.permil[1]);
  });

  it("未収録のカード ID には null を返す", () => {
    expect(connectEffectIdOfCard("unknown-card")).toBeNull();
    expect(connectEffectOfCard("unknown-card")).toBeNull();
    expect(cardConnectPermil("unknown-card", 1)).toBeNull();
  });

  it("出所は抽出マスター（実機未確認）として記録してある", () => {
    expect(CARD_CONNECT_PROVENANCE.evidence).toBe("extracted-master");
    expect(CARD_CONNECT_PROVENANCE.commit).toMatch(/^[0-9a-f]{40}$/);
  });
});
