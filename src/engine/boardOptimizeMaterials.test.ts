import { describe, expect, it } from "vite-plus/test";

import { holomen } from "../data";
import {
  boardMaterialsOf,
  boardGraphOf,
  emptyHolomenBoards,
  spentBoardMaterials,
  spentBoardPoints,
} from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import { boardPointsForRank } from "../data/boardPoints";
import { BLUE_BOARD_NODE_IDS } from "../data/blueBoard";
import { GREEN_BOARD_NODE_IDS } from "../data/greenBoard";
import { emptyBoardResources } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import type { ConnectPlacementMap } from "../storage/connect";
import { optimizeBoards } from "./boardOptimize";

/**
 * ホロメンボードの最適化の共有資材制約(2026-10-07 ユーザー指示)。評価器は合成の重み表で、選ぶ・選ばないの境目(資材が 1 足りるか足りないか)を
 * 固定する。資材の数字は外部 master 由来(`boardMaterials.ts`)で、このテストの重みはゲームの値ではない。
 * 総量 = 変えてよいホロメンの投入済み + 登録している余り / 余りが未登録(null)は制限なし / 0 は余りが 0 個
 */
const KORONE = "inugami-korone";
const OKAYU = "nekomata-okayu";
const KOYORI = "hakui-koyori";
const OUTSIDE = "tokino-sora"; // 編成にいないホロメン(minimal では緑の全員のマスは変えない)
const ids = holomen.map((h) => h.id);

const weighted =
  (weights: Readonly<Record<string, number>>) =>
  (boards: Readonly<Record<string, HolomenBoards>>): number => {
    let total = 1000;
    for (const [id, b] of Object.entries(boards))
      for (const color of ["red", "blue", "yellow", "green"] as const)
        for (const node of b[color]) total += weights[`${id}/${node}`] ?? 0;
    return total;
  };

const base = {
  current: {} as Record<string, HolomenBoards>,
  ranks: {} as Record<string, number>,
  placements: {} as ConnectPlacementMap,
  scope: "minimal" as "minimal" | "all",
  leaderHolomenId: KOYORI,
  memberHolomenIds: [OKAYU, KORONE],
  hasSong: true,
  holomenIds: ids,
};

/** 色ごとの余りを指定(指定しない色・種類は未登録 = 制限なし) */
const res = (
  over: Partial<Record<"red" | "blue" | "yellow" | "green", Partial<BoardResources["red"]>>>,
) => {
  const r = emptyBoardResources();
  for (const [color, v] of Object.entries(over) as [
    "red" | "blue" | "yellow" | "green",
    Partial<BoardResources["red"]>,
  ][])
    r[color] = { ...r[color], ...v };
  return r;
};
const boards = (over: Partial<HolomenBoards>): HolomenBoards => ({
  ...emptyHolomenBoards(),
  ...over,
});

const green = boardGraphOf("green");
const blue = boardGraphOf("blue");
/** 初期地点の隣で 1 マスだけで開く緑のマス(経路が 1 マス) */
const singles = GREEN_BOARD_NODE_IDS.filter(
  (id) => green.planUnlock(new Set(), id)?.cells.length === 1,
);
const A = singles[0] ?? "";
const CUBE_A = green.cellMaterials(A).cube;
/** 初期地点の隣で 1 マスだけで開く青のマス(緑はホロメンの間で移さないので、資材の回収はメンバーにだけ効く青で確かめる) */
const X =
  BLUE_BOARD_NODE_IDS.find((id) => blue.planUnlock(new Set(), id)?.cells.length === 1) ?? "";
const CUBE_X = blue.cellMaterials(X).cube;
/** 青 B-007(cube 50 / core 10)へのただ 1 つの経路 */
const b007 = blue.planUnlockRoutes(new Set(), "B-007");
const B007 = b007[0];

describe("前提(実グラフ)", () => {
  it("緑には初期地点の隣の 1 マスで開くマスがあり、cube は 20 / core は 0", () => {
    expect(A).toBe("G-001");
    expect(green.cellMaterials(A)).toEqual({ cube: 20, core: 0 });
    expect(CUBE_A).toBe(20);
  });
  it("青 B-007 へは経路が 1 つだけで、core を 10 使う", () => {
    expect(b007).toHaveLength(1);
    expect(B007?.core).toBe(10);
  });
});

describe("共有資材の予算(ボードPt の予算とは別に、色・種類ごとに守る)", () => {
  const takeA = (resources: BoardResources, extra: Record<string, number> = {}) =>
    optimizeBoards({
      ...base,
      resources,
      evaluate: weighted({ [`${KORONE}/${A}`]: 100, ...extra }),
    });

  it("1. cube が足りるなら取れる(ちょうど 20)", () => {
    const r = takeA(res({ green: { cube: CUBE_A, core: 0 } }));
    expect(r.boards[KORONE]?.green).toContain(A);
  });

  it("2. cube が 1 足りなければ取れない", () => {
    const r = takeA(res({ green: { cube: CUBE_A - 1, core: 0 } }));
    expect(r.boards[KORONE]?.green ?? []).not.toContain(A);
    expect(r.changed).toEqual([]);
  });

  it("3. core だけ不足していても取れない(cube は十分)", () => {
    if (!B007) throw new Error("B-007 の経路がない");
    const need = { cube: B007.cube, core: B007.core };
    const weights = { [`${OKAYU}/B-007`]: 100 };
    const ok = optimizeBoards({
      ...base,
      ranks: { [OKAYU]: 50 },
      resources: res({ blue: need }),
      evaluate: weighted(weights),
    });
    expect(ok.boards[OKAYU]?.blue).toContain("B-007");
    const short = optimizeBoards({
      ...base,
      ranks: { [OKAYU]: 50 },
      resources: res({ blue: { cube: need.cube + 1000, core: need.core - 1 } }),
      evaluate: weighted(weights),
    });
    expect(short.boards[OKAYU]?.blue ?? []).not.toContain("B-007");
  });

  it("4. 別の色の資材は流用できない(青が足りないとき、緑・赤・黄が潤沢でも取れない)", () => {
    const r = optimizeBoards({
      ...base,
      ranks: { [OKAYU]: 50 },
      resources: res({
        blue: { cube: 0, core: 0 },
        green: { cube: 999999, core: 999999 },
        red: { cube: 999999, core: 999999 },
        yellow: { cube: 999999, core: 999999 },
      }),
      evaluate: weighted({ [`${OKAYU}/B-007`]: 100 }),
    });
    expect(r.boards[OKAYU]?.blue ?? []).not.toContain("B-007");
  });

  it("5. 複数のホロメンが同じ色の資材を取り合う(1 つ分しかなければ 1 人だけ、2 つ分なら 2 人とも)", () => {
    const weights = { [`${KORONE}/${A}`]: 100, [`${OKAYU}/${A}`]: 100 };
    const one = optimizeBoards({
      ...base,
      resources: res({ green: { cube: CUBE_A, core: 0 } }),
      evaluate: weighted(weights),
    });
    const taken = [KORONE, OKAYU].filter((id) => one.boards[id]?.green.includes(A));
    expect(taken).toHaveLength(1);
    expect(spentBoardMaterials(one.boards).green.cube).toBeLessThanOrEqual(CUBE_A);
    const two = optimizeBoards({
      ...base,
      resources: res({ green: { cube: CUBE_A * 2, core: 0 } }),
      evaluate: weighted(weights),
    });
    expect([KORONE, OKAYU].filter((id) => two.boards[id]?.green.includes(A))).toHaveLength(2);
  });

  it("6. ボードPt が足りていても cube が足りなければ取れない", () => {
    const r = optimizeBoards({
      ...base,
      ranks: { [KORONE]: 50 },
      resources: res({ green: { cube: CUBE_A - 1, core: 0 } }),
      evaluate: weighted({ [`${KORONE}/${A}`]: 100 }),
    });
    expect(r.boards[KORONE]?.green ?? []).not.toContain(A);
  });

  it("7. cube が足りていてもホロメンのボードPt が足りなければ取れない(資材は未登録 = 制限なし)", () => {
    expect(boardPointsForRank(1)).toBe(0);
    const r = optimizeBoards({
      ...base,
      ranks: { [KORONE]: 1 },
      evaluate: weighted({ [`${KORONE}/${A}`]: 100 }),
    });
    expect(r.boards[KORONE]?.green ?? []).not.toContain(A);
    // ほかのホロメンの Pt は別の財布(ランク 1 のホロメンがいても、Pt に余裕のあるホロメンは取れる)
    const other = optimizeBoards({
      ...base,
      ranks: { [KORONE]: 1, [OKAYU]: 50 },
      resources: res({ green: { cube: CUBE_A, core: 0 } }),
      evaluate: weighted({ [`${KORONE}/${A}`]: 100, [`${OKAYU}/${A}`]: 100 }),
    });
    expect(other.boards[OKAYU]?.green).toContain(A);
    expect(other.boards[KORONE]?.green ?? []).not.toContain(A);
  });

  it("8. コネクトマスは cube / core を使わない(資材は通常マスの経路だけ。余り 0 でも現状のコネクト込みの盤面を保てる)", () => {
    const connectorId = blue.connectorId ?? "";
    const path = blue.planUnlockRoutes(new Set(), connectorId)[0];
    expect(path).toBeDefined();
    const cells = (path?.cells ?? []).filter((id) => id !== connectorId);
    const current = boards({ blue: cells, connects: ["card"] });
    // コネクト込みの投入資材 = 通常マスだけの資材
    expect(boardMaterialsOf(current).blue).toEqual(blue.unlockedMaterials(new Set(cells)));
    expect(blue.cellMaterials(connectorId)).toEqual({ cube: 0, core: 0 });
    const r = optimizeBoards({
      ...base,
      current: { [OKAYU]: current },
      ranks: { [OKAYU]: 50 },
      placements: { [OKAYU]: { card: { extent: "card-3", permil: 1600 } } },
      resources: res({ blue: { cube: 0, core: 0 } }),
      evaluate: weighted({}),
    });
    expect(r.infeasible).toEqual([]);
    expect(r.changed).toEqual([]);
  });

  it("9. 現在ボードへ投入済みの資材を再利用できる(余り 0 でも、投入済みの資材を別のホロメンへ回せる)", () => {
    const r = optimizeBoards({
      ...base,
      current: { [OKAYU]: boards({ blue: [X] }) },
      resources: res({ blue: { cube: 0, core: 0 } }),
      evaluate: weighted({ [`${KORONE}/${X}`]: 100 }),
    });
    expect(r.boards[KORONE]?.blue).toContain(X);
    expect(r.boards[OKAYU]?.blue).toEqual([]); // 回収された
    expect(spentBoardMaterials(r.boards).blue.cube).toBeLessThanOrEqual(CUBE_X);
  });

  it("緑は移さない: 登録の緑はほかのホロメンへ回さず残し、新しい緑(十字のマス)は余りの範囲でだけ開ける", () => {
    const r = optimizeBoards({
      ...base,
      current: { [OKAYU]: boards({ green: [A] }) },
      resources: res({ green: { cube: 0, core: 0 } }),
      evaluate: weighted({ [`${KORONE}/${A}`]: 100 }),
    });
    expect(r.changed).toEqual([]);
  });

  it("10. 登録した余りも追加で使える(投入済み + 余り の分だけ増やせる。1 足りなければ増やせない)", () => {
    const weights = { [`${OKAYU}/${A}`]: 100, [`${KORONE}/${A}`]: 100 };
    const r = optimizeBoards({
      ...base,
      current: { [OKAYU]: boards({ green: [A] }) },
      resources: res({ green: { cube: CUBE_A, core: 0 } }),
      evaluate: weighted(weights),
    });
    expect(r.boards[KORONE]?.green).toContain(A);
    expect(r.boards[OKAYU]).toBeUndefined(); // 登録のまま
    const short = optimizeBoards({
      ...base,
      current: { [OKAYU]: boards({ green: [A] }) },
      resources: res({ green: { cube: CUBE_A - 1, core: 0 } }),
      evaluate: weighted(weights),
    });
    expect(short.boards[KORONE]?.green ?? []).not.toContain(A);
  });

  it("余りが 0 は「余りが 0 個」で制限なしではない / 未登録(null)は制限なし", () => {
    const zero = takeA(res({ green: { cube: 0, core: 0 } }));
    expect(zero.changed).toEqual([]);
    const none = takeA(emptyBoardResources());
    expect(none.boards[KORONE]?.green).toContain(A);
    const omitted = optimizeBoards({ ...base, evaluate: weighted({ [`${KORONE}/${A}`]: 100 }) });
    expect(omitted.boards[KORONE]?.green).toContain(A);
  });
});

describe("scope と共有資材", () => {
  const owned = { [OUTSIDE]: boards({ green: [A] }) };

  it("minimal: ユニット外のホロメンが使っている資材(全員のマス)を勝手に回収しない", () => {
    const r = optimizeBoards({
      ...base,
      scope: "minimal",
      current: owned,
      resources: res({ green: { cube: 0, core: 0 } }),
      evaluate: weighted({ [`${KORONE}/${A}`]: 100 }),
    });
    expect(r.boards[KORONE]?.green ?? []).not.toContain(A);
    expect(r.changed).toEqual([]);
    // 余りがあればユニットは取れ、ユニット外はそのまま
    const withRemaining = optimizeBoards({
      ...base,
      scope: "minimal",
      current: owned,
      resources: res({ green: { cube: CUBE_A, core: 0 } }),
      evaluate: weighted({ [`${KORONE}/${A}`]: 100 }),
    });
    expect(withRemaining.boards[KORONE]?.green).toContain(A);
    expect(withRemaining.changed).not.toContain(OUTSIDE);
  });

  it("all: ユニット外の効かない青の資材もメンバーへ回せる(ユニット外のボードは変えず、反映すると余りが負になる — 外して回す分)", () => {
    const blueOwned = { [OUTSIDE]: boards({ blue: [X] }) };
    const r = optimizeBoards({
      ...base,
      scope: "all",
      current: blueOwned,
      resources: res({ blue: { cube: 0, core: 0 } }),
      evaluate: weighted({ [`${KORONE}/${X}`]: 100, [`${OUTSIDE}/${X}`]: 90 }),
    });
    expect(r.boards[KORONE]?.blue).toContain(X);
    expect(r.changed).toEqual([KORONE]);
  });

  it("all でも、ユニット外の登録の緑はほかのホロメンへ移さない(緑はどのホロメンに置いても同じように効く)", () => {
    const r = optimizeBoards({
      ...base,
      scope: "all",
      current: owned,
      resources: res({ green: { cube: 0, core: 0 } }),
      evaluate: weighted({ [`${KORONE}/${A}`]: 100, [`${OUTSIDE}/${A}`]: 90 }),
    });
    expect(r.changed).toEqual([]);
  });
});

describe("経路の選び方(資材に上限があるとき Pt 最小の経路だけを見ない)", () => {
  const baseAll = { ...base, scope: "all" as const };
  it("緑 G-018: core が 0 なら、core 50 のマスを避ける +3 Pt・cube +200 の別経路で届く(cube が 1 足りなければ届かない)", () => {
    // 資材の経路の選び方を見るため、十字(投入済み)の先の G-018 だけに価値を付ける
    const CROSS = ["G-001", "G-002", "G-003", "G-004", "G-005"];
    const routes = green.planUnlockRoutes(new Set(CROSS), "G-018");
    const coreFree = routes.find((r) => r.core === 0);
    const cheapest = routes.reduce((a, b) => (b.points < a.points ? b : a));
    expect(coreFree).toBeDefined();
    expect(cheapest.core).toBe(50);
    expect((coreFree?.points ?? 0) - cheapest.points).toBe(3);
    expect((coreFree?.cube ?? 0) - cheapest.cube).toBe(200);
    const need = coreFree?.cube ?? 0;
    // 十字のマスにも価値を付ける(ころねは組み直すので、価値のない十字なら外して G-018 に回せてしまう)
    const weights = {
      [`${KORONE}/G-018`]: 100,
      ...Object.fromEntries(CROSS.map((id) => [`${KORONE}/${id}`, 1000])),
    };
    const cross = { [KORONE]: boards({ green: CROSS }) };
    const base = { ...baseAll, current: cross };
    const ok = optimizeBoards({
      ...base,
      ranks: { [KORONE]: 50 },
      resources: res({ green: { cube: need, core: 0 } }),
      evaluate: weighted(weights),
    });
    expect(ok.boards[KORONE]?.green).toContain("G-018");
    // 登録の十字(投入済み)を除いた、新しく使った分
    const used = spentBoardMaterials(ok.boards).green;
    expect(used.core).toBe(0);
    expect(used.cube - spentBoardMaterials(cross).green.cube).toBeLessThanOrEqual(need);
    const short = optimizeBoards({
      ...base,
      ranks: { [KORONE]: 50 },
      resources: res({ green: { cube: need - 1, core: 0 } }),
      evaluate: weighted(weights),
    });
    expect(short.boards[KORONE]?.green ?? []).not.toContain("G-018");
    // 資材の制限がなければ Pt 最小の経路
    const free = optimizeBoards({
      ...base,
      ranks: { [KORONE]: 50 },
      evaluate: weighted(weights),
    });
    expect(spentBoardMaterials(free.boards).green.core).toBe(50);
  });

  it("緑 G-021: Pt 最小の経路(20 Pt / core 50)に core が足りないとき、+3 Pt の別経路(cube 1020 / core 0)で届く", () => {
    const routes = green.planUnlockRoutes(new Set(), "G-021");
    expect(routes.map((r) => [r.points, r.cube, r.core])).toEqual([
      [20, 820, 50],
      [23, 1020, 0],
    ]);
    const weights = { [`${KORONE}/G-021`]: 100 };
    const ok = optimizeBoards({
      ...base,
      ranks: { [KORONE]: 50 },
      resources: res({ green: { cube: 1020, core: 49 } }),
      evaluate: weighted(weights),
    });
    expect(ok.boards[KORONE]?.green).toContain("G-021");
    expect(spentBoardMaterials(ok.boards).green.core).toBeLessThanOrEqual(49);
    const none = optimizeBoards({
      ...base,
      ranks: { [KORONE]: 50 },
      resources: res({ green: { cube: 1019, core: 49 } }),
      evaluate: weighted(weights),
    });
    expect(none.boards[KORONE]?.green ?? []).not.toContain("G-021");
  });
});

describe("どんな重み・資材でも守る制約(乱数で多数の組合せ)", () => {
  it(
    "使用量は総量(変えてよいホロメンの投入済み + 余り)を超えず、各ホロメンの Pt と中心からの到達も守る",
    { timeout: 120_000 },
    () => {
      let seed = 20261007;
      const rnd = (): number => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };
      for (let trial = 0; trial < 6; trial += 1) {
        const weights: Record<string, number> = {};
        for (const h of [KOYORI, OKAYU, KORONE])
          for (const id of [...GREEN_BOARD_NODE_IDS, "B-007", "B-013", "R-025", "R-051"])
            if (rnd() < 0.5) weights[`${h}/${id}`] = Math.floor(rnd() * 50);
        const resources = emptyBoardResources();
        for (const color of ["red", "blue", "yellow", "green"] as const)
          if (rnd() < 0.8)
            resources[color] = {
              cube: Math.floor(rnd() * 600),
              core: rnd() < 0.5 ? null : Math.floor(rnd() * 60),
            };
        const ranks: Record<string, number> = {};
        for (const h of [KOYORI, OKAYU, KORONE])
          if (rnd() < 0.8) ranks[h] = 10 + Math.floor(rnd() * 41);
        const scope = rnd() < 0.5 ? "minimal" : "all";
        const current = { [OKAYU]: boards({ green: [A] }) };
        const result = optimizeBoards({
          ...base,
          current,
          ranks,
          resources,
          scope,
          evaluate: weighted(weights),
        });
        const allowed = scope === "minimal" ? [KOYORI, OKAYU, KORONE] : ids;
        const before = spentBoardMaterials(
          Object.fromEntries(
            allowed.map((id) => [id, current[id as typeof OKAYU] ?? emptyHolomenBoards()]),
          ),
        );
        const afterBoards = { ...current, ...result.boards };
        const after = spentBoardMaterials(
          Object.fromEntries(
            allowed.map((id) => [id, afterBoards[id as typeof OKAYU] ?? emptyHolomenBoards()]),
          ),
        );
        for (const color of ["red", "blue", "yellow", "green"] as const)
          for (const kind of ["cube", "core"] as const) {
            const left = resources[color][kind];
            if (left === null) continue;
            expect(
              after[color][kind],
              `trial ${String(trial)} ${color} ${kind}`,
            ).toBeLessThanOrEqual(before[color][kind] + left);
          }
        for (const [id, b] of Object.entries(result.boards)) {
          const rank = ranks[id];
          const budget = rank === undefined ? Infinity : boardPointsForRank(rank);
          expect(spentBoardPoints(b), `trial ${String(trial)} ${id}`).toBeLessThanOrEqual(budget);
        }
      }
    },
  );
});
