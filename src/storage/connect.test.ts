import { describe, expect, it } from "vite-plus/test";

import type { ConnectEntry } from "./connect";

import {
  CONNECT_SCHEMA_VERSION,
  parseConnect,
  replaceConnectPlacements,
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

  it("倍率の候補にない過去の自由入力の値も落とさず、読み込んで書き出しても変わらない(2026-10-02 選択制へ変えたあとも既存の保存を壊さない)", () => {
    const entries: ConnectEntry[] = [
      {
        holomenId: "nekomata-okayu",
        placements: {
          card: { extent: "card-2", permil: 1234 }, // 候補は 850 / 1350
          center: { extent: "card-3", permil: 3000 }, // 候補は 1600 / 2100 / 2600
          leader: { extent: "leader-2", permil: 1 },
        },
      },
    ];
    const raw = serializeConnect(entries);
    expect(parseConnect(raw)).toEqual(entries);
    expect(parseConnect(serializeConnect(parseConnect(raw)))).toEqual(entries);
    // 選択に変えても、読み込みは値を候補に丸めない（開いただけで値が変わらない）
    expect(toConnectPlacementMap(parseConnect(raw))["nekomata-okayu"]?.card?.permil).toBe(1234);
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

describe("コネクトの配置の置き換え(コネクトの最適化の反映)", () => {
  const entries: ConnectEntry[] = [
    {
      holomenId: "nekomata-okayu",
      placements: { center: { extent: "card-3", permil: 1600 } },
    },
    {
      holomenId: "inugami-korone",
      placements: { card: { extent: "card-3", permil: 2100 } },
    },
    { holomenId: "unknown-holomen", placements: { center: { extent: "card-1", permil: 1100 } } },
  ];

  it("map にあるホロメンは map の配置になり、ないホロメンの配置は外れる。新しいホロメンは足す", () => {
    const next = replaceConnectPlacements(entries, {
      "nekomata-okayu": { center: { extent: "center-2", permil: 1400 } },
      "ouro-kronii": { card: { extent: "card-1", permil: 1100 } },
    });
    expect(toConnectPlacementMap(next)).toEqual({
      "nekomata-okayu": { center: { extent: "center-2", permil: 1400 } },
      "ouro-kronii": { card: { extent: "card-1", permil: 1100 } },
    });
  });

  it("元の配列と配置は書き換えず、map とも参照を共有しない", () => {
    const map = { "inugami-korone": { card: { extent: "card-3" as const, permil: 2100 } } };
    const before = JSON.stringify(entries);
    const next = replaceConnectPlacements(entries, map);
    expect(JSON.stringify(entries)).toBe(before);
    const placed = next.find((e) => e.holomenId === "inugami-korone")?.placements.card;
    expect(placed).toEqual(map["inugami-korone"].card);
    expect(placed).not.toBe(map["inugami-korone"].card);
  });

  it("最適化の結果(現在の配置から変更を重ねた全体)をそのまま反映すると、同じ配置が保存される", () => {
    const current = toConnectPlacementMap(entries);
    expect(toConnectPlacementMap(replaceConnectPlacements(entries, current))).toEqual(current);
  });
});
