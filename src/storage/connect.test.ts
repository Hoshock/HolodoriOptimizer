import { describe, expect, it } from "vite-plus/test";

import type { ConnectEntry } from "./connect";

import {
  CONNECT_SCHEMA_VERSION,
  parseConnect,
  serializeConnect,
  setConnectPlacement,
  toConnectPlacementMap,
} from "./connect";

describe("コネクトの入力の保存形式", () => {
  it("v3(版番号つき)を読め、書き出しは v3。無いキー(旧データ)は空扱い", () => {
    const entries = [
      {
        holomenId: "nekomata-okayu",
        placements: {
          card: { extent: "card-2" as const, permil: 850 },
          center: { extent: "card-3" as const, permil: 1600 },
        },
      },
    ];
    const raw = serializeConnect(entries);
    expect(JSON.parse(raw)).toEqual({ version: CONNECT_SCHEMA_VERSION, entries });
    expect(parseConnect(raw)).toEqual(entries);
    expect(parseConnect(null)).toEqual([]);
    expect(parseConnect("{")).toEqual([]);
    expect(parseConnect(JSON.stringify({ boards: [] }))).toEqual([]);
  });

  it("v2(反転して当てていた旧モデル)の形は、反転していたアンカーだけ左右反転した形へ写して読む", () => {
    const raw = JSON.stringify({
      version: 2,
      entries: [
        {
          holomenId: "nekomata-okayu",
          placements: {
            card: { extent: "card-2", permil: 850 },
            center: { extent: "card-3", permil: 1600 },
          },
        },
        { holomenId: "tokino-sora", placements: { card: { extent: "card-2", permil: 850 } } },
      ],
    });
    expect(parseConnect(raw)).toEqual([
      {
        holomenId: "nekomata-okayu",
        placements: {
          center: { extent: "card-3", permil: 1600 },
          card: { extent: "content-2", permil: 850 },
        },
      },
      { holomenId: "tokino-sora", placements: { card: { extent: "card-2", permil: 850 } } },
    ]);
    // v3 はそのまま
    expect(parseConnect(raw.replace('"version":2', '"version":3'))).toEqual([
      {
        holomenId: "nekomata-okayu",
        placements: {
          center: { extent: "card-3", permil: 1600 },
          card: { extent: "card-2", permil: 850 },
        },
      },
      { holomenId: "tokino-sora", placements: { card: { extent: "card-2", permil: 850 } } },
    ]);
  });

  it("v1(カード ID の文字列)・知らない形・0 以下の ‰・知らないアンカーは読み飛ばし、データにないホロメンは残す", () => {
    const raw = JSON.stringify({
      version: 1,
      entries: [
        {
          holomenId: "unknown",
          placements: {
            leader: "nekomata-okayu-02",
            card: { extent: "nope", permil: 1500 },
            content: { extent: "content-1", permil: 0 },
            center: { extent: "center-1", permil: 1400.4 },
            bogus: { extent: "card-1", permil: 1 },
          },
        },
        { holomenId: "unknown", placements: {} },
        { holomenId: "" },
      ],
    });
    expect(parseConnect(raw)).toEqual([
      { holomenId: "unknown", placements: { center: { extent: "center-1", permil: 1400 } } },
    ]);
  });

  it("置く / 外すは新しい配列を返し、空の入力は計算用の map に含めない", () => {
    const a = setConnectPlacement([], "h1", "card", { extent: "card-1", permil: 1100 });
    expect(a).toEqual([
      { holomenId: "h1", placements: { card: { extent: "card-1", permil: 1100 } } },
    ]);
    const b = setConnectPlacement(a, "h1", "center", { extent: "general-1", permil: 550 });
    const c = setConnectPlacement(b, "h1", "card", null);
    expect(c).toEqual([
      { holomenId: "h1", placements: { center: { extent: "general-1", permil: 550 } } },
    ]);
    expect(a[0]?.placements).toEqual({ card: { extent: "card-1", permil: 1100 } });
    expect(toConnectPlacementMap(setConnectPlacement(c, "h1", "center", null))).toEqual({});
  });

  it("計算用の map は配置 1 つ 1 つまで新しいオブジェクトに写す(元の配置を参照しない — Worker へ複製できる形)", () => {
    const entries: ConnectEntry[] = [
      { holomenId: "nekomata-okayu", placements: { card: { extent: "content-2", permil: 850 } } },
    ];
    const map = toConnectPlacementMap(entries);
    expect(map["nekomata-okayu"]).toEqual({ card: { extent: "content-2", permil: 850 } });
    expect(map["nekomata-okayu"]?.card).not.toBe(entries[0]?.placements.card);
  });
});
