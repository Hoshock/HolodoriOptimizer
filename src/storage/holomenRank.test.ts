import { describe, expect, it } from "vite-plus/test";

import {
  HOLOMEN_RANK_SCHEMA_VERSION,
  parseHolomenRanks,
  serializeHolomenRanks,
  setHolomenRank,
  toHolomenRankMap,
} from "./holomenRank";

/**
 * ホロメンランクの保存(2026-10-04 ユーザー指示)。未登録(= ボードPt の制限なし)は配列に載せないことで表し、0 を未登録の代わりにしない
 */
describe("ホロメンランクの保存形式", () => {
  it("版番号つきの封筒で書き、読み戻せる。キーがない旧データは「全員未登録」", () => {
    const entries = [
      { holomenId: "nekomata-okayu", rank: 27 },
      { holomenId: "tokino-sora", rank: 1 },
    ];
    const raw = serializeHolomenRanks(entries);
    expect(JSON.parse(raw)).toEqual({ version: HOLOMEN_RANK_SCHEMA_VERSION, ranks: entries });
    expect(parseHolomenRanks(raw)).toEqual(entries);
    expect(parseHolomenRanks(null)).toEqual([]);
    expect(parseHolomenRanks("{")).toEqual([]);
    expect(parseHolomenRanks(JSON.stringify({ entries: [] }))).toEqual([]);
  });

  it("範囲外・整数でない・文字列のランクは読み飛ばす(0 を未登録の代わりにしない)。重複は先頭を残す", () => {
    const raw = JSON.stringify({
      version: 1,
      ranks: [
        { holomenId: "a", rank: 0 },
        { holomenId: "b", rank: 51 },
        { holomenId: "c", rank: 2.5 },
        { holomenId: "d", rank: "10" },
        { holomenId: "e", rank: 50 },
        { holomenId: "e", rank: 3 },
        { holomenId: "", rank: 3 },
        null,
      ],
    });
    expect(parseHolomenRanks(raw)).toEqual([{ holomenId: "e", rank: 50 }]);
  });

  it("現在のデータにないホロメン ID も捨てずに持ち回る", () => {
    const raw = serializeHolomenRanks([{ holomenId: "future-holomen", rank: 12 }]);
    expect(parseHolomenRanks(raw)).toEqual([{ holomenId: "future-holomen", rank: 12 }]);
  });

  it("setHolomenRank: 登録・置き換え・null で未登録へ戻す。範囲外は例外", () => {
    let entries = setHolomenRank([], "x", 27);
    entries = setHolomenRank(entries, "y", 3);
    expect(entries).toEqual([
      { holomenId: "x", rank: 27 },
      { holomenId: "y", rank: 3 },
    ]);
    entries = setHolomenRank(entries, "x", 28);
    expect(toHolomenRankMap(entries)).toEqual({ x: 28, y: 3 });
    entries = setHolomenRank(entries, "x", null);
    expect(toHolomenRankMap(entries)).toEqual({ y: 3 });
    expect(() => setHolomenRank(entries, "x", 0)).toThrow(RangeError);
    expect(() => setHolomenRank(entries, "x", 51)).toThrow(RangeError);
  });
});
