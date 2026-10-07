import { BOARD_COLOR_ORDER } from "./boards";
import type { BoardColor } from "./boards";

/**
 * 余っているボード用リソース(色ごとのキューブ・コアキューブの個数)の登録。localStorage のみ(2026-10-04 ユーザー指示)。
 * ゲームではホロメンボードのマスを開けるのに、ボードPt に加えて**色ごとのキューブ・コアキューブ**が要る(マスごとに消費量が違う。
 * 消費量は `src/data/boardMaterials.ts` が持つ外部 master 由来の表で、この登録値とは混ぜない)。**このツールで手動でボードを開ける操作は
 * リソースを要求しない**(個数によらず自由に開けられ、手動の編集でこの値を自動で増減もしない)。
 * ここに登録するのは**ボードを開けた上で余っている個数**(総所持量ではない)で、使うのは「ホロメンボードの最適化」だけ: いまの全ホロメンの
 * ボードへ投入済みの資材(`boardMaterials.ts` から逆算)+ この余り = 再配分できる総量として、全ホロメンで共有して配り直す
 * (`src/engine/boardOptimize.ts`)。最適化の推奨を反映するときだけ、この値も新しい盤面に合わせて置き換える(総量を増減させない)。
 *
 * **未登録は `null` で、画面には ∞ と出す = 制限なし**(ホロメンランクの未登録と同じ。0 は「0 個持っている」という別の値で、未登録の代わりにしない)。
 * 後方互換の約束は他のキーと同じ: 版番号つき封筒、壊れていれば全部未登録扱い、キーがない旧データも全部未登録として読む。
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

/** 1 色ぶんの個数(未登録 = null = ∞) */
export type ColorResources = Record<BoardResourceKind, number | null>;
/** 色 → 個数(4 色すべて持つ。未登録は null) */
export type BoardResources = Record<BoardColor, ColorResources>;

interface ResourcesEnvelope {
  version: number;
  resources: BoardResources;
}

export function emptyBoardResources(): BoardResources {
  return {
    red: { cube: null, core: null },
    blue: { cube: null, core: null },
    yellow: { cube: null, core: null },
    green: { cube: null, core: null },
  };
}

/** 0 以上の整数だけ(小数は切り捨て、負は 0、上限で止める)。数値でない値は未登録(null) */
function toCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
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

/** 1 色 × 1 種類の個数を置き換えた新しい登録を返す(範囲外は 0〜上限へ丸める。null で未登録 = ∞ に戻す) */
export function setBoardResource(
  resources: BoardResources,
  color: BoardColor,
  kind: BoardResourceKind,
  count: number | null,
): BoardResources {
  return { ...resources, [color]: { ...resources[color], [kind]: toCount(count) } };
}
