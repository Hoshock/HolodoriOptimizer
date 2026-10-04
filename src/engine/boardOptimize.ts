import { BLUE_BOARD_NODE_IDS } from "../data/blueBoard";
import {
  BOARD_STATE_COLORS,
  boardGraphOf,
  BOARD_COLOR_ANCHOR,
  emptyHolomenBoards,
  sameHolomenBoards,
  unlockSetOf,
  UNLOCKABLE_ANCHORS,
} from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import { boardPointsForRank } from "../data/boardPoints";
import { GREEN_BOARD_NODE_IDS } from "../data/greenBoard";
import { RED_BOARD_NODE_IDS } from "../data/redBoard";
import { YELLOW_BOARD_NODE_IDS } from "../data/yellowBoard";
import type { BoardColor } from "../storage/boards";
import type { ConnectPlacementMap } from "../storage/connect";
import { NO_SCORE_EFFECT } from "./connectOptimize";

/**
 * ホロメンボードの最適化(2026-10-04 ユーザー指示。結果詳細・ユニット詳細の下端の「ホロメンボードの最適化」)。
 *
 * **固定した編成**に対して、ホロメンごとのボードPt の予算(ホロメンランク。src/data/boardPoints.ts)の範囲で、**表示ユニットスコア**
 * (`teamEvaluator` が返す調整後ユニットスコア。コネクトの最適化と同じ評価経路)が高くなる解放マスを選ぶ。
 * ライブスコアの式は未確定なので目的関数にしない(勝手に理論ライブスコアを最大化しない)。
 *
 * 守る制約(どの結果でも破らない — テストで固定):
 * - ランク登録済みのホロメンは、通常マスのPt + 解放した非中心コネクトのPt ≤ そのランクの累積ボードPt。未登録は制限なし
 * - 解放済みのマスはすべて中心から解放済みのセルだけで到達できる(コネクトの先を取るならコネクトも解放済み。コネクトの 1 Pt も予算に含む)
 * - **コネクトの配置は変えない**(それはコネクトの最適化の責務): いま配置のある非中心コネクトは、ボードの最適化中は
 *   必ず解放済み(必須。1 Pt を予算に含む)。ランクが低くて必須の状態すら作れないホロメンは、**無理に不正な結果を作らず変更しない**
 *   (`infeasible` に載せる。「このランクでは現在のコネクト配置を維持できない」)
 *
 * 変えてよい範囲(`scope`): `unit` = リーダーとメンバーのホロメンだけ / `all` = 全ホロメン(緑ボードはアカウント全体に効き、黄も曲を
 * 指定すれば全体に効くので、ユニット外のボードもスコアに効く)。変えないホロメンは登録している状態のまま評価する。
 *
 * 選び方(**近似**。最大を保証しない): 150 通常マスの組合せを全部は試さない(指数爆発)。1 マスずつの増分では、効果のない途中のマスの
 * 先にある効果のあるマスへ辿り着けないので、候補は「ターゲットのマスを新たに取るのに必要な未解放の経路一式(途中のコネクトも)」
 * = **解放プラン**で、その追加ボードPt(Pt 最小の経路 — `BoardGraph.planUnlock`)とスコアの増分で評価する。
 * 遅延評価の貪欲法: 増分 ÷ 追加Pt(または増分)の大きい順に取り出し、取る直前に測り直し、まだ先頭なら取る(残りの予算に収まるものだけ)。
 * 出発点は 2 通り — 必須のマスだけの状態(ゼロから)と、登録している状態(予算内で整合しているホロメンだけ)。ゼロからは「増分 ÷ Pt」と
 * 「増分」の 2 通りの順で試し、いちばんスコアの高いものを選ぶ(同点なら登録している状態に近いほう)。
 * 厳密な最適(ナップサック)でも、いま登録している状態より必ず良いことの保証でもないので、全ホロメンが整合している状態から出発して
 * 結果がそれを下回るときは、登録している状態をそのまま返す。
 * 試さない候補: スコアに効かない効果のマス(報酬・ライフ・ホロメンスキル・ホロワーク報酬)がターゲットのもの、効かない色(青はメンバーのホロメン
 * だけ、赤はリーダーのホロメンだけ、黄は曲を指定したときだけ。緑は常に)。途中の経路にそれらが入るのは構わない。
 */

export type BoardScope = "unit" | "all";

export interface BoardOptimizeInput {
  /** 登録している状態(ホロメン ID → ボード)。載っていないホロメンは空として扱う */
  current: Readonly<Record<string, HolomenBoards>>;
  /** ホロメンランク(登録済みのホロメンだけ。載っていないホロメンは制限なし) */
  ranks: Readonly<Record<string, number>>;
  /** コネクトの配置(変えない)。非中心のアンカーに配置のあるホロメンは、そのコネクトが必須 */
  placements: ConnectPlacementMap;
  scope: BoardScope;
  leaderHolomenId: string;
  memberHolomenIds: readonly string[];
  /** 曲を指定しているか(黄の楽曲スコアボーナスは曲があるときだけ効く) */
  hasSong: boolean;
  /** 候補にするホロメン(全ホロメン。編成のホロメンを先にすると同点のとき編成が先に取る) */
  holomenIds: readonly string[];
  /** 全ホロメンのボードを渡して、その編成の調整後ユニットスコアを返す(呼び出し側が実際の探索と同じ評価経路で計算する) */
  evaluate: (boards: Readonly<Record<string, HolomenBoards>>) => number;
}

export interface BoardOptimizeResult {
  /** 推奨のボード(変更のあるホロメンだけ) */
  boards: Record<string, HolomenBoards>;
  /** 変更のあるホロメン ID(`holomenIds` の順) */
  changed: string[];
  /** 必須のコネクトがランクの予算に収まらず、変更できなかったホロメン ID */
  infeasible: string[];
  /** 登録している状態のスコア / 推奨のスコア */
  currentScore: number;
  recommendedScore: number;
}

const NODE_IDS: Readonly<Record<BoardColor, readonly string[]>> = {
  red: RED_BOARD_NODE_IDS,
  blue: BLUE_BOARD_NODE_IDS,
  yellow: YELLOW_BOARD_NODE_IDS,
  green: GREEN_BOARD_NODE_IDS,
};

/** ホロメンごとの作業用の状態: 色 → 解放の集合(通常マス + 解放済みのコネクトの ID) */
type Sets = Record<BoardColor, Set<string>>;

const setsOf = (b: HolomenBoards): Sets => ({
  red: unlockSetOf("red", b.red, b.connects),
  blue: unlockSetOf("blue", b.blue, b.connects),
  yellow: unlockSetOf("yellow", b.yellow, b.connects),
  green: unlockSetOf("green", b.green, b.connects),
});

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** 作業用の集合 → ボード(通常マス・コネクトとも ID 順で固定) */
function boardsOf(sets: Sets): HolomenBoards {
  const nodes = (color: BoardColor): string[] =>
    boardGraphOf(color)
      .knownNodeIds([...sets[color]])
      .sort(byId);
  const connects = UNLOCKABLE_ANCHORS.filter((anchor) => {
    const color = (Object.keys(BOARD_COLOR_ANCHOR) as BoardColor[]).find(
      (c) => BOARD_COLOR_ANCHOR[c] === anchor,
    );
    const connectorId = color === undefined ? null : boardGraphOf(color).connectorId;
    return color !== undefined && connectorId !== null && sets[color].has(connectorId);
  });
  return {
    red: nodes("red"),
    blue: nodes("blue"),
    yellow: nodes("yellow"),
    green: nodes("green"),
    connects,
  };
}

/** 使用しているボードPt(作業用の集合から) */
function pointsOf(sets: Sets): number {
  return BOARD_STATE_COLORS.reduce(
    (sum, color) => sum + boardGraphOf(color).unlockedPoints(sets[color]),
    0,
  );
}

/** ランクからの予算(未登録は無限大) */
const budgetOf = (ranks: Readonly<Record<string, number>>, holomenId: string): number => {
  const rank = ranks[holomenId];
  return rank === undefined ? Number.POSITIVE_INFINITY : boardPointsForRank(rank);
};

/**
 * 必須のコネクトを解放済みにした出発点(ゼロから)。配置のある非中心のコネクトごとに、中心からそこまでのPt 最小の経路を足す
 * (経路の通常マスもすべて予算に含む)
 */
function mandatorySets(placed: ReadonlySet<string>): Sets {
  const sets: Sets = { red: new Set(), blue: new Set(), yellow: new Set(), green: new Set() };
  for (const color of BOARD_STATE_COLORS) {
    const anchor = BOARD_COLOR_ANCHOR[color];
    const graph = boardGraphOf(color);
    if (anchor === undefined || graph.connectorId === null || !placed.has(anchor)) continue;
    const plan = graph.planUnlock(sets[color], graph.connectorId);
    if (plan) for (const id of plan.cells) sets[color].add(id);
  }
  return sets;
}

/** 解放済みのセルがすべて中心から解放済みのセルだけで到達できるか(コネクトの先のマスはコネクトも解放済み) */
function isConnected(sets: Sets): boolean {
  return BOARD_STATE_COLORS.every(
    (color) => boardGraphOf(color).reachableNodes(sets[color]).size === sets[color].size,
  );
}

/** 結果の検査(制約を破る結果は返さない): 予算内・全マスが中心から到達可能・必須のコネクトが解放済み */
export function violatesBoardRules(
  boards: HolomenBoards,
  budget: number,
  placedAnchors: ReadonlySet<string>,
): string | null {
  const sets = setsOf(boards);
  if (!isConnected(sets)) return "中心から届かないマスがある";
  if (pointsOf(sets) > budget) return "ボードPt が予算を超えている";
  for (const anchor of UNLOCKABLE_ANCHORS)
    if (placedAnchors.has(anchor) && !boards.connects.includes(anchor))
      return "配置のあるコネクトが解放済みでない";
  return null;
}

type Order = "ratio" | "gain";

interface Candidate {
  holomenId: string;
  color: BoardColor;
  id: string;
  /** 測った時点の増分・追加Pt */
  gain: number;
  cost: number;
  /** 測った時点の「確定した変更の数」。いまと違えば測り直す */
  version: number;
}

export function optimizeBoards(input: BoardOptimizeInput): BoardOptimizeResult {
  const { ranks, placements, scope, leaderHolomenId, hasSong, holomenIds, evaluate } = input;
  const members = new Set(input.memberHolomenIds);
  const unit = new Set([leaderHolomenId, ...input.memberHolomenIds]);
  const order = new Map(holomenIds.map((id, i) => [id, i]));
  const currentOf = (id: string): HolomenBoards => input.current[id] ?? emptyHolomenBoards();
  const placedOf = (id: string): Set<string> =>
    new Set(
      Object.entries(placements[id] ?? {})
        .filter(([anchor]) => anchor !== "center")
        .map(([anchor]) => anchor),
    );

  // 変えてよいホロメンのうち、必須のコネクトがランクの予算に収まるものだけを候補にする(収まらないものは変更しない)
  const infeasible: string[] = [];
  const allowed: string[] = [];
  const scratch = new Map<string, Sets>();
  for (const id of holomenIds) {
    if (scope === "unit" && !unit.has(id)) continue;
    const start = mandatorySets(placedOf(id));
    if (pointsOf(start) > budgetOf(ranks, id)) {
      infeasible.push(id);
      continue;
    }
    allowed.push(id);
    scratch.set(id, start);
  }
  /** 登録している状態から出発してよいホロメン: 中心から整合していて、予算内で、必須のコネクトを含む */
  const eligible = new Set(
    allowed.filter(
      (id) => violatesBoardRules(currentOf(id), budgetOf(ranks, id), placedOf(id)) === null,
    ),
  );
  const finiteBudget = allowed.some((id) => Number.isFinite(budgetOf(ranks, id)));

  const initial: Record<string, HolomenBoards> = {};
  for (const id of holomenIds) initial[id] = currentOf(id);
  const currentScore = evaluate(initial);

  interface Run {
    sets: Map<string, Sets>;
    score: number;
  }
  function run(fromCurrent: boolean, ordering: Order): Run {
    const sets = new Map<string, Sets>();
    const cache: Record<string, HolomenBoards> = {};
    for (const id of holomenIds) {
      const start =
        scratch.has(id) && !(fromCurrent && eligible.has(id))
          ? cloneSets(scratch.get(id) ?? setsOf(currentOf(id)))
          : setsOf(currentOf(id));
      sets.set(id, start);
      cache[id] = boardsOf(start);
    }
    const spent = new Map<string, number>(
      holomenIds.map((id) => [id, pointsOf(sets.get(id) ?? setsOf(emptyHolomenBoards()))]),
    );
    let score = evaluate(cache);
    let version = 0;

    const relevant = (id: string, color: BoardColor): boolean => {
      if (color === "red") return id === leaderHolomenId;
      if (color === "blue") return members.has(id);
      if (color === "yellow") return hasSong;
      return true;
    };
    const remaining = (id: string): number => budgetOf(ranks, id) - (spent.get(id) ?? 0);

    /** そのターゲットを取る解放プランを、確定せずに測る。取れない・効かない・予算に収まらないときは null */
    function measure(c: Candidate): { gain: number; cost: number } | null {
      const s = sets.get(c.holomenId);
      if (!s) return null;
      const graph = boardGraphOf(c.color);
      const plan = graph.planUnlock(s[c.color], c.id);
      if (!plan || plan.cells.length === 0 || plan.points > remaining(c.holomenId)) return null;
      for (const cell of plan.cells) s[c.color].add(cell);
      cache[c.holomenId] = boardsOf(s);
      const value = evaluate(cache);
      for (const cell of plan.cells) s[c.color].delete(cell);
      cache[c.holomenId] = boardsOf(s);
      return value - score > 0 ? { gain: value - score, cost: plan.points } : null;
    }
    function commit(c: Candidate): void {
      const s = sets.get(c.holomenId);
      if (!s) return;
      const plan = boardGraphOf(c.color).planUnlock(s[c.color], c.id);
      if (!plan) return;
      for (const cell of plan.cells) s[c.color].add(cell);
      spent.set(c.holomenId, (spent.get(c.holomenId) ?? 0) + plan.points);
      cache[c.holomenId] = boardsOf(s);
      score = evaluate(cache);
    }
    const priority = (c: Candidate): number => (ordering === "ratio" ? c.gain / c.cost : c.gain);
    const compare = (a: Candidate, b: Candidate): number =>
      priority(b) - priority(a) ||
      b.gain - a.gain ||
      (order.get(a.holomenId) ?? 0) - (order.get(b.holomenId) ?? 0) ||
      byId(a.color, b.color) ||
      byId(a.id, b.id);

    for (let pass = 0; pass < 64; pass += 1) {
      let queue: Candidate[] = [];
      for (const holomenId of allowed) {
        for (const color of BOARD_STATE_COLORS) {
          if (!relevant(holomenId, color)) continue;
          for (const id of NODE_IDS[color]) {
            if (NO_SCORE_EFFECT.has(`${color}/${id}`)) continue;
            if (sets.get(holomenId)?.[color].has(id)) continue;
            const candidate: Candidate = { holomenId, color, id, gain: 0, cost: 1, version };
            const m = measure(candidate);
            if (m) queue.push({ ...candidate, ...m });
          }
        }
      }
      queue.sort(compare);
      let accepted = false;
      while (queue.length > 0) {
        const top = queue[0];
        if (!top) break;
        if (sets.get(top.holomenId)?.[top.color].has(top.id)) {
          queue = queue.slice(1);
          continue;
        }
        if (top.version !== version) {
          const m = measure(top);
          if (!m) {
            queue = queue.slice(1);
            continue;
          }
          top.gain = m.gain;
          top.cost = m.cost;
          top.version = version;
          queue.sort(compare);
          continue;
        }
        commit(top);
        version += 1;
        accepted = true;
        queue = queue.slice(1);
      }
      if (!accepted) break;
    }
    return { sets, score };
  }

  const runs: Run[] = [];
  const orderings: Order[] = finiteBudget ? ["ratio", "gain"] : ["ratio"];
  if (eligible.size > 0) for (const o of orderings) runs.push(run(true, o));
  for (const o of orderings) runs.push(run(false, o));
  let best = runs[0];
  for (const r of runs) if (best === undefined || r.score > best.score) best = r;

  const boards: Record<string, HolomenBoards> = {};
  const changed: string[] = [];
  const allEligible = allowed.length === eligible.size;
  // 変えてよいホロメン全員が整合した状態から出発でき、結果が登録している状態を下回る(貪欲法の取りこぼし)ときは変更しない
  const keepCurrent = best === undefined || (allEligible && best.score < currentScore);
  if (!keepCurrent && best) {
    for (const id of allowed) {
      // 変更量を最小にする: 整合した登録から出発できるホロメンは、スコアに効かず選ばれなかった登録済みのマスを、予算が許す限り戻す
      // (マスを足してもスコアは下がらない。ゼロから選び直した結果で、効かない登録済みのマスが理由なく消えるのを避ける)
      const resultSets = best.sets.get(id);
      if (resultSets && eligible.has(id))
        restoreCurrent(resultSets, setsOf(currentOf(id)), budgetOf(ranks, id));
      const next = boardsOf(best.sets.get(id) ?? setsOf(emptyHolomenBoards()));
      const reason = violatesBoardRules(next, budgetOf(ranks, id), placedOf(id));
      if (reason !== null) continue; // 制約を破る結果は返さない(起きない想定の安全弁)
      if (!sameHolomenBoards(next, normalized(currentOf(id)))) {
        boards[id] = next;
        changed.push(id);
      }
    }
  }
  const recommended: Record<string, HolomenBoards> = { ...initial, ...boards };
  return {
    boards,
    changed,
    infeasible,
    currentScore,
    recommendedScore: changed.length === 0 ? currentScore : evaluate(recommended),
  };
}

/** 登録済みのセル(通常マス・解放済みのコネクト)のうち結果にないものを、経路ごと予算に収まる限り足し戻す(ID 順。結果を直接書き換える) */
function restoreCurrent(result: Sets, current: Sets, budget: number): void {
  for (const color of BOARD_STATE_COLORS) {
    const graph = boardGraphOf(color);
    for (const cell of [...current[color]].sort(byId)) {
      if (result[color].has(cell)) continue;
      const plan = graph.planUnlock(result[color], cell);
      if (!plan || pointsOf(result) + plan.points > budget) continue;
      for (const c of plan.cells) result[color].add(c);
    }
  }
}

function cloneSets(s: Sets): Sets {
  return {
    red: new Set(s.red),
    blue: new Set(s.blue),
    yellow: new Set(s.yellow),
    green: new Set(s.green),
  };
}

/** 比較用: 通常マスを ID 順に・既知のものだけにそろえる(登録の並び・未知の ID で「変更あり」と誤判定しない) */
function normalized(b: HolomenBoards): HolomenBoards {
  return boardsOf(setsOf(b));
}
