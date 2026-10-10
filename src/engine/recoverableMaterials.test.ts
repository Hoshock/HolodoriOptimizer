import { describe, expect, it } from "vite-plus/test";

import { songById } from "../data";
import { boardGraphOf, emptyHolomenBoards } from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import type { Song } from "../data/types";
import type { BoardColor } from "../storage/boards";
import { emptyBoardResources } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import { coverDeficits, recoverableMaterials } from "./boardOptimize";

/**
 * 外して回せる資材(2026-10-08 ユーザー指示)。その編成のユニットスコアに効かないマスだけを、端から外せる範囲で数える。
 * マスの選び方はこのテスト用の入力(実機の盤面ではない)。資材の数字は外部 master 由来(`boardMaterials.ts`)
 */
const LEADER = "ookami-mio";
const MEMBER = "nekomata-okayu";
const OUTSIDE = "houshou-marine";
const boards = (color: BoardColor, nodes: string[]): HolomenBoards => ({
  ...emptyHolomenBoards(),
  [color]: nodes,
});
const materialsOf = (color: BoardColor, nodes: string[]) =>
  boardGraphOf(color).unlockedMaterials(new Set(nodes));
const recover = (all: Record<string, HolomenBoards>, song: Song | null = null) =>
  recoverableMaterials({
    boards: all,
    placements: {},
    leaderHolomenId: LEADER,
    memberHolomenIds: [MEMBER],
    song,
  });
const marineSolo = [...songById.values()].find(
  (s) => s.artists.length === 1 && s.artists[0] === "宝鐘マリン",
);

describe("recoverableMaterials", () => {
  it("赤はリーダー以外、青はメンバー以外のホロメンの全部", () => {
    const blue = ["B-001", "B-002", "B-005"];
    const red = ["R-001", "R-002"];
    const out = recover({
      [OUTSIDE]: { ...boards("blue", blue), red },
      [MEMBER]: boards("blue", blue),
      [LEADER]: boards("red", red),
    });
    expect(out.blue).toEqual(materialsOf("blue", blue));
    expect(out.red).toEqual(materialsOf("red", red));
  });

  it("黄: 曲なしなら全部。曲を指定したら、その曲に入るマス(と、そこへの途中のマス)は残し、端の報酬のマスだけ", () => {
    expect(marineSolo).toBeDefined();
    // Y-001 → Y-002 → Y-005 → Y-006 → Y-007(ソロ)→ Y-008(ホロワークの報酬。端)
    const yellow = ["Y-001", "Y-002", "Y-005", "Y-006", "Y-007", "Y-008"];
    const all = { [OUTSIDE]: boards("yellow", yellow) };
    expect(recover(all).yellow).toEqual(materialsOf("yellow", yellow));
    expect(recover(all, marineSolo ?? null).yellow).toEqual(materialsOf("yellow", ["Y-008"]));
  });

  it("緑: 報酬のマスだけ(端から)。全員・パラメータ・所属のマスと、そこへの途中は残す", () => {
    const green = [
      "G-001",
      "G-002",
      "G-005",
      "G-006",
      "G-007",
      "G-008",
      "G-011",
      "G-012",
      "G-013",
      "G-014",
    ];
    expect(recover({ [OUTSIDE]: boards("green", green) }).green).toEqual(
      materialsOf("green", ["G-014"]),
    );
  });
});

/**
 * 余りの負を、この編成に効かないマスを外す差分で埋める(2026-10-10 ユーザー指示「最適化の結果に青を外す差分も入れる」)。
 * すでに変えるホロメンから先に、端から足りるまでだけ外す。効くマス・資材を考慮しない色には触らない
 */
describe("coverDeficits", () => {
  const blue = ["B-001", "B-002", "B-005"];
  const OTHER = "shirogane-noel";
  const deficit = (cube: number): BoardResources => ({
    ...emptyBoardResources(),
    blue: { cube: -cube, core: 0 },
  });
  const cover = (
    all: Record<string, HolomenBoards>,
    remaining: BoardResources,
    changed: string[] = [],
    relaxed: string[] = [],
  ) =>
    coverDeficits({
      boards: all,
      placements: {},
      leaderHolomenId: LEADER,
      memberHolomenIds: [MEMBER],
      song: null,
      remaining,
      changed: new Set(changed),
      relaxed: new Set(relaxed),
    });

  it("足りないぶんだけ、効かないマス(ユニット外の青)を端から外す。メンバーの青(効く)は外さない", () => {
    const all = { [OUTSIDE]: boards("blue", blue), [MEMBER]: boards("blue", blue) };
    const out = cover(all, deficit(1));
    expect(out.remaining.blue.cube).toBeGreaterThanOrEqual(0);
    expect(out.boards[MEMBER]).toBe(all[MEMBER]);
    const removed = blue.filter((n) => !out.boards[OUTSIDE]?.blue.includes(n));
    expect(removed).toHaveLength(1);
    expect(out.remaining.blue.cube).toBe(materialsOf("blue", removed).cube - 1);
  });

  it("すでに変えるホロメンから先に外す(効かない量が少なくても)。変えないホロメンは足りるなら触らない", () => {
    const all = { [OUTSIDE]: boards("blue", blue), [OTHER]: boards("blue", ["B-001"]) };
    const out = cover(all, deficit(1), [OTHER]);
    expect(out.boards[OTHER]?.blue).toEqual([]);
    expect(out.boards[OUTSIDE]).toBe(all[OUTSIDE]);
  });

  it("外せるマスが尽きたら残りは不足のまま。資材を考慮しない色(relaxed)には触らない", () => {
    const all = { [OUTSIDE]: boards("blue", blue) };
    const total = materialsOf("blue", blue).cube;
    const out = cover(all, deficit(total + 5));
    expect(out.boards[OUTSIDE]?.blue).toEqual([]);
    expect(out.remaining.blue.cube).toBe(-5);
    const relaxed = cover(all, deficit(1), [], ["blue"]);
    expect(relaxed.boards[OUTSIDE]).toBe(all[OUTSIDE]);
    expect(relaxed.remaining.blue.cube).toBe(-1);
  });
});
