import { describe, expect, it } from "vite-plus/test";

import {
  SELECTION_SCHEMA_VERSION,
  emptySelection,
  packSlots,
  parseSelection,
  serializeSelection,
} from "./selection";

describe("枠の選択の保存形式", () => {
  it("v1(版番号つき)を読め、書き出しは v1 になる", () => {
    const selection = {
      leaderId: "tokino-sora-01",
      memberIds: ["roboco-san-01", "aki-rosenthal-01", null, null, null],
      songId: "song-1",
      excludedLeaderIds: ["akai-haato-01"],
      excludedMemberIds: ["shirakami-fubuki-01", "natsuiro-matsuri-01"],
    };
    const raw = serializeSelection(selection);
    expect(JSON.parse(raw)).toEqual({ version: SELECTION_SCHEMA_VERSION, ...selection });
    expect(parseSelection(raw, 5)).toEqual(selection);
  });

  it("未保存・壊れたデータは「すべて未選択」に戻す", () => {
    expect(parseSelection(null, 5)).toEqual(emptySelection(5));
    expect(parseSelection("{oops", 5)).toEqual(emptySelection(5));
    expect(parseSelection("[]", 5)).toEqual(emptySelection(5));
    expect(emptySelection(5).memberIds).toHaveLength(5);
  });

  it("未知のフィールドは読み飛ばし、欠けた項目は未選択として読む", () => {
    expect(
      parseSelection(JSON.stringify({ version: 9, songId: "song-1", future: true }), 5),
    ).toEqual({ ...emptySelection(5), songId: "song-1" });
  });

  it("文字列でない ID・空文字は未選択にする", () => {
    expect(
      parseSelection(JSON.stringify({ leaderId: 3, memberIds: ["", null, { id: "x" }] }), 5),
    ).toEqual(emptySelection(5));
  });

  it("メンバーは前から詰め、重複は 1 枚だけ・枠数ぶんに切りそろえる", () => {
    expect(packSlots([null, "a", null, "b"], 5)).toEqual(["a", "b", null, null, null]);
    expect(packSlots(["a", "a", "b"], 5)).toEqual(["a", "b", null, null, null]);
    expect(packSlots(["a", "b", "c"], 2)).toEqual(["a", "b"]);
    expect(parseSelection(JSON.stringify({ memberIds: [null, "a", "b"] }), 5).memberIds).toEqual([
      "a",
      "b",
      null,
      null,
      null,
    ]);
  });
});

describe("除外の読み込み", () => {
  it("現在のデータにない ID も捨てずに残す(登録を消さない)", () => {
    const raw = JSON.stringify({
      excludedLeaderIds: ["no-such-card-99"],
      excludedMemberIds: ["roboco-san-01"],
    });
    expect(parseSelection(raw, 5).excludedLeaderIds).toEqual(["no-such-card-99"]);
    expect(parseSelection(raw, 5).excludedMemberIds).toEqual(["roboco-san-01"]);
  });

  it("配列でない値・文字列でない要素・重複は落とす", () => {
    const raw = JSON.stringify({
      excludedLeaderIds: "roboco-san-01",
      excludedMemberIds: ["a", "a", "", 3, null, "b"],
    });
    expect(parseSelection(raw, 5).excludedLeaderIds).toEqual([]);
    expect(parseSelection(raw, 5).excludedMemberIds).toEqual(["a", "b"]);
  });
});
