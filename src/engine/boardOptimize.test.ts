import { describe, expect, it } from "vite-plus/test";

import { cardById, holomen } from "../data";
import { readAccountSnapshot, snapshotConnectPlacements } from "../data/accountSnapshot.fixture";
import { boardPointsForRank, CONNECT_UNLOCK_POINTS, nodeBoardPoints } from "../data/boardPoints";
import {
  boardGraphOf,
  emptyHolomenBoards,
  isFrequencyNode,
  spentBoardPoints,
  unlockSetOf,
  UNLOCKABLE_ANCHORS,
} from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import { BLUE_BOARD_NODE_IDS } from "../data/blueBoard";
import { GREEN_BOARD_NODE_IDS } from "../data/greenBoard";
import { RED_BOARD_NODE_IDS } from "../data/redBoard";
import type { ConnectPlacementMap } from "../storage/connect";
import { optimizeBoards, violatesBoardRules } from "./boardOptimize";
import { NO_SCORE_EFFECT } from "./connectOptimize";
import type { BoardOptimizeInput } from "./boardOptimize";
import { planBoards } from "./boardPlan";
import { runOptimize } from "./request";
import type { OptimizeRunRequest } from "./request";

/**
 * ホロメンボードの最適化(2026-10-04 ユーザー指示)。選び方は近似(貪欲法)なので、**スコアの大きさは固定せず、どの結果でも守る制約**
 * (ランクの予算・中心からの到達・コネクトを解放してから先へ・配置のあるコネクトは必ず解放済み)を固定する。
 * 評価器は差し替え(合成の重み表)と、本物の評価経路(`planBoards` → `teamEvaluator`。画面の値と一致)の両方で確かめる
 */
const OKAYU = "nekomata-okayu";
const KORONE = "inugami-korone";
const KOYORI = "hakui-koyori";
const ids = holomen.map((h) => h.id);
const pts = (list: readonly string[]): number =>
  list.reduce((sum, id) => sum + (nodeBoardPoints(id) ?? 0), 0);
const A = { extent: "card-3" as const, permil: 1600 };

/** 重み表(ホロメン ID/マス ID → 加点)で採点する合成の評価器 */
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
  current: {},
  ranks: {},
  placements: {} as ConnectPlacementMap,
  scope: "minimal" as const,
  leaderHolomenId: KOYORI,
  memberHolomenIds: [OKAYU, KORONE],
  hasSong: true,
  holomenIds: ids,
};
const rule = (b: HolomenBoards, rank: number | undefined, placed: readonly string[] = []) =>
  violatesBoardRules(
    b,
    rank === undefined ? Number.POSITIVE_INFINITY : boardPointsForRank(rank),
    new Set(placed),
  );

describe("ホロメンボードの最適化(合成の評価器)", () => {
  it("効果のない途中のマスの先にある効果のあるマスへも、経路一式(コネクトを含む)を 1 つのプランとして届く", () => {
    // 青 B-023 だけが加点。B-001〜B-008 と C(コネクト)は 0 点だが、取らないと B-023 に届かない
    const result = optimizeBoards({
      ...base,
      ranks: { [OKAYU]: 50 },
      evaluate: weighted({ [`${OKAYU}/B-023`]: 100 }),
    });
    const b = result.boards[OKAYU];
    expect(b?.blue).toContain("B-023");
    expect(b?.connects).toEqual(["card"]); // コネクトを解放してから先へ
    expect(rule(b ?? emptyHolomenBoards(), 50)).toBeNull();
    expect(result.recommendedScore - result.currentScore).toBeGreaterThanOrEqual(100);
  });

  it("ランクの予算を超える経路は取らない(必要Pt − 1 の予算なら何も変えず、ちょうどなら取る)", () => {
    const need =
      pts(["B-001", "B-002", "B-005", "B-006", "B-007", "B-008", "B-023"]) + CONNECT_UNLOCK_POINTS;
    const rankWith = (points: number): number => {
      for (let rank = 1; rank <= 50; rank += 1) if (boardPointsForRank(rank) >= points) return rank;
      throw new Error("届くランクがない");
    };
    const rank = rankWith(need);
    // 予算ちょうど〜超過に収まるランクが必要Pt を満たす。1 つ下のランクは満たさない(Pt の刻みが 2 以上あるので)
    expect(boardPointsForRank(rank)).toBeGreaterThanOrEqual(need);
    const withRank = optimizeBoards({
      ...base,
      ranks: { [OKAYU]: rank },
      evaluate: weighted({ [`${OKAYU}/B-023`]: 100 }),
    });
    expect(withRank.boards[OKAYU]?.blue).toContain("B-023");
    const lower = rank - 1;
    expect(boardPointsForRank(lower)).toBeLessThan(need);
    const tooLow = optimizeBoards({
      ...base,
      ranks: { [OKAYU]: lower },
      evaluate: weighted({ [`${OKAYU}/B-023`]: 100 }),
    });
    expect(tooLow.boards[OKAYU]?.blue ?? []).not.toContain("B-023");
    for (const b of [tooLow.boards[OKAYU]])
      expect(spentBoardPoints(b ?? emptyHolomenBoards())).toBeLessThanOrEqual(
        boardPointsForRank(lower),
      );
  });

  it("ランク未登録は制限なし: スコアに効くマスは全部取る(報酬・ライフ・ホロメンスキルのマスは目的にしない)", () => {
    const scoring = RED_BOARD_NODE_IDS.filter((id) => !NO_SCORE_EFFECT.has(`red/${id}`));
    const weights = Object.fromEntries(scoring.map((id) => [`${KOYORI}/${id}`, 1]));
    const result = optimizeBoards({ ...base, evaluate: weighted(weights) });
    for (const id of scoring) expect(result.boards[KOYORI]?.red).toContain(id);
    expect(result.boards[KOYORI]?.connects).toContain("leader");
    expect(rule(result.boards[KOYORI] ?? emptyHolomenBoards(), undefined)).toBeNull();
  });

  it(
    "どんな重み・どんなランクでも、予算・到達・コネクトの制約を破らない(乱数の重みで多数の組合せ)",
    { timeout: 120_000 },
    () => {
      let seed = 20261004;
      const rnd = (): number => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };
      for (let trial = 0; trial < 6; trial += 1) {
        const weights: Record<string, number> = {};
        for (const h of [KOYORI, OKAYU, KORONE])
          for (const id of [...RED_BOARD_NODE_IDS, ...BLUE_BOARD_NODE_IDS, ...GREEN_BOARD_NODE_IDS])
            if (rnd() < 0.5) weights[`${h}/${id}`] = Math.floor(rnd() * 50);
        const ranks: Record<string, number> = {};
        for (const h of [KOYORI, OKAYU, KORONE])
          if (rnd() < 0.8) ranks[h] = 1 + Math.floor(rnd() * 50);
        const placements: ConnectPlacementMap = rnd() < 0.5 ? { [OKAYU]: { card: A } } : {};
        const result = optimizeBoards({
          ...base,
          ranks,
          placements,
          scope: rnd() < 0.5 ? "minimal" : "all",
          evaluate: weighted(weights),
        });
        for (const [id, b] of Object.entries(result.boards)) {
          const placed = Object.keys(placements[id] ?? {}).filter((a) => a !== "center");
          expect(rule(b, ranks[id], placed), `trial ${String(trial)} ${id}`).toBeNull();
        }
        expect(result.recommendedScore).toBeGreaterThanOrEqual(0);
      }
    },
  );

  it("配置のあるコネクトは、加点がなくても必ず解放済み(1 Pt を予算に含む)。ランクが低くて足りなければ変更しない", () => {
    const placements: ConnectPlacementMap = { [OKAYU]: { card: A } };
    const result = optimizeBoards({
      ...base,
      ranks: { [OKAYU]: 20 },
      placements,
      evaluate: weighted({}),
    });
    const b = result.boards[OKAYU];
    expect(b?.connects).toContain("card");
    // C の手前の 6 マス + コネクト 1 Pt が最低限の出発点
    expect(b ? spentBoardPoints(b) : 0).toBeGreaterThanOrEqual(
      pts(["B-001", "B-002", "B-005", "B-006", "B-007", "B-008"]) + 1,
    );
    expect(rule(b ?? emptyHolomenBoards(), 20, ["card"])).toBeNull();

    // ランク 1(0 Pt)では必須の状態すら作れない → 無理に不正な結果を作らず、変更しない(infeasible)
    const tooLow = optimizeBoards({
      ...base,
      ranks: { [OKAYU]: 1 },
      placements,
      current: { [OKAYU]: { ...emptyHolomenBoards(), blue: ["B-001"] } },
      evaluate: weighted({ [`${OKAYU}/B-001`]: 10, [`${OKAYU}/B-002`]: 10 }),
    });
    expect(tooLow.infeasible).toEqual([OKAYU]);
    expect(tooLow.boards[OKAYU]).toBeUndefined();
    expect(tooLow.changed).not.toContain(OKAYU);
  });

  it("コネクトの配置は変えない(結果にコネクトの配置は出ず、入力の配置が評価に渡されるのは呼び出し側の責務)。現在の解放を壊さずに置ける", () => {
    // 現在: 配置のあるコネクトが未解放(不整合)。推奨では解放済みに直る
    const result = optimizeBoards({
      ...base,
      ranks: { [OKAYU]: 50 },
      placements: { [OKAYU]: { card: A } },
      current: { [OKAYU]: emptyHolomenBoards() },
      evaluate: weighted({}),
    });
    expect(result.changed).toContain(OKAYU);
    expect(result.boards[OKAYU]?.connects).toEqual(["card"]);
  });

  it("「ユニットのみ」はユニット外のホロメンを変えない。「全て」は緑ボードなどユニット外も変える", () => {
    const OUTSIDER = "tokino-sora";
    const weights = { [`${OUTSIDER}/G-001`]: 50, [`${OKAYU}/B-001`]: 50 };
    const unit = optimizeBoards({ ...base, scope: "minimal", evaluate: weighted(weights) });
    expect(unit.changed).toContain(OKAYU);
    expect(unit.changed).not.toContain(OUTSIDER);
    const all = optimizeBoards({ ...base, scope: "all", evaluate: weighted(weights) });
    expect(all.boards[OUTSIDER]?.green).toContain("G-001");
  });

  it("ユニット外の登録は評価に渡る(登録のまま)。変えないホロメンのボードは結果に出ない", () => {
    const OUTSIDER = "tokino-sora";
    let seen = false;
    optimizeBoards({
      ...base,
      current: { [OUTSIDER]: { ...emptyHolomenBoards(), green: ["G-001"] } },
      evaluate: (boards) => {
        if (boards[OUTSIDER]?.green.includes("G-001")) seen = true;
        return 1000;
      },
    });
    expect(seen).toBe(true);
  });

  it("すでに最良の登録は崩さない(推奨が登録を下回らず、変更なしなら changed が空)", () => {
    const current: Record<string, HolomenBoards> = {
      [OKAYU]: { ...emptyHolomenBoards(), blue: ["B-001"] },
    };
    const result = optimizeBoards({
      ...base,
      current,
      ranks: { [OKAYU]: 5, [KOYORI]: 5, [KORONE]: 5 }, // 未登録のホロメンは全開放になるので、変更なしを見るには全員ランクを入れる
      evaluate: weighted({ [`${OKAYU}/B-001`]: 100 }),
    });
    expect(result.recommendedScore).toBeGreaterThanOrEqual(result.currentScore);
    expect(result.changed).toEqual([]);
  });

  it("予算を超えている登録からは、予算内へ戻す推奨を出す(登録を勝手に削除することはなく、反映したときだけ置き換わる)", () => {
    const over: HolomenBoards = {
      ...emptyHolomenBoards(),
      red: ["R-001", "R-002", "R-005", "R-006", "R-007", "R-008"],
    };
    const result = optimizeBoards({
      ...base,
      current: { [KOYORI]: over },
      ranks: { [KOYORI]: 3 }, // 4 Pt。現在は 8 Pt 使っている
      evaluate: weighted({ [`${KOYORI}/R-001`]: 10 }),
    });
    expect(result.boards[KOYORI]).toBeDefined();
    expect(spentBoardPoints(result.boards[KOYORI] ?? over)).toBeLessThanOrEqual(
      boardPointsForRank(3),
    );
  });

  it("変更量を最小にする: 効かず選ばれなかった登録済みのマスは、予算が許す限り残す(ランクを超えるぶんは残さない)", () => {
    // OKAYU はメンバーなので赤は効かない。赤の登録(R-001〜R-008 = 10 Pt)は加点がないが、予算に余裕があれば消さない
    const red = ["R-001", "R-002", "R-005", "R-006", "R-007", "R-008"];
    const current: Record<string, HolomenBoards> = {
      [OKAYU]: { ...emptyHolomenBoards(), red },
    };
    const weights = { [`${OKAYU}/B-001`]: 100 };
    const roomy = optimizeBoards({
      ...base,
      current,
      ranks: { [OKAYU]: 20 },
      evaluate: weighted(weights),
    });
    expect(roomy.boards[OKAYU]?.blue).toContain("B-001");
    for (const id of red) expect(roomy.boards[OKAYU]?.red).toContain(id);
    // 予算が足りないときは、ランクを超えない範囲まで(超えるなら戻さない)
    const tight = optimizeBoards({
      ...base,
      current,
      ranks: { [OKAYU]: 4 }, // 6 Pt。現在の赤だけで 10 Pt 使っていて予算超過
      evaluate: weighted(weights),
    });
    expect(spentBoardPoints(tight.boards[OKAYU] ?? emptyHolomenBoards())).toBeLessThanOrEqual(
      boardPointsForRank(4),
    );
  });

  it("ランク未登録(制限なし)でも、スコアに効かないマスは開けない(効くマスと、そこへ届く経路・コネクトだけ)", () => {
    // 加点は OKAYU の B-001 と G-001 だけ。G-025(報酬系で加点なし)・赤・黄・緑の残りは開けない
    const result = optimizeBoards({
      ...base,
      scope: "all",
      evaluate: weighted({ [`${OKAYU}/B-001`]: 10, [`tokino-sora/G-001`]: 10 }),
    });
    expect(result.boards[OKAYU]?.blue).toEqual(["B-001"]);
    expect(result.boards[OKAYU]?.red).toEqual([]);
    expect(result.boards[OKAYU]?.green).toEqual([]);
    expect(result.boards[OKAYU]?.connects).toEqual([]);
    expect(result.boards["tokino-sora"]?.green).toEqual(["G-001"]);
    expect(result.changed.sort()).toEqual([OKAYU, "tokino-sora"].sort());
  });

  it("ユニットのみは変更の範囲がユニットのホロメンだけ(効く色も限る)。全員は緑・黄をユニット外にも開ける", () => {
    const weights = {
      [`${KOYORI}/R-001`]: 5, // リーダーの赤
      [`${KORONE}/R-001`]: 5, // メンバーの赤: 赤はリーダーにしか効かないので開けない
      [`${KORONE}/B-001`]: 5, // メンバーの青
      [`${KOYORI}/B-001`]: 5, // リーダーの青: 青はメンバーにしか効かないので開けない
      [`tokino-sora/G-001`]: 5, // ユニット外の緑
    };
    const unit = optimizeBoards({ ...base, hasSong: false, evaluate: weighted(weights) });
    expect(unit.boards[KOYORI]?.red).toEqual(["R-001"]);
    expect(unit.boards[KOYORI]?.blue ?? []).toEqual([]);
    expect(unit.boards[KORONE]?.blue).toEqual(["B-001"]);
    expect(unit.boards[KORONE]?.red ?? []).toEqual([]);
    expect(unit.changed).not.toContain("tokino-sora");
    const all = optimizeBoards({
      ...base,
      hasSong: false,
      scope: "all",
      evaluate: weighted(weights),
    });
    expect(all.boards["tokino-sora"]?.green).toEqual(["G-001"]);
    expect(all.boards["tokino-sora"]?.red ?? []).toEqual([]);
  });

  it("同じ入力なら同じ結果(固定のタイブレーク)", () => {
    const input: BoardOptimizeInput = {
      ...base,
      ranks: { [OKAYU]: 12, [KOYORI]: 15 },
      evaluate: weighted({ [`${OKAYU}/B-001`]: 3, [`${KOYORI}/R-002`]: 3, [`${KOYORI}/R-003`]: 3 }),
    };
    expect(optimizeBoards(input)).toEqual(optimizeBoards(input));
  });

  it("結果のボードは解放済みのセルがすべて中心から届き、コネクトの先があるならコネクトも解放済み", () => {
    const result = optimizeBoards({
      ...base,
      evaluate: weighted(
        Object.fromEntries(
          [...BLUE_BOARD_NODE_IDS, ...RED_BOARD_NODE_IDS].map((id, i) => [
            `${OKAYU}/${id}`,
            (i % 7) + 1,
          ]),
        ),
      ),
    });
    for (const b of Object.values(result.boards)) {
      for (const color of ["red", "blue", "yellow", "green"] as const) {
        const set = unlockSetOf(color, b[color], b.connects);
        const graph = boardGraphOf(color);
        expect(graph.reachableNodes(set).size).toBe(set.size);
      }
      expect(b.connects.every((a) => UNLOCKABLE_ANCHORS.includes(a))).toBe(true);
    }
  });
});

describe("ホロメンボードの最適化(本物の評価経路。画面のユニットスコアと一致)", () => {
  const acc = readAccountSnapshot("2026-09-15");
  const boards: Record<"red" | "blue" | "yellow" | "green", Record<string, string[]>> = {
    red: {},
    blue: {},
    yellow: {},
    green: {},
  };
  for (const r of acc.holomen)
    for (const c of ["red", "blue", "yellow", "green"] as const) {
      const nodes = r[c];
      if (nodes?.length) boards[c][r.holomenId] = nodes;
    }
  const owned = acc.members.map((m) => m.cardId);
  const leader = owned[0] ?? "";
  const seen = new Set<string>();
  const members: string[] = [];
  for (const id of owned) {
    const h = cardById.get(id)?.holomenId ?? "";
    if (id === leader || seen.has(h)) continue;
    seen.add(h);
    members.push(id);
    if (members.length === 5) break;
  }
  const request: OptimizeRunRequest = {
    leaderId: leader,
    fixedMemberIds: members,
    excludedCardIds: [],
    excludedLeaderCardIds: [],
    excludedMemberCardIds: [],
    leaderCandidateIds: null,
    requiredMemberHolomenIds: [],
    songId: null,
    blooms: Object.fromEntries(acc.members.map((m) => [m.cardId, m.bloom])),
    boards: boards.blue,
    greenBoards: boards.green,
    yellowBoards: boards.yellow,
    redBoards: boards.red,
    connectPlacements: snapshotConnectPlacements(acc),
    account: { memoryPercent: acc.memoryPercent, enhancementPercent: acc.enhancementPercent },
    topN: 1,
  };
  const team = { leaderId: leader, memberIds: members };
  const unitHolomen = [leader, ...members].map((id) => cardById.get(id)?.holomenId ?? "");
  // 旧スナップショットはコネクトの解放状態がないので、配置のあるコネクトを解放済みとして渡す(移行と同じ規則 B)
  const connects: Record<string, ("leader" | "card" | "content")[]> = {};
  for (const [id, placed] of Object.entries(request.connectPlacements ?? {}))
    connects[id] = UNLOCKABLE_ANCHORS.filter((a) => placed[a] !== undefined);

  it("推奨のユニットスコアは、推奨のボードで同じ編成を評価した画面の値(runOptimize)と一致する", () => {
    const ranks = Object.fromEntries(unitHolomen.map((id) => [id, 30]));
    const plan = planBoards({ request, team, connects, ranks, scope: "minimal" });
    expect(plan.changed.length).toBeGreaterThan(0);
    const apply = (
      key: "redBoards" | "boards" | "yellowBoards" | "greenBoards",
      color: "red" | "blue" | "yellow" | "green",
    ) => {
      const map: Record<string, string[]> = { ...request[key] };
      for (const [id, b] of Object.entries(plan.boards)) {
        if (b[color].length > 0) map[id] = [...b[color]];
        else delete map[id];
      }
      return map;
    };
    const applied: OptimizeRunRequest = {
      ...request,
      redBoards: apply("redBoards", "red"),
      boards: apply("boards", "blue"),
      yellowBoards: apply("yellowBoards", "yellow"),
      greenBoards: apply("greenBoards", "green"),
      leaderId: leader,
      fixedMemberIds: members,
    };
    // 頻度マスは評価に含めない(ホロメンボードの最適化は頻度マスを OFF の世界で行う)ので、画面の値も頻度マスを外した青ボードで出す
    const noFrequency = (map: Record<string, string[]>): Record<string, string[]> =>
      Object.fromEntries(
        Object.entries(map).map(([id, nodes]) => [id, nodes.filter((n) => !isFrequencyNode(n))]),
      );
    const screen = runOptimize({ ...applied, boards: noFrequency(applied.boards) }).candidates[0]
      ?.modifiers.adjustedUnitScore;
    expect(plan.recommended).toBe(screen);
    const current = runOptimize({ ...request, boards: noFrequency(request.boards) }).candidates[0]
      ?.modifiers.adjustedUnitScore;
    expect(plan.current).toBe(current);
  });

  it(
    "ランクを登録したホロメンは予算を超えない。どの結果も中心から届き、配置のあるコネクトは解放済み",
    { timeout: 120_000 },
    () => {
      const ranks = Object.fromEntries(
        unitHolomen.map((id, i) => [id, [8, 15, 22, 30, 40, 50][i % 6] ?? 30]),
      );
      for (const scope of ["minimal", "all"] as const) {
        const plan = planBoards({ request, team, connects, ranks, scope });
        for (const [id, b] of Object.entries(plan.boards)) {
          const placed = Object.keys(request.connectPlacements?.[id] ?? {}).filter(
            (a) => a !== "center",
          );
          const rank = ranks[id];
          expect(
            violatesBoardRules(
              b,
              rank === undefined ? Number.POSITIVE_INFINITY : boardPointsForRank(rank),
              new Set(placed),
            ),
            `${scope} ${id}`,
          ).toBeNull();
          // 最小限: ユニット外のホロメンは、緑の所属マスと曲に効く黄を足す・取り崩すだけで、赤・青・コネクトは登録のまま
          if (scope === "minimal" && !unitHolomen.includes(id)) {
            const before = request.boards[id] ?? [];
            expect([...b.blue].sort(), id).toEqual([...before].sort());
            expect(b.connects, id).toEqual(connects[id] ?? []);
          }
        }
      }
    },
  );
});
