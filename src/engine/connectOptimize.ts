import { holomenById } from "../data";
import { CONNECT_ANCHORS, connectTargets } from "../data/connect";
import type { ConnectAnchor, ConnectPlacement } from "../data/connect";
import { GREEN_BOARD_NODES } from "../data/greenBoard";
import { RED_BOARD_NODES } from "../data/redBoard";
import { YELLOW_BOARD_NODES } from "../data/yellowBoard";
import type { BoardColor } from "../storage/boards";
import type { ConnectPlacementMap } from "../storage/connect";

/**
 * コネクトの最適化(2026-10-02 ユーザー指示。結果詳細・ユニット詳細の下端の左「コネクトの最適化」)。
 *
 * 自分が持っているコネクト(形 × ％ × 枚数。`src/storage/connectInventory.ts`)を、ホロメンごと・コネクトマス 4 か所へどう置くと
 * **その編成のユニットスコアが最大になるか**を選ぶ。基準にするボード・開花・アカウント補正は発動頻度の最適化と同じく**登録している状態**
 * (探索のオプションの「考慮する / しない」に関わらない)で、いま置いている配置は見ずに全部置き直してよい。
 * スコアの評価は呼び出し側が渡す(`evaluate` — `request.ts` の `teamEvaluator`。6 枠固定の依頼と同じ経路)ので、
 * ここは「どの配置を選ぶか」だけを持つ純粋な部分。
 *
 * - 1 枚は 1 か所にしか置けない(枚数の上限)。1 つのコネクトマスには 1 枚。
 * - 選び方は**遅延評価の貪欲法**: 最初に「空の状態から 1 枚だけ置いたときの増分」を全部の(置き場所 × コネクト)で測り、
 *   増分の大きい順に取り出して、置く直前にいまの状態での増分を測り直し、まだ先頭なら置く(先頭でなくなれば入れ直す)。
 *   同じマスに複数の範囲が掛かるときは増分の加算(`combineConnectPermils`)なので、増分はほぼ独立で、測り直しはまれ。
 *   近似であり、枚数が足りないときの最適な割り当て(どの枚をどこへ)を保証するものではない
 * - 試さない組合せ: 解放済みのマスに 1 つも掛からない、スコアに効かないマス(報酬・ライフ・ホロメンスキル・ホロワーク報酬)にしか
 *   掛からない、効かない色(青はそのホロメンが編成にメンバーでいるときだけ、赤はリーダーのときだけ、黄は曲を指定したときだけ。
 *   緑は常に)にしか掛からない。増幅の増分が 0 以下の置き方は置かない。
 */

export type UnlockedByColor = Readonly<
  Record<BoardColor, ReadonlyMap<string, ReadonlySet<string>>>
>;

/** 所持しているコネクト 1 種(形 × ％)と、その枚数 */
export interface ConnectItem {
  placement: ConnectPlacement;
  count: number;
}

/** スコアに効かない効果のマス(報酬・獲得量・ライフ・ホロメンスキル・ホロワーク報酬)。増幅しても値が変わらないので範囲に数えない */
const NO_SCORE_EFFECT = new Set<string>([
  ...GREEN_BOARD_NODES.filter((n) => n.effect.kind === "reward").map((n) => `green/${n.id}`),
  ...RED_BOARD_NODES.filter((n) =>
    ["life", "liveReward", "leaderSkill"].includes(n.effect.kind),
  ).map((n) => `red/${n.id}`),
  ...YELLOW_BOARD_NODES.filter((n) => n.effect.kind === "workReward").map((n) => `yellow/${n.id}`),
]);

export interface AssignConnectsInput {
  /** 所持のコネクト(枚数 0 のものは無視する) */
  items: readonly ConnectItem[];
  /** 対象の編成のホロメン(リーダーとメンバー) */
  leaderHolomenId: string;
  memberHolomenIds: readonly string[];
  /** 曲を指定しているか(黄の楽曲スコアボーナスは曲があるときだけ効く) */
  hasSong: boolean;
  /** 色ごとの解放済みマス(ホロメン ID → マス ID の集合)。登録している状態 */
  unlocked: UnlockedByColor;
  /** 置き場所の候補にするホロメン(全ホロメン。編成にいるホロメンを先に並べると同点のとき先に選ばれる) */
  holomenIds: readonly string[];
  /** 配置を渡して、その編成の調整後ユニットスコアを返す。呼び出し側が実際の探索と同じ評価経路で計算する */
  evaluate: (placements: ConnectPlacementMap) => number;
}

interface Move {
  holomenId: string;
  anchor: ConnectAnchor;
  item: number;
  /** 増分(測った時点の状態で) */
  gain: number;
  /** 測った時点の「置いた枚数」。いまと違えば測り直す */
  version: number;
}

/** 置き場所(ホロメン × コネクトマス)の識別子 */
const slotKey = (holomenId: string, anchor: ConnectAnchor): string => `${holomenId}/${anchor}`;

/**
 * 所持のコネクトを置く場所と組合せを選ぶ(上の説明)。何も置かなければ空の配置を返す。
 * 返す配置の形は `ConnectPlacementMap`(ホロメン ID → コネクトマス → 形と ‰)で、登録している配置と同じなので並べて比べられる
 */
export function assignConnects(input: AssignConnectsInput): ConnectPlacementMap {
  const { leaderHolomenId, memberHolomenIds, hasSong, unlocked, holomenIds, evaluate } = input;
  const items = input.items.filter((i) => i.count > 0 && i.placement.permil > 0);
  const placements: ConnectPlacementMap = {};
  if (items.length === 0) return placements;

  const remaining = items.map((i) => i.count);
  const used = new Set<string>();
  const members = new Set(memberHolomenIds);

  const relevantColor = (color: BoardColor, holomenId: string): boolean => {
    if (color === "blue") return members.has(holomenId);
    if (color === "red") return holomenId === leaderHolomenId;
    if (color === "yellow") return hasSong;
    return true;
  };

  const set = (
    holomenId: string,
    anchor: ConnectAnchor,
    placement: ConnectPlacement | null,
  ): void => {
    const entry = (placements[holomenId] ??= {});
    if (placement === null) delete entry[anchor];
    else entry[anchor] = { ...placement };
    if (Object.keys(entry).length === 0) delete placements[holomenId];
  };
  const trial = (m: Move): number => {
    const item = items[m.item];
    if (!item) return 0;
    set(m.holomenId, m.anchor, item.placement);
    const value = evaluate(placements);
    set(m.holomenId, m.anchor, null);
    return value;
  };

  let score = evaluate(placements);
  let version = 0;

  // 置き場所 × コネクトの全部を、空の状態から 1 枚だけ置いたときの増分で測る
  let moves: Move[] = [];
  for (const holomenId of holomenIds) {
    const layout = holomenById.get(holomenId)?.board;
    if (!layout) continue;
    for (const anchor of CONNECT_ANCHORS) {
      items.forEach((item, index) => {
        const hit = connectTargets(layout, anchor, item.placement.extent).some(
          (t) =>
            unlocked[t.color].get(holomenId)?.has(t.nodeId) === true &&
            !NO_SCORE_EFFECT.has(`${t.color}/${t.nodeId}`) &&
            relevantColor(t.color, holomenId),
        );
        if (!hit) return;
        const move: Move = { holomenId, anchor, item: index, gain: 0, version };
        move.gain = trial(move) - score;
        if (move.gain > 0) moves.push(move);
      });
    }
  }

  // 増分の大きい順に取り出し、置く直前に測り直す(遅延評価)
  const byGain = (a: Move, b: Move): number => b.gain - a.gain;
  moves.sort(byGain);
  while (moves.length > 0) {
    const m = moves[0];
    if (!m) break;
    if ((remaining[m.item] ?? 0) <= 0 || used.has(slotKey(m.holomenId, m.anchor))) {
      moves = moves.slice(1);
      continue;
    }
    if (m.version !== version) {
      m.gain = trial(m) - score;
      m.version = version;
      if (m.gain <= 0) moves = moves.slice(1);
      else moves.sort(byGain);
      continue;
    }
    const item = items[m.item];
    if (!item) break;
    set(m.holomenId, m.anchor, item.placement);
    score += m.gain;
    remaining[m.item] = (remaining[m.item] ?? 0) - 1;
    used.add(slotKey(m.holomenId, m.anchor));
    version += 1;
    moves = moves.slice(1);
  }
  return placements;
}
