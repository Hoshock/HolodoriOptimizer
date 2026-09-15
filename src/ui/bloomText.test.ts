import { describe, expect, it } from "vite-plus/test";

import { cardById, holomen } from "../data";
import { BLOOM_MAX } from "../data/bloom";
import {
  BLOOM_STAGES,
  BLOOM_TEXT_REPORT_KIND,
  BLOOM_TEXT_REPORT_VERSION,
  bloomTextRangesOf,
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
  it("欄は段階ごとではなく、文言が変わらない区間ごとに 1 つだけにする", () => {
    expect(BLOOM_STAGES).toEqual([0, 1, 2, 3, 4, 5]);
    // 衣装スキルは開花で変わらないので 1 区間、ほかは強化の前後で 2 区間
    expect(bloomTextRangesOf(null).map((r) => r.label)).toEqual(["0〜5凸"]);
    expect(bloomTextRangesOf(1).map((r) => r.label)).toEqual(["0凸", "1〜5凸"]);
    expect(bloomTextRangesOf(3).map((r) => r.label)).toEqual(["0〜2凸", "3〜5凸"]);
    expect(bloomTextRangesOf(4).map((r) => r.label)).toEqual(["0〜3凸", "4〜5凸"]);
    expect(bloomTextRangesOf(4)[0]).toEqual({ bloom: 0, blooms: [0, 1, 2, 3], label: "0〜3凸" });
  });

  it("区間ごとに、いまのカードデータの文言と出所で埋める", () => {
    const card = cardWithVariants;
    expect(card).toBeDefined();
    if (!card) return;
    const defaults = bloomTextDefaultsOf(card);
    expect(defaults.costumeSkill).toHaveLength(1);
    expect(defaults.activeSkill).toHaveLength(2);
    // 強化後の区間はカード本体のレコードそのもの
    expect(defaults.activeSkill[1]).toEqual({
      bloom: 1,
      blooms: [1, 2, 3, 4, 5],
      label: "1〜5凸",
      text: card.activeSkill.raw,
      source: "max-record",
    });
    expect(defaults.activeSkill[1]?.blooms.at(-1)).toBe(BLOOM_MAX);
    // variant を持つ区間は記録由来(最大からの推定ではない)
    expect(defaults.activeSkill[0]?.source).not.toBe("unknown");
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

  it("知らないスキル・区間の先頭でない段階・文字列でない値は読み飛ばし、残りは読む", () => {
    const state = normalizeBloomTextState({
      visited: ["a", "a", "", 3, "b"],
      edits: {
        "card-1": {
          // アクティブの区間は 0凸 / 1〜5凸 なので、保存してよいのは 0 と 1 だけ
          activeSkill: { "0": "ok", "9": "範囲外", "2": "区間の途中", "1": 3 },
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
    expect(report.version).toBe(BLOOM_TEXT_REPORT_VERSION);
    expect(report.cards).toHaveLength(1);
    const entry = report.cards[0];
    expect(entry.cardId).toBe(cardId);
    expect(entry.holomenId).toBe(card.holomenId);
    expect(entry.editedCount).toBe(1);
    expect(entry.skills.passiveSkill[0]).toEqual({
      blooms: [0, 1, 2, 3],
      label: "0〜3凸",
      text: "実機で見た文言",
      source: entry.skills.passiveSkill[0].source,
      edited: true,
      current,
    });
    // 触っていない区間は文言と出所だけ(「この内容で合っている」の記録)
    expect(entry.skills.passiveSkill[1].edited).toBeUndefined();
    expect(entry.skills.passiveSkill[1].blooms).toEqual([4, 5]);
    expect(entry.skills.costumeSkill).toHaveLength(1);
  });

  it("いまのカードデータにない ID は出さない(保存からは消さない)", () => {
    const state: BloomTextState = { visited: ["no-such-card-99"], edits: {} };
    expect(JSON.parse(buildBloomTextReport(state, resolve)).cards).toEqual([]);
  });
});
