import { songById } from "../data";
import { emptyHolomenBoards, sameHolomenBoards } from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import { emptyBoardResources } from "../storage/boardResources";
import { BOARD_MATERIAL_COLORS } from "../data/boardMaterials";
import type { BoardMaterials } from "../data/boardMaterials";
import { BOARD_RESOURCE_KINDS } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import { unlimitedMaterials } from "./boardMaterialBudget";
import type { MaterialLimits } from "./boardMaterialBudget";
import { normalized, recoverableMaterials } from "./boardOptimize";
import { planBoardConnect } from "./boardConnectPlan";
import type { BoardConnectPlanInput, BoardConnectPlanResult } from "./boardConnectPlan";
import { planHolomenOrder, registeredBoardsOf } from "./boardPlan";
import { frequencyPercentOf, planFrequencyStage } from "./frequencyStage";
import type { FrequencyObjective, FrequencyStageRow } from "./frequencyStage";
import type { FrequencyPlanMetrics } from "./liveFrequencyOptimizer";
import { createTeamScorer } from "./request";

/**
 * 「最適化」(2026-10-08 ユーザー指示。結果詳細・ユニット詳細の下端の 1 つのボタン)。**ボード → コネクト → 頻度** の順に、選んだものだけを行う。
 * ボードとコネクトは `planBoardConnect`(頻度マスを OFF にした世界。ADR-014)、頻度は `planFrequencyStage`(その盤面から、ランクの Pt の範囲で
 * 頻度マスを選ぶ。Pt が足りなければ優先度の低いマスを外して空ける。ADR-015)。
 * 資材は 余り + この編成に効かないマス(外して回せる — `recoverableMaterials`)の範囲で、所持リソースを考慮しない色は制限なし(2026-10-08 ユーザー指示)。
 *
 * 頻度を選ばないときは、ボードとコネクトの段は登録している頻度マスを残したまま行う(2026-10-08 ユーザー指示「頻度を外すと何で現在が変わるんだ」)。
 * 「現在」のスコアはいつも登録そのまま(頻度マス込み)
 */
export interface OptimizePlanInput extends Omit<BoardConnectPlanInput, "board" | "connect"> {
  board: boolean;
  connect: boolean;
  frequency: boolean;
  /** 頻度の選び方(理論値重視 / 期待値重視 / ユニットスコア重視) */
  objective: FrequencyObjective;
  /** ホロメン ID → 固定する頻度マスの数(0〜3) */
  fixedFrequencyNodes: Record<string, number>;
  /** ライブ側の評価区間(秒。曲の長さか、全曲の中央値) */
  horizonSeconds: number;
}

export interface FrequencyPlanSummary {
  /** メンバーの並び: ホロメン ID・現在 / 推奨の実効発動頻度 UP(%)・届く頻度の選択肢 */
  rows: (FrequencyStageRow & { currentPercent: number })[];
  metrics: FrequencyPlanMetrics;
}

export interface OptimizePlanResult extends BoardConnectPlanResult {
  /** 頻度を選んだときだけ */
  frequency: FrequencyPlanSummary | null;
  /**
   * 推奨の盤面で、この編成に効かないマスに入っている資材(外して回せる量。`recoverableMaterials`)。
   * 余り(`remainingAfter`)の負のうちこの量までは外して回すぶんで、超えたぶんが本当の不足
   */
  recoverableAfter: BoardMaterials;
}

/** 頻度の段で増やしてよい資材の上限 = 余り + 外して回せる量(所持リソースを考慮しない色・未登録の項目は制限なし) */
function frequencyLimits(
  remaining: BoardResources,
  recoverable: BoardMaterials,
  relaxed: ReadonlySet<string>,
): MaterialLimits {
  const out = unlimitedMaterials();
  for (const color of BOARD_MATERIAL_COLORS)
    for (const kind of BOARD_RESOURCE_KINDS) {
      const left = remaining[color][kind];
      if (left !== null && !relaxed.has(color)) out[color][kind] = left + recoverable[color][kind];
    }
  return out;
}

export function planOptimize(input: OptimizePlanInput): OptimizePlanResult {
  const { request, team, board, connect, frequency } = input;
  const { holomenIds, leaderHolomenId, memberHolomenIds } = planHolomenOrder(team);
  const song = request.songId === null ? null : (songById.get(request.songId) ?? null);
  const original = registeredBoardsOf(request, input.connects, holomenIds);

  // 段どうしで評価器を共有する(同じ盤面を測り直さない — 2026-10-08「計算の高速化」)
  const scorer = createTeamScorer(request, team);
  let state: Record<string, HolomenBoards> = original;
  let placements = request.connectPlacements ?? {};
  let remaining = input.resources ?? emptyBoardResources();
  let infeasible: string[] = [];
  let rounds = 0;
  let current = 0;
  let recommended = 0;
  if (board || connect) {
    const bc = planBoardConnect({ ...input, board, connect, keepFrequency: !frequency, scorer });
    state = { ...original, ...bc.boards };
    placements = bc.placements;
    remaining = bc.remainingAfter;
    infeasible = bc.infeasible;
    rounds = bc.rounds;
    current = bc.current;
    recommended = bc.recommended;
  }

  let summary: FrequencyPlanSummary | null = null;
  if (frequency) {
    const stage = planFrequencyStage({
      request,
      team,
      boards: state,
      placements,
      remaining,
      ranks: input.ranks,
      objective: input.objective,
      fixed: input.fixedFrequencyNodes,
      horizonSeconds: input.horizonSeconds,
      scorer,
      materialLimits: frequencyLimits(
        remaining,
        recoverableMaterials({
          boards: state,
          placements,
          leaderHolomenId,
          memberHolomenIds,
          song,
        }),
        new Set(input.relaxedMaterialColors ?? []),
      ),
    });
    state = stage.boards;
    remaining = stage.remaining;
    recommended = stage.score;
    // 現在 = 登録そのまま(頻度マス込み)
    current = scorer.evaluate(original, request.connectPlacements ?? {}, false).modifiers
      .adjustedUnitScore;
    // 現在の頻度は、登録している盤面と配置での実効値
    summary = {
      rows: stage.rows.map((row) => ({
        ...row,
        currentPercent: frequencyPercentOf(
          row.holomenId,
          original[row.holomenId],
          request.connectPlacements ?? {},
        ),
      })),
      metrics: stage.metrics,
    };
  }

  const changed = holomenIds.filter(
    (id) =>
      !sameHolomenBoards(
        normalized(state[id] ?? emptyHolomenBoards()),
        normalized(original[id] ?? emptyHolomenBoards()),
      ),
  );
  const boards: Record<string, HolomenBoards> = {};
  const before: Record<string, HolomenBoards> = {};
  for (const id of changed) {
    boards[id] = state[id] ?? emptyHolomenBoards();
    before[id] = original[id] ?? emptyHolomenBoards();
  }
  return {
    current,
    recommended,
    boards,
    changed,
    infeasible,
    before,
    remainingAfter: remaining,
    placements,
    rounds,
    frequency: summary,
    recoverableAfter: recoverableMaterials({
      boards: state,
      placements,
      leaderHolomenId,
      memberHolomenIds,
      song,
    }),
  };
}
