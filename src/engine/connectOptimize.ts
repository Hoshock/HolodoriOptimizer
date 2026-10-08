import { holomenById } from "../data";
import { CONNECT_ANCHORS, connectTargets } from "../data/connect";
import type { ConnectAnchor, ConnectPlacement } from "../data/connect";
import { GREEN_BOARD_NODES } from "../data/greenBoard";
import { RED_BOARD_NODES } from "../data/redBoard";
import { YELLOW_BOARD_NODES } from "../data/yellowBoard";
import type { BoardColor } from "../storage/boards";
import type { ConnectPlacementMap } from "../storage/connect";

/**
 * コネクトの最適化(2026-10-02 ユーザー指示。いまは結果詳細・ユニット詳細の下端の「最適化」の中の段)。
 *
 * 自分が持っているコネクト(形 × ％ × 枚数。`src/storage/connectInventory.ts`)の範囲で、**いま置いている配置から出発して**、
 * その編成のユニットスコアが**厳密に上がる変更だけ**を重ねる。**変更量を最小にする**のが方針(ユーザー指示):
 * 置いても置かなくても結果が変わらない場所は、いま置いているものをそのまま残す(外さない・置き換えない)。
 * 出発点が現在の配置なので、返す配置のスコアは現在以上になる(下回ることはない)。
 * スコアの評価は呼び出し側が渡す(`evaluate` — `request.ts` の `createTeamScorer`。6 枠固定の依頼と同じ値になる)。
 *
 * 変更する範囲は 2 通り(`scope`):
 * - `unit`(既定): **リーダーとメンバーのホロメン**の 4 か所だけを変える。ユニット外のホロメンの配置はそのままだが、
 *   ユニットがそのコネクトを必要とし、手持ちの枚数が足りないときだけ、ユニット外が使っているものを**外して**回す
 *   (ユーザー指示「ユニット外で使われているコネクトが必要なのであれば、その変更は含んでよい」)
 * - `all`: 全ホロメンの全コネクトマスを変えてよい(緑・黄はアカウント全体に効くので、ユニット外の置き方でもスコアが動く)
 *
 * 選び方は**遅延評価の貪欲法**: 変更先の候補(置き場所 × コネクトの種類)ごとに「そこへ 1 枚置いたときの増分」を測り、
 * 増分の大きい順に取り出して、置く直前に測り直し、まだ先頭なら置く。手持ちの枚数が足りないときは、そのコネクトを
 * 置いている場所のうち**外して失うスコアが最も小さい 1 か所**から回す(外す側も変更に数える)。近似であり、最大を保証しない。
 *
 * 試さない候補: 解放していないコネクトマス(中心以外。`unlockedConnects`)、解放済みのマスに 1 つも掛からない、スコアに効かないマス(報酬・ライフ・ホロメンスキル・ホロワーク報酬)にしか
 * 掛からない、効かない色(青はそのホロメンが編成にメンバーでいるときだけ、赤はリーダーのときだけ、黄は曲を指定したときだけ。
 * 緑は常に)にしか掛からない場所。
 */

export type UnlockedByColor = Readonly<
  Record<BoardColor, ReadonlyMap<string, ReadonlySet<string>>>
>;

/** 所持しているコネクト 1 種(形 × ％)と、その枚数 */
export interface ConnectItem {
  placement: ConnectPlacement;
  count: number;
}

/** 変更してよい範囲: ユニット(リーダーとメンバー)だけ / 全ホロメン */
export type ConnectScope = "unit" | "all";

/** スコアに効かない効果のマス(報酬・獲得量・ライフ・ホロメンスキル・ホロワーク報酬)。増幅しても値が変わらないので範囲に数えない */
export const NO_SCORE_EFFECT = new Set<string>([
  ...GREEN_BOARD_NODES.filter((n) => n.effect.kind === "reward").map((n) => `green/${n.id}`),
  ...RED_BOARD_NODES.filter((n) =>
    ["life", "liveReward", "leaderSkill"].includes(n.effect.kind),
  ).map((n) => `red/${n.id}`),
  ...YELLOW_BOARD_NODES.filter((n) => n.effect.kind === "workReward").map((n) => `yellow/${n.id}`),
]);

export interface AssignConnectsInput {
  /** 所持のコネクト(枚数 0 のものは無視する) */
  items: readonly ConnectItem[];
  /** いまボードに置いている配置(全ホロメン)。所持の枚数に収まっている前提(呼び出し側が先に確かめる) */
  current: ConnectPlacementMap;
  scope: ConnectScope;
  /** 対象の編成のホロメン(リーダーとメンバー) */
  leaderHolomenId: string;
  memberHolomenIds: readonly string[];
  /** 曲を指定しているか(黄の楽曲スコアボーナスは曲があるときだけ効く) */
  hasSong: boolean;
  /** 色ごとの解放済みマス(ホロメン ID → マス ID の集合)。登録している状態 */
  unlocked: UnlockedByColor;
  /** 置き場所の候補にするホロメン(全ホロメン) */
  holomenIds: readonly string[];
  /**
   * ホロメン ID → 解放済みのコネクトマス(赤 / 青 / 黄)。**解放していないコネクトマスには置かない**(2026-10-04 ユーザー指示。
   * 解放は効果の配置とは別の状態)。中心は常に解放済み。省略は「どのコネクトマスにも置ける」(旧来の呼び方)
   */
  unlockedConnects?: Readonly<Record<string, readonly ConnectAnchor[]>>;
  /** 配置を渡して、その編成の調整後ユニットスコアを返す。呼び出し側が実際の探索と同じ評価経路で計算する */
  evaluate: (placements: ConnectPlacementMap) => number;
}

/** 置き場所(ホロメン × コネクトマス) */
interface Slot {
  holomenId: string;
  anchor: ConnectAnchor;
}
const slotKey = (s: Slot): string => `${s.holomenId}/${s.anchor}`;
const typeKey = (p: ConnectPlacement): string => `${p.extent}/${String(p.permil)}`;

interface Move {
  slot: Slot;
  /** 置くコネクトの種類(`types` の添字) */
  type: number;
  /** 増分(測った時点の状態で) */
  gain: number;
  /** 測った時点の「確定した変更の数」。いまと違えば測り直す */
  version: number;
}

/**
 * いまの配置から、ユニットスコアが上がる変更だけを重ねた配置を返す(上の説明)。変えるものがなければ現在の配置そのまま。
 * 返す配置の形は `ConnectPlacementMap`(ホロメン ID → コネクトマス → 形と ‰)で、登録している配置と同じなので並べて比べられる
 */
export function assignConnects(input: AssignConnectsInput): ConnectPlacementMap {
  const { scope, leaderHolomenId, memberHolomenIds, hasSong, unlocked, holomenIds, evaluate } =
    input;
  const types = input.items.filter((i) => i.count > 0 && i.placement.permil > 0);
  const state: ConnectPlacementMap = {};
  for (const [holomenId, anchors] of Object.entries(input.current)) {
    for (const anchor of CONNECT_ANCHORS) {
      const p = anchors[anchor];
      if (p) (state[holomenId] ??= {})[anchor] = { ...p };
    }
  }
  const unit = new Set([leaderHolomenId, ...memberHolomenIds]);
  const members = new Set(memberHolomenIds);

  const get = (s: Slot): ConnectPlacement | null => state[s.holomenId]?.[s.anchor] ?? null;
  const set = (s: Slot, placement: ConnectPlacement | null): void => {
    const entry = (state[s.holomenId] ??= {});
    if (placement === null) delete entry[s.anchor];
    else entry[s.anchor] = { ...placement };
    if (Object.keys(entry).length === 0) delete state[s.holomenId];
  };
  /** いまの配置で、その種類を置いている場所 */
  const holdersOf = (t: ConnectPlacement): Slot[] => {
    const out: Slot[] = [];
    for (const holomenId of holomenIds) {
      for (const anchor of CONNECT_ANCHORS) {
        const p = state[holomenId]?.[anchor];
        if (p && typeKey(p) === typeKey(t)) out.push({ holomenId, anchor });
      }
    }
    return out;
  };
  /** その種類の空き枚数(持っている枚数 − 置いている枚数) */
  const free = (t: ConnectPlacement, owned: number): number => owned - holdersOf(t).length;

  const relevantColor = (color: BoardColor, holomenId: string): boolean => {
    if (color === "blue") return members.has(holomenId);
    if (color === "red") return holomenId === leaderHolomenId;
    if (color === "yellow") return hasSong;
    return true;
  };

  let score = evaluate(state);
  let version = 0;
  /** 外したときに失うスコア(置き場所ごと)。確定した変更が増えたら捨てる */
  let lossCache = new Map<string, number>();

  /** その場所のコネクトを外したときに失うスコア */
  const lossOf = (s: Slot): number => {
    const key = slotKey(s);
    const cached = lossCache.get(key);
    if (cached !== undefined) return cached;
    const old = get(s);
    set(s, null);
    const loss = score - evaluate(state);
    set(s, old);
    lossCache.set(key, loss);
    return loss;
  };
  /**
   * その場所へその種類を置く変更を、確定せずに評価する。空き枚数があればそのまま、なければ**外して失うスコアが最小の
   * 場所**から回す(ユニットのみのときもユニット外から回してよい。同じ失うスコアならユニット外を先に)。
   * 返すのは 増分 と、回す元の場所(空き枚数で足りるなら null)。枚数が足りず回す元もないときは null
   */
  const plan = (m: Move): { gain: number; from: Slot | null } | null => {
    const item = types[m.type];
    if (!item) return null;
    const target = item.placement;
    const old = get(m.slot);
    let from: Slot | null = null;
    if (free(target, item.count) <= 0) {
      const holders = holdersOf(target).filter((h) => slotKey(h) !== slotKey(m.slot));
      if (holders.length === 0) return null;
      holders.sort(
        (a, b) =>
          lossOf(a) - lossOf(b) ||
          Number(unit.has(a.holomenId)) - Number(unit.has(b.holomenId)) ||
          slotKey(a).localeCompare(slotKey(b)),
      );
      from = holders[0] ?? null;
    }
    const fromOld = from ? get(from) : null;
    if (from) set(from, null);
    set(m.slot, target);
    const value = evaluate(state);
    set(m.slot, old);
    if (from) set(from, fromOld);
    return { gain: value - score, from };
  };

  // 変更先の候補: ユニットのみのときはユニットの 4 か所、すべてのときは全ホロメンの 4 か所。
  // 最初の増分は「枚数が足りていると仮定して 1 枚置いたとき」で測る(足りないものは置く直前に回す元を決めて測り直す)
  const destinations = holomenIds.filter((id) => scope === "all" || unit.has(id));
  let moves: Move[] = [];
  for (const holomenId of destinations) {
    const layout = holomenById.get(holomenId)?.board;
    if (!layout) continue;
    for (const anchor of CONNECT_ANCHORS) {
      if (
        anchor !== "center" &&
        input.unlockedConnects !== undefined &&
        !(input.unlockedConnects[holomenId] ?? []).includes(anchor)
      )
        continue;
      const slot: Slot = { holomenId, anchor };
      types.forEach((item, type) => {
        const old = get(slot);
        if (old && typeKey(old) === typeKey(item.placement)) return;
        const hit = connectTargets(layout, anchor, item.placement.extent).some(
          (t) =>
            unlocked[t.color].get(holomenId)?.has(t.nodeId) === true &&
            !NO_SCORE_EFFECT.has(`${t.color}/${t.nodeId}`) &&
            relevantColor(t.color, holomenId),
        );
        if (!hit) return;
        set(slot, item.placement);
        const gain = evaluate(state) - score;
        set(slot, old);
        if (gain > 0) moves.push({ slot, type, gain, version });
      });
    }
  }

  // 増分の大きい順に取り出し、置く直前に測り直す(遅延評価)。厳密に上がる変更だけを確定する
  const byGain = (a: Move, b: Move): number => b.gain - a.gain;
  moves.sort(byGain);
  while (moves.length > 0) {
    const m = moves[0];
    if (!m) break;
    const item = types[m.type];
    const old = get(m.slot);
    if (!item || (old && typeKey(old) === typeKey(item.placement))) {
      moves = moves.slice(1);
      continue;
    }
    if (m.version !== version) {
      const planned = plan(m);
      m.version = version;
      m.gain = planned?.gain ?? 0;
      if (m.gain <= 0) moves = moves.slice(1);
      else moves.sort(byGain);
      continue;
    }
    const planned = plan(m);
    if (!planned || planned.gain <= 0) {
      moves = moves.slice(1);
      continue;
    }
    if (planned.from) set(planned.from, null);
    set(m.slot, item.placement);
    score += planned.gain;
    version += 1;
    lossCache = new Map();
    moves = moves.slice(1);
  }
  return state;
}
