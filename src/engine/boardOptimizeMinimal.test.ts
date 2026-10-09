import { describe, expect, it } from "vite-plus/test";

import { holomen, songs } from "../data";
import { boardGraphOf, emptyHolomenBoards, spentBoardMaterials } from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import { songSingers } from "../data/songSingers";
import { emptyBoardResources } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import { optimizeBoards } from "./boardOptimize";

/**
 * 「最小限で組み直す」(scope = minimal。2026-10-09 ユーザー指示)。評価器は合成の重み表(ゲームの値ではない)。
 * - ユニット外のホロメンは、メンバーの所属に効く緑の所属マスと、指定した曲に効く黄のマスだけ足せる(全員のマスなどは足さない)
 * - 緑の資材が足りないときは、ユニット外の「メンバーに効かない所属マス・報酬のマス」を先のマスごと外して回す。外すホロメンは最小限(多く空く 1 人から)。
 *   外して失うスコアが得を上回れば外さない
 */
const KORONE = "inugami-korone"; // gamers
const OKAYU = "nekomata-okayu"; // gamers
const KOYORI = "hakui-koyori"; // holox(リーダー)
const MIO = "ookami-mio"; // gamers(ユニット外。メンバーと同じ所属)
const SORA = "tokino-sora"; // gen0(ユニット外。メンバーに効かない所属)
const MIKO = "sakura-miko"; // gen0
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
  placements: {},
  scope: "minimal" as "minimal" | "all",
  leaderHolomenId: KOYORI,
  memberHolomenIds: [OKAYU, KORONE],
  hasSong: false,
  holomenIds: ids,
};
const boards = (over: Partial<HolomenBoards>): HolomenBoards => ({
  ...emptyHolomenBoards(),
  ...over,
});
const greenOnly = (cube: number): BoardResources => {
  const r = emptyBoardResources();
  r.green = { cube, core: 0 };
  return r;
};

const green = boardGraphOf("green");
/** 中心から G-008(所属マス 1 個目)までの幹 */
const TRUNK = ["G-001", "G-002", "G-005", "G-006", "G-007", "G-008"];
const G008 = green.cellMaterials("G-008");
const G001 = green.cellMaterials("G-001");

describe("前提(実データ・実グラフ)", () => {
  it("メンバー(おかゆ・ころね)と ミオ は gamers、そら・みこ は gen0。幹は中心から届き、G-008 の cube は G-001 の cube 以上", () => {
    const aff = (id: string) => holomen.find((h) => h.id === id)?.affiliations ?? [];
    expect(aff(OKAYU)).toContain("gamers");
    expect(aff(KORONE)).toContain("gamers");
    expect(aff(MIO)).toContain("gamers");
    expect(aff(SORA)).toEqual(["gen0"]);
    expect(aff(MIKO)).toEqual(["gen0"]);
    expect(green.reachableNodes(new Set(TRUNK)).size).toBe(TRUNK.length);
    expect(G008.cube).toBeGreaterThanOrEqual(G001.cube);
    expect(G001.core).toBe(0);
  });
});

describe("ユニット外に足せるマス", () => {
  it("メンバーと同じ所属のホロメンには、緑の所属マス(と経路)を足す。効かない所属のホロメンには足さない(all なら足す)", () => {
    const weights = { [`${MIO}/G-008`]: 100, [`${SORA}/G-008`]: 100 };
    const r = optimizeBoards({ ...base, evaluate: weighted(weights) });
    expect(r.boards[MIO]?.green).toEqual(expect.arrayContaining(TRUNK));
    expect(r.changed).toContain(MIO);
    expect(r.changed).not.toContain(SORA);
    const all = optimizeBoards({ ...base, scope: "all", evaluate: weighted(weights) });
    expect(all.changed).toEqual(expect.arrayContaining([MIO, SORA]));
  });

  it("ユニット外の全員・パラメータのマスは、所属マスへの経路でなければ足さない(全整理の役目)。幹の G-003 は経路に入らない", () => {
    const weights = { [`${MIO}/G-003`]: 100 };
    const r = optimizeBoards({ ...base, evaluate: weighted(weights) });
    expect(r.changed).toEqual([]);
    const all = optimizeBoards({ ...base, scope: "all", evaluate: weighted(weights) });
    expect(all.boards[MIO]?.green).toContain("G-003");
  });

  it("曲を指定すると、ユニット外にもその曲に効く黄のマスを足す(全体曲の「全体」のマス)。曲なしなら足さない", () => {
    const allSong = songs.find((s) => songSingers(s).scope === "all");
    if (!allSong) throw new Error("全体曲がない");
    const weights = { [`${SORA}/Y-004`]: 100 };
    const r = optimizeBoards({
      ...base,
      hasSong: true,
      song: allSong,
      evaluate: weighted(weights),
    });
    expect(r.boards[SORA]?.yellow).toContain("Y-004");
    const none = optimizeBoards({ ...base, evaluate: weighted(weights) });
    expect(none.changed).toEqual([]);
  });

  it("ユニット外の赤・青は足さない(効かない)", () => {
    const weights = { [`${MIO}/R-001`]: 100, [`${MIO}/B-001`]: 100 };
    const r = optimizeBoards({ ...base, evaluate: weighted(weights) });
    expect(r.changed).toEqual([]);
  });
});

describe("ユニット外の緑の取り崩し(資材が足りないとき)", () => {
  const owned = { [SORA]: boards({ green: TRUNK }) };
  const want = { [`${KORONE}/G-001`]: 100 };

  it("緑の余りが 0 なら、効かない所属マス(G-008)を外して回し、メンバーのマスを開ける。幹の全員のマスは残す", () => {
    const r = optimizeBoards({
      ...base,
      current: owned,
      resources: greenOnly(0),
      evaluate: weighted({ ...want, [`${SORA}/G-008`]: 10 }),
    });
    expect(r.boards[KORONE]?.green).toContain("G-001");
    expect(r.boards[SORA]?.green).toEqual(TRUNK.filter((id) => id !== "G-008"));
    expect(r.changed).toEqual(expect.arrayContaining([KORONE, SORA]));
    // 総量(投入済み + 余り 0)を超えない
    const after = spentBoardMaterials({ ...owned, ...r.boards });
    expect(after.green.cube).toBeLessThanOrEqual(spentBoardMaterials(owned).green.cube);
  });

  it("外して失うスコアが得を上回るなら外さない(何も変えない)", () => {
    const r = optimizeBoards({
      ...base,
      current: owned,
      resources: greenOnly(0),
      evaluate: weighted({ ...want, [`${SORA}/G-008`]: 200 }),
    });
    expect(r.changed).toEqual([]);
  });

  it("余りが足りているなら取り崩さない", () => {
    const r = optimizeBoards({
      ...base,
      current: owned,
      resources: greenOnly(G001.cube),
      evaluate: weighted({ ...want, [`${SORA}/G-008`]: 10 }),
    });
    expect(r.boards[KORONE]?.green).toContain("G-001");
    expect(r.changed).toEqual([KORONE]);
  });

  it("外すホロメンは最小限: 2 人が同じだけ空けられるなら 1 人だけ外す", () => {
    const two = { [SORA]: boards({ green: TRUNK }), [MIKO]: boards({ green: TRUNK }) };
    const r = optimizeBoards({
      ...base,
      current: two,
      resources: greenOnly(0),
      evaluate: weighted({ ...want, [`${SORA}/G-008`]: 10, [`${MIKO}/G-008`]: 10 }),
    });
    expect(r.boards[KORONE]?.green).toContain("G-001");
    expect(r.changed.filter((id) => id === SORA || id === MIKO)).toHaveLength(1);
  });

  it("全整理(all)ではユニット外も含めて全体で配り直すので、取り崩しの仕組みは使わない(結果は総量に収まる)", () => {
    const r = optimizeBoards({
      ...base,
      scope: "all",
      current: owned,
      resources: greenOnly(0),
      evaluate: weighted({ ...want, [`${SORA}/G-008`]: 10 }),
    });
    const after = spentBoardMaterials({ ...owned, ...r.boards });
    expect(after.green.cube).toBeLessThanOrEqual(spentBoardMaterials(owned).green.cube);
    expect(r.boards[KORONE]?.green).toContain("G-001");
  });
});
