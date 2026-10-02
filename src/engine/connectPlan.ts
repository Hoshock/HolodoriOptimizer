import { cardById, holomen } from "../data";
import type { ConnectPlacementMap } from "../storage/connect";
import { assignConnects } from "./connectOptimize";
import type { ConnectItem } from "./connectOptimize";
import { teamEvaluator } from "./request";
import type { OptimizeRunRequest, TeamIds } from "./request";

/**
 * コネクトの最適化の依頼と結果(結果詳細・ユニット詳細の下端の左「コネクトの最適化」。2026-10-02 ユーザー指示)。
 * Web Worker(`connectWorker.ts`)と UI スレッドのどちらからも同じ関数を呼ぶ。
 *
 * 依頼の `request` は**登録している状態**(ボード 4 色・開花・アカウント補正・曲)で、`connectPlacements` は
 * **いまボードに置いている配置**(「現在」)。所持の枚数の範囲でその編成のユニットスコアを最大にする置き方(「推奨」)を選び、
 * 両方のユニットスコアを返す。評価は 6 枠固定の依頼と同じ経路なので、画面の値と一致する(`connectOptimize.test.ts`)
 */
export interface ConnectPlanInput {
  request: OptimizeRunRequest;
  team: TeamIds;
  /** 持っているコネクト(形 × ％ × 枚数) */
  items: ConnectItem[];
}

export interface ConnectPlanResult {
  /** いまの配置(`request.connectPlacements`)でのユニットスコア */
  current: number;
  /** 推奨の配置でのユニットスコア */
  recommended: number;
  /** 推奨の配置(ホロメン ID → コネクトマス → 形と ‰)。いまの配置とは独立で、全部置き直した結果 */
  placements: ConnectPlacementMap;
}

export function planConnects(input: ConnectPlanInput): ConnectPlanResult {
  const { request, team, items } = input;
  const evaluate = teamEvaluator(request, team);
  const score = (placements: ConnectPlacementMap): number =>
    evaluate(placements)?.modifiers.adjustedUnitScore ?? 0;

  const holomenOf = (cardId: string): string => cardById.get(cardId)?.holomenId ?? "";
  const leaderHolomenId = holomenOf(team.leaderId);
  const memberHolomenIds = team.memberIds.map(holomenOf);
  // 編成にいるホロメンを先に回す(同点のとき編成のホロメンへ先に置く)
  const first = [leaderHolomenId, ...memberHolomenIds].filter(
    (id, i, all) => all.indexOf(id) === i,
  );
  const holomenIds = [...first, ...holomen.map((h) => h.id).filter((id) => !first.includes(id))];
  const sets = (map: Record<string, string[]>): Map<string, Set<string>> =>
    new Map(Object.entries(map).map(([id, nodes]) => [id, new Set(nodes)]));

  const placements = assignConnects({
    items,
    leaderHolomenId,
    memberHolomenIds,
    hasSong: request.songId !== null,
    unlocked: {
      blue: sets(request.boards),
      red: sets(request.redBoards),
      yellow: sets(request.yellowBoards),
      green: sets(request.greenBoards),
    },
    holomenIds,
    evaluate: score,
  });
  return {
    current: score(request.connectPlacements ?? {}),
    recommended: score(placements),
    placements,
  };
}
