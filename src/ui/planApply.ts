import { boardMaterialsOf, BOARD_STATE_COLORS } from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import { CONNECT_ANCHORS } from "../data/connect";
import type { ConnectAnchor, ConnectPlacement } from "../data/connect";
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
 * 外す単位は「ホロメンのボード(頻度マスを含む)」と「ホロメンのコネクトの配置」の行。**基本はどの行も独立に外せて、
 * 片方だけでは成り立たない特殊なケースだけ連動する**(2026-10-09 ユーザー指示「基本は独立でできるようにしつつ、特殊なケースでは連動する」)。
 * 連動は「この行を反映するには、あの行も反映しなければならない」という前提(`ApplyRow.requires`)の 1 種類だけで表し、
 * 行を入れたら前提も入れ、外したらそれを前提にする行も外す(`toggleApply`。たどれるだけたどる)。前提になるのは次の 3 つ:
 *
 * | ケース | 前提 | 連動のしかた |
 * | :-- | :-- | :-- |
 * | 推奨の配置が、推奨のボードで開けたコネクトマスにある | コネクト → 同じホロメンのボード | ボードを外すとコネクトも外れる(コネクトだけ外すのは自由) |
 * | いまの配置のコネクトマスを、推奨のボードが閉じる | ボード → 同じホロメンのコネクト | コネクトを外すとボードも外れる(ボードだけ外すのは自由) |
 * | コネクトを回し合う(推奨が、あるホロメンから外したコネクトを別のホロメンへ置く)。形 × ％ ごとに、外す側を全部登録のままにしても空きで足りないとき | その形を置き換えるホロメンのコネクトどうし(互いに) | どれを外しても全部外れる(片方だけ外すと持っている枚数を超える) |
 *
 * どれにも当たらない同じホロメンのボードとコネクトは連動させない(同日ユーザー指示「同じ盤面のボードとコネクトの連動は分離したい」)。
 * 前提を満たさない外し方を渡されたとき(画面では連動するので起きない)は、開いていないコネクトマスに残る配置だけを外す(`selectApply` の `dropped`)。
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
  /** この行を反映するのに、一緒に反映しなければならない行の key(自分は含まない。並びは行の並び) */
  requires: string[];
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

/** 推奨・いまの配置の、中心以外のコネクトマス */
const anchorsOf = (p: ConnectPlacementMap[string] | undefined): string[] =>
  Object.keys(p ?? {}).filter((a) => a !== "center");

/**
 * 反映の確認に並べる行(ボード → コネクト、それぞれ区分の順)。行は独立で、片方だけでは成り立たないときだけ `requires` を持つ(冒頭の表)
 */
export function applyRows(plan: ApplyPlan, unit: PlanUnit): ApplyRow[] {
  const connectIds = sortPlanHolomen(placementChanged(plan), unit);
  const boardIds = sortPlanHolomen(Object.keys(plan.boards), unit);
  const keys = [
    ...boardIds.map((id) => applyKey("board", id)),
    ...connectIds.map((id) => applyKey("connect", id)),
  ];
  const requires = new Map(keys.map((k) => [k, new Set<string>()]));
  const require = (from: string, to: string): void => {
    if (from !== to && requires.has(to)) requires.get(from)?.add(to);
  };
  if (plan.placements !== null) {
    for (const id of connectIds) {
      const after = plan.boards[id];
      const before = plan.before[id];
      if (!after || !before) continue;
      const board = applyKey("board", id);
      const connect = applyKey("connect", id);
      // 推奨の配置が、推奨のボードで開けたコネクトマスにある
      if (anchorsOf(plan.placements[id]).some((a) => !before.connects.includes(a as never)))
        require(connect, board);
      // いまの配置のコネクトマスを、推奨のボードが閉じる
      if (anchorsOf(plan.currentPlacements[id]).some((a) => !after.connects.includes(a as never)))
        require(board, connect);
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
      // 外す側を全部登録のままにしても空きで足りるなら、連動させなくてよい
      if (need <= (owned.get(type) ?? 0) - recommended) continue;
      for (const a of touched) for (const b of touched) require(a, b);
    }
  }
  return keys.map((key) => {
    const [kind, holomenId] = key.split(":") as [ApplyKind, string];
    const req = requires.get(key) ?? new Set<string>();
    return {
      key,
      kind,
      holomenId,
      section: planSectionOf(holomenId, unit),
      requires: keys.filter((k) => req.has(k)),
    };
  });
}

/**
 * 行を押したあとの外す行(`excluded` は行の key)。入れたら前提の行も入れ、外したらそれを前提にする行も外す(たどれるだけたどる)。
 * 前提のない行は自分だけが切り替わる
 */
export function toggleApply(
  rows: readonly ApplyRow[],
  excluded: ReadonlySet<string>,
  key: string,
): Set<string> {
  const next = new Set(excluded);
  const turnOn = next.has(key);
  const pending = [key];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const k = pending.pop();
    if (k === undefined || seen.has(k)) continue;
    seen.add(k);
    const row = rows.find((r) => r.key === k);
    if (!row) continue;
    if (turnOn) {
      next.delete(k);
      pending.push(...row.requires);
    } else {
      next.add(k);
      pending.push(...rows.filter((r) => r.requires.includes(k)).map((r) => r.key));
    }
  }
  return next;
}

/** 外した行を除いて反映する中身(外したボード・配置は登録のまま、外したボードのぶん余りを戻す)。`excluded` は行の key */
export function selectApply(
  plan: ApplyPlan,
  excluded: ReadonlySet<string>,
): {
  boards: Record<string, HolomenBoards>;
  remaining: BoardResources;
  placements: ConnectPlacementMap | null;
  /** 反映後のボードでコネクトマスが開いていないので外れる配置(前提の行を一緒に外していれば起きない) */
  dropped: { holomenId: string; anchor: ConnectAnchor }[];
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
  // 解放していないコネクトマスに残る配置は外す
  const dropped: { holomenId: string; anchor: ConnectAnchor }[] = [];
  if (placements !== null)
    for (const id of Object.keys(plan.boards)) {
      const open = (boards[id] ?? plan.before[id])?.connects ?? [];
      const anchors = placements[id];
      if (!anchors) continue;
      for (const anchor of CONNECT_ANCHORS) {
        if (anchor === "center" || !anchors[anchor] || (open as readonly string[]).includes(anchor))
          continue;
        delete anchors[anchor];
        dropped.push({ holomenId: id, anchor });
      }
      if (Object.keys(anchors).length === 0) delete placements[id];
    }
  return { boards, remaining, placements, dropped };
}
