import type { Card } from "./types";

/**
 * cards.json 取り込み後に適用する、実機で再確認済みの権威付き訂正。
 * ここへ追加するときは docs/human/evidence-policy.md に従い、根拠をコメントに残す。
 */
export function applyCardCorrections(sourceCards: readonly Card[]): Card[] {
  return sourceCards.map((card) => {
    if (card.id !== "fuwawa-abyssgard-02") return card;

    // 2026-09-12 ユーザー実機再確認。ゲーム内では2行で、両方に
    // 「ピュアタイプ2人以上で」が明記される。旧structuredは後半25%だけを
    // 無条件と推測していたため訂正する。
    return {
      ...card,
      costumeSkill: {
        ...card.costumeSkill,
        raw:
          "ピュアタイプ2人以上で全員の全パラメータ30%UP\n" +
          "ピュアタイプ2人以上で全員のスコアサポート25%",
        structured: {
          condition: { kind: "typeCount", type: "pure", min: 2 },
          effects: [
            {
              kind: "paramUp",
              target: { kind: "all" },
              param: "all",
              percent: 30,
            },
            {
              kind: "scoreSupport",
              target: { kind: "all" },
              percent: 25,
            },
          ],
        },
      },
    } satisfies Card;
  });
}
