import { describe, expect, it } from "vite-plus/test";

import { BLOOM_MAX } from "../data/bloom";
import { OWNED_SCHEMA_VERSION, parseOwned, serializeOwned } from "./owned";

describe("所持カードの保存形式", () => {
  it("v0(ID の文字列配列)は開花 0 として読める", () => {
    expect(parseOwned(JSON.stringify(["tokino-sora-01", "roboco-san-01"]))).toEqual([
      { id: "tokino-sora-01", bloom: 0 },
      { id: "roboco-san-01", bloom: 0 },
    ]);
  });

  it("v1({id, bloom} の配列)を読める", () => {
    expect(parseOwned(JSON.stringify([{ id: "tokino-sora-01", bloom: 3 }]))).toEqual([
      { id: "tokino-sora-01", bloom: 3 },
    ]);
  });

  it("v2(版番号つき)を読め、書き出しは v2 になる", () => {
    const cards = [{ id: "tokino-sora-01", bloom: 5 }];
    const raw = serializeOwned(cards);
    expect(JSON.parse(raw)).toEqual({ version: OWNED_SCHEMA_VERSION, cards });
    expect(parseOwned(raw)).toEqual(cards);
  });

  it("現在のデータにない ID も捨てない(書き戻しで登録が消えないこと)", () => {
    const raw = JSON.stringify([{ id: "unknown-card-99", bloom: 2 }, "tokino-sora-01"]);
    expect(parseOwned(raw)).toEqual([
      { id: "unknown-card-99", bloom: 2 },
      { id: "tokino-sora-01", bloom: 0 },
    ]);
  });

  it("開花段階は 0〜BLOOM_MAX に丸め、不正値は 0 にする", () => {
    const raw = JSON.stringify([
      { id: "a", bloom: 99 },
      { id: "b", bloom: -1 },
      { id: "c", bloom: "3" },
      { id: "d", bloom: 1.5 },
    ]);
    expect(parseOwned(raw).map((c) => c.bloom)).toEqual([BLOOM_MAX, 0, 0, 0]);
  });

  it("壊れた保存・未知の形は空として扱う", () => {
    expect(parseOwned(null)).toEqual([]);
    expect(parseOwned("{not json")).toEqual([]);
    expect(parseOwned(JSON.stringify({ foo: 1 }))).toEqual([]);
    expect(parseOwned(JSON.stringify([null, 1, {}, { id: "" }]))).toEqual([]);
  });

  it("同じ ID の重複は先勝ちで 1 件にする", () => {
    const raw = JSON.stringify([
      { id: "a", bloom: 1 },
      { id: "a", bloom: 4 },
    ]);
    expect(parseOwned(raw)).toEqual([{ id: "a", bloom: 1 }]);
  });
});
