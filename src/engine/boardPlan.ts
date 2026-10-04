import { cardById, holomen } from "../data";
import { BOARD_STATE_COLORS, emptyHolomenBoards } from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import type { BoardConnectMap } from "../storage/boardConnects";
import type { BoardColor, BoardMap } from "../storage/boards";
import type { HolomenRankMap } from "../storage/holomenRank";
import { optimizeBoards } from "./boardOptimize";
import type { BoardScope } from "./boardOptimize";
import { teamEvaluator } from "./request";
import type { OptimizeRunRequest, TeamIds } from "./request";

/**
 * ホロメンボードの最適化の依頼と結果(結果詳細・ユニット詳細の下端「ホロメンボードの最適化」。2026-10-04 ユーザー指示)。
 * Web Worker(`boardWorker.ts`)と UI スレッドのどちらからも同じ関数を呼ぶ。
 *
 * 依頼の `request` は**登録している状態**(ボード 4 色・開花・アカウント補正・曲・コネクトの配置)で、`connects` は解放済みのコネクトマス、
 * `ranks` はホロメンランク。コネクトの配置は変えない(コネクトの最適化の責務)。評価は 6 枠固定の依頼と同じ経路なので、
 * 画面の値と一致する(`boardOptimize.test.ts`)。選び方と守る制約は `boardOptimize.ts`
 */
export interface BoardPlanInput {
  request: OptimizeRunRequest;
  team: TeamIds;
  /** ホロメン ID → 解放済みのコネクトマス(赤 / 青 / 黄) */
  connects: BoardConnectMap;
  /** ホロメン ID → ホロメンランク(登録済みのホロメンだけ。載っていないホロメンはボードPt の制限なし) */
  ranks: HolomenRankMap;
  /** 変えてよい範囲(ユニットのみ / すべて) */
  scope: BoardScope;
}

export interface BoardPlanResult {
  /** いまの登録でのユニットスコア */
  current: number;
  /** 推奨でのユニットスコア */
  recommended: number;
  /** 推奨のボード(変更のあるホロメンだけ。ホロメン ID → 4 色の解放マスと解放済みのコネクト) */
  boards: Record<string, HolomenBoards>;
  /** 変更のあるホロメン ID(リーダー → メンバー → それ以外) */
  changed: string[];
  /** 必須のコネクトがランクの予算に収まらず、変更できなかったホロメン ID */
  infeasible: string[];
  /** 変更前のボード(変更のあるホロメンだけ。表示で差分を出すため) */
  before: Record<string, HolomenBoards>;
}

const REQUEST_KEYS: Record<BoardColor, "boards" | "greenBoards" | "yellowBoards" | "redBoards"> = {
  red: "redBoards",
  blue: "boards",
  yellow: "yellowBoards",
  green: "greenBoards",
};

export function planBoards(input: BoardPlanInput): BoardPlanResult {
  const { request, team, connects, ranks, scope } = input;
  const holomenOf = (cardId: string): string => cardById.get(cardId)?.holomenId ?? "";
  const leaderHolomenId = holomenOf(team.leaderId);
  const memberHolomenIds = team.memberIds.map(holomenOf);
  const first = [leaderHolomenId, ...memberHolomenIds].filter(
    (id, i, all) => all.indexOf(id) === i,
  );
  const holomenIds = [...first, ...holomen.map((h) => h.id).filter((id) => !first.includes(id))];

  const current: Record<string, HolomenBoards> = {};
  for (const id of holomenIds) {
    current[id] = {
      red: [...(request.redBoards[id] ?? [])],
      blue: [...(request.boards[id] ?? [])],
      yellow: [...(request.yellowBoards[id] ?? [])],
      green: [...(request.greenBoards[id] ?? [])],
      connects: [...(connects[id] ?? [])],
    };
  }
  const placements = request.connectPlacements ?? {};
  const evaluator = (boards: Readonly<Record<string, HolomenBoards>>): number => {
    const maps: Record<(typeof REQUEST_KEYS)[BoardColor], BoardMap> = {
      boards: {},
      greenBoards: {},
      yellowBoards: {},
      redBoards: {},
    };
    for (const [id, b] of Object.entries(boards)) {
      for (const color of BOARD_STATE_COLORS) {
        if (b[color].length > 0) maps[REQUEST_KEYS[color]][id] = [...b[color]];
      }
    }
    return (
      teamEvaluator({ ...request, ...maps }, team)(placements)?.modifiers.adjustedUnitScore ?? 0
    );
  };

  const result = optimizeBoards({
    current,
    ranks,
    placements,
    scope,
    leaderHolomenId,
    memberHolomenIds,
    hasSong: request.songId !== null,
    holomenIds,
    evaluate: evaluator,
  });
  const before: Record<string, HolomenBoards> = {};
  for (const id of result.changed) before[id] = current[id] ?? emptyHolomenBoards();
  return {
    current: result.currentScore,
    recommended: result.recommendedScore,
    boards: result.boards,
    changed: result.changed,
    infeasible: result.infeasible,
    before,
  };
}
