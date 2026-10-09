import { describe, expect, it } from "vite-plus/test";

import { holomen, songs } from "../data";
import {
  boardGraphOf,
  emptyHolomenBoards,
  spentBoardMaterials,
  spentBoardPoints,
} from "../data/boardState";
import { boardPointsForRank } from "../data/boardPoints";
import { RED_BOARD_NODE_IDS } from "../data/redBoard";
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
/** 2026-10-09 のユーザーのアカウントの出力にあった 一条莉々華 の赤(登録の入力。回帰テストの再現用) */
const RIRIKA_RED_20261009 = [
  "R-001",
  "R-002",
  "R-005",
  "R-006",
  "R-003",
  "R-004",
  "R-007",
  "R-008",
  "R-009",
  "R-010",
  "R-021",
  "R-049",
  "R-050",
  "R-051",
  "R-052",
  "R-053",
  "R-056",
  "R-060",
  "R-054",
  "R-058",
  "R-061",
  "R-055",
  "R-032",
  "R-033",
  "R-034",
  "R-035",
  "R-036",
  "R-037",
  "R-038",
  "R-039",
  "R-063",
  "R-020",
  "R-022",
  "R-019",
  "R-040",
  "R-041",
  "R-042",
  "R-043",
  "R-044",
  "R-045",
  "R-046",
  "R-047",
];

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
const G001 = { ...green.cellMaterials("G-001"), points: green.cellPoints("G-001") };

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
  it("メンバーと同じ所属のホロメンには、緑の所属マス(と経路)を足す。効かない所属のホロメンには足さない(全整理でも同じ)", () => {
    const weights = { [`${MIO}/G-008`]: 100, [`${SORA}/G-008`]: 100 };
    const r = optimizeBoards({ ...base, evaluate: weighted(weights) });
    expect(r.boards[MIO]?.green).toEqual(expect.arrayContaining(TRUNK));
    expect(r.changed).toContain(MIO);
    expect(r.changed).not.toContain(SORA);
    const all = optimizeBoards({ ...base, scope: "all", evaluate: weighted(weights) });
    expect(all.changed).toContain(MIO);
    expect(all.changed).not.toContain(SORA);
  });

  it("ユニット外の全員・パラメータのマスは、所属マスへの経路でなければ足さない(G-003 は経路に入らない。全整理では足す)", () => {
    const weights = { [`${MIO}/G-003`]: 100 };
    const r = optimizeBoards({ ...base, evaluate: weighted(weights) });
    expect(r.changed).toEqual([]);
    const all = optimizeBoards({ ...base, scope: "all", evaluate: weighted(weights) });
    expect(all.boards[MIO]?.green).toContain("G-003");
  });

  it("ユニット外の所属マスは、そのマス自体が効くときだけ(経路の全員のマスに価値があっても、所属マスが効かなければ開けない)", () => {
    const r = optimizeBoards({ ...base, evaluate: weighted({ [`${MIO}/G-001`]: 100 }) });
    expect(r.changed).toEqual([]);
    const ok = optimizeBoards({
      ...base,
      evaluate: weighted({ [`${MIO}/G-001`]: 100, [`${MIO}/G-008`]: 1 }),
    });
    expect(ok.boards[MIO]?.green).toEqual(expect.arrayContaining(TRUNK));
  });

  it("最小限では、ユニットのホロメンの緑は赤・青・黄のあと(Pt が 1 マスぶんなら、増分が小さくても青を選ぶ)", () => {
    // 青の経路と緑の経路のどちらか片方しか入らないランクを探す(両方入る・どちらも入らないランクは使わない)
    const blue = boardGraphOf("blue");
    const found = (() => {
      for (const blueId of ["B-001", "B-005", "B-009"])
        for (const greenId of ["G-001", "G-005", "G-007"]) {
          const pb = blue.planUnlock(new Set(), blueId)?.points ?? 0;
          const pg = green.planUnlock(new Set(), greenId)?.points ?? 0;
          for (let rank = 1; rank <= 50; rank += 1) {
            const budget = boardPointsForRank(rank);
            if (budget >= Math.max(pb, pg) && budget < pb + pg) return { blueId, greenId, rank };
          }
        }
      return null;
    })();
    if (!found) throw new Error("片方しか入らないランクがない");
    const { blueId, greenId, rank } = found;
    const weights = { [`${KORONE}/${blueId}`]: 10, [`${KORONE}/${greenId}`]: 100 };
    const r = optimizeBoards({ ...base, ranks: { [KORONE]: rank }, evaluate: weighted(weights) });
    expect(r.boards[KORONE]?.blue).toContain(blueId);
    expect(r.boards[KORONE]?.green ?? []).not.toContain(greenId);
    // 全整理でも緑は赤・青・黄のあと(残った Pt で上乗せする)
    const all = optimizeBoards({
      ...base,
      scope: "all",
      ranks: { [KORONE]: rank },
      evaluate: weighted(weights),
    });
    expect(all.boards[KORONE]?.blue).toContain(blueId);
    expect(all.boards[KORONE]?.green ?? []).not.toContain(greenId);
  });

  it("最小限では、リーダー・メンバーの緑は十字のマスまで(Pt が余っていれば開ける。その先はユニット系マスの経路だけ)。全整理は十字のあと、その先も開ける", () => {
    const weights = Object.fromEntries(
      ["G-001", "G-002", "G-003", "G-004", "G-005", "G-009", "G-012"].map((id) => [
        `${KORONE}/${id}`,
        10,
      ]),
    );
    const r = optimizeBoards({ ...base, evaluate: weighted(weights) });
    expect(r.boards[KORONE]?.green).toEqual(["G-001", "G-002", "G-003", "G-004", "G-005"]);
    const all = optimizeBoards({ ...base, scope: "all", evaluate: weighted(weights) });
    expect(all.boards[KORONE]?.green).toEqual(expect.arrayContaining(["G-009", "G-012"]));
  });

  it("リーダー・メンバーですでに開いている十字の先の緑は、Pt が足りていれば残し、赤・青に Pt が要れば外して回す", () => {
    const owned = { [KORONE]: boards({ green: TRUNK }) };
    const keep = optimizeBoards({ ...base, current: owned, evaluate: weighted({}) });
    expect(keep.changed).toEqual([]);
    // 幹(6 マス)の Pt ちょうどのランクで、青 1 マスに大きな価値: 緑を外して青を開ける
    const trunkPoints = TRUNK.reduce((sum, id) => sum + green.cellPoints(id), 0);
    const rank = (() => {
      for (let r = 1; r <= 50; r += 1) if (boardPointsForRank(r) >= trunkPoints) return r;
      return 50;
    })();
    const budget = boardPointsForRank(rank);
    const r = optimizeBoards({
      ...base,
      current: owned,
      ranks: { [KORONE]: rank },
      evaluate: weighted({ [`${KORONE}/B-001`]: 1000 }),
    });
    expect(r.boards[KORONE]?.blue).toContain("B-001");
    expect(spentBoardPoints(r.boards[KORONE] ?? emptyHolomenBoards())).toBeLessThanOrEqual(budget);
  });

  it("ユニット外のホロメンの Pt が足りないときは、効かない赤を端から外して空け、所属マス(と経路)を足す(共有しないホロメンは何もしない)", () => {
    // 幹(G-008 まで)がちょうど入るランクで、赤を予算いっぱいまで開けた登録
    const red = boardGraphOf("red");
    const trunkPoints = green.unlockedPoints(new Set(TRUNK));
    let rank = 1;
    while (boardPointsForRank(rank) < trunkPoints) rank += 1;
    const budget = boardPointsForRank(rank);
    const redSet = new Set<string>();
    for (const id of RED_BOARD_NODE_IDS) {
      const plan = red.planUnlock(redSet, id);
      if (!plan || red.unlockedPoints(redSet) + plan.points > budget) continue;
      for (const cell of plan.cells) redSet.add(cell);
    }
    const spentRed = red.unlockedPoints(redSet);
    expect(budget - spentRed).toBeLessThan(trunkPoints);
    const owned = { [MIO]: boards({ red: [...redSet] }), [SORA]: boards({ red: [...redSet] }) };
    const weights = { [`${MIO}/G-008`]: 100, [`${SORA}/G-008`]: 100 };
    const r = optimizeBoards({
      ...base,
      current: owned,
      ranks: { [MIO]: rank, [SORA]: rank },
      evaluate: weighted(weights),
    });
    const mio = r.boards[MIO];
    expect(mio?.green).toEqual(expect.arrayContaining(TRUNK));
    expect((mio?.red ?? []).length).toBeLessThan(redSet.size);
    expect(mio ? spentBoardPoints(mio) : Infinity).toBeLessThanOrEqual(budget);
    expect(r.changed).not.toContain(SORA);
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

  // 2026-10-09 ユーザー報告(トウキョウ・シャンディ・ランデヴで、ユニット外の莉々華のソロの黄が開かない)の回帰。
  // 待ち行列の候補を測り直したとき、外すマス(reclaim)だけ古いまま確定していた → 前の確定で外したマスを外したつもりで Pt が予算を超え、
  // そのホロメンの変更ごと結果から落ちていた。登録はそのときのアカウントの莉々華(ランク 27・赤 42 マス・赤のコネクトに配置あり)
  it("ユニット外の Pt を空けて黄を何マスも足すとき、外すマスは測り直した値で確定し、予算を超えず結果に残る", () => {
    const RIRIKA = "ichijou-ririka";
    const song = songs.find((s) => s.id === "song-213");
    if (!song) throw new Error("song-213 がない");
    expect(songSingers(song)).toEqual({ scope: "solo", holomenIds: [RIRIKA] });
    const red = RIRIKA_RED_20261009;
    const rank = 27;
    const budget = boardPointsForRank(rank);
    const owned = { [RIRIKA]: boards({ red, connects: ["leader"] }) };
    expect(budget - spentBoardPoints(owned[RIRIKA])).toBeLessThan(5);
    // ソロの楽曲スコアボーナスのマスに重み(合成の評価器。ゲームの値ではない)
    const solo = [
      "Y-001",
      "Y-002",
      "Y-005",
      "Y-006",
      "Y-007",
      "Y-009",
      "Y-016",
      "Y-024",
      "Y-025",
      "Y-029",
    ];
    const weights = Object.fromEntries(solo.map((id) => [`${RIRIKA}/${id}`, 50]));
    const r = optimizeBoards({
      ...base,
      current: owned,
      ranks: { [RIRIKA]: rank },
      placements: { [RIRIKA]: { leader: { extent: "card-4", permil: 1500 } } },
      hasSong: true,
      song,
      evaluate: weighted(weights),
    });
    const ririka = r.boards[RIRIKA];
    expect(r.changed).toContain(RIRIKA);
    expect(ririka?.yellow.length).toBeGreaterThan(0);
    expect(ririka ? spentBoardPoints(ririka) : Infinity).toBeLessThanOrEqual(budget);
    expect(ririka?.connects).toContain("leader");
  });

  it("ユニット外の赤・青は足さない(効かない)", () => {
    const weights = { [`${MIO}/R-001`]: 100, [`${MIO}/B-001`]: 100 };
    const r = optimizeBoards({ ...base, evaluate: weighted(weights) });
    expect(r.changed).toEqual([]);
  });
});

describe("ユニット外の緑の取り崩し(ユニット系マスを開ける資材が足りないとき)", () => {
  // ミオ(メンバーと同じ gamers)は G-008 の手前まで開けていて、G-008(cube 80)だけが足りない。
  // そらの G-008(gen0 の所属マス。メンバーに効かない)を外すと、ちょうど 1 マスぶん空く
  const BEFORE_G008 = TRUNK.filter((id) => id !== "G-008");
  const owned = { [SORA]: boards({ green: TRUNK }), [MIO]: boards({ green: BEFORE_G008 }) };
  const want = { [`${MIO}/G-008`]: 100 };

  it("緑の余りが 0 なら、効かない所属マス(G-008)を外して回し、メンバーの所属に効く所属マスを開ける。幹の全員のマスは残す", () => {
    const r = optimizeBoards({
      ...base,
      current: owned,
      resources: greenOnly(0),
      evaluate: weighted({ ...want, [`${SORA}/G-008`]: 10 }),
    });
    expect(r.boards[MIO]?.green).toContain("G-008");
    expect(r.boards[SORA]?.green).toEqual(BEFORE_G008);
    expect(r.changed).toEqual(expect.arrayContaining([MIO, SORA]));
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
      resources: greenOnly(G008.cube),
      evaluate: weighted({ ...want, [`${SORA}/G-008`]: 10 }),
    });
    expect(r.boards[MIO]?.green).toContain("G-008");
    expect(r.changed).not.toContain(SORA);
  });

  it("十字のマスのためには取り崩さない(ユニット系マスを開けるときだけ)", () => {
    const r = optimizeBoards({
      ...base,
      current: owned,
      resources: greenOnly(0),
      evaluate: weighted({ [`${KORONE}/G-001`]: 100, [`${SORA}/G-008`]: 10 }),
    });
    expect(r.changed).toEqual([]);
  });

  it("外すホロメンは最小限: 2 人が同じだけ空けられるなら 1 人だけ外す", () => {
    const two = { ...owned, [MIKO]: boards({ green: TRUNK }) };
    const r = optimizeBoards({
      ...base,
      current: two,
      resources: greenOnly(0),
      evaluate: weighted({ ...want, [`${SORA}/G-008`]: 10, [`${MIKO}/G-008`]: 10 }),
    });
    expect(r.boards[MIO]?.green).toContain("G-008");
    expect(r.changed.filter((id) => id === SORA || id === MIKO)).toHaveLength(1);
  });

  it("全整理(all)でも、ユニット系マスのためなら同じように取り崩す(結果は総量に収まる)", () => {
    const r = optimizeBoards({
      ...base,
      scope: "all",
      current: owned,
      resources: greenOnly(0),
      evaluate: weighted({ ...want, [`${SORA}/G-008`]: 10 }),
    });
    const after = spentBoardMaterials({ ...owned, ...r.boards });
    expect(after.green.cube).toBeLessThanOrEqual(spentBoardMaterials(owned).green.cube);
    expect(r.boards[MIO]?.green).toContain("G-008");
    expect(r.boards[SORA]?.green).toEqual(BEFORE_G008);
  });

  it("全整理(all)でも、十字のマスのためには取り崩さない", () => {
    const r = optimizeBoards({
      ...base,
      scope: "all",
      current: owned,
      resources: greenOnly(0),
      evaluate: weighted({ [`${KORONE}/G-001`]: 100, [`${SORA}/G-008`]: 10 }),
    });
    expect(r.changed).toEqual([]);
  });
});

describe("全整理(all)の十字", () => {
  it("十字とユニット系マスは同じ順位で効率を比べる(キューブが足りなければ、キューブあたりの得が大きいほうを先に)", () => {
    // 緑のない そら に十字の G-001(20 cube)を開ける得 > ミオの G-008(80 cube)の得 ÷ 4 なら、20 cube しかないとき十字が勝つ
    const owned = { [MIO]: boards({ green: TRUNK.filter((id) => id !== "G-008") }) };
    const r = optimizeBoards({
      ...base,
      scope: "all",
      current: owned,
      resources: greenOnly(G001.cube),
      evaluate: weighted({ [`${SORA}/G-001`]: 100, [`${MIO}/G-008`]: 100 }),
    });
    expect(r.boards[SORA]?.green).toEqual(["G-001"]);
    expect(r.boards[MIO]?.green ?? []).not.toContain("G-008");
  });

  it("ゼロから組み直したメンバーの登録の緑は、ほかのホロメンの十字へ回さない(取り置き)", () => {
    // ころね(メンバー)の登録の G-001 は効かない(重み 0)が、外した資材をそらの十字へ回すと緑が移るだけになる
    const owned = { [KORONE]: boards({ green: ["G-001"] }) };
    const r = optimizeBoards({
      ...base,
      scope: "all",
      current: owned,
      resources: greenOnly(0),
      evaluate: weighted({ [`${SORA}/G-001`]: 100 }),
    });
    expect(r.changed).toEqual([]);
  });
});
