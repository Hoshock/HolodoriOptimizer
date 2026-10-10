import { BLUE_BOARD_NODE_IDS } from "../data/blueBoard";
import { holomenById } from "../data";
import { emptyBoardMaterials } from "../data/boardMaterials";
import type { BoardMaterialCost, BoardMaterials } from "../data/boardMaterials";
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
import {
  affiliationEffectOf,
  GREEN_AFFILIATION_CAP,
  GREEN_BOARD_NODE_IDS,
  GREEN_BOARD_NODES,
} from "../data/greenBoard";
import { RED_BOARD_NODE_IDS, RED_BOARD_NODES } from "../data/redBoard";
import type { Song } from "../data/types";
import {
  YELLOW_BOARD_NODE_IDS,
  YELLOW_BOARD_NODES,
  yellowNodeAffectsSong,
} from "../data/yellowBoard";
import { emptyBoardResources } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import type { BoardColor } from "../storage/boards";
import type { ConnectPlacementMap } from "../storage/connect";
import { totalAvailableMaterials, withinMaterialLimits } from "./boardMaterialBudget";
import type { MaterialLimits } from "./boardMaterialBudget";
import { NO_SCORE_EFFECT } from "./connectOptimize";

/**
 * ホロメンボードの最適化(2026-10-04 ユーザー指示。いまは組み直しプランのボードの段)。
 *
 * **固定した編成**に対して、ホロメンごとのボードPt の予算(ホロメンランク。src/data/boardPoints.ts)の範囲で、**表示ユニットスコア**
 * (`createTeamScorer` が返す調整後ユニットスコア。コネクトの最適化と同じ評価経路)が高くなる解放マスを選ぶ。
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
 *   に、変えないホロメンの**この編成に効かないマス**(赤はリーダー以外・青はメンバー以外・黄は指定した曲に入らないマス・報酬のマス。外しても
 *   スコアが変わらない — 2026-10-08 ユーザー指示。`recoverableMaterials`)を足したもの。余りが未登録(null)の項目は制限なし。
 *   ホロメンごとのボードPt と、この共有資材の**両方**に収まる候補だけを取る(1 つでも足りなければ採用不可)
 *
 * - **青の発動頻度マス(B-013 / B-020 / B-031)はすべて OFF にして最適化する**(2026-10-07 ユーザー指示。頻度の配分はこのあとの頻度の段 — `frequencyStage.ts` — の担当で、
 *   その結果は経路が一意でないので反映しない — 手で登録する)。変えてよいホロメンは、登録している頻度マスを外した状態から出発し(頻度マスは枝の端なので
 *   外しても他のマスは孤立しない)、頻度マスはターゲットにも経路にもしない。登録していた頻度マスの資材・Pt は他のマスへ回せ、結果には外す変更として
 *   現れる(「現在」のスコアも頻度マスを外した状態の値)。変えないホロメン(ユニット外・infeasible)の頻度マスはそのまま。
 *   **`keepFrequency` を立てると、逆に登録している頻度マスをそのまま残す**(2026-10-08 ユーザー指示 — 頻度を最適化しないときは頻度に触らない)。
 *   登録の頻度マスとそこまでの経路(Pt 最小)を必須のマスとして出発点に含め、土台・「現在」は登録そのまま。新しい頻度マスは開けない
 *
 * **組み直しの 3 つのルール**(2026-10-10 ユーザー指示。ADR-026 — 本質は「Pt・資材あたりのステータスの伸びが大きいマスから」と
 * 「ボードを変えるホロメンを少なく」):
 * 1. **開ける順は効率だけ**(伸び ÷ Pt / 伸び / 伸び ÷ 資源の消費の割合 の 3 通りを試して最良)。色の順位や十字の特別扱いはしない。
 *    例外は最小限のリーダー・メンバーの緑で、赤・青・黄とユニット外の緑のあとに残った Pt で、効率順に開ける(`tier`)。
 *    **緑を変えるホロメンは形にそろえる**(ADR-027): ユニット系担当は縦一直線だけ、それ以外は 1 つ目の所属マスの手前まで(`alignedGreen`)。
 *    最小限オフのユニット外だけ、ほかを取り切ってまだ余れば手前より先も開けてよい(`relaxed`。順位は最後)
 * 2. **外してよいのはこの編成に効かないマスだけ**(`removable`): ユニット外の赤・青の全部、曲に効かない黄、報酬のマス、メンバーの所属に
 *    効かない所属マス、上限で頭打ちのマス(所属向けの +900 を超えた所属マス・楽曲スコアボーナスの 10.0% を超えた黄 — 外しても伸びが減らない)。
 *    ユニット外の全員・パラメータの緑は誰が持っていても効くので外す対象にはしない。ただし効かないマスを外すとき、その先にあって中心から
 *    切れるマスは一緒に外れる(巻き込み。損は差し引いて判断する)。リーダー・メンバーのボードは組み直すので何を外してもよい
 * 3. **新しく触る手間**: まだ緑を変えていないユニット外のホロメンの緑を初めて変えるときは、伸びから 1 人分の手間(`NEW_HOLOMEN_COST_RATIO`)を
 *    差し引く。出発点どうしも、緑を変えたユニット外の人数分の手間を差し引いて比べる。**赤・青・黄だけの変更は手間に数えない**(2026-10-10
 *    ユーザー指示「赤は基本外すとして 1 人、青も最大 5 人程度、黄色も同様。緑は手間を一番考えたい」— 赤・青・黄を変えるユニット外は少ない)
 *
 * 変えてよい範囲(`scope`。画面の「最小限で組み直す」):
 * - リーダーとメンバーのホロメンはどちらの範囲でも組み直す(ゼロから・登録からの 2 通りの出発点)
 * - **ユニット外のホロメン(登録が整合している人)はどちらの範囲でも登録から足す・外すだけ**(`extended`)。足せるマスが範囲で違う:
 *   `minimal` はリーダー・メンバーでは代わりがきかないマスだけ(メンバーの所属に効く緑の所属マス — 経路は通る — と、指定した曲に効く黄)、
 *   `all` は緑ならどのマスでも(全員・パラメータも。形の決まりの範囲で)と、曲に効く黄。全整理で登録が整合していないユニット外だけ、ゼロから組み直す
 * - Pt が足りないユニット外は、外してよいマスを端から外して空ける(`reclaimFor`)。緑の資材が足りなくなったら、ユニット外の外してよい緑を
 *   先のマスごと外して回す(`release`。1 人ずつ試し、報われなければ戻して止める)。
 *   赤・青・曲に効かない黄の資材は `recoverableMaterials` で静的に総量へ入れてある(ボードは変えず、反映すると余りが負になる — 外して回すぶん)
 * - 緑を移さない: ゼロから組み直したリーダー・メンバーが外した登録の緑の資材は、登録を戻す段までほかのホロメンの全員・パラメータの緑に使わない
 *   (取り置き `greenRoom`)。貪欲法のあと、選ばれなかった登録済みのマスを Pt と資材が許す限り戻す(変更を少なくする)
 * 変えないホロメン(最小限で登録が整合していないユニット外・infeasible)は登録している状態のまま評価する。
 *
 * 選び方(**近似**。最大を保証しない): 150 通常マスの組合せを全部は試さない(指数爆発)。1 マスずつの増分では、効果のない途中のマスの
 * 先にある効果のあるマスへ辿り着けないので、候補は「ターゲットのマスを新たに取るのに必要な未解放の経路一式(途中のコネクトも)」
 * = **解放プラン**で、その追加ボードPt(Pt 最小の経路 — `BoardGraph.planUnlock`)とスコアの増分で評価する。
 * **資材に上限がある色では、Pt 最小の経路だけを見ない**: Pt が少し多くても資材が少なく済む別の経路でないと届かないターゲットがある
 * (赤 R-025〜R-027 は +1 Pt で cube を 20 節約する経路と引き換えに core が +25、緑 G-018・G-021 は core 50 を避けるのに +3 Pt・cube +200)ので、
 * `BoardGraph.planUnlockRoutes` が返す Pt・cube・core の非劣な経路のうち、予算に収まるものすべてを評価して最良を選ぶ。
 * 遅延評価の貪欲法: 増分 ÷ 追加Pt(または増分)の大きい順に取り出し、取る直前に測り直し、まだ先頭なら取る(残りの予算に収まるものだけ)。
 * 出発点は 2 通り — 必須のマスだけの状態(ゼロから)と、登録している状態(予算内で整合しているホロメンだけ)。ゼロからは「増分 ÷ Pt」と
 * 「増分」の 2 通りの順で試し、どれも登録の足し戻しまで済ませてから、いちばんスコア(から新しく触った人数分の手間を引いたもの)の高いものを選ぶ(同点なら登録している状態に近いほう)。
 * 厳密な最適(ナップサック)でも、いま登録している状態より必ず良いことの保証でもないので、全ホロメンが整合している状態から出発して
 * 結果がそれを下回るときは、登録している状態をそのまま返す。
 * 試さない候補: スコアに効かない効果のマス(報酬・ライフ・ホロメンスキル・ホロワーク報酬)がターゲットのもの、効かない色(青はメンバーのホロメン
 * だけ、赤はリーダーのホロメンだけ、黄は曲を指定したときだけ)。途中の経路にそれらが入るのは構わない。
 */

export type BoardScope = "minimal" | "all";

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
  /** 指定した曲(外して回せる黄のマスの判定 — `recoverableMaterials`)。省略は曲なし */
  song?: Song | null;
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

const GREEN_NODE_BY_ID = new Map(GREEN_BOARD_NODES.map((n) => [n.id, n]));
/** 緑の縦一直線(x = 0)のマス: 所属マス 3 つ(G-008 / G-011 / G-021)とそこまでの経路と G-018。ユニット系担当が開けてよいのはここだけ */
const GREEN_TRUNK: ReadonlySet<string> = new Set(
  GREEN_BOARD_NODES.filter((n) => n.x === 0).map((n) => n.id),
);
/** 1 つ目の所属マス(G-008)より手前のマス(G-001〜G-007。十字の G-003・G-004 を含む)。ユニット系担当でない人が開けてよいのはここまで */
const GREEN_UPPER: ReadonlySet<string> = new Set(
  GREEN_BOARD_NODES.filter(
    (n) =>
      n.y >
      Math.max(...GREEN_BOARD_NODES.filter((a) => a.effect.kind === "affiliation").map((a) => a.y)),
  ).map((n) => n.id),
);

/**
 * 新しく触るユニット外のホロメン 1 人分の手間を、いまのユニットスコアに対する割合で表したもの(推薦ポリシー。ゲームの仕様ではない)。
 * 0.05%: 2026-10-09 のアカウントで、緑のないホロメンに G-001(全員 +5)を 1 マス開ける伸びが約 0.06%(採る)、十字の G-003
 * (テクニック +5)だけを 1 マス開ける伸びが約 0.009%(採らない)。その人のボードを触るなら、ほかの変更も一緒に載せたほうが得になる
 */
export const NEW_HOLOMEN_COST_RATIO = 0.0005;

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

/** ゲームの報酬だけのマス(ライブのホロゴールド・獲得報酬・ホロワークの報酬)。ユニットスコアに効かず、外してよい(2026-10-08 ユーザー指示) */
const REWARD_NODES = new Set<string>([
  ...GREEN_BOARD_NODES.filter((n) => n.effect.kind === "reward").map((n) => `green/${n.id}`),
  ...RED_BOARD_NODES.filter((n) => n.effect.kind === "liveReward").map((n) => `red/${n.id}`),
  ...YELLOW_BOARD_NODES.filter((n) => n.effect.kind === "workReward").map((n) => `yellow/${n.id}`),
]);

export interface RecoverableInput {
  boards: Readonly<Record<string, HolomenBoards>>;
  placements: ConnectPlacementMap;
  leaderHolomenId: string;
  memberHolomenIds: readonly string[];
  /** 指定した曲(黄の楽曲スコアボーナスがどのマスに乗るか)。null は曲なし(黄はどのマスも効かない) */
  song: Song | null;
  /** 数えないホロメン(最適化で変えてよく、投入済みの全量をすでに総量へ入れているもの) */
  excluded?: ReadonlySet<string>;
  /** 数える色(省略は 4 色。最小限の範囲でユニット外の緑は取り崩し `release` の担当なので、ここでは数えない) */
  colors?: readonly BoardColor[];
}

/**
 * その編成のユニットスコアに効かないマスに入っている資材(色ごと)= 外して回せる資材(2026-10-08 ユーザー指示「青系の資材はメンバー以外のを
 * 外すことで調達できる」「ゲームの報酬とかホロワーク系は気にせず外していい」「黄色は曲指定した時に青赤と同じ扱い」)。効かないマスは
 * - 赤: リーダー以外のホロメンの全部と、リーダーのライブ報酬のマス(赤はリーダーのホロメンにしか効かない)
 * - 青: メンバー以外のホロメンの全部(青はメンバーのホロメンにしか効かない)
 * - 黄: 指定した曲の楽曲スコアボーナスに入らないマス(ホロワークの報酬・ほかの歌唱者の枠。曲なしなら全部 — `yellowNodeAffectsSong`。上限 10.0% は見ない)
 * - 緑: 報酬のマスだけ(全員・パラメータ・所属のマスはアカウント全体に効く)
 * 効かないマスでも、効くマスや配置のあるコネクト(とそこまでの経路)へつながる途中のマスは外せないので、**端から**外せるものだけを数える
 */
export function recoverableMaterials(input: RecoverableInput): BoardMaterials {
  const excluded = input.excluded ?? new Set<string>();
  const keepOf = keepCellsOf(input);
  const out = emptyBoardMaterials();
  for (const [id, b] of Object.entries(input.boards)) {
    if (excluded.has(id)) continue;
    for (const color of input.colors ?? BOARD_STATE_COLORS) {
      const graph = boardGraphOf(color);
      const before = unlockSetOf(color, b[color], b.connects);
      const keep = keepOf(id, color);
      if ([...before].every(keep)) continue;
      const a = graph.unlockedMaterials(before);
      const z = graph.unlockedMaterials(strippedOf(graph, before, keep));
      out[color].cube += a.cube - z.cube;
      out[color].core += a.core - z.core;
    }
  }
  return out;
}

/**
 * 外してはいけないマスの判定(ホロメン × 色ごと): この編成に効くマス(`recoverableMaterials` の一覧)、配置のあるコネクトとそこまでの経路、
 * コネクトマスそのもの。これ以外がこの編成に効かないマス
 */
function keepCellsOf(
  input: Pick<RecoverableInput, "placements" | "leaderHolomenId" | "memberHolomenIds" | "song">,
): (id: string, color: BoardColor) => (cell: string) => boolean {
  const members = new Set(input.memberHolomenIds);
  const effective = (color: BoardColor, id: string, cell: string): boolean => {
    if (REWARD_NODES.has(`${color}/${cell}`)) return false;
    if (color === "red") return id === input.leaderHolomenId;
    if (color === "blue") return members.has(id);
    if (color === "yellow") return yellowNodeAffectsSong(id, cell, input.song);
    return true;
  };
  return (id, color) => {
    const placed = new Set(
      Object.keys(input.placements[id] ?? {}).filter((anchor) => anchor !== "center"),
    );
    const kept = mandatorySets(placed, [])[color];
    const connectorId = boardGraphOf(color).connectorId;
    return (cell) => kept.has(cell) || (cell !== connectorId && effective(color, id, cell));
  };
}

/** 端(外してもほかのマスが切り離されないマス)から、効かないマスを外せなくなるまで外した集合 */
function strippedOf(
  graph: ReturnType<typeof boardGraphOf>,
  unlocked: ReadonlySet<string>,
  keep: (cell: string) => boolean,
): ReadonlySet<string> {
  let set = unlocked;
  for (let changed = true; changed;) {
    changed = false;
    for (const cell of set) {
      if (keep(cell)) continue;
      const next = graph.lockNode(set, cell);
      if (next.size === set.size - 1) {
        set = next;
        changed = true;
      }
    }
  }
  return set;
}

/**
 * 余りが負になった資材を、この編成に効かないマスを外す差分で埋める(2026-10-10 ユーザー指示「最適化の結果に青を外す差分も入れる」)。
 * 外してもスコアは変わらない。資材を考慮しない色(`relaxed`)は不足のまま。外すホロメンは **すでに変えるホロメン → 効かないマスの資材が
 * 多いホロメン** の順(変えるホロメンを増やさない)、1 人の中は端から、足りない資材の多いマスを、足りるまで外す。外せるマスが尽きたら残りは不足
 */
export function coverDeficits(
  input: Omit<RecoverableInput, "excluded" | "colors"> & {
    remaining: BoardResources;
    /** 最適化ですでに変えるホロメン(先に外す) */
    changed: ReadonlySet<string>;
    relaxed: ReadonlySet<string>;
  },
): { boards: Record<string, HolomenBoards>; remaining: BoardResources } {
  const boards: Record<string, HolomenBoards> = { ...input.boards };
  const remaining = structuredClone(input.remaining);
  const keepOf = keepCellsOf(input);
  for (const color of BOARD_STATE_COLORS) {
    if (input.relaxed.has(color)) continue;
    const r = remaining[color];
    const need = (): { cube: boolean; core: boolean } => ({
      cube: r.cube !== null && r.cube < 0,
      core: r.core !== null && r.core < 0,
    });
    /** 足りない資材のうち、その集合から外して取り戻せる量(端から外せる効かないマスの分) */
    const graph = boardGraphOf(color);
    const helps = (set: ReadonlySet<string>, keep: (cell: string) => boolean): number => {
      const n = need();
      const a = graph.unlockedMaterials(set);
      const z = graph.unlockedMaterials(strippedOf(graph, set, keep));
      return (n.cube ? a.cube - z.cube : 0) + (n.core ? a.core - z.core : 0);
    };
    if (!need().cube && !need().core) continue;
    const order = Object.entries(boards)
      .map(([id, b]) => ({
        id,
        changed: input.changed.has(id) ? 1 : 0,
        amount: helps(unlockSetOf(color, b[color], b.connects), keepOf(id, color)),
      }))
      .filter((x) => x.amount > 0)
      .sort((a, b) => b.changed - a.changed || b.amount - a.amount || byId(a.id, b.id));
    for (const { id } of order) {
      const b = boards[id];
      if (!b) continue;
      const keep = keepOf(id, color);
      const sets = setsOf(b);
      while (need().cube || need().core) {
        const n = need();
        let best: { cell: string; gain: number } | null = null;
        for (const cell of sets[color]) {
          if (keep(cell)) continue;
          if (graph.lockNode(sets[color], cell).size !== sets[color].size - 1) continue;
          const m = graph.cellMaterials(cell);
          const gain = (n.core ? m.core * 1_000_000 : 0) + (n.cube ? m.cube : 0);
          if (
            best === null ||
            gain > best.gain ||
            (gain === best.gain && byId(cell, best.cell) < 0)
          )
            best = { cell, gain };
        }
        // 足りない資材を含むマスが端に無くても、その奥にあれば外して進む。奥にも無ければこのホロメンはやめる
        if (best === null || (best.gain === 0 && helps(sets[color], keep) === 0)) break;
        const m = graph.cellMaterials(best.cell);
        sets[color] = graph.lockNode(sets[color], best.cell);
        if (r.cube !== null) r.cube += m.cube;
        if (r.core !== null) r.core += m.core;
      }
      if (!sameHolomenBoards(boardsOf(sets), boardsOf(setsOf(b)))) boards[id] = boardsOf(sets);
      if (!need().cube && !need().core) break;
    }
  }
  return { boards, remaining };
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
  /** Pt を空けるために外すマス(ユニット外のホロメンの効かないマス。色ごと) */
  reclaim?: Reclaim;
  /** 測った時点の「確定した変更の数」。いまと違えば測り直す */
  version: number;
  relaxed?: true;
}
type Reclaim = Partial<Record<BoardColor, string[]>>;
type Measured = {
  gain: number;
  cost: number;
  route: UnlockRoute;
  reclaim?: Reclaim;
  /** 緑の形の決まりのうち「ユニット系担当でない人は G-007 まで」を外して取る(最小限オフのユニット外だけ。最後の順位 — `tier`) */
  relaxed?: true;
};

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
    // ユニット外は登録から足す・外すだけ(`extended`)。全整理で登録が整合していないユニット外だけ、ゼロから組み直す
    if (
      !unit.has(id) &&
      (scope === "minimal" ||
        violatesBoardRules(currentOf(id), budgetOf(ranks, id), placedOf(id)) === null)
    )
      continue;
    const start = mandatorySets(placedOf(id), keptFrequencyOf(id));
    if (pointsOf(start) > budgetOf(ranks, id)) {
      infeasible.push(id);
      continue;
    }
    allowed.push(id);
    scratch.set(id, start);
  }
  const allowedSet = new Set(allowed);
  /**
   * 登録の状態から足す・外すだけのユニット外のホロメン(`extended`。登録が整合している人。両方の範囲で同じ)。
   * 足せるマスは範囲で違い(`extendedTarget`)、外せるのはこの編成に効かないマスだけ(`removable`)
   */
  const extended: string[] = [];
  for (const id of holomenIds) {
    if (unit.has(id) || allowed.includes(id)) continue;
    if (violatesBoardRules(currentOf(id), budgetOf(ranks, id), placedOf(id)) !== null) continue;
    extended.push(id);
  }
  const extendedSet = new Set(extended);
  /** 変える可能性のあるホロメン(`holomenIds` の順) */
  const modifiable = holomenIds.filter((id) => allowedSet.has(id) || extendedSet.has(id));
  const memberAffiliations = new Set(
    input.memberHolomenIds.flatMap((id) => holomenById.get(id)?.affiliations ?? []),
  );
  /** ユニット外のホロメンの緑の所属マスが、メンバーの所属に効くか */
  const sharedAffiliation = (holomenId: string, nodeId: string): boolean => {
    const effect = GREEN_NODE_BY_ID.get(nodeId)?.effect;
    if (effect?.kind !== "affiliation") return false;
    const a = affiliationEffectOf(holomenId, effect.slot);
    return a !== null && memberAffiliations.has(a.affiliation);
  };
  const greenGraphAll = boardGraphOf("green");
  const memberAffiliationLists = input.memberHolomenIds.map(
    (id) => holomenById.get(id)?.affiliations ?? [],
  );
  /**
   * 手前の 7 マスより先を開けてよいホロメン(形 A のまま、効かない所属マスだけを経路に): リーダー・メンバーはどちらの範囲でも、
   * ユニット外は最小限オフだけ(2026-10-10 ユーザー判断「余るなら A の人も先へ行っていい。ユニットを取らないようにしつつステータス UP に
   * 影響のあるマスを順にとる」)。最小限オンのユニット外は、効く所属マスのためにだけ変える
   */
  const mayRelax = (holomenId: string): boolean => unit.has(holomenId) || scope === "all";
  /**
   * ユニット外のホロメンに足してよいマス。最小限は、リーダー・メンバーでは代わりがきかないマスだけ: メンバーの所属に効く緑の所属マス
   * (とそこまでの経路 — 2026-10-09 ユーザー判断「経路にないグループ外の緑を開けるのはなし。変更が多すぎる」)と、指定した曲に効く黄のマス。
   * 全整理は、緑ならどのマスでも(効率で比べる。新しく触るホロメンには手間を差し引く)と、曲に効く黄のマス。赤・青はユニット外には効かない
   */
  const extendedTarget = (holomenId: string, color: BoardColor, nodeId: string): boolean => {
    if (color === "green") return scope === "all" || sharedAffiliation(holomenId, nodeId);
    if (color === "yellow") return yellowNodeAffectsSong(holomenId, nodeId, input.song ?? null);
    return false;
  };
  /**
   * ユニット外のホロメンの、この編成に効かないマス(Pt を空けるために外してよい — 外して失うスコアは 0。2026-10-09 ユーザー判断
   * 「ラミィの赤を外して緑に回せばいいだけ」): 赤・青の全部(ユニット外はリーダーでもメンバーでもない)、曲に効かない黄、報酬のマス
   */
  const ineffectiveFor = (holomenId: string, color: BoardColor, cell: string): boolean => {
    if (REWARD_NODES.has(`${color}/${cell}`)) return true;
    if (color === "red" || color === "blue") return true;
    if (color === "yellow") return !yellowNodeAffectsSong(holomenId, cell, input.song ?? null);
    return false;
  };
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

  // 共有の資材予算: 変える可能性のあるホロメンのいまのボードに投入済みの資材 + 登録している余り(未登録の項目は制限なし)
  // + 変えないホロメン(ユニット外・infeasible)のこの編成に効かないマス(`recoverableMaterials`。外して回せる)
  // + 登録から足す・取り崩すだけのユニット外(`extended`)の、赤・青・黄の効かないマス(緑は取り崩し `release` が動的に扱う)
  const spentAllowed = spentBoardMaterials(
    Object.fromEntries(modifiable.map((id) => [id, currentOf(id)])),
  );
  const registeredAll = Object.fromEntries(holomenIds.map((id) => [id, currentOf(id)]));
  const recoverableInput = {
    boards: registeredAll,
    placements,
    leaderHolomenId,
    memberHolomenIds: input.memberHolomenIds,
    song: input.song ?? null,
  };
  const recoverable = recoverableMaterials({ ...recoverableInput, excluded: new Set(modifiable) });
  const recoverableExtended =
    extended.length === 0
      ? emptyBoardMaterials()
      : recoverableMaterials({
          ...recoverableInput,
          excluded: new Set(holomenIds.filter((id) => !extendedSet.has(id))),
          colors: ["red", "blue", "yellow"],
        });
  for (const color of BOARD_STATE_COLORS) {
    spentAllowed[color].cube += recoverable[color].cube + recoverableExtended[color].cube;
    spentAllowed[color].core += recoverable[color].core + recoverableExtended[color].core;
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
  /** 新しく触るユニット外のホロメン 1 人分の手間(スコアに換算。ルール 3 — `NEW_HOLOMEN_COST_RATIO`) */
  const touchCost = Math.abs(currentScore) * NEW_HOLOMEN_COST_RATIO;
  const registeredCache = new Map<string, HolomenBoards>();
  const registeredOf = (id: string): HolomenBoards => {
    let b = registeredCache.get(id);
    if (b === undefined) {
      b = normalized(currentOf(id));
      registeredCache.set(id, b);
    }
    return b;
  };

  /** ユニット外のホロメンの緑が登録から変わっているか(手間を数えるのは緑の変更だけ — ルール 3) */
  const greenChanged = (b: HolomenBoards | undefined, id: string): boolean => {
    const a = new Set(normalized(b ?? emptyHolomenBoards()).green);
    const r = normalized(registeredOf(id)).green;
    return a.size !== r.length || r.some((x) => !a.has(x));
  };
  interface Run {
    sets: Map<string, Sets>;
    score: number;
    /** Pt を空けるために外した、ユニット外の赤・青・黄のマスの資材(総量に静的に入れてあるぶん。使用量の勘定で二重に空けない) */
    reclaimed: BoardMaterials;
    /** 緑を登録から変えたユニット外のホロメンの数(出発点どうしを比べるとき、手間を差し引く) */
    changedOutside: number;
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
    for (const id of modifiable) {
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
    const reclaimed = emptyBoardMaterials();
    /**
     * 登録の緑の取り置き: ゼロから出発して登録の緑を外したホロメン(リーダー・メンバー)の、その緑の資材は、登録を戻す段までほかのホロメンの
     * 全員・パラメータのマスに使わない(使うと戻せなくなり、ホロメンの間で緑を移すだけの変更になる — ADR-025)。そのホロメン自身の
     * 組み直しとユニット系マス(メンバーの所属に効く所属マス)には使ってよい
     */
    const greenGraphOf = boardGraphOf("green");
    const registeredGreen = new Map(
      modifiable
        .filter((id) => eligible.has(id))
        .map((id) => [id, setsOf(baseOf(id)).green] as const)
        .filter(([id, g]) => [...g].some((cell) => !sets.get(id)?.green.has(cell))),
    );
    let reserving = registeredGreen.size > 0;
    const greenRoom = (holomenId: string, nodeId: string): Avail[BoardColor] => {
      if (!reserving || sharedAffiliation(holomenId, nodeId)) return avail.green;
      let cube = 0;
      let core = 0;
      for (const [id, g] of registeredGreen)
        if (id !== holomenId)
          for (const cell of g)
            if (!sets.get(id)?.green.has(cell)) {
              const m = greenGraphOf.cellMaterials(cell);
              cube += m.cube;
              core += m.core;
            }
      return { cube: avail.green.cube - cube, core: avail.green.core - core };
    };
    /**
     * 新しく触るホロメンの手間(ルール 3): ユニット外のホロメンの緑を登録から初めて変えるときは、伸びから `touchCost` を差し引いて比べる
     * (伸びが手間より小さければ取らない)。赤・青・黄だけの変更と、リーダー・メンバー(どのみち組み直す)は差し引かない
     */
    const touched = new Set(
      modifiable.filter((id) => !unit.has(id) && greenChanged(cache[id], id)),
    );
    const touchCostOf = (id: string, green = true): number =>
      !green || unit.has(id) || touched.has(id) ? 0 : touchCost;
    /** 「手前の 7 マスまで」を外してその先を開けたホロメン(以後の形のそろえ方もゆるいほう) */
    const relaxedHolomen = new Set<string>();
    /**
     * 「手前の 7 マスまで」を外してよいのは、登録を戻したあとの 2 周目だけ(「余るなら」— 登録のマスを戻すより先に Pt・資材を使って、
     * 登録の所属マスを捨てる入れ替わりを起こさない)
     */
    let allowRelax = false;
    /** 所属向けの合計(所属 → 値。上限前)。`holomenId` の緑だけ `green` に置き換えて数える */
    function affiliationTotals(holomenId: string, green: ReadonlySet<string>): Map<string, number> {
      const totals = new Map<string, number>();
      for (const id of holomenIds) {
        const g = id === holomenId ? green : sets.get(id)?.green;
        if (!g) continue;
        for (const cell of g) {
          const effect = GREEN_NODE_BY_ID.get(cell)?.effect;
          if (effect?.kind !== "affiliation") continue;
          const a = affiliationEffectOf(id, effect.slot);
          if (a) totals.set(a.affiliation, (totals.get(a.affiliation) ?? 0) + a.value);
        }
      }
      return totals;
    }
    /**
     * ユニット系担当(形 B)か: **効く**所属マス — メンバーの誰かの所属向けの合計が、そのマスを除くと上限 +900 に届かない — を持つ
     * (2026-10-10 ユーザー指摘「ユニット系マスなんか 900 超える時も開けようとしてる」)。上限で頭打ちの所属マスは経路として通るだけのマス
     */
    function unitRoleOf(holomenId: string, green: ReadonlySet<string>): boolean {
      const cells = [...green].filter((cell) => sharedAffiliation(holomenId, cell));
      if (cells.length === 0) return false;
      const totals = affiliationTotals(holomenId, green);
      return cells.some((cell) => {
        const effect = GREEN_NODE_BY_ID.get(cell)?.effect;
        if (effect?.kind !== "affiliation") return false;
        const a = affiliationEffectOf(holomenId, effect.slot);
        if (!a) return false;
        return memberAffiliationLists.some(
          (affs) =>
            affs.includes(a.affiliation) &&
            affs.reduce((sum, x) => sum + (totals.get(x) ?? 0), 0) - a.value <
              GREEN_AFFILIATION_CAP,
        );
      });
    }
    /**
     * 緑の形の決まり(ADR-027。2026-10-10 ユーザー指示「ユニットマスを開ける役割のあるホロメンは一直線上のマスのみ開けられる。十字の左右を
     * 開けない。ユニット系担当とそれ以外をわかりやすくするため」)。**緑を変えるホロメンだけ**この形にそろえる(緑を変えない人の登録は残す):
     * - 形 B(ユニット系担当)は縦一直線のマスだけ(`GREEN_TRUNK`)。ほかのマスは外す
     * - 形 A(それ以外)は 1 つ目の所属マスの手前の 7 マスまで(`GREEN_UPPER`)。`relaxed`(ほかを取り切ってまだ余るとき — `mayRelax`)なら
     *   その先も開けてよい(通る所属マスが効けば形 B になるので、効かない所属マスだけを経路にすることになる)
     */
    function alignedGreen(
      holomenId: string,
      green: ReadonlySet<string>,
      relaxed: boolean,
    ): Set<string> {
      let next = new Set(green);
      const keep: ReadonlySet<string> | null = unitRoleOf(holomenId, green)
        ? GREEN_TRUNK
        : relaxed
          ? null
          : GREEN_UPPER;
      if (keep === null) return next;
      for (const cell of [...green].sort(byId))
        if (next.has(cell) && !keep.has(cell)) next = greenGraphAll.lockNode(next, cell);
      return next;
    }
    /**
     * 緑のターゲットへの経路 `cells` を足したときの形のそろえ方: 外すマス(いまの集合のうち形に合わないもの)と、ゆるい決まりで取るか。
     * 経路のマスまで外れてしまう(形に合わない)ときは null
     */
    function shapeOf(
      holomenId: string,
      green: ReadonlySet<string>,
      cells: readonly string[],
    ): { remove: string[]; relaxed: boolean } | null {
      const after = new Set([...green, ...cells]);
      const removeOf = (kept: ReadonlySet<string>): string[] =>
        [...green].filter((cell) => !kept.has(cell));
      const strict = alignedGreen(holomenId, after, relaxedHolomen.has(holomenId));
      if (cells.every((cell) => strict.has(cell)))
        return { remove: removeOf(strict), relaxed: false };
      if (!allowRelax || !mayRelax(holomenId) || relaxedHolomen.has(holomenId)) return null;
      const loose = alignedGreen(holomenId, after, true);
      if (cells.every((cell) => loose.has(cell))) return { remove: removeOf(loose), relaxed: true };
      return null;
    }
    /** そのマスだけを外したときに失うスコア(盤面のつながりは見ない。効くかどうかの判定) */
    const lossCache = new Map<string, number>();
    const lossOfRemoving = (id: string, color: BoardColor, cell: string): number => {
      const key = `${String(version)}|${id}|${color}|${cell}`;
      const hit = lossCache.get(key);
      if (hit !== undefined) return hit;
      const s = sets.get(id);
      if (!s || !s[color].has(cell)) return 0;
      s[color].delete(cell);
      cache[id] = boardsOf(s);
      const loss = score - evaluate(cache);
      s[color].add(cell);
      cache[id] = boardsOf(s);
      lossCache.set(key, loss);
      return loss;
    };
    /**
     * ユニット外のホロメンから外してよいマス(ルール 2 — この編成に効かないマスだけ): 赤・青の全部、曲に効かない黄、報酬のマス、
     * メンバーの所属に効かない所属マス、それと上限で頭打ちになって外してもスコアが下がらないマス(所属向けの +900 を超えた所属マス・
     * 楽曲スコアボーナスの 10.0% を超えた黄)。全員・パラメータの緑は誰が持っていても効くので外さない
     */
    const removable = (id: string, color: BoardColor, cell: string): boolean => {
      if (ineffectiveFor(id, color, cell)) return true;
      if (color === "yellow") return lossOfRemoving(id, color, cell) <= 0;
      if (color !== "green") return false;
      const effect = GREEN_NODE_BY_ID.get(cell)?.effect;
      if (effect?.kind !== "affiliation") return false;
      return !sharedAffiliation(id, cell) || lossOfRemoving(id, color, cell) <= 0;
    };
    /**
     * 外したマスの資材を総量に静的に入れてあるか(赤・青・曲に効かない黄は報酬のマスも含めて `recoverableExtended` に入れてある)。
     * ほか(緑・上限を超えた黄)は外したときに戻す
     */
    const counted = (id: string, color: BoardColor, cell: string): boolean =>
      color !== "green" && ineffectiveFor(id, color, cell);

    const relevant = (id: string, color: BoardColor): boolean => {
      if (extendedSet.has(id)) return color === "green" || color === "yellow";
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
    /**
     * ユニット外のホロメンで Pt が `need` 足りないとき、外してよいマス(`removable`)を端から(Pt の大きいものから)外して空ける
     * (配置のあるコネクトへの経路は残す)。空けられなければ null
     */
    function reclaimFor(holomenId: string, s: Sets, need: number): Reclaim | null {
      const work = cloneSets(s);
      const mandatory = mandatorySets(placedOf(holomenId), []);
      const removed: Reclaim = {};
      let freed = 0;
      while (freed < need) {
        let best: { color: BoardColor; cell: string; points: number } | null = null;
        for (const color of BOARD_STATE_COLORS) {
          const graph = boardGraphOf(color);
          for (const cell of work[color]) {
            if (!removable(holomenId, color, cell)) continue;
            const after = graph.lockNode(work[color], cell);
            if (after.size !== work[color].size - 1) continue;
            if (![...mandatory[color]].every((m) => after.has(m))) continue;
            const points = graph.cellPoints(cell);
            if (
              best === null ||
              points > best.points ||
              (points === best.points && byId(cell, best.cell) < 0)
            )
              best = { color, cell, points };
          }
        }
        if (best === null) return null;
        work[best.color].delete(best.cell);
        (removed[best.color] ??= []).push(best.cell);
        freed += best.points;
      }
      return removed;
    }
    const applyReclaim = (s: Sets, reclaim: Reclaim | undefined, undo: boolean): void => {
      if (!reclaim) return;
      for (const color of BOARD_STATE_COLORS)
        for (const cell of reclaim[color] ?? [])
          if (undo) s[color].add(cell);
          else s[color].delete(cell);
    };

    /** そのターゲットを取る解放プランを、確定せずに測る。取れない・効かない・予算(Pt・共有の資材)に収まらないときは null */
    /**
     * 直前の `measure` が null を返した理由が「伸びが 0(効かない)」以外か: Pt・資材が足りない経路があった、または伸びはあるが
     * 新しく触る手間に届かなかった。どちらもほかの確定・取り崩しで取れるようになりうるので、次の周も測り直す(`waiting`)
     */
    let roomBlocked = false;
    function measure(c: Candidate): Measured | null {
      roomBlocked = false;
      const s = sets.get(c.holomenId);
      if (!s) return null;
      const room = c.color === "green" ? greenRoom(c.holomenId, c.id) : avail[c.color];
      let best: Measured | null = null;
      for (const route of routesFor(c.color, s[c.color], c.id)) {
        if (route.cells.length === 0) continue;
        // 緑は形の決まりにそろえる(形に合わないいまのマスは外し、その資材と Pt はこの経路に回る)
        let align: string[] = [];
        let relaxed = false;
        if (c.color === "green") {
          const shape = shapeOf(c.holomenId, s.green, route.cells);
          if (shape === null) continue;
          align = shape.remove;
          relaxed = shape.relaxed;
        }
        let freedCube = 0;
        let freedCore = 0;
        let freedPoints = 0;
        for (const cell of align) {
          const m = greenGraphAll.cellMaterials(cell);
          freedCube += m.cube;
          freedCore += m.core;
          freedPoints += greenGraphAll.cellPoints(cell);
        }
        if (
          !routeFits({ ...route, cube: route.cube - freedCube, core: route.core - freedCore }, room)
        ) {
          roomBlocked = true;
          continue;
        }
        const need = route.points - freedPoints - remaining(c.holomenId);
        let reclaim: Reclaim | undefined = align.length > 0 ? { green: align } : undefined;
        if (need > 0) {
          if (!extendedSet.has(c.holomenId)) continue;
          applyReclaim(s, reclaim, false);
          const r = reclaimFor(c.holomenId, s, need);
          applyReclaim(s, reclaim, true);
          if (!r) continue;
          reclaim = { ...r, green: [...align, ...(r.green ?? [])] };
        }
        applyReclaim(s, reclaim, false);
        for (const cell of route.cells) s[c.color].add(cell);
        cache[c.holomenId] = boardsOf(s);
        const value = evaluate(cache);
        // 所属マスはそのマス自体が効くときだけ(所属向けの上限 +900 に達した所属マスを、経路の全員のマスを口実に開けない)。
        // 全員・パラメータのマスは開ければ必ずステータスが上がるので確かめない
        let targetGain = 1;
        if (c.color === "green" && GREEN_NODE_BY_ID.get(c.id)?.effect.kind === "affiliation") {
          s[c.color].delete(c.id);
          cache[c.holomenId] = boardsOf(s);
          targetGain = value - evaluate(cache);
          s[c.color].add(c.id);
        }
        for (const cell of route.cells) s[c.color].delete(cell);
        applyReclaim(s, reclaim, true);
        cache[c.holomenId] = boardsOf(s);
        // 新しく触るユニット外のホロメンは、伸びから手間を差し引く(ルール 3)
        const gain =
          value - score - touchCostOf(c.holomenId, c.color === "green" || !!reclaim?.green?.length);
        if (gain <= 0 && value - score > 0) roomBlocked = true;
        if (gain <= 0 || targetGain <= 0) continue;
        const cost = ordering === "scarce" ? scarcity(c.holomenId, c.color, route) : route.points;
        const key = ordering === "gain" ? gain : gain / cost;
        const bestKey =
          best === null ? -Infinity : ordering === "gain" ? best.gain : best.gain / best.cost;
        if (key > bestKey)
          best = {
            gain,
            cost,
            route,
            ...(reclaim ? { reclaim } : {}),
            ...(relaxed ? { relaxed: true as const } : {}),
          };
      }
      return best;
    }
    function commit(c: Candidate): void {
      const s = sets.get(c.holomenId);
      if (!s) return;
      if (c.reclaim) {
        // 外したマスの資材: 総量に静的に入れてあるもの(赤・青・曲に効かない黄)は戻さず、二重に数えない記録だけ残す。ほかは戻す
        for (const color of BOARD_STATE_COLORS)
          for (const cell of c.reclaim[color] ?? []) {
            const m = boardGraphOf(color).cellMaterials(cell);
            const target = counted(c.holomenId, color, cell) ? reclaimed[color] : avail[color];
            target.cube += m.cube;
            target.core += m.core;
          }
        applyReclaim(s, c.reclaim, false);
      }
      for (const cell of c.route.cells) s[c.color].add(cell);
      spent.set(c.holomenId, pointsOf(s));
      avail[c.color].cube -= c.route.cube;
      avail[c.color].core -= c.route.core;
      cache[c.holomenId] = boardsOf(s);
      score = evaluate(cache);
      if (!unit.has(c.holomenId) && (c.color === "green" || !!c.reclaim?.green?.length))
        touched.add(c.holomenId);
      if (c.relaxed) relaxedHolomen.add(c.holomenId);
    }
    const priority = (c: Candidate): number => (ordering === "gain" ? c.gain : c.gain / c.cost);
    /**
     * 順位は効率だけ(ルール 1)。例外は最小限のリーダー・メンバーの緑で、赤・青・黄とユニット外の緑のあとに残った Pt で、効率順に開ける
     * (2026-10-09 ユーザー指示「最小限でリーダーとメンバーは緑は開けないで済むなら開けない」。2026-10-10「十字までというのも本質ではない。
     * 余った Pt があるなら Pt やキューブあたりの伸びで緑を埋める」)
     */
    const tier = (c: Candidate): number =>
      c.relaxed
        ? 3
        : scope !== "minimal" || c.color !== "green"
          ? 0
          : unit.has(c.holomenId)
            ? 2
            : 1;
    const compare = (a: Candidate, b: Candidate): number =>
      tier(a) - tier(b) ||
      priority(b) - priority(a) ||
      b.gain - a.gain ||
      (order.get(a.holomenId) ?? 0) - (order.get(b.holomenId) ?? 0) ||
      byId(a.color, b.color) ||
      byId(a.id, b.id);

    /**
     * ユニット外の緑の取り崩し: いまの集合から外してよい緑(`removable`)を、その先のマスごと外した集合(外すものがなければ null)。
     * 先のマスは中心から切れるので一緒に外れる(巻き込み。全員・パラメータのマスも — 2026-10-10 ユーザー判断「まきこみをみとめる」)。
     * 巻き込んだマスの損は、取り崩しが報われたかの判定で差し引かれる
     */
    const greenGraph = boardGraphOf("green");
    function releaseOf(holomenId: string): Set<string> | null {
      const before = sets.get(holomenId)?.green;
      if (!before) return null;
      const mandatory = mandatorySets(placedOf(holomenId), []).green;
      let next: Set<string> = new Set(before);
      for (const cell of [...before].sort(byId)) {
        if (!next.has(cell) || !removable(holomenId, "green", cell)) continue;
        const after = greenGraph.lockNode(next, cell);
        if ([...mandatory].every((c) => after.has(c))) next = after;
      }
      if (next.size === before.size) return null;
      // 緑を変えるので形の決まりにそろえる(取り崩しで巻き込む損と同じく、報われたかの判定で差し引かれる)
      return alignedGreen(holomenId, next, relaxedHolomen.has(holomenId));
    }
    const freedOf = (
      before: ReadonlySet<string>,
      after: ReadonlySet<string>,
    ): BoardMaterialCost => {
      const a = greenGraph.unlockedMaterials(before);
      const z = greenGraph.unlockedMaterials(after);
      return { cube: a.cube - z.cube, core: a.core - z.core };
    };
    /**
     * 取り崩す順: 空く資材が多い人 → 外して失うスコアが小さい人 → 依頼の順。外すホロメンの数を最小にする。
     * 取り崩せるのはユニット外のホロメン(最小限は登録から足すだけの人、全整理はユニット外の全員)
     */
    const ladder: string[] = [];
    if (limitedColor("green")) {
      const ranked: { holomenId: string; freed: number; loss: number }[] = [];
      for (const holomenId of extended) {
        const next = releaseOf(holomenId);
        const s = sets.get(holomenId);
        if (!next || !s) continue;
        const freed = freedOf(s.green, next);
        const before = s.green;
        s.green = next;
        cache[holomenId] = boardsOf(s);
        const loss = score - evaluate(cache);
        s.green = before;
        cache[holomenId] = boardsOf(s);
        ranked.push({ holomenId, freed: freed.cube + freed.core, loss });
      }
      ranked.sort(
        (a, b) =>
          b.freed - a.freed ||
          a.loss - b.loss ||
          (order.get(a.holomenId) ?? 0) - (order.get(b.holomenId) ?? 0),
      );
      for (const r of ranked) ladder.push(r.holomenId);
    }
    interface Snapshot {
      touched: Set<string>;
      relaxed: Set<string>;
      sets: Map<string, Sets>;
      spent: Map<string, number>;
      avail: Avail;
      cache: Record<string, HolomenBoards>;
      score: number;
      reclaimed: BoardMaterials;
    }
    const snapshot = (): Snapshot => ({
      touched: new Set(touched),
      relaxed: new Set(relaxedHolomen),
      reclaimed: {
        red: { ...reclaimed.red },
        blue: { ...reclaimed.blue },
        yellow: { ...reclaimed.yellow },
        green: { ...reclaimed.green },
      },
      sets: new Map([...sets].map(([id, s]) => [id, cloneSets(s)])),
      spent: new Map(spent),
      avail: {
        red: { ...avail.red },
        blue: { ...avail.blue },
        yellow: { ...avail.yellow },
        green: { ...avail.green },
      },
      cache: { ...cache },
      score,
    });
    function restore(snap: Snapshot): void {
      sets.clear();
      for (const [id, s] of snap.sets) sets.set(id, s);
      spent.clear();
      for (const [id, p] of snap.spent) spent.set(id, p);
      for (const color of BOARD_STATE_COLORS) {
        avail[color].cube = snap.avail[color].cube;
        avail[color].core = snap.avail[color].core;
      }
      for (const id of Object.keys(cache)) delete cache[id];
      Object.assign(cache, snap.cache);
      for (const color of BOARD_STATE_COLORS) {
        reclaimed[color].cube = snap.reclaimed[color].cube;
        reclaimed[color].core = snap.reclaimed[color].core;
      }
      score = snap.score;
      touched.clear();
      for (const id of snap.touched) touched.add(id);
      relaxedHolomen.clear();
      for (const id of snap.relaxed) relaxedHolomen.add(id);
      version += 1;
    }
    /** 取り崩しを確定する(外して失うスコアはここで下がる。報われなければ呼び出し側が `restore` で戻す) */
    function release(holomenId: string): boolean {
      const s = sets.get(holomenId);
      const next = releaseOf(holomenId);
      if (!s || !next) return false;
      const freed = freedOf(s.green, next);
      s.green = next;
      avail.green.cube += freed.cube;
      avail.green.core += freed.core;
      spent.set(holomenId, pointsOf(s));
      cache[holomenId] = boardsOf(s);
      score = evaluate(cache);
      version += 1;
      touched.add(holomenId);
      return true;
    }
    /** 直前の取り崩し(まだ報われたか分からないもの)の戻し先と、その取り崩しで新しく触ったホロメンの手間 */
    let pending: Snapshot | null = null;
    let pendingCost = 0;

    /**
     * 2 周目からは測り直す候補を絞る(値は変えずに速くする — ADR-018)。周の終わりには待ち行列が空で、どの候補も取ったか取れなかったかの
     * どちらか。取れなかったものが取れるようになるのは (a) そのホロメンの盤面・Pt が変わった(確定・取り崩し)、(b) Pt・資材が足りないか
     * 手間に届かずに見送った(`waiting`)、(c) 取り崩しで所属向けの合計が減り、頭打ちだった所属マスが効くようになった、のどれか。
     * 伸びが 0 で見送ったマス(この編成に効かない・上限で頭打ち)は、確定では効くようにならない(上限へ近づくだけ)。
     * 取り崩した周のあとは (a)(b) と緑の所属マス全部、そのほかは (a) と (b) だけを測る
     */
    let fullScan = true;
    let greenScan = false;
    const dirty = new Set<string>();
    const waiting = new Set<string>();
    const keyOf = (holomenId: string, color: BoardColor, id: string): string =>
      `${holomenId}|${color}|${id}`;
    const noteMeasured = (c: Candidate, m: Measured | null): void => {
      const key = keyOf(c.holomenId, c.color, c.id);
      if (m === null && roomBlocked) waiting.add(key);
      else waiting.delete(key);
    };
    function greedy(): void {
      for (let pass = 0; pass < 64; pass += 1) {
        let queue: Candidate[] = [];
        const rescan = new Set(dirty);
        const scanAll = fullScan;
        const scanGreen = greenScan;
        dirty.clear();
        fullScan = false;
        greenScan = false;
        for (const holomenId of modifiable) {
          for (const color of BOARD_STATE_COLORS) {
            if (!relevant(holomenId, color)) continue;
            const wide = scanAll || rescan.has(holomenId);
            for (const id of NODE_IDS[color]) {
              if (color === "blue" && isFrequencyNode(id)) continue; // 新しい頻度マスは開けない(頻度の段の担当)
              if (NO_SCORE_EFFECT.has(`${color}/${id}`)) continue;
              if (extendedSet.has(holomenId) && !extendedTarget(holomenId, color, id)) continue;
              if (sets.get(holomenId)?.[color].has(id)) continue;
              if (
                !wide &&
                !waiting.has(keyOf(holomenId, color, id)) &&
                !(
                  scanGreen &&
                  color === "green" &&
                  GREEN_NODE_BY_ID.get(id)?.effect.kind === "affiliation"
                )
              )
                continue;
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
              noteMeasured(candidate, m);
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
            noteMeasured(top, m);
            if (!m) {
              queue = queue.slice(1);
              continue;
            }
            top.gain = m.gain;
            top.cost = m.cost;
            top.route = m.route;
            // 外すマスも測り直した値にする(古いままだと、前の確定ですでに外したマスを外したつもりになり、Pt が予算を超える)
            if (m.reclaim) top.reclaim = m.reclaim;
            else delete top.reclaim;
            if (m.relaxed) top.relaxed = true;
            else delete top.relaxed;
            top.version = version;
            queue.sort(compare);
            continue;
          }
          commit(top);
          version += 1;
          accepted = true;
          dirty.add(top.holomenId);
          queue = queue.slice(1);
        }
        if (accepted) continue;
        // 取れるものがなくなった: 直前の取り崩しが報われていなければ(スコアが取り崩す前以下)戻して終わり。報われていれば次の 1 人を試す
        if (pending !== null) {
          if (score - pending.score <= pendingCost) {
            restore(pending);
            pending = null;
            break;
          }
          pending = null;
        }
        let released = false;
        while (!released) {
          const next = ladder.shift();
          if (next === undefined) break;
          const snap = snapshot();
          const cost = touchCostOf(next);
          if (release(next)) {
            pending = snap;
            pendingCost = cost;
            released = true;
            dirty.add(next);
            greenScan = true;
          }
        }
        if (!released) break;
      }
      if (pending !== null && score - pending.score <= pendingCost) restore(pending);
      pending = null;
    }
    greedy();

    // 変更量を最小にする: 整合した登録から出発できるホロメンは、スコアに効かず選ばれなかった登録済みのマスを、Pt と共有の資材の残りが
    // 許す限り戻す(マスを足してもスコアは下がらない。ゼロから選び直した結果で、登録済みのマスが理由なく消えるのを避ける。頻度マスは戻さない)。
    // 取り置きはここで解く
    reserving = false;
    for (const id of modifiable) {
      const s = sets.get(id);
      if (!s || !eligible.has(id)) continue;
      restoreCurrent(s, setsOf(baseOf(id)), budgetOf(ranks, id), avail, limitedColor);
      spent.set(id, pointsOf(s));
      cache[id] = boardsOf(s);
    }
    // 戻した登録の所属マスで、途中で開けた所属マスが上限 +900 を超えて効かなくなることがある(ゼロから組み直したメンバーの所属マスを戻すと、
    // その間にほかの人が開けた同じ所属のマスが余る)。緑が登録と違う人を形の決まりにそろえ直し、最小限オンのユニット外で効く所属マスが
    // 残らない人は、新しく開けたマスを取り消す(最小限のユニット外は効く所属マスのためにだけ変える)。そろえると効き方が変わりうるので 2 回
    // 新しく開けたユニット外を先に見る(同じ所属のマスが余ったら、登録のマスより新しく開けたマスを取り消す)
    const alignOrder = [
      ...modifiable.filter((id) => extendedSet.has(id)),
      ...modifiable.filter((id) => !extendedSet.has(id)),
    ];
    for (let round = 0; round < 2; round += 1)
      for (const id of alignOrder) {
        const s = sets.get(id);
        if (!s) continue;
        const baseGreen = setsOf(baseOf(id)).green;
        if (s.green.size === baseGreen.size && [...s.green].every((c) => baseGreen.has(c)))
          continue;
        let next = alignedGreen(id, s.green, relaxedHolomen.has(id));
        if (scope === "minimal" && extendedSet.has(id) && !unitRoleOf(id, next))
          for (const cell of [...next].sort(byId))
            if (next.has(cell) && !baseGreen.has(cell)) next = greenGraphAll.lockNode(next, cell);
        if (next.size === s.green.size) continue;
        const freed = freedOf(s.green, next);
        s.green = next;
        avail.green.cube += freed.cube;
        avail.green.core += freed.core;
        spent.set(id, pointsOf(s));
        cache[id] = boardsOf(s);
      }
    score = evaluate(cache);
    version += 1;
    // そろえ直して空いた Pt・資材で、もう 1 周開ける(同じ決まり・順位で。形 A の人が手前の 7 マスより先を開けるのはこの周だけ)
    allowRelax = true;
    fullScan = true;
    greedy();
    const changedOutside = modifiable.filter(
      (id) => !unit.has(id) && greenChanged(cache[id], id),
    ).length;
    return { sets, score, reclaimed, changedOutside };
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
  // 出発点どうしは、変えたユニット外のホロメンの手間を差し引いて比べる(ルール 3)
  const worth = (r: Run): number => r.score - touchCost * r.changedOutside;
  let best: Run | undefined = runs[0];
  for (const r of runs) if (best === undefined || worth(r) > worth(best)) best = r;

  interface Picked {
    boards: Record<string, HolomenBoards>;
    changed: string[];
  }
  /** 登録(`currentOf`)と違うホロメンだけを集める。制約を破る結果は返さない(起きない想定の安全弁) */
  function collect(next: (id: string) => HolomenBoards | null): Picked {
    const picked: Picked = { boards: {}, changed: [] };
    for (const id of modifiable) {
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
  /** 選んだ結果(登録済みのマスの足し戻しは `run` の中で済んでいる) */
  const pickBest = (chosen: Run): Picked =>
    collect((id) => boardsOf(chosen.sets.get(id) ?? setsOf(emptyHolomenBoards())));
  /** 安全弁: 共有の資材が総量を超える結果は使わない(起きない想定。出発点・候補・足し戻しの各段で守っている) */
  const withinPool = (picked: Picked): boolean => {
    const chosen = { ...initial, ...picked.boards };
    return withinMaterialLimits(
      spentBoardMaterials(
        Object.fromEntries(modifiable.map((id) => [id, chosen[id] ?? baseOf(id)])),
      ),
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
