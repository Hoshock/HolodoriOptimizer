import { describe, expect, it } from "vite-plus/test";

import {
  normalizeUnitName,
  parseUnits,
  putUnit,
  removeUnit,
  renameUnit,
  sameUnit,
  serializeUnits,
  UNIT_NAME_MAX_LENGTH,
  UNIT_SLOT_COUNT,
  UNITS_SCHEMA_VERSION,
  unitDisplayName,
  unitSlotOf,
} from "./units";
import type { SavedUnit } from "./units";

const unit = (slot: number, leaderId: string, members: string[]): SavedUnit => ({
  slot,
  leaderId,
  memberIds: members,
});
const FIVE = ["a", "b", "c", "d", "e"];

describe("お気に入りユニットの保存形式", () => {
  it("v1(版番号つき)を読め、書き出しは v1 になる", () => {
    const units = [unit(1, "leader", FIVE)];
    const raw = serializeUnits(units);
    expect(JSON.parse(raw)).toEqual({ version: UNITS_SCHEMA_VERSION, units });
    expect(parseUnits(raw)).toEqual(units);
  });

  it("配列そのままの形式も読める(将来の封筒変更に備えた前方の互換)", () => {
    expect(parseUnits(JSON.stringify([unit(3, "leader", FIVE)]))).toEqual([
      unit(3, "leader", FIVE),
    ]);
  });

  it("壊れた文字列・未登録は登録なしとして読む", () => {
    expect(parseUnits(null)).toEqual([]);
    expect(parseUnits("{")).toEqual([]);
    expect(parseUnits(JSON.stringify({ version: 1 }))).toEqual([]);
  });

  it("現在のデータにない ID も捨てない(書き戻しで登録が消えないこと)", () => {
    const raw = JSON.stringify([unit(2, "unknown-card-99", FIVE)]);
    expect(parseUnits(raw)).toEqual([unit(2, "unknown-card-99", FIVE)]);
  });

  it("番号が範囲外・メンバー数が 5 でない・リーダーがない項目は落とす", () => {
    const raw = JSON.stringify([
      unit(0, "leader", FIVE),
      unit(UNIT_SLOT_COUNT + 1, "leader", FIVE),
      unit(1, "leader", ["a", "b"]),
      { slot: 2, memberIds: FIVE },
      unit(3, "leader", FIVE),
    ]);
    expect(parseUnits(raw)).toEqual([unit(3, "leader", FIVE)]);
  });

  it("番号の昇順にそろえ、同じ番号は先に現れたものを残す", () => {
    const raw = JSON.stringify([
      unit(5, "first", FIVE),
      unit(2, "second", FIVE),
      unit(5, "duplicate", FIVE),
    ]);
    expect(parseUnits(raw)).toEqual([unit(2, "second", FIVE), unit(5, "first", FIVE)]);
  });
});

describe("編成の同一判定と登録の操作", () => {
  it("メンバーの並びが違っても同じ編成とみなす", () => {
    expect(
      sameUnit(
        { leaderId: "l", memberIds: FIVE },
        { leaderId: "l", memberIds: [...FIVE].reverse() },
      ),
    ).toBe(true);
  });

  it("リーダーが違えば別の編成", () => {
    expect(sameUnit({ leaderId: "l", memberIds: FIVE }, { leaderId: "x", memberIds: FIVE })).toBe(
      false,
    );
  });

  it("メンバーが 1 枚でも違えば別の編成", () => {
    expect(
      sameUnit(
        { leaderId: "l", memberIds: FIVE },
        { leaderId: "l", memberIds: ["a", "b", "c", "d", "z"] },
      ),
    ).toBe(false);
  });

  it("登録されている番号を引ける", () => {
    const units = [unit(4, "l", FIVE)];
    expect(unitSlotOf(units, { leaderId: "l", memberIds: [...FIVE].reverse() })).toBe(4);
    expect(unitSlotOf(units, { leaderId: "x", memberIds: FIVE })).toBe(null);
  });

  it("同じ番号への登録は上書きし、番号の昇順を保つ", () => {
    const units = putUnit([unit(3, "old", FIVE)], 1, { leaderId: "new", memberIds: FIVE });
    expect(units).toEqual([unit(1, "new", FIVE), unit(3, "old", FIVE)]);
    expect(putUnit(units, 3, { leaderId: "replaced", memberIds: FIVE })).toEqual([
      unit(1, "new", FIVE),
      unit(3, "replaced", FIVE),
    ]);
  });

  it("範囲外の番号への登録は何もしない", () => {
    const units = [unit(1, "l", FIVE)];
    expect(putUnit(units, 0, { leaderId: "x", memberIds: FIVE })).toBe(units);
    expect(putUnit(units, UNIT_SLOT_COUNT + 1, { leaderId: "x", memberIds: FIVE })).toBe(units);
  });

  it("解除はその番号だけを消す", () => {
    expect(removeUnit([unit(1, "a", FIVE), unit(2, "b", FIVE)], 1)).toEqual([unit(2, "b", FIVE)]);
  });
});

/**
 * ユニット名（2026-09-15 ユーザー指示。最大 10 文字、鉛筆から付け直す）。
 * 名前は後から足した項目なので、**名前のない過去の保存も読めること**を固定する
 */
describe("ユニット名", () => {
  it("上限は 10 文字で、前後の空白は落とす。空なら名前なし", () => {
    expect(UNIT_NAME_MAX_LENGTH).toBe(10);
    expect(normalizeUnitName("  ほろどり最強  ")).toBe("ほろどり最強");
    expect(normalizeUnitName("あいうえおかきくけこさしすせそ")).toBe("あいうえおかきくけこ");
    expect(normalizeUnitName("   ")).toBeNull();
    expect(normalizeUnitName(undefined)).toBeNull();
  });

  it("付けていなければ「ユニット{番号}」で出す", () => {
    expect(unitDisplayName(3, null)).toBe("ユニット3");
    expect(unitDisplayName(3, "")).toBe("ユニット3");
    expect(unitDisplayName(3, "推し編成")).toBe("推し編成");
  });

  it("付け直しは保存へ往復し、空にすると名前なしへ戻る", () => {
    const base = putUnit([], 1, { leaderId: "a", memberIds: ["b", "c", "d", "e", "f"] });
    const named = renameUnit(base, 1, "  推し編成 ");
    expect(named[0]?.name).toBe("推し編成");
    expect(parseUnits(serializeUnits(named))[0]?.name).toBe("推し編成");

    const cleared = renameUnit(named, 1, "");
    expect(cleared[0]?.name).toBeUndefined();
    expect(serializeUnits(cleared)).not.toContain("name");
  });

  it("名前のない過去の保存もそのまま読める", () => {
    const old = JSON.stringify({
      version: 1,
      units: [{ slot: 2, leaderId: "a", memberIds: ["b", "c", "d", "e", "f"] }],
    });
    const parsed = parseUnits(old);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.name).toBeUndefined();
    expect(unitDisplayName(2, parsed[0]?.name)).toBe("ユニット2");
  });

  it("上書き登録すると前の名前は残らない（別の編成になるため）", () => {
    const named = renameUnit(
      putUnit([], 1, { leaderId: "a", memberIds: ["b", "c", "d", "e", "f"] }),
      1,
      "推し編成",
    );
    const replaced = putUnit(named, 1, { leaderId: "z", memberIds: ["b", "c", "d", "e", "f"] });
    expect(replaced[0]?.name).toBeUndefined();
  });
});
