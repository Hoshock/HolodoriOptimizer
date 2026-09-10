import { describe, expect, it } from "vite-plus/test";

import {
  applyOwnedEntries,
  IMPORT_FORMAT,
  IMPORT_VERSION,
  parseImport,
  planOwnedImport,
} from "./import";
import type { ParsedOwnedImport } from "./import";
import type { OwnedCard } from "./owned";

/** 実データの ★5 カード（src/data/cards.json）。名前で照合するのでカード名も実物を使う */
const SORA = { id: "tokino-sora-01", card: "ひたむきに描く虹のうた", holomen: "ときのそら" };
const ROBOCO = { id: "roboco-san-01", card: "高性能なVサイン", holomen: "ロボ子さん" };

function envelope(cards: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: IMPORT_FORMAT,
    version: IMPORT_VERSION,
    kind: "owned-members",
    cards,
    ...extra,
  });
}

function parsed(rows: ParsedOwnedImport["rows"]): ParsedOwnedImport {
  return { kind: "owned-members", rows, unreadable: [], capturedAt: null };
}

describe("インポート用 JSON の解釈", () => {
  it("封筒と cards を読める", () => {
    const result = parseImport(envelope([{ card: SORA.card, holomen: SORA.holomen, bloom: 3 }]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows).toEqual([{ card: SORA.card, holomen: SORA.holomen, bloom: 3 }]);
  });

  it("コードブロックごと貼られても読める", () => {
    const text =
      "```json\n" + envelope([{ card: SORA.card, holomen: SORA.holomen, bloom: 0 }]) + "\n```";
    expect(parseImport(text).ok).toBe(true);
  });

  it("format・version・kind が違うデータは理由つきで断る", () => {
    const wrongFormat = JSON.stringify({
      format: "other",
      version: 1,
      kind: "owned-members",
      cards: [],
    });
    expect(parseImport(wrongFormat)).toEqual({
      ok: false,
      message: expect.stringContaining("取り込み用データではありません"),
    });
    const wrongVersion = JSON.stringify({
      format: IMPORT_FORMAT,
      version: 99,
      kind: "owned-members",
      cards: [],
    });
    expect(parseImport(wrongVersion)).toEqual({
      ok: false,
      message: expect.stringContaining("対応していない版"),
    });
    const wrongKind = JSON.stringify({
      format: IMPORT_FORMAT,
      version: IMPORT_VERSION,
      kind: "boards",
      cards: [],
    });
    expect(parseImport(wrongKind)).toEqual({
      ok: false,
      message: expect.stringContaining("所持メンバー"),
    });
  });

  it("壊れた JSON・空の cards は断る", () => {
    expect(parseImport("{").ok).toBe(false);
    expect(parseImport(envelope([])).ok).toBe(false);
  });

  it("holomen が欠けた行だけ読み飛ばし、件数を unreadable に残す（card は任意）", () => {
    const result = parseImport(
      envelope([
        { card: SORA.card, holomen: SORA.holomen, bloom: 1 },
        { holomen: "ときのそら", bloom: 2 },
        { card: "カード名だけ", bloom: 0 },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows).toEqual([
      { card: SORA.card, holomen: SORA.holomen, bloom: 1 },
      { card: null, holomen: "ときのそら", bloom: 2 },
    ]);
    expect(result.value.unreadable).toEqual([
      { reason: "holomen が欠けている 1 件を読み飛ばしました" },
    ]);
  });
});

describe("所持メンバーの取り込みプラン", () => {
  it("未登録は add、開花が違えば update、同じなら unchanged に分け、並びは JSON の順", () => {
    const current: OwnedCard[] = [
      { id: SORA.id, bloom: 1 },
      { id: ROBOCO.id, bloom: 5 },
    ];
    const plan = planOwnedImport(
      parsed([
        { card: SORA.card, holomen: SORA.holomen, bloom: 4 },
        { card: ROBOCO.card, holomen: ROBOCO.holomen, bloom: 5 },
        { card: "サクラBloom", holomen: "さくらみこ", bloom: 2 },
      ]),
      current,
    );
    expect(plan.entries).toEqual([
      {
        index: 0,
        id: SORA.id,
        card: SORA.card,
        holomen: SORA.holomen,
        readCard: SORA.card,
        readHolomen: SORA.holomen,
        kind: "update",
        bloom: 4,
        from: 1,
        caution: null,
      },
      {
        index: 2,
        id: "sakura-miko-01",
        card: "サクラBloom",
        holomen: "さくらみこ",
        readCard: "サクラBloom",
        readHolomen: "さくらみこ",
        kind: "add",
        bloom: 2,
        from: null,
        caution: null,
      },
    ]);
    expect(plan.unchanged).toBe(1);
    expect(plan.notices).toEqual([]);
  });

  it("表記ゆれ（全角・大小・空白・中黒）を吸収して照合する", () => {
    const plan = planOwnedImport(
      parsed([{ card: "サクラＢＬＯＯＭ", holomen: " さくら みこ ", bloom: 0 }]),
      [],
    );
    expect(plan.entries.map((e) => e.id)).toEqual(["sakura-miko-01"]);
    expect(plan.entries[0]?.caution).toBeNull();
  });

  it("cardId があればそれを優先する", () => {
    const plan = planOwnedImport(
      parsed([{ card: SORA.card, holomen: SORA.holomen, bloom: 2, cardId: SORA.id }]),
      [],
    );
    expect(plan.entries.map((e) => e.id)).toEqual([SORA.id]);
  });

  it("カード名の少しのブレ（1 文字違い・脱字）は 1 つに絞れれば読み替え、caution を付ける", () => {
    const plan = planOwnedImport(
      parsed([
        // 探求心 → 探究心（漢字 1 文字違い）、ラビット → ビット（1 文字の脱字）: 実例 2026-09-10
        { card: "書庫ではぐくむ探究心", holomen: "シオリ・ノヴェラ", bloom: 2 },
        { card: "愛嬌たっぷりビットフィールド", holomen: "兎田ぺこら", bloom: 1 },
      ]),
      [],
    );
    expect(plan.entries.map((e) => e.id)).toEqual(["shiori-novella-01", "usada-pekora-01"]);
    expect(plan.entries.map((e) => e.caution)).toEqual([
      expect.stringContaining("書庫ではぐくむ探求心"),
      expect.stringContaining("愛嬌たっぷりラビットフィールド"),
    ]);
  });

  it("カード名が一致していればホロメン名の 1 文字違いも読み替える", () => {
    const plan = planOwnedImport(parsed([{ card: SORA.card, holomen: "ときのそ", bloom: 1 }]), []);
    expect(plan.entries.map((e) => e.id)).toEqual([SORA.id]);
    expect(plan.entries[0]?.caution).toEqual(expect.stringContaining("ときのそら"));
  });

  it("カード名がない行は、そのホロメンの★5 が 1 枚なら質問つきで取り込む", () => {
    const plan = planOwnedImport(
      parsed([
        { card: null, holomen: SORA.holomen, bloom: 3 },
        // さくらみこは★5 が 2 枚あるので特定できない
        { card: null, holomen: "さくらみこ", bloom: 1 },
      ]),
      [],
    );
    expect(plan.entries.map((e) => e.id)).toEqual([SORA.id]);
    expect(plan.entries[0]?.caution).toEqual(expect.stringContaining(SORA.card));
    expect(plan.notices.map((n) => n.reason)).toEqual([
      expect.stringContaining("★5 が 2 枚あります"),
    ]);
  });

  it("ブレが大きいものは取り込まない", () => {
    const plan = planOwnedImport(
      parsed([
        { card: "まったく別のカード名です", holomen: "ときのそら", bloom: 0 },
        { card: SORA.card, holomen: "さくらみこ", bloom: 0 },
      ]),
      [],
    );
    expect(plan.entries).toEqual([]);
    expect(plan.notices.map((n) => n.reason)).toEqual([
      expect.stringContaining("見つかりません"),
      expect.stringContaining("食い違う"),
    ]);
  });

  it("重複・範囲外の開花は取り込まず理由を残す", () => {
    const plan = planOwnedImport(
      parsed([
        { card: ROBOCO.card, holomen: ROBOCO.holomen, bloom: 1 },
        { card: ROBOCO.card, holomen: ROBOCO.holomen, bloom: 2 },
        { card: "サクラBloom", holomen: "さくらみこ", bloom: 9 },
      ]),
      [],
    );
    expect(plan.entries.map((e) => e.id)).toEqual([ROBOCO.id]);
    expect(plan.notices.map((n) => n.reason)).toEqual([
      expect.stringContaining("2 回"),
      expect.stringContaining("0〜5 の整数ではありません"),
    ]);
  });

  it("開花が未読取(null)なら、新規は 0凸 + caution、登録済みは現在の段階を保って notice", () => {
    const plan = planOwnedImport(
      parsed([
        { card: SORA.card, holomen: SORA.holomen, bloom: null },
        { card: ROBOCO.card, holomen: ROBOCO.holomen, bloom: null },
      ]),
      [{ id: ROBOCO.id, bloom: 3 }],
    );
    expect(plan.entries).toEqual([
      {
        index: 0,
        id: SORA.id,
        card: SORA.card,
        holomen: SORA.holomen,
        readCard: SORA.card,
        readHolomen: SORA.holomen,
        kind: "add",
        bloom: 0,
        from: null,
        caution: expect.stringContaining("読み取れていません"),
      },
    ]);
    expect(plan.unchanged).toBe(1);
    // 登録済みで何も変わらない行はエラーに数えない（「登録済み n 件」に出る）
    expect(plan.notices).toEqual([]);
  });

  it("unreadable は notice の末尾に並ぶ", () => {
    const result = parseImport(
      JSON.stringify({
        format: IMPORT_FORMAT,
        version: IMPORT_VERSION,
        kind: "owned-members",
        cards: [{ card: SORA.card, holomen: SORA.holomen, bloom: 0 }],
        unreadable: [{ reason: "指で隠れている", hint: "3 枚目" }],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan = planOwnedImport(result.value, []);
    expect(plan.notices).toEqual([
      { label: "読み取れなかったもの", reason: "指で隠れている（3 枚目）" },
    ]);
  });

  it("選んだ行だけを当て、JSON に無いカードの登録は消さず未知の ID も残す", () => {
    const current: OwnedCard[] = [
      { id: "retired-card-99", bloom: 2 },
      { id: SORA.id, bloom: 0 },
    ];
    const plan = planOwnedImport(
      parsed([
        { card: SORA.card, holomen: SORA.holomen, bloom: 5 },
        { card: "サクラBloom", holomen: "さくらみこ", bloom: 1 },
      ]),
      current,
    );
    // 2 行目を外して 1 行目だけ当てる
    expect(applyOwnedEntries(plan.entries.slice(0, 1), current)).toEqual([
      { id: "retired-card-99", bloom: 2 },
      { id: SORA.id, bloom: 5 },
    ]);
  });
});
