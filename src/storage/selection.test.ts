import { describe, expect, it } from "vite-plus/test";

import {
  SELECTION_SCHEMA_VERSION,
  emptySelection,
  packSlots,
  parseSelection,
  serializeSelection,
} from "./selection";

describe("さがすときの除外の保存形式", () => {
  it("v1(版番号つき)を読め、書き出しは v1 になる", () => {
    const selection = {
      poolMode: "exclude" as const,
      excludedLeaderIds: ["akai-haato-01"],
      excludedMemberIds: ["shirakami-fubuki-01", "natsuiro-matsuri-01"],
      selectedLeaderIds: [],
      selectedMemberIds: [],
    };
    const raw = serializeSelection(selection);
    expect(JSON.parse(raw)).toEqual({ version: SELECTION_SCHEMA_VERSION, ...selection });
    expect(parseSelection(raw)).toEqual(selection);
  });

  it("未保存・壊れたデータは「除外なし」に戻す", () => {
    expect(parseSelection(null)).toEqual(emptySelection());
    expect(parseSelection("{oops")).toEqual(emptySelection());
    expect(parseSelection("[]")).toEqual(emptySelection());
  });

  it("未知のフィールドは読み飛ばし、欠けた項目は除外なしとして読む", () => {
    expect(parseSelection(JSON.stringify({ version: 9, future: true }))).toEqual(emptySelection());
  });

  it("2026-09-14〜16 に保存した枠の選択(リーダー・メンバー・曲)は読み飛ばし、除外だけを読む", () => {
    const raw = JSON.stringify({
      version: 1,
      leaderId: "tokino-sora-01",
      memberIds: ["roboco-san-01", "aki-rosenthal-01", null, null, null],
      songId: "song-1",
      excludedLeaderIds: ["akai-haato-01"],
      excludedMemberIds: [],
    });
    expect(parseSelection(raw)).toEqual({
      ...emptySelection(),
      excludedLeaderIds: ["akai-haato-01"],
    });
    // 書き戻しにも枠の選択は入らない(次の読み込みでも復元されない)
    expect(JSON.parse(serializeSelection(parseSelection(raw)))).toEqual({
      version: SELECTION_SCHEMA_VERSION,
      ...emptySelection(),
      excludedLeaderIds: ["akai-haato-01"],
    });
  });

  it("2026-09-30: 「選択」(poolMode と選択リスト)を保存でき、ない保存は除外として読む", () => {
    const selection = {
      poolMode: "select" as const,
      excludedLeaderIds: ["a"],
      excludedMemberIds: [],
      selectedLeaderIds: ["b", "c"],
      selectedMemberIds: ["d"],
    };
    expect(parseSelection(serializeSelection(selection))).toEqual(selection);
    // 選択を足す前の保存(除外だけ)は、従来どおり除外として読める
    const legacy = JSON.stringify({
      version: 1,
      excludedLeaderIds: ["a"],
      excludedMemberIds: ["b"],
    });
    expect(parseSelection(legacy)).toEqual({
      ...emptySelection(),
      excludedLeaderIds: ["a"],
      excludedMemberIds: ["b"],
    });
    // 知らない種類は除外に倒す
    expect(parseSelection(JSON.stringify({ poolMode: "all" })).poolMode).toBe("exclude");
  });

  it("メンバー枠は前から詰め、重複は 1 枚だけ・枠数ぶんに切りそろえる(保存はしない)", () => {
    expect(packSlots([null, "a", null, "b"], 5)).toEqual(["a", "b", null, null, null]);
    expect(packSlots(["a", "a", "b"], 5)).toEqual(["a", "b", null, null, null]);
    expect(packSlots(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });
});

describe("除外の読み込み", () => {
  it("現在のデータにない ID も捨てずに残す(登録を消さない)", () => {
    const raw = JSON.stringify({
      excludedLeaderIds: ["no-such-card-99"],
      excludedMemberIds: ["roboco-san-01"],
    });
    expect(parseSelection(raw).excludedLeaderIds).toEqual(["no-such-card-99"]);
    expect(parseSelection(raw).excludedMemberIds).toEqual(["roboco-san-01"]);
  });

  it("配列でない値・文字列でない要素・重複は落とす", () => {
    const raw = JSON.stringify({
      excludedLeaderIds: "roboco-san-01",
      excludedMemberIds: ["a", "a", "", 3, null, "b"],
    });
    expect(parseSelection(raw).excludedLeaderIds).toEqual([]);
    expect(parseSelection(raw).excludedMemberIds).toEqual(["a", "b"]);
  });
});
