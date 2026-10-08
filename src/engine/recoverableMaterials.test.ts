import { describe, expect, it } from "vite-plus/test";

import { songById } from "../data";
import { boardGraphOf, emptyHolomenBoards } from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import type { Song } from "../data/types";
import type { BoardColor } from "../storage/boards";
import { recoverableMaterials } from "./boardOptimize";

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
