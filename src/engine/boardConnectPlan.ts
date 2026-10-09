import { emptyHolomenBoards, sameHolomenBoards } from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import type { ConnectAnchor } from "../data/connect";
import type { BoardConnectMap } from "../storage/boardConnects";
import { emptyBoardResources } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import type { ConnectPlacementMap } from "../storage/connect";
import type { BoardColor } from "../storage/boards";
import type { HolomenRankMap } from "../storage/holomenRank";
import { normalized } from "./boardOptimize";
import type { BoardScope } from "./boardOptimize";
import { planBoards, planHolomenOrder, registeredBoardsOf, requestBoardMaps } from "./boardPlan";
import type { BoardPlanResult } from "./boardPlan";
import { planConnects } from "./connectPlan";
import type { ConnectItem } from "./connectOptimize";
import { createTeamScorer } from "./request";
import type { OptimizeRunRequest, TeamIds, TeamScorer } from "./request";

/**
 * 「最適化」のボードとコネクトの段(2026-10-07 ユーザー指示。結果詳細・ユニット詳細の下端)。**ホロメンボード**と**コネクト**を 1 つの操作で、
 * 選んだものだけ最適化する(頻度はこのあとの段 — `optimizePlan.ts` / `frequencyStage.ts`。ここでは頻度マスを OFF にした世界で行う。
 * 頻度を最適化しないとき(`keepFrequency`)は、登録している頻度マスを残した世界で行う — 2026-10-08 ユーザー指示)。
 *
 * - ボード(`planBoards`): ホロメンごとのボードPt・共有の資材の範囲で解放マスを選ぶ。**青の発動頻度マスはすべて OFF にして行う**
 *   (頻度はこのあとの段が選び直す。`keepFrequency` のときは登録の頻度マスを残す。`boardOptimize.ts`)
 * - コネクト(`planConnects`): 持っているコネクトの範囲で、解放済みのコネクトマスの配置を変える。範囲はボードと同じ `scope`(最小限 = ユニットのみ)
 *   (ユニットのみ / 全ホロメン。2026-10-08 ユーザー指示で、統合のときにユニットのみへ固定していたのを戻した)。
 *   評価は頻度マスを OFF にした世界で行う(コネクトだけを選んだときも同じ。ボードは変えないので、登録している頻度マスは外さない)
 * - 両方を選んだときは **ボード → コネクト** の順で回し、スコアが上がらなくなるまで繰り返す(最大 `MAX_ROUNDS` 周。
 *   1 周目はボード → コネクトがコネクト → ボードより高く、2 周目で +0.9〜1.8% 伸びる計測がある — `docs/ai/tmp/pending.md`)。
 *   各段は土台を下回らない(ボードは土台のまま返す・コネクトは厳密に上がる変更だけ)ので、結果も土台(頻度マスを外した登録)を下回らない。
 *   **例外は、登録がホロメンランクの予算を超えているとき**(ランクを下げたあとなど): 予算内へ直すのでスコアが下がることがある(1 周目はスコアで止めない)。
 *   段の間で、ボードは最適化後の盤面とその余りのリソース、コネクトは最適化後の配置を次の段の出発点にする
 *
 * 「現在」のスコアは、頻度マスを外した登録の値(結果一覧の値より頻度マスのぶん低いことがある)。`keepFrequency` のときは登録そのまま
 */
export interface BoardConnectPlanInput {
  /** 登録している状態(ボード 4 色・開花・アカウント補正・曲・コネクトの配置) */
  request: OptimizeRunRequest;
  team: TeamIds;
  /** ホロメン ID → 解放済みのコネクトマス(赤 / 青 / 黄) */
  connects: BoardConnectMap;
  /** ホロメン ID → ホロメンランク(登録済みのホロメンだけ) */
  ranks: HolomenRankMap;
  /** 「リソース」の登録値(ボードの最適化が使う余り。未登録の項目は制限なし) */
  resources?: BoardResources;
  /** 変えてよい範囲(ボードとコネクトの両方にかかる。unit = リーダーとメンバーのホロメンだけ / all = 全ホロメン) */
  scope: BoardScope;
  /** ホロメンボードを最適化するか / コネクトを最適化するか(少なくとも 1 つ) */
  board: boolean;
  connect: boolean;
  /** 持っているコネクト(コネクトを最適化するときに使う) */
  items: ConnectItem[];
  /** 登録している頻度マスを残す(頻度を最適化しないとき)。省略は頻度マスを OFF にした世界 */
  keepFrequency?: boolean;
  /** 資材を考慮しない色(ボードの段。`planBoards`) */
  relaxedMaterialColors?: readonly BoardColor[];
  /** 編成の評価器(段どうしで共有すると、同じ盤面を測り直さない)。省略はこの依頼から作る */
  scorer?: TeamScorer;
}

export interface BoardConnectPlanResult extends BoardPlanResult {
  /** 推奨のコネクトの配置(全ホロメン。コネクトを選ばなかったときは登録のまま) */
  placements: ConnectPlacementMap;
  /** 回した周数 */
  rounds: number;
}

export const MAX_ROUNDS = 3;

export function planBoardConnect(input: BoardConnectPlanInput): BoardConnectPlanResult {
  const { request, team, ranks, scope, board, connect, items } = input;
  const keepFrequency = input.keepFrequency ?? false;
  const { holomenIds } = planHolomenOrder(team);
  const original = registeredBoardsOf(request, input.connects, holomenIds);
  const originalPlacements: ConnectPlacementMap = request.connectPlacements ?? {};

  let boards: Record<string, HolomenBoards> = original;
  let placements = originalPlacements;
  let remaining: BoardResources = input.resources ?? emptyBoardResources();
  const infeasible = new Set<string>();

  /** いまの状態の依頼。頻度マスを外す(評価を頻度 OFF の世界にする)かは段による */
  const stateRequest = (withoutFrequency: boolean): OptimizeRunRequest => ({
    ...request,
    ...requestBoardMaps(boards, withoutFrequency),
    connectPlacements: placements,
  });
  const unlockedConnectsOf = (): Record<string, readonly ConnectAnchor[]> =>
    Object.fromEntries(holomenIds.map((id) => [id, boards[id]?.connects ?? []]));
  const scorer = input.scorer ?? createTeamScorer(request, team);
  const scoreOf = (): number =>
    scorer.evaluate(boards, placements, !keepFrequency).modifiers.adjustedUnitScore;

  const baseline = scoreOf();
  let score = baseline;
  let rounds = 0;
  // 片方だけのときは 1 周(繰り返しても同じ結果になる)
  const maxRounds = board && connect ? MAX_ROUNDS : 1;
  while (rounds < maxRounds) {
    rounds += 1;
    const before = score;
    let moved = false; // この周で盤面か配置が変わったか(変わらなければ、繰り返しても同じ結果になる)
    if (board) {
      const plan = planBoards({
        request: stateRequest(false),
        team,
        connects: Object.fromEntries(
          holomenIds.map((id) => [id, [...(boards[id]?.connects ?? [])]]),
        ),
        ranks,
        resources: remaining,
        scope,
        keepFrequency,
        scorer,
        ...(input.relaxedMaterialColors
          ? { relaxedMaterialColors: input.relaxedMaterialColors }
          : {}),
      });
      boards = { ...boards, ...plan.boards };
      remaining = plan.remainingAfter;
      for (const id of plan.infeasible) infeasible.add(id);
      score = plan.recommended;
      if (plan.changed.length > 0) moved = true;
    }
    if (connect) {
      const plan = planConnects({
        request: stateRequest(!keepFrequency),
        team,
        items,
        // コネクトの範囲: 最小限 = リーダーとメンバーのホロメンだけ(枚数が足りないときだけユニット外から回す) / 全整理 = 全ホロメン
        scope: scope === "all" ? "all" : "unit",
        unlockedConnects: unlockedConnectsOf(),
        scorer,
      });
      if (plan.recommended > score) {
        placements = plan.placements;
        score = plan.recommended;
        moved = true;
      }
    }
    if (!moved) break;
    // 1 周目は、登録が予算を超えている(土台に届かない)ときにボードの結果が土台より低いことがあるので、スコアでは止めない。
    // 2 周目からは、前の周より上がらなくなったら止める(各段は土台を下回らないので、ここからは単調に増える)
    if (rounds >= 2 && score <= before) break;
  }

  const changed = holomenIds.filter(
    (id) =>
      !sameHolomenBoards(
        normalized(boards[id] ?? emptyHolomenBoards()),
        normalized(original[id] ?? emptyHolomenBoards()),
      ),
  );
  const result: Record<string, HolomenBoards> = {};
  const before: Record<string, HolomenBoards> = {};
  for (const id of changed) {
    result[id] = boards[id] ?? emptyHolomenBoards();
    before[id] = original[id] ?? emptyHolomenBoards();
  }
  return {
    current: baseline,
    recommended: score,
    boards: result,
    changed,
    infeasible: holomenIds.filter((id) => infeasible.has(id)),
    before,
    remainingAfter: remaining,
    placements,
    rounds,
  };
}
