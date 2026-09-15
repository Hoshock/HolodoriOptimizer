import type { Card } from "./types";

/**
 * cards.json 取り込み後に適用する、実機で再確認済みの権威付き訂正。
 * ここへ追加するときは docs/human/evidence-policy.md に従い、根拠をコメントに残す。
 */
export function applyCardCorrections(sourceCards: readonly Card[]): Card[] {
  return sourceCards.map((card) => {
    if (card.id === "fuwawa-abyssgard-02") return fuwawaAbyssgard02(card);
    if (card.id === "sakura-miko-02") return sakuraMiko02(card);
    return card;
  });
}

// 2026-09-12 ユーザー実機再確認。両方に「ピュアタイプ2人以上で」が明記される。
// 旧structuredは後半25%だけを無条件と推測していたため訂正した。
// 2026-09-15 の全区間確認で、原文は2行ではなく読点でつながる1文だった。
function fuwawaAbyssgard02(card: Card): Card {
  return {
    ...card,
    costumeSkill: {
      ...card.costumeSkill,
      raw: "ピュアタイプ2人以上で全員の全パラメータが30%UP、ピュアタイプ2人以上で全員のスコアサポート25%",
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
}

// 2026-09-15 ユーザー実機確認（開花文言フォーム）。スコアサポート側にも
// 「ピュアタイプ2人以上で」が明記される。取り込み時の raw は後半の条件が落ちており、
// structured もそれに合わせて後半だけ無条件（always）と解釈していたため訂正する。
// 衣装スキルは開花段階で変わらないので、この訂正は全段階に効く。
function sakuraMiko02(card: Card): Card {
  return {
    ...card,
    costumeSkill: {
      ...card.costumeSkill,
      raw: "ピュアタイプ2人以上で全員のパフォーマンスが80%UP、ピュアタイプ2人以上で全員のスコアサポート効果25%",
      structured: {
        condition: { kind: "typeCount", type: "pure", min: 2 },
        effects: [
          {
            kind: "paramUp",
            target: { kind: "all" },
            param: "performance",
            percent: 80,
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
}
