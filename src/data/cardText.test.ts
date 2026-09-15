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

/** そのスキルの最大側レコードと bloomVariants を `<id> <skill> <bloom>` つきで並べる */
function withStructured<K extends (typeof SKILLS)[number]>(
  card: Card,
  skill: K,
): [string, { raw: string; structured: Card[K]["structured"] }][] {
  const s = card[skill];
  return [
    [`${card.id} ${skill} max`, { raw: s.raw, structured: s.structured }],
    ...(s.bloomVariants ?? []).map(
      (v): [string, { raw: string; structured: Card[K]["structured"] }] => [
        `${card.id} ${skill} ${String(v.bloom)}`,
        { raw: v.raw, structured: v.structured },
      ],
    ),
  ];
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
    expect(violations((t) => /スキル発動率[0-9]/.test(t))).toEqual([]);
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

  it("区切りは読点だけ（括弧・改行・中黒・スラッシュ・句点を使わない）", () => {
    expect(violations((t) => /[()（）\n\r\t・/／;；,，.。]/.test(t))).toEqual([]);
  });

  // AREA15 だけ「AREA15 2人の」と半角空白が入る（空白なしだと「AREA152人」で数字が続いて読めない）。
  // ほかの英字所属（Myth / holoX / ReGLOSS / Advent / Promise）はすべて空白なし
  it("使う文字は日本語・英数字・読点・% だけ（AREA15 のあとの半角空白だけ例外）", () => {
    const allowed = /^[0-9A-Za-z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF、%]+$/;
    expect(violations((t) => !allowed.test(t.replace("AREA15 2人", "AREA152人")))).toEqual([]);
  });
});

/**
 * raw と structured が同じ区切りで対応していること。スコアの計算は structured を見るので、
 * ここがずれると「画面の文言と計算が食い違う」形の事故になる（2026-09-15 ユーザー指摘）
 */
describe("raw と structured の対応", () => {
  it("SP の追加条件は raw の末尾に読点でつながる（なければ読点なし）", () => {
    const bad: string[] = [];
    for (const card of cards) {
      for (const [where, o] of withStructured(card, "specialSkill")) {
        const extra = o.structured?.extra ?? null;
        const commas = (o.raw.match(/、/g) ?? []).length;
        if (extra === null) {
          if (commas !== 0) bad.push(`${where}: 追加条件がないのに読点 ${String(commas)} 個`);
        } else if (!o.raw.endsWith(`、${extra}`) || commas !== 1) {
          bad.push(`${where}: ${o.raw} | extra=${extra}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("アクティブの追加条件も raw の末尾に読点でつながる", () => {
    const bad: string[] = [];
    for (const card of cards) {
      for (const [where, o] of withStructured(card, "activeSkill")) {
        const extra = o.structured?.extraCondition ?? null;
        const commas = (o.raw.match(/、/g) ?? []).length;
        if (extra === null) {
          if (commas !== 0) bad.push(`${where}: 追加条件がないのに読点 ${String(commas)} 個`);
        } else if (!o.raw.endsWith(`、${extra}`) || commas !== 1) {
          bad.push(`${where}: ${o.raw} | extraCondition=${extra}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("衣装・パッシブの読点の数は効果の数 − 1", () => {
    const bad: string[] = [];
    for (const card of cards) {
      for (const skill of ["costumeSkill", "passiveSkill"] as const) {
        for (const [where, o] of withStructured(card, skill)) {
          const effects = o.structured?.effects.length ?? 0;
          const commas = (o.raw.match(/、/g) ?? []).length;
          if (commas !== effects - 1) {
            bad.push(`${where}: 読点 ${String(commas)} / 効果 ${String(effects)} : ${o.raw}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
