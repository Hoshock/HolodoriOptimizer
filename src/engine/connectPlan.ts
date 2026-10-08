import { cardById, holomen } from "../data";
import type { ConnectAnchor } from "../data/connect";
import type { ConnectPlacementMap } from "../storage/connect";
import { assignConnects } from "./connectOptimize";
import type { ConnectItem, ConnectScope } from "./connectOptimize";
import { createTeamScorer } from "./request";
import type { OptimizeRunRequest, TeamIds, TeamScorer } from "./request";

/**
 * コネクトの最適化の依頼と結果(2026-10-02 ユーザー指示。いまは「最適化」の中の段で、`boardConnectPlan.ts` が呼ぶ)。
 * Web Worker(`optimizeWorker.ts`)と UI スレッドのどちらからも同じ関数を呼ぶ。
 *
 * 依頼の `request` は**登録している状態**(ボード 4 色・開花・アカウント補正・曲)で、`connectPlacements` は
 * **いまボードに置いている配置**(「現在」)。所持の枚数の範囲で、現在の配置から**ユニットスコアが上がる変更だけ**を重ねた置き方
 * (「推奨」。変更量が最小になる方針 — `connectOptimize.ts`)を選び、両方のユニットスコアを返す。
 * 変えてよい範囲は `scope`(ユニットのみ / すべて)。評価は 6 枠固定の依頼と同じ経路なので、画面の値と一致する
 * (`connectOptimize.test.ts`)
 */
export interface ConnectPlanInput {
  request: OptimizeRunRequest;
  team: TeamIds;
  /** 持っているコネクト(形 × ％ × 枚数) */
  items: ConnectItem[];
  /** 変えてよい範囲(ユニットのみ / すべて) */
  scope: ConnectScope;
  /** ホロメン ID → 解放済みのコネクトマス。解放していないコネクトマスには置かない(省略はどこにも置ける) */
  unlockedConnects?: Readonly<Record<string, readonly ConnectAnchor[]>>;
  /** 編成の評価器(組み直しプランの段どうしで共有する)。省略はこの依頼から作る */
  scorer?: TeamScorer;
}

export interface ConnectPlanResult {
  /** いまの配置(`request.connectPlacements`)でのユニットスコア */
  current: number;
  /** 推奨の配置でのユニットスコア */
  recommended: number;
  /** 推奨の配置(ホロメン ID → コネクトマス → 形と ‰)。いまの配置から、ユニットスコアが上がる変更だけを重ねたもの */
  placements: ConnectPlacementMap;
}

export function planConnects(input: ConnectPlanInput): ConnectPlanResult {
  const { request, team, items, scope } = input;
  const scorer = input.scorer ?? createTeamScorer(request, team);
  const score = (placements: ConnectPlacementMap): number =>
    scorer.evaluateMaps(request, placements).modifiers.adjustedUnitScore;

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
    current: request.connectPlacements ?? {},
    scope,
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
    ...(input.unlockedConnects ? { unlockedConnects: input.unlockedConnects } : {}),
    evaluate: score,
  });
  return {
    current: score(request.connectPlacements ?? {}),
    recommended: score(placements),
    placements,
  };
}
