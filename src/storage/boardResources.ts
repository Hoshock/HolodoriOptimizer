import { BOARD_COLOR_ORDER } from "./boards";
import type { BoardColor } from "./boards";

/**
 * 余っているボード用リソース(色ごとのキューブ・コアキューブの個数)の登録。localStorage のみ(2026-10-04 ユーザー指示)。
 * ゲームではホロメンボードのマスを開けるのに、ボードPt に加えて**色ごとのキューブ・コアキューブ**が要る(マスごとに消費量が違う。
 * 消費量の表は収集中で未実装)。**このツールはボードを開けるのにリソースを要求しない**(個数によらず自由に開けられる)。
 * ここに登録するのは**ボードを開けた上で余っている個数**で、最適化(ボードの最適化)が、いまの解放状態から必要な量を逆算しつつ
 * 余りも使って全体を最適化するための入力として使う予定(受け入れだけ先に用意。今は計算に使わない)。
 *
 * 後方互換の約束は他のキーと同じ: 版番号つき封筒、壊れていれば全部 0 扱い、キーがない旧データは「何も持っていない」として読む。
 * 値は 0 以上の整数だけ受け付け、上限(`BOARD_RESOURCE_MAX`)で止める。知らない色・知らない項目は読み飛ばす。
 */
export const BOARD_RESOURCES_STORAGE_KEY = "holodori-optimizer:board-resources";
export const BOARD_RESOURCES_SCHEMA_VERSION = 1;
/** 1 項目の上限(誤入力で膨らませない。ゲーム内の実際の上限は未確認) */
export const BOARD_RESOURCE_MAX = 999999;

/** リソースの種類(キューブ / コアキューブ) */
export type BoardResourceKind = "cube" | "core";
export const BOARD_RESOURCE_KINDS: readonly BoardResourceKind[] = ["cube", "core"];
export const BOARD_RESOURCE_LABELS: Record<BoardResourceKind, string> = {
  cube: "キューブ",
  core: "コアキューブ",
};

/** 1 色ぶんの個数 */
export type ColorResources = Record<BoardResourceKind, number>;
/** 色 → 個数(4 色すべて持つ。未登録は 0) */
export type BoardResources = Record<BoardColor, ColorResources>;

interface ResourcesEnvelope {
  version: number;
  resources: BoardResources;
}

export function emptyBoardResources(): BoardResources {
  return {
    red: { cube: 0, core: 0 },
    blue: { cube: 0, core: 0 },
    yellow: { cube: 0, core: 0 },
    green: { cube: 0, core: 0 },
  };
}

/** 0 以上の整数だけ(小数は切り捨て、上限で止める)。それ以外は 0 */
function toCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(BOARD_RESOURCE_MAX, Math.max(0, Math.floor(value)));
}

export function parseBoardResources(raw: string | null): BoardResources {
  const out = emptyBoardResources();
  if (raw === null) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (typeof parsed !== "object" || parsed === null || !("resources" in parsed)) return out;
  const resources = parsed.resources;
  if (typeof resources !== "object" || resources === null) return out;
  for (const color of BOARD_COLOR_ORDER) {
    const row = (resources as Record<string, unknown>)[color];
    if (typeof row !== "object" || row === null) continue;
    for (const kind of BOARD_RESOURCE_KINDS) {
      out[color][kind] = toCount((row as Record<string, unknown>)[kind]);
    }
  }
  return out;
}

export function serializeBoardResources(resources: BoardResources): string {
  const envelope: ResourcesEnvelope = {
    version: BOARD_RESOURCES_SCHEMA_VERSION,
    resources: parseBoardResources(JSON.stringify({ resources })),
  };
  return JSON.stringify(envelope);
}

export function loadBoardResources(): BoardResources {
  try {
    return parseBoardResources(localStorage.getItem(BOARD_RESOURCES_STORAGE_KEY));
  } catch {
    return emptyBoardResources();
  }
}

export function saveBoardResources(resources: BoardResources): void {
  try {
    localStorage.setItem(BOARD_RESOURCES_STORAGE_KEY, serializeBoardResources(resources));
  } catch {
    // 保存できない環境でも動作は継続する
  }
}

/** 1 色 × 1 種類の個数を置き換えた新しい登録を返す(範囲外は 0〜上限へ丸める) */
export function setBoardResource(
  resources: BoardResources,
  color: BoardColor,
  kind: BoardResourceKind,
  count: number,
): BoardResources {
  return { ...resources, [color]: { ...resources[color], [kind]: toCount(count) } };
}
