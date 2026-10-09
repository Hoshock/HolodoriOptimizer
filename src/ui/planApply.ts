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
 * 外す単位はホロメン(そのホロメンのボードとコネクトの配置をまとめて登録のままにする)。ボードとコネクトを別々に外さないのは、
 * 推奨の配置が推奨のボードで開けたコネクトマスに置かれていることがあるため。
 * **コネクトを回し合うホロメンは 1 つにまとめる**: 推奨が、あるホロメンから外したコネクトを別のホロメンへ置いているとき、外した側だけを
 * 登録のままにすると、持っている枚数を超えて置くことになる。形 × ％ ごとに、外す側を全部登録のままにしても空きで足りないときは、
 * その形を置き換えるホロメン全員を 1 つにまとめる(足りるときはまとめない)。
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

/** 反映の確認の 1 行(まとめて外すホロメン) */
export interface ApplyGroup {
  /** 区分の順に並べたホロメン */
  ids: string[];
  section: PlanSection;
  /** ボードの変更があるか / コネクトの置き場所の変更があるか */
  board: boolean;
  connect: boolean;
}

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

/** 反映の確認に並べる行(区分 → 区分の中の並び)。まとめて外すホロメンは 1 行 */
export function applyGroups(plan: ApplyPlan, unit: PlanUnit): ApplyGroup[] {
  const connectIds = placementChanged(plan);
  const ids = sortPlanHolomen([...Object.keys(plan.boards), ...connectIds], unit);
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  if (plan.placements !== null) {
    const owned = new Map<string, number>();
    for (const item of plan.items)
      owned.set(typeKey(item.placement), (owned.get(typeKey(item.placement)) ?? 0) + item.count);
    const keys = new Set(
      [...Object.values(plan.currentPlacements), ...Object.values(plan.placements)].flatMap((a) =>
        Object.values(a).map(typeKey),
      ),
    );
    for (const key of keys) {
      const recommended = Object.values(plan.placements).reduce(
        (sum, a) => sum + countOf(a, key),
        0,
      );
      let need = 0;
      const touched: string[] = [];
      for (const id of connectIds) {
        const now = countOf(plan.currentPlacements[id], key);
        const next = countOf(plan.placements[id], key);
        if (now !== next) touched.push(id);
        if (now > next) need += now - next;
      }
      // 外す側を全部登録のままにしても空きで足りるなら、まとめなくてよい
      if (need <= (owned.get(key) ?? 0) - recommended) continue;
      for (const id of touched.slice(1)) union(touched[0] ?? id, id);
    }
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }
  const boardIds = new Set(Object.keys(plan.boards));
  const connectSet = new Set(connectIds);
  return [...groups.values()].map((members) => ({
    ids: members,
    section: planSectionOf(members[0] ?? "", unit),
    board: members.some((id) => boardIds.has(id)),
    connect: members.some((id) => connectSet.has(id)),
  }));
}

/** 外したホロメンを除いて反映する中身(外したホロメンのボードと配置は登録のまま、余りはそのぶん戻す) */
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
    if (!excluded.has(id)) {
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
    for (const id of excluded) {
      const now = plan.currentPlacements[id];
      if (now && Object.keys(now).length > 0) placements[id] = copy(now);
      else delete placements[id];
    }
  }
  return { boards, remaining, placements };
}
