import { cardById, cards, holomen } from "../data";
import type { HolomenBoards } from "../data/boardState";
import type { BoardResources } from "../storage/boardResources";
import type { BoardConnectMap } from "../storage/boardConnects";
import { BOARD_STATE_COLORS } from "../data/boardState";
import type { ConnectPlacementMap } from "../storage/connect";
import type { HolomenRankMap } from "../storage/holomenRank";
import { registeredBoardsOf, requestBoardMaps } from "./boardPlan";
import type { ConnectItem } from "./connectOptimize";
import type { DisplayScoreBreakdown } from "./displayScore";
import type { ScoreModifierBreakdown } from "./optimize";
import { planOptimize } from "./optimizePlan";
import type { OptimizePlanResult } from "./optimizePlan";
import type { StaticPowerBreakdown } from "./power";
import { runOptimize, teamEvaluator } from "./request";
import type { OptimizeRunRequest, TeamIds } from "./request";

/**
 * 結果一覧の「最適化順」(2026-10-08 ユーザー指示)。**いまのボードで強い編成**ではなく、**ボードを開け直したら強くなる編成**を拾って、
 * 1 件ずつ「最適化」(`planOptimize`)をかけて並べる。イベントのたびにボードを大きく組み替えるので、いまのボードでの探索の上位だけを
 * 最適化すると、いまは弱いが開け直すと伸びる編成(例: 水着ハコスがリーダー)を取りこぼす。3 段で行う:
 *
 * 1. **見込みのボード**: ホロメンごとに、ランクの Pt の範囲で「最適化」をかけた盤面とコネクトの配置を作る。資材は数えない
 *    (所持リソースは全色考慮しない)。ユニットスコアは 6 枚の編成でしか測れないので、**探索の 1 位の編成**(`reference`)に
 *    そのホロメンを入れ替えた仮の編成で測る。役割で効く色が違うので 3 通り — メンバーとして(M)/ リーダー兼メンバー(LM)/ リーダーだけ(L)
 * 2. **見込みでの探索**: リーダーのホロメンごとに、そのホロメンは L / LM、ほかのホロメンは M の盤面にして探索する(探すと同じ条件。
 *    変えるのはボードとコネクトの配置だけ)。見込みのユニットスコアの高い順に `limit` 件を選び、探索の上位(`includeTeams`)も足す
 *    (いまのボードで強い編成を落とさない)
 * 3. **最適化**: 選んだ編成それぞれに、最適化のシートの既定と同じ計算(登録している状態から ボード → コネクト → 頻度。ユニットスコア重視・
 *    ユニットのみ・所持リソースは全色考慮)をかける
 *
 * 見込みは編成どうしの絡み・共有の資材・コネクトの枚数を無視した近似で、**候補を選ぶのにだけ使う**(画面の値は 3 の値)。
 * 最大の保証はない(2026-10-08 の計測: このアカウントで、最適化後の上位 12 件は見込みの上位 100 件にすべて入った — `pending.md` 8)
 */

export interface TrueRankingInput {
  /** 探索の依頼(条件 — 固定・除外・選択・曲・開花 — と、登録している盤面・コネクトの配置) */
  request: OptimizeRunRequest;
  /** 探索の 1 位の編成(見込みを測る仮の編成の土台) */
  reference: TeamIds;
  /** ホロメン ID → 解放済みのコネクトマス */
  connects: BoardConnectMap;
  ranks: HolomenRankMap;
  resources: BoardResources;
  items: ConnectItem[];
  /** コネクトも最適化するか(最適化のシートで実行できる状態のときだけ) */
  connect: boolean;
  horizonSeconds: number;
  /** 見込みで選んで最適化にかける件数 */
  limit: number;
  /** 見込みに関係なく最適化にかける編成(探索の上位。いまのボードで強い編成を落とさない) */
  includeTeams: TeamIds[];
  /** 見込みでの探索で、リーダーのホロメン × 役割ごとに受け取る件数 */
  perLeader: number;
}

export type TrueRankingPhase = "proxy" | "search" | "optimize";

export interface TrueRankingProgress {
  phase: TrueRankingPhase;
  /** その段の済んだ数 / 全体の数 */
  done: number;
  total: number;
}

/** 登録している状態での候補(結果一覧・結果詳細の形) */
export interface RankingCandidate {
  leaderId: string;
  memberIds: string[];
  breakdown: StaticPowerBreakdown;
  display: DisplayScoreBreakdown;
  modifiers: ScoreModifierBreakdown;
}

export interface TrueRankingItem {
  candidate: RankingCandidate;
  result: OptimizePlanResult;
}

export type Role = "M" | "LM" | "L";

export interface Proxy {
  boards: HolomenBoards;
  placement: ConnectPlacementMap[string] | undefined;
}

/** 見込みのボード: 役割 → ホロメン ID → 盤面と配置 */
export type ProxyBoards = Record<Role, Record<string, Proxy>>;

const holomenOf = (cardId: string): string => cardById.get(cardId)?.holomenId ?? "";
const keyOf = (leaderId: string, memberIds: readonly string[]): string =>
  `${leaderId}:${[...memberIds].sort().join(",")}`;

/** 探すの条件でリーダー・メンバーに使えるカード */
export function rankingPool(request: OptimizeRunRequest): {
  leaders: string[];
  members: string[];
} {
  const excluded = new Set(request.excludedCardIds);
  const available = cards.map((c) => c.id).filter((id) => !excluded.has(id));
  let leaders: string[];
  if (request.leaderId !== null) leaders = [request.leaderId];
  else {
    const out = new Set(request.excludedLeaderCardIds);
    const only = request.leaderCandidateIds ? new Set(request.leaderCandidateIds) : null;
    leaders = available.filter((id) => !out.has(id) && (only === null || only.has(id)));
  }
  const outMember = new Set(request.excludedMemberCardIds);
  const members = [
    ...new Set([...request.fixedMemberIds, ...available.filter((id) => !outMember.has(id))]),
  ];
  return { leaders, members };
}

/**
 * 各段の仕事の数(進み具合と残り時間の見積もりに使う)。見込みのボードは ホロメン × 役割、見込みでの探索は リーダーのホロメン × 役割、
 * 最適化は `limit` 件(候補が少なければそれ以下)
 */
export function rankingWorkload(input: TrueRankingInput): Record<TrueRankingPhase, number> {
  const jobs = proxyJobs(input);
  const pool = rankingPool(input.request);
  const leaderHolomen = new Set(pool.leaders.map(holomenOf));
  return {
    proxy: jobs.length,
    search: jobs.filter((j) => j.role !== "M" && leaderHolomen.has(j.h)).length,
    optimize: input.limit + input.includeTeams.length,
  };
}

/** 見込みのボードの仕事(ホロメン × 役割と、測る仮の編成) */
function proxyJobs(input: TrueRankingInput): { h: string; role: Role; team: TeamIds }[] {
  const { request, reference } = input;
  const pool = rankingPool(request);
  const bloomOf = (id: string): number => request.blooms[id] ?? 0;
  /** メンバーとして測るカード(開花のいちばん高いもの) */
  const memberCard = new Map<string, string>();
  for (const id of pool.members) {
    const h = holomenOf(id);
    const best = memberCard.get(h);
    if (best === undefined || bloomOf(id) > bloomOf(best)) memberCard.set(h, id);
  }
  const leaderCard = new Map<string, string>();
  for (const id of pool.leaders)
    if (!leaderCard.has(holomenOf(id))) leaderCard.set(holomenOf(id), id);

  /** 仮の編成のメンバーに、そのホロメンのカードを入れる(同じホロメンがいればその枠、いなければ最後の枠) */
  const withMember = (h: string, card: string): string[] => {
    const out = [...reference.memberIds];
    const at = out.findIndex((m) => holomenOf(m) === h);
    out[at >= 0 ? at : out.length - 1] = card;
    return out;
  };
  /** 穴埋めのカード: `avoid` のホロメンを含まないもの(メンバーは同じホロメンを 2 人入れられない) */
  const other = (avoid: ReadonlySet<string>): string =>
    [reference.leaderId, ...reference.memberIds, ...pool.members].find(
      (id) => !avoid.has(holomenOf(id)),
    ) ?? reference.leaderId;
  const ids = [...new Set([...memberCard.keys(), ...leaderCard.keys()])];
  const out: { h: string; role: Role; team: TeamIds }[] = [];
  for (const h of ids) {
    const m = memberCard.get(h);
    const l = leaderCard.get(h);
    if (m !== undefined) {
      const leaderId =
        holomenOf(reference.leaderId) === h ? other(new Set([h])) : reference.leaderId;
      out.push({ h, role: "M", team: { leaderId, memberIds: withMember(h, m) } });
    }
    if (l !== undefined) {
      if (m !== undefined)
        out.push({ h, role: "LM", team: { leaderId: l, memberIds: withMember(h, m) } });
      out.push({
        h,
        role: "L",
        team: {
          leaderId: l,
          memberIds: reference.memberIds.map((id) =>
            holomenOf(id) === h ? other(new Set([h, ...reference.memberIds.map(holomenOf)])) : id,
          ),
        },
      });
    }
  }
  return out;
}

/** 見込みのボード(段 1) */
export function proxyBoards(
  input: TrueRankingInput,
  onStep?: (done: number, total: number) => void,
): ProxyBoards {
  const { request } = input;
  const jobs = proxyJobs(input);
  const registered = registeredBoardsOf(
    request,
    input.connects,
    holomen.map((h) => h.id),
  );
  const out: ProxyBoards = { M: {}, LM: {}, L: {} };
  onStep?.(0, jobs.length);
  for (const [i, job] of jobs.entries()) {
    const result = planOptimize({
      request: {
        ...request,
        leaderId: job.team.leaderId,
        fixedMemberIds: [...job.team.memberIds],
        excludedCardIds: [],
        excludedLeaderCardIds: [],
        excludedMemberCardIds: [],
        leaderCandidateIds: null,
        requiredMemberHolomenIds: [],
        topN: 1,
      },
      team: job.team,
      connects: input.connects,
      ranks: input.ranks,
      resources: input.resources,
      items: input.items,
      scope: "unit",
      board: true,
      connect: input.connect,
      frequency: true,
      objective: "unit",
      fixedFrequencyNodes: {},
      horizonSeconds: input.horizonSeconds,
      relaxedMaterialColors: [...BOARD_STATE_COLORS],
    });
    out[job.role][job.h] = {
      boards: result.boards[job.h] ?? registered[job.h] ?? emptyBoards(),
      placement: result.placements[job.h],
    };
    onStep?.(i + 1, jobs.length);
  }
  return out;
}

const emptyBoards = (): HolomenBoards => ({
  red: [],
  blue: [],
  yellow: [],
  green: [],
  connects: [],
});

/** 見込みでの探索(段 2)。見込みのユニットスコアの高い順に `limit` 件と、その後ろに `includeTeams`(重複は除く) */
export function proxySearch(
  input: TrueRankingInput,
  proxy: ProxyBoards,
  onStep?: (done: number, total: number) => void,
): TeamIds[] {
  const { request } = input;
  const pool = rankingPool(request);
  const registered = registeredBoardsOf(
    request,
    input.connects,
    holomen.map((h) => h.id),
  );
  const leaderHolomen = [...new Set(pool.leaders.map(holomenOf))];
  const jobs = leaderHolomen.flatMap((h) =>
    (["LM", "L"] as const)
      .filter((role) => proxy[role][h] !== undefined)
      .map((role) => ({ h, role })),
  );
  const best = new Map<string, { team: TeamIds; score: number }>();
  onStep?.(0, jobs.length);
  for (const [i, job] of jobs.entries()) {
    const boards: Record<string, HolomenBoards> = { ...registered };
    const placements: ConnectPlacementMap = { ...request.connectPlacements };
    const use = (h: string, p: Proxy): void => {
      boards[h] = p.boards;
      if (p.placement) placements[h] = p.placement;
      else delete placements[h];
    };
    for (const [h, p] of Object.entries(proxy.M)) if (h !== job.h) use(h, p);
    const own = proxy[job.role][job.h];
    if (own) use(job.h, own);
    const result = runOptimize({
      ...request,
      ...requestBoardMaps(boards, false),
      connectPlacements: placements,
      leaderCandidateIds:
        request.leaderId !== null ? null : pool.leaders.filter((id) => holomenOf(id) === job.h),
      topN: input.perLeader,
    });
    for (const c of result.candidates) {
      const team = { leaderId: c.leader.id, memberIds: c.members.map((m) => m.id) };
      const key = keyOf(team.leaderId, team.memberIds);
      const score = c.modifiers.adjustedUnitScore;
      if ((best.get(key)?.score ?? -1) < score) best.set(key, { team, score });
    }
    onStep?.(i + 1, jobs.length);
  }
  const picked = [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit)
    .map((e) => e.team);
  const keys = new Set(picked.map((t) => keyOf(t.leaderId, t.memberIds)));
  for (const team of input.includeTeams) {
    const key = keyOf(team.leaderId, team.memberIds);
    if (keys.has(key)) continue;
    keys.add(key);
    picked.push({ leaderId: team.leaderId, memberIds: [...team.memberIds] });
  }
  return picked;
}

/** 1 編成を最適化する(段 3)。登録している状態の候補も返す */
export function optimizeRankingTeam(input: TrueRankingInput, team: TeamIds): TrueRankingItem {
  const request: OptimizeRunRequest = {
    ...input.request,
    leaderId: team.leaderId,
    fixedMemberIds: [...team.memberIds],
    excludedCardIds: [],
    excludedLeaderCardIds: [],
    excludedMemberCardIds: [],
    leaderCandidateIds: null,
    requiredMemberHolomenIds: [],
    topN: 1,
  };
  const registered = teamEvaluator(request, team)(request.connectPlacements ?? {});
  if (!registered) throw new Error(`編成を評価できない: ${team.leaderId}`);
  const result = planOptimize({
    request,
    team,
    connects: input.connects,
    ranks: input.ranks,
    resources: input.resources,
    items: input.items,
    scope: "unit",
    board: true,
    connect: input.connect,
    frequency: true,
    objective: "unit",
    fixedFrequencyNodes: {},
    horizonSeconds: input.horizonSeconds,
    relaxedMaterialColors: [],
  });
  return {
    candidate: {
      leaderId: registered.leader.id,
      memberIds: registered.members.map((m) => m.id),
      breakdown: registered.breakdown,
      display: registered.display,
      modifiers: registered.modifiers,
    },
    result,
  };
}
