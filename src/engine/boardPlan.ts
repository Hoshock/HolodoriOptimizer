import { cardById, holomen } from "../data";
import {
  BOARD_STATE_COLORS,
  emptyHolomenBoards,
  spentBoardMaterials,
  withoutFrequencyNodes,
} from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import type { BoardConnectMap } from "../storage/boardConnects";
import { emptyBoardResources } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import type { BoardColor, BoardMap } from "../storage/boards";
import type { HolomenRankMap } from "../storage/holomenRank";
import { remainingAfterMaterials, totalAvailableMaterials } from "./boardMaterialBudget";
import { optimizeBoards } from "./boardOptimize";
import type { BoardScope } from "./boardOptimize";
import { teamEvaluator } from "./request";
import type { OptimizeRunRequest, TeamIds } from "./request";

/**
 * ホロメンボードの最適化の依頼と結果(結果詳細・ユニット詳細の下端「ホロメンボードの最適化」。2026-10-04 ユーザー指示)。
 * Web Worker(`optimizeWorker.ts`)と UI スレッドのどちらからも同じ関数を呼ぶ。
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
  /**
   * 「リソース」の登録値(いまのボードを開けた上で余っているキューブ・コアキューブ。色ごと)。再配分できる総量は 投入済み + 余りで、
   * 全ホロメンで共有する(`boardOptimize.ts`)。余りが未登録(null)の項目は制限なし。省略は全項目が未登録
   */
  resources?: BoardResources;
  /** 変えてよい範囲(ユニットのみ / すべて) */
  scope: BoardScope;
  /** 登録している頻度マスを残す(頻度を最適化しないとき)。省略は外す(頻度マスを OFF の世界で評価する) */
  keepFrequency?: boolean;
}

export interface BoardPlanResult {
  /** いまの登録でのユニットスコア(**青の発動頻度マスを外した状態**の値。`keepFrequency` のときは登録そのまま) */
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
  /**
   * 推奨のボードへ組み替えたあとの余りのリソース(色ごと)= 総利用可能量(いまの全ホロメンの投入済み + 登録している余り)−
   * 推奨でのアカウント全体の使用量。ユニットのみでも、変えないホロメンの使用分を含む全体で出す。余りが未登録の項目は未登録のまま。
   * 負にはならない。推奨を反映するときは、登録している余りもこの値へ置き換える(総量を増減させない)
   */
  remainingAfter: BoardResources;
}

const REQUEST_KEYS: Record<BoardColor, "boards" | "greenBoards" | "yellowBoards" | "redBoards"> = {
  red: "redBoards",
  blue: "boards",
  yellow: "yellowBoards",
  green: "greenBoards",
};

type RequestBoardMaps = Record<(typeof REQUEST_KEYS)[BoardColor], BoardMap>;

/**
 * 全ホロメンのボード → 依頼の 4 色のボード(`OptimizeRunRequest` の `boards` / `greenBoards` / `yellowBoards` / `redBoards`)。
 * `withoutFrequency` を立てると青の発動頻度マスを外す(ホロメンボードの最適化は頻度マスを OFF の世界で評価する)
 */
export function requestBoardMaps(
  boards: Readonly<Record<string, HolomenBoards>>,
  withoutFrequency: boolean,
): RequestBoardMaps {
  const maps: RequestBoardMaps = { boards: {}, greenBoards: {}, yellowBoards: {}, redBoards: {} };
  for (const [id, registered] of Object.entries(boards)) {
    const b = withoutFrequency ? withoutFrequencyNodes(registered) : registered;
    for (const color of BOARD_STATE_COLORS) {
      if (b[color].length > 0) maps[REQUEST_KEYS[color]][id] = [...b[color]];
    }
  }
  return maps;
}

/** 編成のホロメン(リーダー → メンバー)を先にして、残りの全ホロメンを後ろに並べる(同点のとき編成が先に取る) */
export function planHolomenOrder(team: TeamIds): {
  leaderHolomenId: string;
  memberHolomenIds: string[];
  holomenIds: string[];
} {
  const holomenOf = (cardId: string): string => cardById.get(cardId)?.holomenId ?? "";
  const leaderHolomenId = holomenOf(team.leaderId);
  const memberHolomenIds = team.memberIds.map(holomenOf);
  const first = [leaderHolomenId, ...memberHolomenIds].filter(
    (id, i, all) => all.indexOf(id) === i,
  );
  return {
    leaderHolomenId,
    memberHolomenIds,
    holomenIds: [...first, ...holomen.map((h) => h.id).filter((id) => !first.includes(id))],
  };
}

/** 登録している全ホロメンのボード(依頼の 4 色 + 解放済みのコネクト) */
export function registeredBoardsOf(
  request: OptimizeRunRequest,
  connects: BoardConnectMap,
  holomenIds: readonly string[],
): Record<string, HolomenBoards> {
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
  return current;
}

export function planBoards(input: BoardPlanInput): BoardPlanResult {
  const { request, team, connects, ranks, scope } = input;
  const { leaderHolomenId, memberHolomenIds, holomenIds } = planHolomenOrder(team);
  const current = registeredBoardsOf(request, connects, holomenIds);
  const placements = request.connectPlacements ?? {};
  // 頻度マスは評価に含めない(ホロメンボードの最適化は頻度マスを OFF の世界で行う。変えないホロメンの頻度マスも同じ)。
  // 頻度マスを残すときは登録の頻度マスごと評価する
  const keepFrequency = input.keepFrequency ?? false;
  const evaluator = (boards: Readonly<Record<string, HolomenBoards>>): number =>
    teamEvaluator({ ...request, ...requestBoardMaps(boards, !keepFrequency) }, team)(placements)
      ?.modifiers.adjustedUnitScore ?? 0;

  const result = optimizeBoards({
    current,
    ranks,
    placements,
    scope,
    ...(input.resources ? { resources: input.resources } : {}),
    leaderHolomenId,
    memberHolomenIds,
    hasSong: request.songId !== null,
    holomenIds,
    evaluate: evaluator,
    keepFrequency,
  });
  const before: Record<string, HolomenBoards> = {};
  for (const id of result.changed) before[id] = current[id] ?? emptyHolomenBoards();
  // 推奨のあとの余り: 総量 = いまの全ホロメンの投入済み + 登録している余り(保存則。総量は変わらない)から、推奨のアカウント全体の使用量を引く
  const total = totalAvailableMaterials(
    spentBoardMaterials(current),
    input.resources ?? emptyBoardResources(),
  );
  const remainingAfter = remainingAfterMaterials(
    total,
    spentBoardMaterials({ ...current, ...result.boards }),
  );
  return {
    current: result.currentScore,
    recommended: result.recommendedScore,
    boards: result.boards,
    changed: result.changed,
    infeasible: result.infeasible,
    before,
    remainingAfter,
  };
}
