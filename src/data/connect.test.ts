import { describe, expect, it } from "vite-plus/test";

import { BLUE_BOARD_NODE_IDS, blueBoardEffects } from "./blueBoard";
import {
  amplifyFixed,
  amplifyRatio,
  combineConnectPermils,
  CONNECT_EFFECT_IDS,
  CONNECT_EFFECTS,
  CONNECT_EXTENTS,
  connectFactorsOf,
  connectLevel,
  connectPermil,
  connectTargets,
  CONNECT_EXTENT_DISPLAY_ORDER,
  CONNECT_EXTENT_IDS,
  connectUsageRows,
  extentCellsOnScreen,
} from "./connect";
import type { HolomenBoardLayout } from "./types";

const LEFT: HolomenBoardLayout = { blueSide: "left", lifeSide: "left" };
const RIGHT: HolomenBoardLayout = { blueSide: "right", lifeSide: "right" };
const ids = (targets: { nodeId: string }[]) => targets.map((t) => t.nodeId).sort();

describe("コネクト効果のデータ", () => {
  it("効果はすべて既知の範囲を指し、Lv2 は Lv1 より 500‰ 高い", () => {
    for (const id of CONNECT_EFFECT_IDS) {
      const e = CONNECT_EFFECTS[id];
      expect(Object.hasOwn(CONNECT_EXTENTS, e.extent), id).toBe(true);
      expect(e.permil[1] - e.permil[0], id).toBe(500);
    }
  });

  it("図形一覧の並びは 17 種を過不足なく含み、マスの数が少ない順(同数の中で対称な対が隣)", () => {
    expect([...CONNECT_EXTENT_DISPLAY_ORDER].sort()).toEqual([...CONNECT_EXTENT_IDS].sort());
    expect(new Set(CONNECT_EXTENT_DISPLAY_ORDER).size).toBe(17);
    const counts = CONNECT_EXTENT_DISPLAY_ORDER.map((id) => CONNECT_EXTENTS[id].length);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i], CONNECT_EXTENT_DISPLAY_ORDER[i]).toBeGreaterThanOrEqual(counts[i - 1] ?? 0);
    }
    // 左右対称の対は隣り合う
    const at = (id: (typeof CONNECT_EXTENT_IDS)[number]) =>
      CONNECT_EXTENT_DISPLAY_ORDER.indexOf(id);
    expect(Math.abs(at("card-3") - at("content-3"))).toBe(1);
    expect(Math.abs(at("card-1") - at("content-1"))).toBe(1);
    expect(Math.abs(at("card-2") - at("content-2"))).toBe(1);
    expect(Math.abs(at("center-2") - at("center-3"))).toBe(1);
  });

  it("一覧は アンカー・形・倍率 が同じ入力を 1 行にまとめ、アンカー → 図形の順 → 倍率の順に並ぶ", () => {
    const rows = connectUsageRows({
      "tokino-sora": {
        center: { extent: "center-1", permil: 1400 },
        card: { extent: "card-2", permil: 850 },
      },
      "roboco-san": {
        card: { extent: "card-2", permil: 850 },
        content: { extent: "content-3", permil: 2000 },
      },
      "aki-rosenthal": {
        card: { extent: "card-2", permil: 1350 },
        leader: { extent: "leader-2", permil: 2200 },
      },
      "akai-haato": {},
    });
    expect(rows.map((r) => [r.anchor, r.extent, r.permil, r.holomenIds])).toEqual([
      ["center", "center-1", 1400, ["tokino-sora"]],
      ["leader", "leader-2", 2200, ["aki-rosenthal"]],
      ["card", "card-2", 850, ["tokino-sora", "roboco-san"]],
      ["card", "card-2", 1350, ["aki-rosenthal"]],
      ["content", "content-3", 2000, ["roboco-san"]],
    ]);
    expect(connectUsageRows({})).toEqual([]);
  });

  it("レベルは 5凸で 2、0〜4凸で 1(暫定)。‰ はレベル別", () => {
    expect(connectLevel(0)).toBe(1);
    expect(connectLevel(4)).toBe(1);
    expect(connectLevel(5)).toBe(2);
    expect(connectPermil("card-2-r5", 1)).toBe(850);
    expect(connectPermil("card-2-r5", 2)).toBe(1350);
  });

  it("倍率 = 1 + Σ‰/1000(150% UP は × 2.5。重複は増分を加算し、150% + 140% は 1.9 倍で 2.1 倍ではない)", () => {
    expect(combineConnectPermils([])).toBe(1);
    expect(combineConnectPermils([1500])).toBe(2.5);
    expect(combineConnectPermils([1500, 1400])).toBeCloseTo(3.9, 9);
    expect(combineConnectPermils([850])).toBeCloseTo(1.85, 9);
  });

  it("固定値はマスごとに切り上げ、割合は丸めない", () => {
    expect(amplifyFixed(100, 2.5)).toBe(250);
    expect(amplifyFixed(150, 1.85)).toBe(278); // 277.5 → 278
    expect(amplifyFixed(50, 1)).toBe(50);
    expect(amplifyRatio(2, 2.5)).toBe(5);
    expect(amplifyRatio(2, 1.85)).toBeCloseTo(3.7, 9);
    expect(amplifyRatio(5, 2.5)).toBe(12.5);
  });
});

describe("コネクトの範囲の解決(ホロメンの左右型)", () => {
  it("青のコネクト(青が左)の card-2 は外向きに広がり、青が右のホロメンでは同じマス ID になる(dx を反転)", () => {
    const left = ids(connectTargets(LEFT, "card", "card-2"));
    expect(left).toEqual(
      ["B-009", "B-010", "B-016", "B-017", "B-023", "B-024", "B-025", "B-026"].sort(),
    );
    expect(ids(connectTargets(RIGHT, "card", "card-2"))).toEqual(left);
    // card-3 はコネクトから中心へ向かう 3 マス
    expect(ids(connectTargets(LEFT, "card", "card-3"))).toEqual(["B-006", "B-007", "B-008"]);
  });

  it("黄のコネクトは青の反対側にあり、content-2 は黄のマスに外向きに広がる", () => {
    const left = ids(connectTargets(LEFT, "content", "content-2"));
    expect(left).toEqual(
      ["Y-009", "Y-010", "Y-016", "Y-017", "Y-023", "Y-024", "Y-025", "Y-026"].sort(),
    );
    expect(ids(connectTargets(RIGHT, "content", "content-2"))).toEqual(left);
    expect(connectTargets(LEFT, "content", "content-2").every((t) => t.color === "yellow")).toBe(
      true,
    );
  });

  it("赤のコネクト (0, 7) の leader-3 はライフ系が左なら +x = ステータス系側、右なら dx を反転して同じマス ID", () => {
    const left = ids(connectTargets(LEFT, "leader", "leader-3"));
    expect(left).toEqual(["R-019", "R-020", "R-021", "R-049"]);
    expect(ids(connectTargets(RIGHT, "leader", "leader-3"))).toEqual(left);
    expect(ids(connectTargets(LEFT, "leader", "leader-2"))).toEqual(["R-006", "R-007", "R-008"]);
  });

  it("中心のコネクトは物理座標のまま: +x は青が右のホロメンでは青、青が左では黄に伸びる。-y は緑", () => {
    expect(connectTargets(RIGHT, "center", "card-3")).toEqual([
      { color: "blue", nodeId: "B-001" },
      { color: "blue", nodeId: "B-002" },
      { color: "blue", nodeId: "B-005" },
    ]);
    expect(ids(connectTargets(LEFT, "center", "card-3"))).toEqual(["Y-001", "Y-002", "Y-005"]);
    expect(ids(connectTargets(LEFT, "center", "center-5"))).toEqual([
      "G-001",
      "G-002",
      "G-003",
      "G-004",
      "G-005",
    ]);
    expect(ids(connectTargets(LEFT, "center", "center-1"))).toEqual([
      "R-001",
      "R-002",
      "R-003",
      "R-004",
      "R-005",
    ]);
  });

  it("範囲がボードの外に出た座標は含まれず、コネクトマスそのものは対象にならない", () => {
    // general-1 の (±1, ±1) にはマスがない(中心の斜め)。(0, ±1) は赤 / 緑、(±1, 0) は青 / 黄
    const t = connectTargets(LEFT, "center", "general-1");
    expect(t).toHaveLength(8);
    expect(ids(t)).toEqual([
      "B-001",
      "B-002",
      "G-001",
      "G-002",
      "R-001",
      "R-002",
      "Y-001",
      "Y-002",
    ]);
  });
});

describe("実機との整合(2026-09-11 status.md「ホロメン別の青ホロメンボード」猫又おかゆ)", () => {
  /**
   * おかゆ(青が右)の青ボードは全解放(P/T/S 各 +5.0%・発動頻度 +12% が全マス分)。表示は 全パラ +546 / S +688 /
   * P +528 / T +528 / 発動率 +35.1%。単純合計(300 / 400 / 400 / 400 / 30.0)との差が、青のコネクトに card-2(Lv1 850)、
   * 中心に card-3(★4 の Lv1 1600)を置いた形で全項目一致する(置いたカードの実体は未確認なので仮定のカード ID で表す)。
   * 「‰/1000 をそのまま倍率」にすると発動率は 29.1% になり合わない
   */
  it("card-2(+85%)を青のコネクト、3 マス直線(+160%)を中心に置くと 546 / 688 / 528 / 528 / 35.1 になる", () => {
    const factors = connectFactorsOf("nekomata-okayu", {
      card: { extent: "card-2", permil: 850 },
      center: { extent: "card-3", permil: 1600 },
    });
    expect(factors.blue?.["B-023"]).toBeCloseTo(1.85, 9);
    expect(factors.blue?.["B-002"]).toBeCloseTo(2.6, 9);
    expect(factors.blue?.["B-007"]).toBeUndefined();
    const e = blueBoardEffects(BLUE_BOARD_NODE_IDS, factors.blue);
    expect(e.allParams).toBe(546);
    expect(e.params.sense).toBe(688);
    expect(e.params.performance).toBe(528);
    expect(e.params.technique).toBe(528);
    expect(e.activeRatePercent).toBeCloseTo(35.1, 9);
    expect(e.activeFrequencyPercent).toBe(12);
    expect(e.percents).toEqual({ performance: 5, technique: 5, sense: 5 });
  });

  it("配置がなければ単純合計のまま(既存のゴールデンは変わらない)", () => {
    const e = blueBoardEffects(BLUE_BOARD_NODE_IDS, undefined);
    expect([e.allParams, e.params.sense, e.activeRatePercent]).toEqual([300, 400, 30]);
    expect(connectFactorsOf("nekomata-okayu", {})).toEqual({});
  });

  it("未解放のマスは範囲内でも効かず、‰ が 0 以下の入力は増幅しない", () => {
    const factors = connectFactorsOf("nekomata-okayu", {
      card: { extent: "card-2", permil: 1350 },
    });
    const e = blueBoardEffects(["B-001", "B-023"], factors.blue);
    // B-023(P +150)は範囲内で × 2.35 = 352.5 → 353。B-001 は範囲外
    expect(e.params.performance).toBe(353);
    expect(e.allParams).toBe(50);
    expect(connectFactorsOf("nekomata-okayu", { card: { extent: "card-2", permil: 0 } })).toEqual(
      {},
    );
  });

  it("図形の表示用のセルは盤面の見た目と同じ向き(青が右のホロメンの青のコネクトは dx を反転)", () => {
    expect(extentCellsOnScreen(LEFT, "card", "card-3")).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    expect(extentCellsOnScreen(RIGHT, "card", "card-3")).toEqual([
      [-1, 0],
      [-2, 0],
      [-3, 0],
    ]);
    expect(extentCellsOnScreen(RIGHT, "center", "card-3")).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });
});
