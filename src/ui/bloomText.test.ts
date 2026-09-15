import { describe, expect, it } from "vite-plus/test";

import { cardById, holomen } from "../data";
import { BLOOM_MAX } from "../data/bloom";
import {
  BLOOM_STAGES,
  BLOOM_TEXT_REPORT_KIND,
  bloomTextDefaultsOf,
  bloomTextValue,
  buildBloomTextReport,
  normalizeBloomTextState,
  withBloomTextEdit,
  withVisitedCard,
  withoutBloomTextCard,
  withoutBloomTextEdits,
} from "./bloomText";
import type { BloomTextState } from "./bloomText";

const holomenName = (id: string): string => holomen.find((h) => h.id === id)?.name ?? id;
const resolve = (cardId: string) => {
  const card = cardById.get(cardId);
  return card ? { card, holomen: holomenName(card.holomenId) } : null;
};

/** 開花段階ごとの variant を実際に持っているカード(データが変わっても 1 枚は選べる) */
const cardWithVariants = [...cardById.values()].find(
  (c) => (c.activeSkill.bloomVariants?.length ?? 0) > 0,
);

describe("開花文言の既定値", () => {
  it("開花 0凸〜最大までの全段階を、いまのカードデータの文言で埋める", () => {
    expect(BLOOM_STAGES).toEqual([0, 1, 2, 3, 4, 5]);
    const card = cardWithVariants;
    expect(card).toBeDefined();
    if (!card) return;
    const defaults = bloomTextDefaultsOf(card);
    expect(defaults.activeSkill).toHaveLength(BLOOM_MAX + 1);
    // 最大段階はカード本体のレコードそのもの
    expect(defaults.activeSkill[BLOOM_MAX]).toEqual({
      bloom: BLOOM_MAX,
      text: card.activeSkill.raw,
      source: "max-record",
    });
    // variant を持つ段階は記録由来(最大からの推定ではない)
    expect(defaults.activeSkill[0]?.source).not.toBe("estimated-from-max");
  });
});

describe("上書き", () => {
  const cardId = "roboco-san-01";

  it("既定値と違う文字列だけを持ち、既定値に戻すと上書きを捨てる", () => {
    const empty: BloomTextState = { visited: [], edits: {} };
    const edited = withBloomTextEdit(empty, cardId, "passiveSkill", 0, "新しい文言", "もとの文言");
    expect(edited.edits[cardId]?.passiveSkill).toEqual({ "0": "新しい文言" });
    expect(edited.visited).toEqual([cardId]);
    const back = withBloomTextEdit(edited, cardId, "passiveSkill", 0, "もとの文言", "もとの文言");
    expect(back.edits[cardId]).toBeUndefined();
    // 開いた記録は残る(触ったカードとして一覧と共有用データに出す)
    expect(back.visited).toEqual([cardId]);
  });

  it("入力値は上書き→データの既定値の順に解決する", () => {
    const state = withBloomTextEdit(
      { visited: [], edits: {} },
      cardId,
      "activeSkill",
      2,
      "上書き",
      "既定",
    );
    expect(bloomTextValue(state.edits, cardId, "activeSkill", 2, "既定")).toBe("上書き");
    expect(bloomTextValue(state.edits, cardId, "activeSkill", 3, "既定")).toBe("既定");
    expect(bloomTextValue({}, cardId, "activeSkill", 2, "既定")).toBe("既定");
  });

  it("カード単位で、上書きだけ捨てる / 一覧から外すを分けられる", () => {
    const state = withBloomTextEdit({ visited: [], edits: {} }, cardId, "activeSkill", 0, "a", "b");
    expect(withoutBloomTextEdits(state, cardId)).toEqual({ visited: [cardId], edits: {} });
    expect(withoutBloomTextCard(state, cardId)).toEqual({ visited: [], edits: {} });
  });

  it("開いたカードは開いた順に 1 度だけ記録する", () => {
    const first = withVisitedCard({ visited: [], edits: {} }, "a");
    const second = withVisitedCard(first, "b");
    expect(withVisitedCard(second, "a").visited).toEqual(["a", "b"]);
  });
});

describe("保存値の読み込み", () => {
  it("未保存・壊れたデータは空の状態に戻す", () => {
    expect(normalizeBloomTextState(null)).toEqual({ visited: [], edits: {} });
    expect(normalizeBloomTextState([])).toEqual({ visited: [], edits: {} });
    expect(normalizeBloomTextState({ visited: "x", edits: 3 })).toEqual({ visited: [], edits: {} });
  });

  it("知らないスキル・段階の範囲外・文字列でない値は読み飛ばし、残りは読む", () => {
    const state = normalizeBloomTextState({
      visited: ["a", "a", "", 3, "b"],
      edits: {
        "card-1": {
          activeSkill: { "0": "ok", "9": "範囲外", "1": 3 },
          unknownSkill: { "0": "無視" },
        },
        "card-2": { activeSkill: {} },
        "": { activeSkill: { "0": "ok" } },
      },
    });
    expect(state.visited).toEqual(["a", "b"]);
    expect(state.edits).toEqual({ "card-1": { activeSkill: { "0": "ok" } } });
  });
});

describe("共有用データ", () => {
  it("開いたカードを開いた順に並べ、上書きした段階だけ edited といまの文言を付ける", () => {
    const cardId = "roboco-san-01";
    const card = cardById.get(cardId);
    expect(card).toBeDefined();
    if (!card) return;
    const current = bloomTextDefaultsOf(card).passiveSkill[0]?.text ?? "";
    const state = withBloomTextEdit(
      { visited: [], edits: {} },
      cardId,
      "passiveSkill",
      0,
      "実機で見た文言",
      current,
    );
    const report = JSON.parse(buildBloomTextReport(state, resolve));
    expect(report.kind).toBe(BLOOM_TEXT_REPORT_KIND);
    expect(report.cards).toHaveLength(1);
    const entry = report.cards[0];
    expect(entry.cardId).toBe(cardId);
    expect(entry.holomenId).toBe(card.holomenId);
    expect(entry.editedCount).toBe(1);
    expect(entry.skills.passiveSkill[0]).toEqual({
      bloom: 0,
      text: "実機で見た文言",
      source: entry.skills.passiveSkill[0].source,
      edited: true,
      current,
    });
    // 触っていない段階は文言と出所だけ(「この内容で合っている」の記録)
    expect(entry.skills.passiveSkill[5].edited).toBeUndefined();
    expect(entry.skills.costumeSkill).toHaveLength(BLOOM_MAX + 1);
  });

  it("いまのカードデータにない ID は出さない(保存からは消さない)", () => {
    const state: BloomTextState = { visited: ["no-such-card-99"], edits: {} };
    expect(JSON.parse(buildBloomTextReport(state, resolve)).cards).toEqual([]);
  });
});
