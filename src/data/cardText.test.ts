import { describe, expect, it } from "vite-plus/test";

import { cards } from "./index";
import type { Card } from "./types";

/**
 * スキル文言の表記をそろえる（2026-09-15 ユーザー指示）。
 * 2026-09-15 の実機確認 21 枚で分かった表記を、まだ確認していないカードへも当ててある
 * （`docs/human/card-data-provenance.md`「表記の推測でそろえた分」）。取り込みや追記でゆれが戻ったらここで落とす。
 */

const SKILLS = ["costumeSkill", "specialSkill", "activeSkill", "passiveSkill"] as const;
/** 所属名（タイプ「キュート/ハッピー/ピュアタイプ」は「が」を取らないので入れない） */
const AFFILIATION =
  "(?:[0-9]期生|ゲーマーズ|holoX|AREA15|holoro|holoh3ro|Myth|Promise|Advent|ReGLOSS)";

/** カードの全スキル文言（最大側レコードと bloomVariants）を `<id> <skill> <bloom>` つきで並べる */
function allTexts(card: Card): [string, string][] {
  const out: [string, string][] = [];
  for (const k of SKILLS) {
    out.push([`${card.id} ${k} max`, card[k].raw]);
    for (const v of card[k].bloomVariants ?? [])
      out.push([`${card.id} ${k} ${String(v.bloom)}`, v.raw]);
  }
  return out;
}

function violations(test: (text: string) => boolean): string[] {
  const out: string[] = [];
  for (const card of cards) {
    for (const [where, text] of allTexts(card)) if (test(text)) out.push(`${where}: ${text}`);
  }
  return out;
}

describe("スキル文言の表記", () => {
  it("追加条件は読点でつなぐ（括弧で囲まない）", () => {
    expect(violations((t) => /[(（]/.test(t))).toEqual([]);
  });

  it("「スキル発動率」の次は「が」", () => {
    // 2026-09-15 の実機確認で「が」つきが 23 件。恒常モココの 3〜5凸 だけ報告が「が」なしだったので
    // 実機報告どおり残してある（同じカードの 0〜2凸 には「が」がある）
    expect(violations((t) => /スキル発動率[0-9]/.test(t))).toEqual([
      "mococo-abyssgard-01 specialSkill max: 11秒間スコアサポート効果130%、100コンボ以上でスキル発動率50%UP",
    ]);
  });

  it("所属の「N人以上で」の前は「が」（タイプは「が」を取らない）", () => {
    expect(violations((t) => new RegExp(`${AFFILIATION}[0-9]人以上で`).test(t))).toEqual([]);
    expect(violations((t) => /タイプが[0-9]人以上/.test(t))).toEqual([]);
  });

  it("発動周期は「N秒毎に」（「ごとに」を使わない）", () => {
    expect(violations((t) => /秒ごとに/.test(t))).toEqual([]);
  });

  it("条件つき衣装スキルのスコアサポートに「無条件」の上書きを残さない（原文は条件を再掲する）", () => {
    const left: string[] = [];
    for (const card of cards) {
      const st = card.costumeSkill.structured;
      if (!st || st.condition.kind === "always") continue;
      for (const e of st.effects) {
        if (e.kind === "scoreSupport" && e.condition?.kind === "always") left.push(card.id);
      }
    }
    expect(left).toEqual([]);
  });
});
