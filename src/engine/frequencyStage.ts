import { cardById, holomenById } from "../data";
import { BLUE_FREQUENCY_NODE_IDS, blueBoardEffects } from "../data/blueBoard";
import { BOARD_MATERIAL_COLORS, emptyBoardMaterials } from "../data/boardMaterials";
import type { BoardMaterials } from "../data/boardMaterials";
import { boardPointsForRank } from "../data/boardPoints";
import {
  BOARD_COLOR_ANCHOR,
  BOARD_STATE_COLORS,
  boardGraphOf,
  emptyHolomenBoards,
  boardMaterialsOf,
  isFrequencyNode,
  sameHolomenBoards,
  spentBoardPoints,
  unlockSetOf,
  withColorSet,
  withoutFrequencyNodes,
} from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import { connectFactorMapOf } from "../data/connect";
import { resolveCard } from "../data/resolve";
import type { Card } from "../data/types";
import { BOARD_RESOURCE_KINDS } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import type { ConnectPlacementMap } from "../storage/connect";
import type { HolomenRankMap } from "../storage/holomenRank";
import type { MaterialLimits } from "./boardMaterialBudget";
import {
  evaluateFrequencyPlan,
  liveActiveSkillOf,
  optimizeFrequency,
} from "./liveFrequencyOptimizer";
import type {
  FrequencyCandidate,
  FrequencyMember,
  FrequencyPlanMetrics,
} from "./liveFrequencyOptimizer";
import { createTeamScorer } from "./request";
import type { OptimizeRunRequest, TeamIds, TeamScorer } from "./request";

/**
 * 最適化の**頻度の段**(2026-10-08 ユーザー指示。「最適化」の 1 つのボタンで、ボード → コネクト のあとに選んで行う)。
 * 前の段の盤面(ボードの最適化は頻度マスを OFF にして行う — ADR-014)から、メンバーごとに青の発動頻度マス(B-013 / B-020 / B-031)の
 * どれを開けるかを選ぶ。
 *
 * - **候補**: メンバーごとに頻度マスの部分集合(最大 8 通り)。経路は前の段の盤面から **Pt 最小**(順序は全通り試す)で、
 *   頻度マスは枝の端なので経路は一意に決まる(だから反映できる。ADR-015)
 * - **ホロメンランクの Pt は超えない**: 足りないときは、その経路を必須にしたまま、そのホロメンの 4 色のマスから
 *   「外して失うスコア ÷ 空く Pt」が小さいものを順に外して空ける(色を問わず優先度の低いところから回す。外したマスの資材は戻る)。
 *   それでも空かない(必須のコネクトとその経路だけで埋まっている)候補は取らない。届かない頻度マスは候補にならず、一部だけ届くなら届く範囲で選ぶ
 * - **資材(キューブ・コアキューブ)は `materialLimits` の範囲**(2026-10-08 ユーザー指示で「不足してよい」から変更): 前の段の盤面から増やしてよい量の上限で、
 *   呼び出し側が 余り + この編成に効かないマス(外して回せる — `recoverableMaterials`)から出す。所持リソースを考慮しない色・未登録の項目は制限なし。
 *   上限を超える組合せは選ばない(余りは負になりうる — 外して回すぶん)
 * - **選び方**: `perfect`(理論値重視)/ `expected`(期待値重視)はライブ側のモデル(`liveFrequencyOptimizer.ts`)で全組合せから選び、
 *   同じ発動頻度・発動率になる候補どうし(経路や外したマスが違う)はユニットスコアの高いほうを採る。`unit`(ユニットスコア重視)は
 *   表示ユニットスコアをメンバーごとに 1 人ずつ最良へ替えて、変わらなくなるまで回す(座標降下。近似)
 * - **固定**: ホロメン ID → 頻度マスの数(0〜3)。固定したメンバーはその数の候補だけで選ぶ(届かない数は無視する)。
 *   実効 % ではなく数で固定するのは、コネクトも同じ最適化で変わると、実行する前には実効 % が決まらないため(2026-10-08 ユーザー指示)
 *
 * ライブ側の 2 つは P/T/S を見ないので、Pt を空けるために外したマスのぶん表示ユニットスコアが下がる案を選ぶことがある(モデルを混ぜない —
 * `.claude/skills/engine-structure/SKILL.md`)。返すスコアは選んだ案の表示ユニットスコア(頻度マス込み)
 */
export type FrequencyObjective = "perfect" | "expected" | "unit";

export interface FrequencyStageInput {
  /** 登録している状態の依頼(開花・アカウント補正・曲。ボードと配置は下の値で置き換えて評価する) */
  request: OptimizeRunRequest;
  team: TeamIds;
  /** 前の段のあとの全ホロメンの盤面 */
  boards: Readonly<Record<string, HolomenBoards>>;
  /** 前の段のあとのコネクトの配置 */
  placements: ConnectPlacementMap;
  /** 前の段のあとの余りのリソース(未登録は null) */
  remaining: BoardResources;
  ranks: HolomenRankMap;
  objective: FrequencyObjective;
  /** ホロメン ID → 固定する頻度マスの数(0〜3)。届かない数は無視する(固定しない) */
  fixed: Readonly<Record<string, number>>;
  /** ライブ側の評価区間(秒) */
  horizonSeconds: number;
  /** 前の段の盤面から増やしてよい資材の上限(色ごと。制限なしは Infinity)。省略は全色制限なし */
  materialLimits?: MaterialLimits;
  /** 編成の評価器(組み直しプランの段どうしで共有する)。省略はこの依頼から作る */
  scorer?: TeamScorer;
}

export interface FrequencyStageRow {
  holomenId: string;
  /** 推奨の実効発動頻度 UP(%) */
  recommendedPercent: number;
  /** 推奨で開ける頻度マスの数(0〜3) */
  recommendedNodeCount: number;
  /** 届く(Pt の範囲で選べる)頻度マスの数(昇順)。[0] だけなら頻度マスに届かない */
  reachableNodeCounts: number[];
}

export interface FrequencyStageResult {
  /** 頻度の段のあとの全ホロメンの盤面 */
  boards: Record<string, HolomenBoards>;
  /** 頻度の段のあとの余り(不足は負。未登録は null のまま) */
  remaining: BoardResources;
  /** 選んだ案の表示ユニットスコア(頻度マス込み) */
  score: number;
  /** メンバーの並び(重複なし) */
  rows: FrequencyStageRow[];
  /** 選んだ案のライブ側の指標(スコアUP・期待カバレッジ・最大空白の表示に使う) */
  metrics: FrequencyPlanMetrics;
}

/** メンバー 1 人の候補 1 つ */
interface Variant {
  boards: HolomenBoards;
  frequencyNodeCount: number;
  frequencyPercent: number;
  ratePercent: number;
  /** 前の段の盤面(頻度マスを外したもの)から追加したマス(青) */
  added: string[];
}

const FREQUENCY: readonly string[] = BLUE_FREQUENCY_NODE_IDS;

function subsets(ids: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let mask = 0; mask < 2 ** ids.length; mask += 1)
    out.push(ids.filter((_, i) => Math.floor(mask / 2 ** i) % 2 === 1));
  return out;
}

function permutations(ids: readonly string[]): string[][] {
  if (ids.length <= 1) return [[...ids]];
  const out: string[][] = [];
  for (const [i, id] of ids.entries())
    for (const tail of permutations([...ids.slice(0, i), ...ids.slice(i + 1)]))
      out.push([id, ...tail]);
  return out;
}

/** 頻度マスの部分集合を、追加 Pt が最小になる順で開けた青の集合(届かなければ null) */
function withFrequencyRoute(base: HolomenBoards, targets: readonly string[]): HolomenBoards | null {
  const graph = boardGraphOf("blue");
  const start = unlockSetOf("blue", base.blue, base.connects);
  let best: { set: Set<string>; points: number } | null = null;
  for (const order of permutations(targets)) {
    const set = new Set(start);
    let points = 0;
    let ok = true;
    for (const id of order) {
      const plan = graph.planUnlock(set, id);
      if (!plan) {
        ok = false;
        break;
      }
      for (const cell of plan.cells) set.add(cell);
      points += plan.points;
    }
    if (ok && (best === null || points < best.points)) best = { set, points };
  }
  return best === null ? null : withColorSet(base, "blue", best.set);
}

const budgetOf = (ranks: HolomenRankMap, id: string): number => {
  const rank = ranks[id];
  return rank === undefined ? Number.POSITIVE_INFINITY : boardPointsForRank(rank);
};

/** そのホロメンの盤面での実効発動頻度 UP(%。コネクト増幅込み) */
export function frequencyPercentOf(
  holomenId: string,
  boards: HolomenBoards | undefined,
  placements: ConnectPlacementMap,
): number {
  return blueBoardEffects(boards?.blue ?? [], connectFactorMapOf(placements)[holomenId]?.blue)
    .activeFrequencyPercent;
}

export function planFrequencyStage(input: FrequencyStageInput): FrequencyStageResult {
  const { request, team, placements, ranks, objective, fixed, horizonSeconds } = input;
  const state: Record<string, HolomenBoards> = { ...input.boards };
  const scorer = input.scorer ?? createTeamScorer(request, team);
  const evaluateState = (boards: Readonly<Record<string, HolomenBoards>>): number =>
    scorer.evaluate(boards, placements, false).modifiers.adjustedUnitScore;

  const memberCards = team.memberIds
    .map((id) => cardById.get(id))
    .filter((c): c is Card => c !== undefined);
  const memberIds = memberCards
    .map((c) => c.holomenId)
    .filter((id, i, all) => all.indexOf(id) === i);
  const factors = connectFactorMapOf(placements);

  /** 盤面を 1 人ぶん差し替えた全体 */
  const replaced = (id: string, boards: HolomenBoards): Record<string, HolomenBoards> => ({
    ...state,
    [id]: boards,
  });
  /** そのホロメンの、外してはいけないコネクト(配置のある非中心のコネクトマス) */
  const placedConnectors = (id: string): Set<string> => {
    const out = new Set<string>();
    for (const color of BOARD_STATE_COLORS) {
      const anchor = BOARD_COLOR_ANCHOR[color];
      const connectorId = boardGraphOf(color).connectorId;
      if (anchor !== undefined && connectorId !== null && placements[id]?.[anchor] !== undefined)
        out.add(`${color}/${connectorId}`);
    }
    return out;
  };

  /**
   * Pt が足りない候補を、経路(と頻度マス)を必須にしたまま、外して失うスコア ÷ 空く Pt が小さいマスから外して予算に収める。
   * 収まらなければ null
   */
  function reclaim(
    id: string,
    base: HolomenBoards,
    boards: HolomenBoards,
    cap: number,
  ): HolomenBoards | null {
    const keepBlue = new Set(boards.blue.filter((cell) => !base.blue.includes(cell)));
    for (const f of FREQUENCY) if (boards.blue.includes(f)) keepBlue.add(f);
    const connectors = placedConnectors(id);
    let current = boards;
    let score = evaluateState(replaced(id, current));
    while (spentBoardPoints(current) > cap) {
      let best: { boards: HolomenBoards; ratio: number; loss: number; score: number } | null = null;
      for (const color of BOARD_STATE_COLORS) {
        const graph = boardGraphOf(color);
        const set = unlockSetOf(color, current[color], current.connects);
        const before = graph.unlockedPoints(set);
        for (const cell of set) {
          if (color === "blue" && keepBlue.has(cell)) continue;
          if (connectors.has(`${color}/${cell}`)) continue;
          const next = graph.lockNode(set, cell);
          if (color === "blue" && [...keepBlue].some((k) => !next.has(k))) continue;
          if (
            graph.connectorId !== null &&
            connectors.has(`${color}/${graph.connectorId}`) &&
            !next.has(graph.connectorId)
          )
            continue;
          const freed = before - graph.unlockedPoints(next);
          if (freed <= 0) continue;
          const candidate = withColorSet(current, color, next);
          const value = evaluateState(replaced(id, candidate));
          const loss = score - value;
          const ratio = loss / freed;
          if (best === null || ratio < best.ratio || (ratio === best.ratio && loss < best.loss))
            best = { boards: candidate, ratio, loss, score: value };
        }
      }
      if (best === null) return null;
      current = best.boards;
      score = best.score;
    }
    return current;
  }

  /** メンバーごとの候補(部分集合 × 経路。Pt は予算内) */
  const variantsOf = (id: string): Variant[] => {
    const base = withoutFrequencyNodes(state[id] ?? emptyHolomenBoards());
    // 予算を超えている登録(ランクを下げたあとなど)は、頻度の段では直さない(超えている分までは許す)
    const cap = Math.max(budgetOf(ranks, id), spentBoardPoints(base));
    const out: Variant[] = [];
    // 候補は登録の頻度マスの部分集合か上位集合だけ(数が同じなら登録のまま、増やす・減らすときも登録に足す・減らすだけ)。
    // 同じ数で場所だけ替える案は意味がない(2026-10-09 ユーザー指摘 — 3 マスとも +4% で、違いは経路だけ)
    const registered = new Set((request.boards[id] ?? []).filter(isFrequencyNode));
    for (const subset of subsets(FREQUENCY)) {
      const chosen = new Set(subset);
      const nested =
        subset.every((f) => registered.has(f)) || [...registered].every((f) => chosen.has(f));
      if (!nested) continue;
      let boards = withFrequencyRoute(base, subset);
      if (boards === null) continue;
      if (spentBoardPoints(boards) > cap) boards = reclaim(id, base, boards, cap);
      if (boards === null) continue;
      if (out.some((v) => sameHolomenBoards(v.boards, boards))) continue;
      const effects = blueBoardEffects(boards.blue, factors[id]?.blue);
      out.push({
        boards,
        frequencyNodeCount: subset.length,
        frequencyPercent: effects.activeFrequencyPercent,
        ratePercent: effects.activeRatePercent,
        added: boards.blue.filter((cell) => !base.blue.includes(cell)),
      });
    }
    return out;
  };

  const variants = memberIds.map(variantsOf);
  /** 固定したメンバーは、その頻度の候補だけ(届かない値は無視) */
  const allowedOf = (i: number): number[] => {
    const list = variants[i] ?? [];
    const target = fixed[memberIds[i] ?? ""];
    const all = list.map((_, k) => k);
    if (target === undefined) return all;
    const kept = all.filter((k) => list[k]?.frequencyNodeCount === target);
    return kept.length > 0 ? kept : all;
  };
  /** 選んだ添字を盤面へ */
  const apply = (choice: readonly number[]): Record<string, HolomenBoards> => {
    const out = { ...state };
    for (const [i, id] of memberIds.entries()) {
      const v = variants[i]?.[choice[i] ?? 0];
      if (v) out[id] = v.boards;
    }
    return out;
  };
  const scoreOf = (choice: readonly number[]): number => evaluateState(apply(choice));
  /** 候補ごとの、前の段の盤面からの資材の増分(外して戻る分は負) */
  const deltaOf = (i: number, k: number): BoardMaterials => {
    const id = memberIds[i] ?? "";
    const before = boardMaterialsOf(state[id] ?? emptyHolomenBoards());
    const after = boardMaterialsOf(variants[i]?.[k]?.boards ?? state[id] ?? emptyHolomenBoards());
    const out = emptyBoardMaterials();
    for (const color of BOARD_MATERIAL_COLORS)
      for (const kind of BOARD_RESOURCE_KINDS)
        out[color][kind] = after[color][kind] - before[color][kind];
    return out;
  };
  const deltas = variants.map((list, i) => list.map((_, k) => deltaOf(i, k)));
  const limits = input.materialLimits;
  /** 組合せが資材の上限に収まるか */
  const feasible = (choice: readonly number[]): boolean => {
    if (!limits) return true;
    for (const color of BOARD_MATERIAL_COLORS)
      for (const kind of BOARD_RESOURCE_KINDS) {
        const limit = limits[color][kind];
        if (!Number.isFinite(limit)) continue;
        let sum = 0;
        for (const [i, k] of choice.entries()) sum += deltas[i]?.[k]?.[color][kind] ?? 0;
        if (sum > limit) return false;
      }
    return true;
  };
  /** 資材の増分の合計(同じ頻度・発動率の候補から選ぶときの目安。少ないほど通りやすい) */
  const weightOf = (i: number, k: number): number =>
    BOARD_MATERIAL_COLORS.reduce(
      (sum, color) =>
        sum +
        Math.max(0, deltas[i]?.[k]?.[color].cube ?? 0) +
        Math.max(0, deltas[i]?.[k]?.[color].core ?? 0),
      0,
    );

  /** 1 人ずつ、許す候補のうちユニットスコアが最良のものへ替える(変わらなくなるまで。最大 4 周) */
  /**
   * 許す候補の中で、1 人ずつ → 2 人同時の順に、ユニットスコアが上がる替え方がなくなるまで替える(近似。頻度の効きは単調でなく、
   * 1 人ずつだけでは 2 人の頻度を同時に動かすと上がる組合せで止まる)
   */
  const descend = (start: number[], pool: (i: number) => number[]): number[] => {
    let choice = start;
    let best = scoreOf(choice);
    const tryNext = (next: number[]): boolean => {
      if (!feasible(next)) return false;
      const value = scoreOf(next);
      if (value <= best) return false;
      best = value;
      choice = next;
      return true;
    };
    for (let round = 0; round < 8; round += 1) {
      let improved = false;
      for (let i = 0; i < memberIds.length; i += 1)
        for (const k of pool(i))
          if (k !== choice[i])
            improved = tryNext(choice.map((c, x) => (x === i ? k : c))) || improved;
      if (improved) continue;
      for (let i = 0; i < memberIds.length; i += 1)
        for (let j = i + 1; j < memberIds.length; j += 1)
          for (const a of pool(i))
            for (const b of pool(j))
              if (a !== choice[i] && b !== choice[j])
                improved =
                  tryNext(choice.map((c, x) => (x === i ? a : x === j ? b : c))) || improved;
      if (!improved) break;
    }
    return choice;
  };

  // ライブ側の入力: 同じ発動頻度・発動率の候補は 1 つにまとめる(ライブ側では区別できない)
  const resolved = memberCards.map((c) => resolveCard(c, request.blooms, undefined));
  const classes = variants.map((list) => {
    const keys: string[] = [];
    const members: number[][] = [];
    for (const [k, v] of list.entries()) {
      const key = `${String(v.frequencyPercent)}|${String(v.ratePercent)}`;
      const at = keys.indexOf(key);
      if (at < 0) {
        keys.push(key);
        members.push([k]);
      } else members[at]?.push(k);
    }
    return members;
  });
  const liveMembers: FrequencyMember[] = memberIds.map((id, i) => {
    const card = resolved.find((c) => c.holomenId === id);
    const list = variants[i] ?? [];
    const candidates: FrequencyCandidate[] = (classes[i] ?? []).map((ks) => {
      const v = list[ks[0] ?? 0];
      return {
        frequencyNodeCount: v?.frequencyNodeCount ?? 0,
        effectiveFrequencyPercent: v?.frequencyPercent ?? 0,
        effectiveRatePercent: v?.ratePercent ?? 0,
        unlockedNodeIds: [...(v?.boards.blue ?? [])],
        addedNodeIds: [...(v?.added ?? [])],
        removedNodeIds: [],
        additionalNodeCount: v?.added.length ?? 0,
      };
    });
    return {
      holomenId: id,
      cardId: card?.id ?? "",
      skill: card ? liveActiveSkillOf(card, resolved, holomenById) : null,
      candidates,
      currentIndex: 0,
    };
  });
  const classOf = (i: number, k: number): number =>
    (classes[i] ?? []).findIndex((ks) => ks.includes(k));

  let choice: number[];
  if (objective === "unit") {
    // 座標降下は出発点で止まる場所が変わるので、頻度マスなし・届く最大の頻度の 2 つから回して高いほうを採る
    const highest = (i: number): number => {
      const list = variants[i] ?? [];
      return allowedOf(i).reduce(
        (best, k) =>
          (list[k]?.frequencyPercent ?? 0) > (list[best]?.frequencyPercent ?? 0) ? k : best,
        allowedOf(i)[0] ?? 0,
      );
    };
    // 上限に収まらない出発点は使わない(頻度マスを足さない盤面 = 添字 0 は増分がないので必ず収まる)
    const starts = [
      memberIds.map((_, i) => allowedOf(i)[0] ?? 0),
      memberIds.map((_, i) => highest(i)),
    ].filter(feasible);
    if (starts.length === 0) starts.push(memberIds.map(() => 0));
    choice = starts
      .map((start) => descend(start, allowedOf))
      .reduce((best, c) => (scoreOf(c) > scoreOf(best) ? c : best));
  } else {
    // 固定したメンバーは、その数の候補(まとめた候補は数がそろっている — 頻度マスは 1 つ +4% 以上なので数が違えば % も違う)だけ
    const fixedMembers: FrequencyMember[] = liveMembers.map((member) => {
      const target = fixed[member.holomenId];
      if (target === undefined) return member;
      const kept = member.candidates.filter((c) => c.frequencyNodeCount === target);
      return kept.length > 0 ? { ...member, candidates: kept, currentIndex: 0 } : member;
    });
    // 資材の上限があるときは、上位から順に収まる案を探す(全案を並べる)
    const result = optimizeFrequency(
      fixedMembers,
      horizonSeconds,
      limits ? { rankingSize: Number.POSITIVE_INFINITY } : undefined,
    );
    const mode = objective === "perfect" ? result.perfect : result.expected;
    /** 固定で絞った候補の添字 → まとめた候補の添字 */
    const pickedOf = (plan: { choice: number[] }): number[] =>
      plan.choice.map((index, i) => {
        const candidate = fixedMembers[i]?.candidates[index];
        return Math.max(
          0,
          liveMembers[i]?.candidates.indexOf(candidate as FrequencyCandidate) ?? 0,
        );
      });
    /** まとめた候補の中の出発点(上限があるときは資材のいちばん少ない候補) */
    const lightest = (i: number, c: number): number =>
      limits
        ? (classes[i]?.[c] ?? [0]).reduce((best, k) =>
            weightOf(i, k) < weightOf(i, best) ? k : best,
          )
        : (classes[i]?.[c]?.[0] ?? 0);
    const plans = limits ? mode.ranking : [mode.best];
    const fits = plans.find((plan) => feasible(pickedOf(plan).map((c, i) => lightest(i, c))));
    const picked = fits ? pickedOf(fits) : null;
    // その中でユニットスコアが最良の候補(収まる範囲で)
    choice = picked
      ? descend(
          picked.map((c, i) => lightest(i, c)),
          (i) => classes[i]?.[picked[i] ?? 0] ?? [0],
        )
      : memberIds.map(() => 0);
  }

  const boards = apply(choice);
  const metrics = evaluateFrequencyPlan(
    liveMembers,
    choice.map((k, i) => Math.max(0, classOf(i, k))),
    horizonSeconds,
  );
  // 余り: 前の段の余りから、頻度の段で増えた(外して戻った分は減った)資材を引く(外して回すぶんは負になる)
  const remaining: BoardResources = JSON.parse(JSON.stringify(input.remaining)) as BoardResources;
  for (const id of memberIds) {
    const before = boardMaterialsOf(state[id] ?? emptyHolomenBoards());
    const after = boardMaterialsOf(boards[id] ?? emptyHolomenBoards());
    for (const color of BOARD_MATERIAL_COLORS)
      for (const kind of BOARD_RESOURCE_KINDS) {
        const left = remaining[color][kind];
        if (left !== null)
          remaining[color][kind] = left - (after[color][kind] - before[color][kind]);
      }
  }
  return {
    boards,
    remaining,
    score: evaluateState(boards),
    rows: memberIds.map((id, i) => {
      const list = variants[i] ?? [];
      return {
        holomenId: id,
        recommendedPercent: list[choice[i] ?? 0]?.frequencyPercent ?? 0,
        recommendedNodeCount: list[choice[i] ?? 0]?.frequencyNodeCount ?? 0,
        reachableNodeCounts: [...new Set(list.map((v) => v.frequencyNodeCount))].sort(
          (a, b) => a - b,
        ),
      };
    }),
    metrics,
  };
}
