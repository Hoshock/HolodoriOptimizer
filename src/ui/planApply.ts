import { boardMaterialsOf, BOARD_STATE_COLORS } from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import { CONNECT_ANCHORS } from "../data/connect";
import type { ConnectPlacement } from "../data/connect";
import type { ConnectItem } from "../engine/connectOptimize";
import { BOARD_RESOURCE_KINDS } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import type { ConnectPlacementMap } from "../storage/connect";
import { planSectionOf, sortPlanHolomen } from "./planSections";
import type { PlanSection, PlanUnit } from "./planSections";

/**
 * 組み直しプランの「ボードに反映」で、ホロメンごとに反映から外せるようにする(2026-10-09 ユーザー指示
 * 「ボードの反映は一部除いて反映したいことがあるので、モーダルでオプトアウトできる UI」)。
 *
 * 外す単位は「ホロメンのボード(頻度マスを含む)」と「ホロメンのコネクトの配置」で、別々に外せる(2026-10-09 ユーザー指示
 * 「ボードとコネクトの 2 つのタブと、リーダーメンバーとかのフィルタも。それぞれごとに外せるように」)。ただし片方だけでは成り立たないものは一緒に外れる
 * (`applyRows` の `group`):
 * - 推奨の配置が推奨のボードで開けたコネクトマスにある / いまの配置のコネクトマスを推奨のボードが閉じる → そのホロメンのボードとコネクト
 * - コネクトを回し合うホロメン: 推奨が、あるホロメンから外したコネクトを別のホロメンへ置いているとき、外した側だけを登録のままにすると
 *   持っている枚数を超える。形 × ％ ごとに、外す側を全部登録のままにしても空きで足りないときは、その形を置き換えるホロメンのコネクトを全部まとめる
 * 資材は共有なので、外したホロメンのぶんだけ余りを戻す(推奨で使う量 − 登録で使っている量。マイナスになりうる — 不足は反映の確認で言う)
 */

export interface ApplyPlan {
  /** 推奨のボード(変更のあるホロメンだけ。ボードを反映しないときは空) */
  boards: Record<string, HolomenBoards>;
  /** 変更のあるホロメンの登録のボード */
  before: Record<string, HolomenBoards>;
  /** 全部反映したときの余りのリソース */
  remaining: BoardResources;
  /** いまボードに置いている配置 */
  currentPlacements: ConnectPlacementMap;
  /** 推奨の配置(全ホロメン。コネクトを反映しないときは null) */
  placements: ConnectPlacementMap | null;
  /** 持っているコネクト */
  items: readonly ConnectItem[];
}

/** 反映の確認で外せるもの: ホロメンのボード(頻度マスを含む) / ホロメンのコネクトの配置 */
export type ApplyKind = "board" | "connect";

/** 反映の確認の 1 行(ホロメン × ボード / コネクト) */
export interface ApplyRow {
  /** `applyKey(kind, holomenId)` */
  key: string;
  kind: ApplyKind;
  holomenId: string;
  section: PlanSection;
  /** 一緒に外れる行の key(自分を含む。並びは行の並び) */
  group: string[];
}

export const applyKey = (kind: ApplyKind, holomenId: string): string => `${kind}:${holomenId}`;

/** 写し(Vue のリアクティブな Proxy でも写せるように JSON を通す。structuredClone は Proxy を写せない) */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const typeKey = (p: ConnectPlacement): string => `${p.extent}/${String(p.permil)}`;
const sameAnchors = (
  a: ConnectPlacementMap[string] | undefined,
  b: ConnectPlacementMap[string] | undefined,
): boolean =>
  CONNECT_ANCHORS.every((anchor) => {
    const x = a?.[anchor];
    const y = b?.[anchor];
    return x === y || (!!x && !!y && typeKey(x) === typeKey(y));
  });
const countOf = (anchors: ConnectPlacementMap[string] | undefined, key: string): number =>
  Object.values(anchors ?? {}).filter((p) => typeKey(p) === key).length;

/** 置き場所が変わるホロメン */
function placementChanged(plan: ApplyPlan): string[] {
  if (plan.placements === null) return [];
  const ids = new Set([...Object.keys(plan.currentPlacements), ...Object.keys(plan.placements)]);
  return [...ids].filter(
    (id) => !sameAnchors(plan.currentPlacements[id], plan.placements?.[id] ?? undefined),
  );
}

/**
 * 反映の確認に並べる行(ボード → コネクト、それぞれ区分の順)。一緒に外れる行は `group` で示す:
 * - 同じホロメンのボードとコネクト: 推奨の配置が推奨のボードで開けたコネクトマスにある、またはいまの配置のコネクトマスを推奨のボードが閉じるとき
 *   (片方だけ反映すると、解放していないコネクトマスに配置が残る)
 * - コネクトを回し合うホロメン: 形 × ％ ごとに、外す側を全部登録のままにしても空きで足りないとき(片方だけ外すと持っている枚数を超える)
 */
export function applyRows(plan: ApplyPlan, unit: PlanUnit): ApplyRow[] {
  const connectIds = sortPlanHolomen(placementChanged(plan), unit);
  const boardIds = sortPlanHolomen(Object.keys(plan.boards), unit);
  const keys = [
    ...boardIds.map((id) => applyKey("board", id)),
    ...connectIds.map((id) => applyKey("connect", id)),
  ];
  const parent = new Map(keys.map((k) => [k, k]));
  const find = (k: string): string => {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  if (plan.placements !== null) {
    // 同じホロメンのボードとコネクト
    for (const id of connectIds) {
      const after = plan.boards[id];
      const before = plan.before[id];
      if (!after || !before) continue;
      const anchorsOf = (p: ConnectPlacementMap[string] | undefined): string[] =>
        Object.keys(p ?? {}).filter((a) => a !== "center");
      const needsBoard = anchorsOf(plan.placements[id]).some(
        (a) => !before.connects.includes(a as never),
      );
      const needsConnect = anchorsOf(plan.currentPlacements[id]).some(
        (a) => !after.connects.includes(a as never),
      );
      if (needsBoard || needsConnect) union(applyKey("board", id), applyKey("connect", id));
    }
    // コネクトを回し合うホロメン
    const owned = new Map<string, number>();
    for (const item of plan.items)
      owned.set(typeKey(item.placement), (owned.get(typeKey(item.placement)) ?? 0) + item.count);
    const types = new Set(
      [...Object.values(plan.currentPlacements), ...Object.values(plan.placements)].flatMap((a) =>
        Object.values(a).map(typeKey),
      ),
    );
    for (const type of types) {
      const recommended = Object.values(plan.placements).reduce(
        (sum, a) => sum + countOf(a, type),
        0,
      );
      let need = 0;
      const touched: string[] = [];
      for (const id of connectIds) {
        const now = countOf(plan.currentPlacements[id], type);
        const next = countOf(plan.placements[id], type);
        if (now !== next) touched.push(applyKey("connect", id));
        if (now > next) need += now - next;
      }
      // 外す側を全部登録のままにしても空きで足りるなら、まとめなくてよい
      if (need <= (owned.get(type) ?? 0) - recommended) continue;
      for (const k of touched.slice(1)) union(touched[0] ?? k, k);
    }
  }
  return keys.map((key) => {
    const [kind, holomenId] = key.split(":") as [ApplyKind, string];
    return {
      key,
      kind,
      holomenId,
      section: planSectionOf(holomenId, unit),
      group: keys.filter((k) => find(k) === find(key)),
    };
  });
}

/** 外した行を除いて反映する中身(外したボード・配置は登録のまま、外したボードのぶん余りを戻す)。`excluded` は行の key */
export function selectApply(
  plan: ApplyPlan,
  excluded: ReadonlySet<string>,
): {
  boards: Record<string, HolomenBoards>;
  remaining: BoardResources;
  placements: ConnectPlacementMap | null;
} {
  const boards: Record<string, HolomenBoards> = {};
  const remaining: BoardResources = copy(plan.remaining);
  for (const [id, board] of Object.entries(plan.boards)) {
    if (!excluded.has(applyKey("board", id))) {
      boards[id] = board;
      continue;
    }
    const after = boardMaterialsOf(board);
    const before = plan.before[id];
    const was = before ? boardMaterialsOf(before) : null;
    for (const color of BOARD_STATE_COLORS)
      for (const kind of BOARD_RESOURCE_KINDS) {
        const left = remaining[color][kind];
        if (left === null) continue;
        remaining[color][kind] = left + after[color][kind] - (was?.[color][kind] ?? 0);
      }
  }
  let placements: ConnectPlacementMap | null = null;
  if (plan.placements !== null) {
    placements = copy(plan.placements);
    for (const key of excluded) {
      if (!key.startsWith("connect:")) continue;
      const id = key.slice("connect:".length);
      const now = plan.currentPlacements[id];
      if (now && Object.keys(now).length > 0) placements[id] = copy(now);
      else delete placements[id];
    }
  }
  return { boards, remaining, placements };
}
