import { describe, expect, it } from "vite-plus/test";

import { holomen } from "../data";
import { BLUE_BOARD_NODE_IDS, BLUE_FREQUENCY_NODE_IDS } from "../data/blueBoard";
import { boardPointsForRank } from "../data/boardPoints";
import { isFrequencyNode, withoutFrequencyNodes } from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import { emptyBoardResources } from "../storage/boardResources";
import type { ConnectPlacementMap } from "../storage/connect";
import { optimizeBoards, violatesBoardRules } from "./boardOptimize";

/**
 * ホロメンボードの最適化は青の発動頻度マス(B-013 / B-020 / B-031)をすべて OFF にして行う(2026-10-07 ユーザー指示)。
 * 頻度の配分はこのあとの頻度の段(`frequencyStage.ts`)の担当。頻度マスは枝の端(葉)なので外しても他のマスは孤立しない。
 * - 頻度マスはターゲットにも結果にもならない(評価が高くても取らない)
 * - 登録している頻度マスは、変えてよいホロメンでは外れる(「現在」のスコアも頻度マスを外した状態の値)。変えないホロメンはそのまま
 * - 外した頻度マスの資材は他のマスへ回せる
 */
const OKAYU = "nekomata-okayu";
const KORONE = "inugami-korone";
const KOYORI = "hakui-koyori";
const ids = holomen.map((h) => h.id);

/** B-013 までの経路(中心 → B-001…B-008 → コネクト → B-009…B-012)と、その先の頻度マス */
const PATH_TO_B013 = [
  "B-001",
  "B-002",
  "B-005",
  "B-006",
  "B-007",
  "B-008",
  "B-009",
  "B-010",
  "B-011",
  "B-012",
];
const withFrequency = (): HolomenBoards => ({
  red: [],
  blue: [...PATH_TO_B013, "B-013"],
  yellow: [],
  green: [],
  connects: ["card"],
});

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
  ranks: {},
  placements: {} as ConnectPlacementMap,
  scope: "unit" as const,
  leaderHolomenId: KOYORI,
  memberHolomenIds: [OKAYU, KORONE],
  hasSong: true,
  holomenIds: ids,
};

describe("青の発動頻度マスは OFF にして最適化する", () => {
  it("頻度マスは枝の端(葉): 外しても残りは中心から届き、ほかのマスは孤立しない", () => {
    expect(BLUE_FREQUENCY_NODE_IDS).toEqual(["B-013", "B-020", "B-031"]);
    for (const id of BLUE_FREQUENCY_NODE_IDS) expect(isFrequencyNode(id)).toBe(true);
    expect(isFrequencyNode("B-012")).toBe(false);
    const stripped = withoutFrequencyNodes(withFrequency());
    expect(stripped.blue).toEqual(PATH_TO_B013);
    expect(withoutFrequencyNodes(stripped)).toBe(stripped); // 頻度マスがなければそのまま
  });

  it("評価が高くても、頻度マスは結果に入らない(3 つとも)", () => {
    const weights = {
      ...Object.fromEntries(BLUE_FREQUENCY_NODE_IDS.map((id) => [`${OKAYU}/${id}`, 10_000])),
      [`${OKAYU}/B-016`]: 100,
    };
    const result = optimizeBoards({ ...base, evaluate: weighted(weights) });
    const blue = result.boards[OKAYU]?.blue ?? [];
    expect(blue).toContain("B-016"); // 頻度以外の評価の高いマスは取る
    for (const id of BLUE_FREQUENCY_NODE_IDS) expect(blue).not.toContain(id);
    expect(result.recommendedScore).toBeLessThan(2000);
  });

  it("登録している頻度マスは、変えてよいホロメンでは外れる。「現在」のスコアも頻度マスを外した状態の値", () => {
    const result = optimizeBoards({
      ...base,
      current: { [OKAYU]: withFrequency() },
      evaluate: weighted({ [`${OKAYU}/B-013`]: 500 }),
    });
    // 頻度マスを外さない登録なら 1500。外した状態が土台なので 1000
    expect(result.currentScore).toBe(1000);
    expect(result.changed).toContain(OKAYU);
    const b = result.boards[OKAYU];
    expect(b?.blue).not.toContain("B-013");
    // 経路のマス(頻度マスの手前まで)とコネクトは、スコアに影響しなくても予算が許す限り残る(変更量を最小にする)
    for (const id of PATH_TO_B013) expect(b?.blue).toContain(id);
    expect(b?.connects).toEqual(["card"]);
    expect(result.recommendedScore).toBeGreaterThanOrEqual(result.currentScore);
  });

  it("頻度マスだけが違う登録は、頻度マスを外す変更として返る(スコアは同じでも)", () => {
    const result = optimizeBoards({
      ...base,
      current: { [OKAYU]: withFrequency() },
      evaluate: weighted({}),
    });
    expect(result.changed).toEqual([OKAYU]);
    expect(result.recommendedScore).toBe(result.currentScore);
  });

  it("変えないホロメン(ユニット外)の頻度マスはそのまま", () => {
    const result = optimizeBoards({
      ...base,
      current: { [OKAYU]: withFrequency(), "tokino-sora": withFrequency() },
      evaluate: weighted({}),
    });
    expect(result.changed).toContain(OKAYU);
    expect(result.changed).not.toContain("tokino-sora");
    expect(result.boards["tokino-sora"]).toBeUndefined();
  });

  it("「全て変更」ではユニット外のホロメンの頻度マスも外す", () => {
    const result = optimizeBoards({
      ...base,
      scope: "all",
      current: { "tokino-sora": withFrequency() },
      evaluate: weighted({}),
    });
    expect(result.changed).toContain("tokino-sora");
    expect(result.boards["tokino-sora"]?.blue).not.toContain("B-013");
  });

  it("外した頻度マスの資材(B-013 は cube 100 / core 25)は、他のマスへ回せる", () => {
    // 余り 0 = 総量は登録済みの投入分だけ。頻度マスを外すと 100 / 25 が空き、B-016(cube 40)が買える
    const resources = emptyBoardResources();
    resources.blue = { cube: 0, core: 0 };
    const result = optimizeBoards({
      ...base,
      current: { [OKAYU]: withFrequency() },
      resources,
      evaluate: weighted({ [`${OKAYU}/B-016`]: 100 }),
    });
    expect(result.boards[OKAYU]?.blue).toContain("B-016");
    expect(result.boards[OKAYU]?.blue).not.toContain("B-013");
    expect(result.recommendedScore).toBe(1100);
  });

  it("予算を超えている登録(ランクを下げたあとなど)は、スコアが下がっても予算内へ直した結果を返す(土台に戻さない)", () => {
    // 青の全 31 マス(頻度マスを含む)を登録しているが、ランク 1 の予算では開けきれない。
    // 全マスに加点があるので、予算内へ直した結果は登録(頻度マスを外した土台)より低い
    const full: HolomenBoards = {
      red: [],
      blue: BLUE_BOARD_NODE_IDS.filter((id) => !isFrequencyNode(id)),
      yellow: [],
      green: [],
      connects: ["card"],
    };
    const weights = Object.fromEntries(BLUE_BOARD_NODE_IDS.map((id) => [`${OKAYU}/${id}`, 10]));
    const result = optimizeBoards({
      ...base,
      current: { [OKAYU]: { ...full, blue: [...full.blue, ...BLUE_FREQUENCY_NODE_IDS] } },
      ranks: { [OKAYU]: 1 },
      evaluate: weighted(weights),
    });
    expect(result.recommendedScore).toBeLessThan(result.currentScore);
    expect(result.changed).toEqual([OKAYU]);
    const b = result.boards[OKAYU];
    expect(b?.blue.some(isFrequencyNode)).toBe(false);
    expect(violatesBoardRules(b ?? full, boardPointsForRank(1), new Set())).toBeNull();
  });
});
