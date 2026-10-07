import { describe, expect, it } from "vite-plus/test";

import {
  BOARD_MATERIAL_COLORS,
  BOARD_NODE_MATERIALS,
  boardColorMaterialTotals,
  nodeBoardMaterials,
} from "./boardMaterials";
import { BOARD_NODE_COSTS, nodeBoardPoints } from "./boardPoints";
import {
  boardGraphOf,
  boardMaterialsOf,
  emptyHolomenBoards,
  spentBoardMaterials,
} from "./boardState";
import type { HolomenBoards } from "./boardState";

/**
 * マス別のキューブ・コアキューブ消費量(外部 master 由来 — `boardMaterials.ts`)の固定。
 * 数字は 2026-10-07 にユーザーが master(SkillTreeNode.json の consumptions)から集計して提供した値で、実機の値ではない
 */
describe("マス別の資材 master", () => {
  it("色ごとのマス数と合計が master の集計と一致する", () => {
    expect(boardColorMaterialTotals("red")).toEqual({ nodes: 63, cube: 6065, core: 600 });
    expect(boardColorMaterialTotals("blue")).toEqual({ nodes: 31, cube: 1870, core: 160 });
    expect(boardColorMaterialTotals("yellow")).toEqual({ nodes: 31, cube: 1870, core: 160 });
    expect(boardColorMaterialTotals("green")).toEqual({ nodes: 25, cube: 3020, core: 150 });
  });

  it("代表的な特殊ケース(ボードPt からは導けない値)", () => {
    const cost = (id: string) => nodeBoardMaterials(id);
    expect(cost("R-002")).toEqual({ cube: 25, core: 5 });
    expect(cost("R-034")).toEqual({ cube: 50, core: 10 });
    expect(cost("R-050")).toEqual({ cube: 200, core: 0 });
    expect(cost("R-051")).toEqual({ cube: 250, core: 75 });
    expect(cost("B-007")).toEqual({ cube: 50, core: 10 });
    expect(cost("B-013")).toEqual({ cube: 100, core: 25 });
    expect(cost("Y-008")).toEqual({ cube: 50, core: 10 });
    expect(cost("Y-013")).toEqual({ cube: 100, core: 25 });
    expect(cost("G-011")).toEqual({ cube: 200, core: 50 });
    expect(cost("G-025")).toEqual({ cube: 160, core: 0 });
  });

  it("同じボードPt でも資材は違う(R-034 = 4 Pt / R-050 = 4 Pt)。Pt から資材を推測しない", () => {
    expect(nodeBoardPoints("R-034")).toBe(4);
    expect(nodeBoardPoints("R-050")).toBe(4);
    expect(nodeBoardMaterials("R-034")).not.toEqual(nodeBoardMaterials("R-050"));
  });

  it("コネクトマス(S-002 / S-003 / S-004)は cube 0 / core 0(ボードPt だけ消費する)", () => {
    for (const id of ["S-002", "S-003", "S-004"])
      expect(nodeBoardMaterials(id), id).toEqual({ cube: 0, core: 0 });
  });

  it("未知の ID は null", () => {
    expect(nodeBoardMaterials("R-064")).toBeNull();
    expect(nodeBoardMaterials("X-001")).toBeNull();
    expect(nodeBoardMaterials("")).toBeNull();
  });

  it("ボードPt の表にある通常マスはすべて資材を持ち、その逆もそう(漏れも余りもない)", () => {
    const missing = [...BOARD_NODE_COSTS.keys()].filter((id) => !BOARD_NODE_MATERIALS.has(id));
    const extra = [...BOARD_NODE_MATERIALS.keys()].filter(
      (id) => !BOARD_NODE_COSTS.has(id) && !id.startsWith("S-"),
    );
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it("各ボードのグラフが同じ表を引く(通常マス = master、コネクト・初期地点 = 0)", () => {
    for (const color of BOARD_MATERIAL_COLORS) {
      const graph = boardGraphOf(color);
      const prefix = { red: "R", blue: "B", yellow: "Y", green: "G" }[color];
      let cube = 0;
      let core = 0;
      for (const [id, m] of BOARD_NODE_MATERIALS) {
        if (!id.startsWith(`${prefix}-`)) continue;
        expect(graph.cellMaterials(id), id).toEqual(m);
        cube += m.cube;
        core += m.core;
      }
      expect({ cube, core }).toEqual(
        (({ cube: c, core: o }) => ({ cube: c, core: o }))(boardColorMaterialTotals(color)),
      );
      if (graph.connectorId !== null)
        expect(graph.cellMaterials(graph.connectorId)).toEqual({ cube: 0, core: 0 });
    }
  });
});

const boards = (over: Partial<HolomenBoards>): HolomenBoards => ({
  ...emptyHolomenBoards(),
  ...over,
});

describe("投入済み資材の逆算", () => {
  it("1 人のホロメンの 4 色のボードから、色ごとの資材を表引きで足す(コネクトは 0)", () => {
    const m = boardMaterialsOf(
      boards({
        red: ["R-001", "R-002"], // 20+25 / 0+5
        blue: ["B-001", "B-007"], // 20+50 / 0+10 — B-007 へは B-001 経由。ここでは集合をそのまま数える
        yellow: ["Y-008"], // 50 / 10
        green: ["G-011"], // 200 / 50
        connects: [],
      }),
    );
    expect(m.red).toEqual({ cube: 45, core: 5 });
    expect(m.blue).toEqual({ cube: 70, core: 10 });
    expect(m.yellow).toEqual({ cube: 50, core: 10 });
    expect(m.green).toEqual({ cube: 200, core: 50 });
  });

  it("解放したコネクトマスは資材に入らない(ボードPt だけ)", () => {
    const withConnect = boardMaterialsOf(
      boards({ red: ["R-001"], blue: ["B-001"], connects: ["leader", "card", "content"] }),
    );
    const without = boardMaterialsOf(boards({ red: ["R-001"], blue: ["B-001"], connects: [] }));
    expect(withConnect).toEqual(without);
  });

  it("全ホロメンの合計: 同じ色を複数のホロメンが開けていれば合算する(ホロメンごとの別財布にしない)", () => {
    const total = spentBoardMaterials({
      a: boards({ green: ["G-001", "G-002"], red: ["R-001"] }),
      b: boards({ green: ["G-001"], red: ["R-001", "R-003"] }),
      c: boards({ blue: ["B-001"] }),
    });
    expect(total.green).toEqual({ cube: 60, core: 0 }); // 20×3
    expect(total.red).toEqual({ cube: 60, core: 0 }); // 20×3
    expect(total.blue).toEqual({ cube: 20, core: 0 });
    expect(total.yellow).toEqual({ cube: 0, core: 0 });
  });

  it("空・未知のマスは 0(未知の ID は数えない)", () => {
    expect(spentBoardMaterials({})).toEqual(spentBoardMaterials({ x: emptyHolomenBoards() }));
    const unknown = boardMaterialsOf(boards({ red: ["R-999"] }));
    expect(unknown.red).toEqual({ cube: 0, core: 0 });
  });
});

describe("解放の経路(Pt・cube・core の非劣な経路)", () => {
  const red = boardGraphOf("red");
  const green = boardGraphOf("green");

  it("Pt 最小の経路は常に候補に入り、先頭(Pt 昇順)になる", () => {
    for (const color of BOARD_MATERIAL_COLORS) {
      const graph = boardGraphOf(color);
      for (const [id] of BOARD_NODE_MATERIALS) {
        if (graph.cellPoints(id) === 0 || graph.planUnlock(new Set(), id) === null) continue;
        const routes = graph.planUnlockRoutes(new Set(), id);
        const best = graph.planUnlock(new Set(), id);
        expect(routes[0]?.points, id).toBe(best?.points);
      }
    }
  });

  it("Pt 最小の経路だけでは資材の少ない別経路を取りこぼす実例が実グラフにある(赤 R-025 / 緑 G-018)", () => {
    // 赤 R-025: Pt 最小の経路は cube 505 / core 5 だが、+1 Pt で cube 485 / core 30 の別経路がある(cube は少ないが core が多い)
    const r025 = red.planUnlockRoutes(new Set(), "R-025");
    expect(r025.map((r) => [r.points, r.cube, r.core])).toEqual([
      [24, 505, 5],
      [25, 485, 30],
    ]);
    // 緑 G-018: Pt 最小は core 50 を踏む(17 Pt)。core が足りなければ +3 Pt・cube +200 の別経路でないと届かない
    const g018 = green.planUnlockRoutes(new Set(), "G-018");
    expect(g018.map((r) => [r.points, r.cube, r.core])).toEqual([
      [17, 660, 50],
      [20, 860, 0],
    ]);
    // どちらも planUnlock は前者だけを返す(後者は planUnlockRoutes でしか見えない)
    expect(green.planUnlock(new Set(), "G-018")?.points).toBe(17);
  });

  it("コネクトマスへの経路は 1 つだけ(必須のコネクトの出発点を Pt 最小の経路で作ってよい根拠)", () => {
    const routes = (c: "red" | "blue" | "yellow") => {
      const g = boardGraphOf(c);
      return g
        .planUnlockRoutes(new Set(), g.connectorId ?? "")
        .map((r) => [r.points, r.cube, r.core]);
    };
    expect(routes("red")).toEqual([[11, 185, 5]]);
    expect(routes("blue")).toEqual([[12, 190, 10]]);
    expect(routes("yellow")).toEqual([[12, 190, 10]]);
  });

  it("解放済みのセルは 0 で通る(経路の資材は未解放のセルだけ)", () => {
    const route = green.planUnlockRoutes(new Set(["G-001"]), "G-001");
    expect(route).toEqual([{ cells: [], points: 0, cube: 0, core: 0 }]);
  });

  it("経路の資材は、経路のセルの cellMaterials の合計と一致し、中心から届く", () => {
    for (const color of BOARD_MATERIAL_COLORS) {
      const graph = boardGraphOf(color);
      for (const [id] of BOARD_NODE_MATERIALS) {
        if (graph.cellPoints(id) === 0) continue;
        for (const r of graph.planUnlockRoutes(new Set(), id)) {
          const sum = r.cells.reduce(
            (s, c) => ({
              cube: s.cube + graph.cellMaterials(c).cube,
              core: s.core + graph.cellMaterials(c).core,
              points: s.points + graph.cellPoints(c),
            }),
            { cube: 0, core: 0, points: 0 },
          );
          expect([r.points, r.cube, r.core], `${color} ${id}`).toEqual([
            sum.points,
            sum.cube,
            sum.core,
          ]);
          const set = new Set(r.cells);
          expect(graph.reachableNodes(set).size, `${color} ${id}`).toBe(set.size);
        }
      }
    }
  });

  it("未知のセルは空", () => {
    expect(red.planUnlockRoutes(new Set(), "R-999")).toEqual([]);
  });
});
