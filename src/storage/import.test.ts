import { describe, expect, it } from "vite-plus/test";

import {
  applyOwnedImport,
  importChangeCount,
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

  it("card / holomen が欠けた行は読み飛ばし、件数を unreadable に残す", () => {
    const result = parseImport(
      envelope([{ card: SORA.card, holomen: SORA.holomen, bloom: 1 }, { holomen: "誰か" }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows).toHaveLength(1);
    expect(result.value.unreadable).toEqual([
      { reason: "card / holomen が欠けている 1 件を読み飛ばしました" },
    ]);
  });
});

describe("所持メンバーの取り込みプラン", () => {
  it("未登録は追加、開花が違えば変更、同じなら変化なしに分ける", () => {
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
    expect(plan.update).toEqual([
      { id: SORA.id, card: SORA.card, holomen: SORA.holomen, from: 1, to: 4 },
    ]);
    expect(plan.unchanged).toBe(1);
    expect(plan.add).toEqual([
      { id: "sakura-miko-01", card: "サクラBloom", holomen: "さくらみこ", bloom: 2 },
    ]);
    expect(importChangeCount(plan)).toBe(2);
  });

  it("表記ゆれ（全角・大小・空白・中黒）を吸収して照合する", () => {
    const plan = planOwnedImport(
      parsed([{ card: "サクラＢＬＯＯＭ", holomen: " さくら みこ ", bloom: 0 }]),
      [],
    );
    expect(plan.add.map((a) => a.id)).toEqual(["sakura-miko-01"]);
    expect(plan.review).toEqual([]);
  });

  it("cardId があればそれを優先する", () => {
    const plan = planOwnedImport(
      parsed([{ card: SORA.card, holomen: SORA.holomen, bloom: 2, cardId: SORA.id }]),
      [],
    );
    expect(plan.add.map((a) => a.id)).toEqual([SORA.id]);
  });

  it("カード名の少しのブレ（1 文字違い・脱字）は 1 つに絞れれば読み替えて取り込む", () => {
    const plan = planOwnedImport(
      parsed([
        // 探求心 → 探究心（漢字 1 文字違い）、ラビット → ビット（1 文字の脱字）: 実例 2026-09-10
        { card: "書庫ではぐくむ探究心", holomen: "シオリ・ノヴェラ", bloom: 2 },
        { card: "愛嬌たっぷりビットフィールド", holomen: "兎田ぺこら", bloom: 1 },
      ]),
      [],
    );
    expect(plan.add.map((a) => a.id)).toEqual(["shiori-novella-01", "usada-pekora-01"]);
    expect(plan.review.map((r) => r.reason)).toEqual([
      expect.stringContaining("書庫ではぐくむ探求心"),
      expect.stringContaining("愛嬌たっぷりラビットフィールド"),
    ]);
  });

  it("カード名が一致していればホロメン名の 1 文字違いも読み替える", () => {
    const plan = planOwnedImport(parsed([{ card: SORA.card, holomen: "ときのそ", bloom: 1 }]), []);
    expect(plan.add.map((a) => a.id)).toEqual([SORA.id]);
    expect(plan.review).toHaveLength(1);
  });

  it("ブレが大きいものは取り込まない", () => {
    const plan = planOwnedImport(
      parsed([
        { card: "まったく別のカード名です", holomen: "ときのそら", bloom: 0 },
        { card: SORA.card, holomen: "さくらみこ", bloom: 0 },
      ]),
      [],
    );
    expect(plan.add).toEqual([]);
    expect(plan.review.map((r) => r.reason)).toEqual([
      expect.stringContaining("見つかりません"),
      expect.stringContaining("食い違う"),
    ]);
  });

  it("見つからないカード名・ホロメン名の食い違い・重複・範囲外の開花は取り込まず理由を残す", () => {
    const plan = planOwnedImport(
      parsed([
        { card: "存在しないカード", holomen: "ときのそら", bloom: 0 },
        { card: SORA.card, holomen: "ロボ子さん", bloom: 0 },
        { card: ROBOCO.card, holomen: ROBOCO.holomen, bloom: 1 },
        { card: ROBOCO.card, holomen: ROBOCO.holomen, bloom: 2 },
        { card: "サクラBloom", holomen: "さくらみこ", bloom: 9 },
      ]),
      [],
    );
    expect(plan.add.map((a) => a.id)).toEqual([ROBOCO.id]);
    expect(plan.review.map((r) => r.reason)).toEqual([
      expect.stringContaining("カード名が見つかりません"),
      expect.stringContaining("食い違う"),
      expect.stringContaining("2 回"),
      expect.stringContaining("0〜5 の整数ではありません"),
    ]);
  });

  it("開花が未読取(null)なら、新規は 0凸で登録し、登録済みは現在の段階を保つ", () => {
    const plan = planOwnedImport(
      parsed([
        { card: SORA.card, holomen: SORA.holomen, bloom: null },
        { card: ROBOCO.card, holomen: ROBOCO.holomen, bloom: null },
      ]),
      [{ id: ROBOCO.id, bloom: 3 }],
    );
    expect(plan.add).toEqual([{ id: SORA.id, card: SORA.card, holomen: SORA.holomen, bloom: 0 }]);
    expect(plan.update).toEqual([]);
    expect(plan.unchanged).toBe(1);
    expect(plan.review).toHaveLength(2);
  });

  it("JSON に無いカードの登録は消さず、未知の ID も残す", () => {
    const current: OwnedCard[] = [
      { id: "retired-card-99", bloom: 2 },
      { id: SORA.id, bloom: 0 },
    ];
    const plan = planOwnedImport(
      parsed([{ card: SORA.card, holomen: SORA.holomen, bloom: 5 }]),
      current,
    );
    expect(applyOwnedImport(plan, current)).toEqual([
      { id: "retired-card-99", bloom: 2 },
      { id: SORA.id, bloom: 5 },
    ]);
  });
});
