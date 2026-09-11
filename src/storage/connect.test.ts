import { describe, expect, it } from "vite-plus/test";

import {
  CONNECT_SCHEMA_VERSION,
  parseConnect,
  serializeConnect,
  setConnectPlacement,
  toConnectPlacementMap,
} from "./connect";

describe("コネクトの配置の保存形式", () => {
  it("v1(版番号つき)を読め、書き出しは v1。無いキー(旧データ)は空扱い", () => {
    const entries = [
      { holomenId: "nekomata-okayu", placements: { card: "nekomata-okayu-01", center: "x-4" } },
    ];
    const raw = serializeConnect(entries);
    expect(JSON.parse(raw)).toEqual({ version: CONNECT_SCHEMA_VERSION, entries });
    expect(parseConnect(raw)).toEqual(entries);
    expect(parseConnect(null)).toEqual([]);
    expect(parseConnect("{")).toEqual([]);
    expect(parseConnect(JSON.stringify({ boards: [] }))).toEqual([]);
  });

  it("知らないアンカーは読み飛ばし、データにないホロメン・カード ID は捨てない。同じホロメンは最初の 1 件", () => {
    const raw = JSON.stringify({
      version: 1,
      entries: [
        { holomenId: "unknown", placements: { leader: "unknown-card", bogus: "x", card: 1 } },
        { holomenId: "unknown", placements: { center: "y" } },
        { holomenId: "" },
      ],
    });
    expect(parseConnect(raw)).toEqual([
      { holomenId: "unknown", placements: { leader: "unknown-card" } },
    ]);
  });

  it("置く / 外すは新しい配列を返し、空の配置は計算用の map に含めない", () => {
    const a = setConnectPlacement([], "h1", "card", "c1");
    expect(a).toEqual([{ holomenId: "h1", placements: { card: "c1" } }]);
    const b = setConnectPlacement(a, "h1", "center", "c2");
    const c = setConnectPlacement(b, "h1", "card", null);
    expect(c).toEqual([{ holomenId: "h1", placements: { center: "c2" } }]);
    expect(a[0]?.placements).toEqual({ card: "c1" }); // 元は変えない
    expect(toConnectPlacementMap(setConnectPlacement(c, "h1", "center", null))).toEqual({});
  });
});
