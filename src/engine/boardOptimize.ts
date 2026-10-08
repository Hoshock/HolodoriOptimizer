import { BLUE_BOARD_NODE_IDS } from "../data/blueBoard";
import { emptyBoardMaterials } from "../data/boardMaterials";
import type { BoardMaterials } from "../data/boardMaterials";
import {
  BOARD_STATE_COLORS,
  boardGraphOf,
  BOARD_COLOR_ANCHOR,
  emptyHolomenBoards,
  isFrequencyNode,
  sameHolomenBoards,
  spentBoardMaterials,
  unlockSetOf,
  UNLOCKABLE_ANCHORS,
  withoutFrequencyNodes,
} from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import type { UnlockRoute } from "../data/boardGraph";
import { boardPointsForRank } from "../data/boardPoints";
import { GREEN_BOARD_NODE_IDS } from "../data/greenBoard";
import { RED_BOARD_NODE_IDS } from "../data/redBoard";
import { YELLOW_BOARD_NODE_IDS } from "../data/yellowBoard";
import { emptyBoardResources } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import type { BoardColor } from "../storage/boards";
import type { ConnectPlacementMap } from "../storage/connect";
import { totalAvailableMaterials, withinMaterialLimits } from "./boardMaterialBudget";
import type { MaterialLimits } from "./boardMaterialBudget";
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
 * - **キューブ・コアキューブは色ごとのアカウント共有の有限資材**(2026-10-07 ユーザー指示。マス別の消費量は `src/data/boardMaterials.ts`)。
 *   「リソース」の登録値は**いまのボードを開けた上での余り**なので、再配分できる総量は 変えてよいホロメンのいまのボードに投入済みの資材 + 余り
 *   に、変えないホロメンの**この編成に効かない赤・青**(赤はリーダー以外・青はメンバー以外。外してもスコアが変わらない — 2026-10-08 ユーザー指示。
 *   `recoverableMaterials`)を足したもの。黄・緑はアカウント全体に効くので、ユニット外のぶんは回収しない。余りが未登録(null)の項目は制限なし。
 *   ホロメンごとのボードPt と、この共有資材の**両方**に収まる候補だけを取る(1 つでも足りなければ採用不可)
 *
 * - **青の発動頻度マス(B-013 / B-020 / B-031)はすべて OFF にして最適化する**(2026-10-07 ユーザー指示。頻度の配分はこのあとの頻度の段 — `frequencyStage.ts` — の担当で、
 *   その結果は経路が一意でないので反映しない — 手で登録する)。変えてよいホロメンは、登録している頻度マスを外した状態から出発し(頻度マスは枝の端なので
 *   外しても他のマスは孤立しない)、頻度マスはターゲットにも経路にもしない。登録していた頻度マスの資材・Pt は他のマスへ回せ、結果には外す変更として
 *   現れる(「現在」のスコアも頻度マスを外した状態の値)。変えないホロメン(ユニット外・infeasible)の頻度マスはそのまま。
 *   **`keepFrequency` を立てると、逆に登録している頻度マスをそのまま残す**(2026-10-08 ユーザー指示 — 頻度を最適化しないときは頻度に触らない)。
 *   登録の頻度マスとそこまでの経路(Pt 最小)を必須のマスとして出発点に含め、土台・「現在」は登録そのまま。新しい頻度マスは開けない
 *
 * 変えてよい範囲(`scope`): `unit` = リーダーとメンバーのホロメンだけ / `all` = 全ホロメン(緑ボードはアカウント全体に効き、黄も曲を
 * 指定すれば全体に効くので、ユニット外のボードもスコアに効く)。変えないホロメンは登録している状態のまま評価する。
 *
 * 選び方(**近似**。最大を保証しない): 150 通常マスの組合せを全部は試さない(指数爆発)。1 マスずつの増分では、効果のない途中のマスの
 * 先にある効果のあるマスへ辿り着けないので、候補は「ターゲットのマスを新たに取るのに必要な未解放の経路一式(途中のコネクトも)」
 * = **解放プラン**で、その追加ボードPt(Pt 最小の経路 — `BoardGraph.planUnlock`)とスコアの増分で評価する。
 * **資材に上限がある色では、Pt 最小の経路だけを見ない**: Pt が少し多くても資材が少なく済む別の経路でないと届かないターゲットがある
 * (赤 R-025〜R-027 は +1 Pt で cube を 20 節約する経路と引き換えに core が +25、緑 G-018・G-021 は core 50 を避けるのに +3 Pt・cube +200)ので、
 * `BoardGraph.planUnlockRoutes` が返す Pt・cube・core の非劣な経路のうち、予算に収まるものすべてを評価して最良を選ぶ。
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
  /**
   * 「リソース」の登録値(いまのボードを開けた上での余り。色 × キューブ/コアキューブ)。省略・未登録(null)の項目は制限なし。
   * 0 は「余りが 0 個」で、制限なしではない
   */
  resources?: BoardResources;
  /** 全ホロメンのボードを渡して、その編成の調整後ユニットスコアを返す(呼び出し側が実際の探索と同じ評価経路で計算する) */
  evaluate: (boards: Readonly<Record<string, HolomenBoards>>) => number;
  /** 登録している青の発動頻度マスを外さずに残す(頻度を最適化しないとき)。省略は外す */
  keepFrequency?: boolean;
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
function mandatorySets(placed: ReadonlySet<string>, frequencyNodes: readonly string[]): Sets {
  const sets: Sets = { red: new Set(), blue: new Set(), yellow: new Set(), green: new Set() };
  for (const color of BOARD_STATE_COLORS) {
    const anchor = BOARD_COLOR_ANCHOR[color];
    const graph = boardGraphOf(color);
    if (anchor === undefined || graph.connectorId === null || !placed.has(anchor)) continue;
    const plan = graph.planUnlock(sets[color], graph.connectorId);
    if (plan) for (const id of plan.cells) sets[color].add(id);
  }
  // 残す頻度マス(`keepFrequency`)も、そこまでの経路ごと必須にする
  const blue = boardGraphOf("blue");
  for (const id of frequencyNodes) {
    const plan = blue.planUnlock(sets.blue, id);
    if (plan) for (const cell of plan.cells) sets.blue.add(cell);
  }
  return sets;
}

/**
 * その編成のユニットスコアに効かないマスに入っている資材(色ごと)= 外して回せる資材(2026-10-08 ユーザー指示「青系の資材はメンバー以外のを
 * 外すことで調達できる」)。赤はリーダーのホロメンにしか、青はメンバーのホロメンにしか効かないので、それ以外のホロメンの赤・青は外しても
 * スコアが変わらない(黄・緑はアカウント全体に効くので数えない)。配置のあるコネクトとそこまでの経路(Pt 最小)は外せないので数えない。
 * `excluded` のホロメン(最適化で変えてよく、投入済みの全量をすでに総量へ入れているもの)は数えない
 */
export function recoverableMaterials(
  boards: Readonly<Record<string, HolomenBoards>>,
  placements: ConnectPlacementMap,
  leaderHolomenId: string,
  memberHolomenIds: readonly string[],
  excluded: ReadonlySet<string> = new Set(),
): BoardMaterials {
  const members = new Set(memberHolomenIds);
  const out = emptyBoardMaterials();
  for (const [id, b] of Object.entries(boards)) {
    if (excluded.has(id)) continue;
    const placed = new Set(
      Object.keys(placements[id] ?? {}).filter((anchor) => anchor !== "center"),
    );
    const kept = mandatorySets(placed, []);
    const colors: BoardColor[] = [];
    if (id !== leaderHolomenId) colors.push("red");
    if (!members.has(id)) colors.push("blue");
    for (const color of colors) {
      const free = new Set(
        [...unlockSetOf(color, b[color], b.connects)].filter((cell) => !kept[color].has(cell)),
      );
      const m = boardGraphOf(color).unlockedMaterials(free);
      out[color].cube += m.cube;
      out[color].core += m.core;
    }
  }
  return out;
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

/** 取り出す順: 増分 ÷ 追加Pt / 増分 / 増分 ÷ 資源の消費の割合(Pt・cube・core をそれぞれ予算に対する割合で足したもの。有限の資材があるときだけ) */
type Order = "ratio" | "gain" | "scarce";

/** 解放済みの集合が消費している資材(色ごと) */
function materialsOfSets(sets: Sets): BoardMaterials {
  const out = emptyBoardMaterials();
  for (const color of BOARD_STATE_COLORS) {
    const m = boardGraphOf(color).unlockedMaterials(sets[color]);
    out[color] = { cube: m.cube, core: m.core };
  }
  return out;
}

/** 資材の残り(色ごと。制限なしの項目は Infinity のまま) */
type Avail = MaterialLimits;
const availMinus = (limits: MaterialLimits, used: BoardMaterials): Avail => ({
  red: { cube: limits.red.cube - used.red.cube, core: limits.red.core - used.red.core },
  blue: { cube: limits.blue.cube - used.blue.cube, core: limits.blue.core - used.blue.core },
  yellow: {
    cube: limits.yellow.cube - used.yellow.cube,
    core: limits.yellow.core - used.yellow.core,
  },
  green: { cube: limits.green.cube - used.green.cube, core: limits.green.core - used.green.core },
});
const availNonNegative = (a: Avail): boolean =>
  BOARD_STATE_COLORS.every((color) => a[color].cube >= 0 && a[color].core >= 0);
const routeFits = (route: UnlockRoute, avail: Avail[BoardColor]): boolean =>
  route.cube <= avail.cube && route.core <= avail.core;

interface Candidate {
  holomenId: string;
  color: BoardColor;
  id: string;
  /** 測った時点の増分・追加Pt(`scarce` の順では資源の消費の割合)と、そのとき選んだ経路 */
  gain: number;
  cost: number;
  route: UnlockRoute;
  /** 測った時点の「確定した変更の数」。いまと違えば測り直す */
  version: number;
}

export function optimizeBoards(input: BoardOptimizeInput): BoardOptimizeResult {
  const { ranks, placements, scope, leaderHolomenId, hasSong, holomenIds, evaluate } = input;
  const members = new Set(input.memberHolomenIds);
  const unit = new Set([leaderHolomenId, ...input.memberHolomenIds]);
  const order = new Map(holomenIds.map((id, i) => [id, i]));
  const currentOf = (id: string): HolomenBoards => input.current[id] ?? emptyHolomenBoards();
  const keepFrequency = input.keepFrequency ?? false;
  /** 残す頻度マス(`keepFrequency` のときの登録の頻度マス。ほかは空) */
  const keptFrequencyOf = (id: string): string[] =>
    keepFrequency ? currentOf(id).blue.filter(isFrequencyNode) : [];
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
    const start = mandatorySets(placedOf(id), keptFrequencyOf(id));
    if (pointsOf(start) > budgetOf(ranks, id)) {
      infeasible.push(id);
      continue;
    }
    allowed.push(id);
    scratch.set(id, start);
  }
  const allowedSet = new Set(allowed);
  /** 最適化の土台(「現在」): 変えてよいホロメンは頻度マスを外した登録(`keepFrequency` のときは登録のまま)、変えないホロメンは登録のまま */
  const baseOf = (id: string): HolomenBoards =>
    allowedSet.has(id) && !keepFrequency ? withoutFrequencyNodes(currentOf(id)) : currentOf(id);
  /** 登録している状態(頻度マスを外したもの)から出発してよいホロメン: 中心から整合していて、予算内で、必須のコネクトを含む */
  const eligible = new Set(
    allowed.filter(
      (id) => violatesBoardRules(baseOf(id), budgetOf(ranks, id), placedOf(id)) === null,
    ),
  );
  const finiteBudget = allowed.some((id) => Number.isFinite(budgetOf(ranks, id)));

  // 共有の資材予算: 変えてよいホロメンのいまのボードに投入済みの資材 + 登録している余り(未登録の項目は制限なし)
  // + 変えないホロメン(ユニット外・infeasible)のうち、この編成に効かない赤・青(`recoverableMaterials`。外して回せる)
  const spentAllowed = spentBoardMaterials(
    Object.fromEntries(allowed.map((id) => [id, currentOf(id)])),
  );
  const recoverable = recoverableMaterials(
    Object.fromEntries(holomenIds.map((id) => [id, currentOf(id)])),
    placements,
    leaderHolomenId,
    input.memberHolomenIds,
    allowedSet,
  );
  for (const color of BOARD_STATE_COLORS) {
    spentAllowed[color].cube += recoverable[color].cube;
    spentAllowed[color].core += recoverable[color].core;
  }
  const pool: MaterialLimits = totalAvailableMaterials(
    spentAllowed,
    input.resources ?? emptyBoardResources(),
  );
  const limitedColor = (color: BoardColor): boolean =>
    Number.isFinite(pool[color].cube) || Number.isFinite(pool[color].core);
  const finiteMaterials = BOARD_STATE_COLORS.some(limitedColor);

  const initial: Record<string, HolomenBoards> = {};
  for (const id of holomenIds) initial[id] = baseOf(id);
  const currentScore = evaluate(initial);

  interface Run {
    sets: Map<string, Sets>;
    score: number;
  }
  function run(fromCurrent: boolean, ordering: Order): Run | null {
    const sets = new Map<string, Sets>();
    const cache: Record<string, HolomenBoards> = {};
    for (const id of holomenIds) {
      const start =
        scratch.has(id) && !(fromCurrent && eligible.has(id))
          ? cloneSets(scratch.get(id) ?? setsOf(baseOf(id)))
          : setsOf(baseOf(id));
      sets.set(id, start);
      cache[id] = boardsOf(start);
    }
    const spent = new Map<string, number>(
      holomenIds.map((id) => [id, pointsOf(sets.get(id) ?? setsOf(emptyHolomenBoards()))]),
    );
    // 出発点が使っている資材を総量から引いた残り(登録から出発するホロメンは投入済みの分を差し引くので、全員そうなら登録している余りに等しい。
    // ゼロから出発するホロメンは回収済みとして、その分も使える)。出発点だけで総量を超えるなら、この出発点は使えない
    const used = emptyBoardMaterials();
    for (const id of allowed) {
      const m = materialsOfSets(sets.get(id) ?? setsOf(emptyHolomenBoards()));
      for (const color of BOARD_STATE_COLORS) {
        used[color].cube += m[color].cube;
        used[color].core += m[color].core;
      }
    }
    const avail = availMinus(pool, used);
    if (!availNonNegative(avail)) return null;
    let score = evaluate(cache);
    let version = 0;

    const relevant = (id: string, color: BoardColor): boolean => {
      if (color === "red") return id === leaderHolomenId;
      if (color === "blue") return members.has(id);
      if (color === "yellow") return hasSong;
      return true;
    };
    const remaining = (id: string): number => budgetOf(ranks, id) - (spent.get(id) ?? 0);

    /** 資源の消費の割合(`scarce` の順の費用): Pt はそのホロメンの予算に対して、cube / core は総量に対して(有限のものだけ)。0 にはしない */
    const scarcity = (holomenId: string, color: BoardColor, route: UnlockRoute): number => {
      let cost = 0;
      const budget = budgetOf(ranks, holomenId);
      if (Number.isFinite(budget) && budget > 0) cost += route.points / budget;
      if (Number.isFinite(pool[color].cube) && pool[color].cube > 0)
        cost += route.cube / pool[color].cube;
      if (Number.isFinite(pool[color].core) && pool[color].core > 0)
        cost += route.core / pool[color].core;
      return Math.max(cost, 1e-9);
    };
    /** そのターゲットへの経路の候補。資材に上限がある色は Pt・cube・core の非劣な経路すべて、ないときは Pt 最小の 1 つ */
    function routesFor(
      color: BoardColor,
      unlocked: ReadonlySet<string>,
      id: string,
    ): UnlockRoute[] {
      const graph = boardGraphOf(color);
      if (limitedColor(color)) return graph.planUnlockRoutes(unlocked, id);
      const plan = graph.planUnlock(unlocked, id);
      if (!plan) return [];
      const m = plan.cells.reduce(
        (sum, cell) => ({
          cube: sum.cube + graph.cellMaterials(cell).cube,
          core: sum.core + graph.cellMaterials(cell).core,
        }),
        { cube: 0, core: 0 },
      );
      return [{ ...plan, ...m }];
    }
    /** そのホロメンのPt の残りと、共有の資材の残りの両方に収まる経路か */
    const fits = (holomenId: string, color: BoardColor, route: UnlockRoute): boolean =>
      route.points <= remaining(holomenId) && routeFits(route, avail[color]);

    /** そのターゲットを取る解放プランを、確定せずに測る。取れない・効かない・予算(Pt・共有の資材)に収まらないときは null */
    function measure(c: Candidate): { gain: number; cost: number; route: UnlockRoute } | null {
      const s = sets.get(c.holomenId);
      if (!s) return null;
      let best: { gain: number; cost: number; route: UnlockRoute } | null = null;
      for (const route of routesFor(c.color, s[c.color], c.id)) {
        if (route.cells.length === 0 || !fits(c.holomenId, c.color, route)) continue;
        for (const cell of route.cells) s[c.color].add(cell);
        cache[c.holomenId] = boardsOf(s);
        const value = evaluate(cache);
        for (const cell of route.cells) s[c.color].delete(cell);
        cache[c.holomenId] = boardsOf(s);
        const gain = value - score;
        if (gain <= 0) continue;
        const cost = ordering === "scarce" ? scarcity(c.holomenId, c.color, route) : route.points;
        const key = ordering === "ratio" || ordering === "scarce" ? gain / cost : gain;
        const bestKey =
          best === null
            ? -Infinity
            : ordering === "ratio" || ordering === "scarce"
              ? best.gain / best.cost
              : best.gain;
        if (key > bestKey) best = { gain, cost, route };
      }
      return best;
    }
    function commit(c: Candidate): void {
      const s = sets.get(c.holomenId);
      if (!s) return;
      for (const cell of c.route.cells) s[c.color].add(cell);
      spent.set(c.holomenId, (spent.get(c.holomenId) ?? 0) + c.route.points);
      avail[c.color].cube -= c.route.cube;
      avail[c.color].core -= c.route.core;
      cache[c.holomenId] = boardsOf(s);
      score = evaluate(cache);
    }
    const priority = (c: Candidate): number => (ordering === "gain" ? c.gain : c.gain / c.cost);
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
            if (color === "blue" && isFrequencyNode(id)) continue; // 新しい頻度マスは開けない(頻度の段の担当)
            if (NO_SCORE_EFFECT.has(`${color}/${id}`)) continue;
            if (sets.get(holomenId)?.[color].has(id)) continue;
            const candidate: Candidate = {
              holomenId,
              color,
              id,
              gain: 0,
              cost: 1,
              route: { cells: [], points: 0, cube: 0, core: 0 },
              version,
            };
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
          top.route = m.route;
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
  const orderings: Order[] = finiteBudget || finiteMaterials ? ["ratio", "gain"] : ["ratio"];
  // 資材に上限があるときは、Pt だけでなく資材の消費も勘定に入れた順も試す(共有の資材を高い増分の候補が食い切るのを避ける)
  if (finiteMaterials) orderings.push("scarce");
  const keep = (r: Run | null): void => {
    if (r) runs.push(r);
  };
  if (eligible.size > 0) for (const o of orderings) keep(run(true, o));
  for (const o of orderings) keep(run(false, o));
  let best: Run | undefined = runs[0];
  for (const r of runs) if (best === undefined || r.score > best.score) best = r;

  interface Picked {
    boards: Record<string, HolomenBoards>;
    changed: string[];
  }
  /** 登録(`currentOf`)と違うホロメンだけを集める。制約を破る結果は返さない(起きない想定の安全弁) */
  function collect(next: (id: string) => HolomenBoards | null): Picked {
    const picked: Picked = { boards: {}, changed: [] };
    for (const id of allowed) {
      const board = next(id);
      if (board === null) continue;
      if (violatesBoardRules(board, budgetOf(ranks, id), placedOf(id)) !== null) continue;
      if (!sameHolomenBoards(board, normalized(currentOf(id)))) {
        picked.boards[id] = board;
        picked.changed.push(id);
      }
    }
    return picked;
  }
  /** 頻度マスを外しただけの登録(整合した状態から出発できるホロメンだけ。ほかは変更しない) */
  const pickBase = (): Picked =>
    collect((id) => (eligible.has(id) ? boardsOf(setsOf(baseOf(id))) : null));
  /** 選んだ結果。効かず選ばれなかった登録済みのマスは、共有の資材の残りと予算が許す限り戻す */
  function pickBest(chosen: Run): Picked {
    // 足し戻しは、結果がすでに使っている資材の残り(共有)の範囲でだけ行う
    const used = emptyBoardMaterials();
    for (const id of allowed) {
      const m = materialsOfSets(chosen.sets.get(id) ?? setsOf(emptyHolomenBoards()));
      for (const color of BOARD_STATE_COLORS) {
        used[color].cube += m[color].cube;
        used[color].core += m[color].core;
      }
    }
    const restoreAvail = availMinus(pool, used);
    return collect((id) => {
      // 変更量を最小にする: 整合した登録から出発できるホロメンは、スコアに効かず選ばれなかった登録済みのマスを、予算が許す限り戻す
      // (マスを足してもスコアは下がらない。ゼロから選び直した結果で、効かない登録済みのマスが理由なく消えるのを避ける。頻度マスは戻さない)
      const resultSets = chosen.sets.get(id);
      if (resultSets && eligible.has(id))
        restoreCurrent(
          resultSets,
          setsOf(baseOf(id)),
          budgetOf(ranks, id),
          restoreAvail,
          limitedColor,
        );
      return boardsOf(chosen.sets.get(id) ?? setsOf(emptyHolomenBoards()));
    });
  }
  /** 安全弁: 共有の資材が総量を超える結果は使わない(起きない想定。出発点・候補・足し戻しの各段で守っている) */
  const withinPool = (picked: Picked): boolean => {
    const chosen = { ...initial, ...picked.boards };
    return withinMaterialLimits(
      spentBoardMaterials(Object.fromEntries(allowed.map((id) => [id, chosen[id] ?? baseOf(id)]))),
      pool,
    );
  };

  // 変えてよいホロメン全員が整合した状態から出発でき、結果が土台(頻度マスを外した登録)を下回る(貪欲法の取りこぼし)ときは、土台のままにする
  const allEligible = allowed.length === eligible.size;
  let picked: Picked =
    best === undefined || (allEligible && best.score < currentScore) ? pickBase() : pickBest(best);
  let recommendedScore =
    picked.changed.length === 0 ? currentScore : evaluate({ ...initial, ...picked.boards });
  // 足し戻しの結果が土台を下回ったり、資材が総量を超えたりするときは、土台(頻度マスを外しただけ)へ戻す。
  // 土台を下回ってよいのは、予算を超えている(整合しない)登録を予算内へ直すとき — 土台に戻せないホロメンがいるときは比べない
  if (
    picked.changed.length > 0 &&
    ((allEligible && recommendedScore < currentScore) || !withinPool(picked))
  ) {
    picked = pickBase();
    recommendedScore =
      picked.changed.length === 0 ? currentScore : evaluate({ ...initial, ...picked.boards });
  }
  return {
    boards: picked.boards,
    changed: picked.changed,
    infeasible,
    currentScore,
    recommendedScore,
  };
}

/**
 * 登録済みのセル(通常マス・解放済みのコネクト)のうち結果にないものを、経路ごとボードPt の予算と共有の資材の残りに収まる限り足し戻す
 * (ID 順。結果と `avail` を直接書き換える)。資材に上限がある色では、収まる経路のうち Pt が少ないものを選ぶ
 */
function restoreCurrent(
  result: Sets,
  current: Sets,
  budget: number,
  avail: Avail,
  limitedColor: (color: BoardColor) => boolean,
): void {
  for (const color of BOARD_STATE_COLORS) {
    const graph = boardGraphOf(color);
    for (const cell of [...current[color]].sort(byId)) {
      if (result[color].has(cell)) continue;
      const used = pointsOf(result);
      let route: UnlockRoute | undefined;
      if (limitedColor(color)) {
        route = graph
          .planUnlockRoutes(result[color], cell)
          .find((r) => used + r.points <= budget && routeFits(r, avail[color]));
      } else {
        const plan = graph.planUnlock(result[color], cell);
        if (plan && used + plan.points <= budget) route = { ...plan, cube: 0, core: 0 };
      }
      if (!route) continue;
      for (const c of route.cells) result[color].add(c);
      avail[color].cube -= route.cube;
      avail[color].core -= route.core;
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
export function normalized(b: HolomenBoards): HolomenBoards {
  return boardsOf(setsOf(b));
}
