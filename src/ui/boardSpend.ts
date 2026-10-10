import { BOARD_MATERIAL_COLORS, emptyBoardMaterials } from "../data/boardMaterials";
import type { BoardMaterials } from "../data/boardMaterials";
import { boardMaterialsOf } from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import {
  BOARD_RESOURCE_KINDS,
  BOARD_RESOURCE_LABELS,
  parseBoardResources,
} from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";

/**
 * ボード画面の手動の解放・解除で、余りのリソース(色ごとのキューブ・コアキューブ)を増減する
 * (2026-10-10 ユーザー指示「ボードで解放すると資材が減るべきなのに減らない。資材以上を解放するときはモーダルで確認しつつ − にする余地を残す」)。
 * 開けたマスの資材を余りから引き、外したマスの資材は全部戻す(ゲームでもマスを戻すと素材は全部戻る — `docs/human/game-spec.md`)。
 * 消費量は `src/data/boardMaterials.ts` の表(コネクトマスは 0 / 0)。**未登録(∞)の項目は増減しない**。足りなくても止めず、
 * ボードのシートで確認してから負(不足)のまま登録する
 */

const COLOR_LABELS: Record<keyof BoardMaterials, string> = {
  red: "赤",
  blue: "青",
  yellow: "黄",
  green: "緑",
};

/** before → after で使う資材(色ごと。負は外して戻るぶん) */
export function materialDelta(before: HolomenBoards, after: HolomenBoards): BoardMaterials {
  const from = boardMaterialsOf(before);
  const to = boardMaterialsOf(after);
  const out = emptyBoardMaterials();
  for (const color of BOARD_MATERIAL_COLORS)
    for (const kind of BOARD_RESOURCE_KINDS) out[color][kind] = to[color][kind] - from[color][kind];
  return out;
}

/** 余りから使ったぶんを引く(戻るぶんは足す)。未登録 = ∞ はそのまま、負は不足として残す(±上限で止める) */
export function spendResources(resources: BoardResources, delta: BoardMaterials): BoardResources {
  const next = parseBoardResources(JSON.stringify({ resources }));
  for (const color of BOARD_MATERIAL_COLORS)
    for (const kind of BOARD_RESOURCE_KINDS) {
      const left = next[color][kind];
      if (left !== null) next[color][kind] = left - delta[color][kind];
    }
  return parseBoardResources(JSON.stringify({ resources: next }));
}

/**
 * 不足の文の一片(「赤のキューブ 30」。足りない個数 = 負の余りの大きさ)。`only` を渡すと、そこで使う項目(正の値)だけを見る
 * (手で開けるときに、その操作で使わない色の前からの不足では聞かない)
 */
export function shortageLabels(
  resources: BoardResources | undefined,
  only?: BoardMaterials,
): string[] {
  const out: string[] = [];
  if (!resources) return out;
  for (const color of BOARD_MATERIAL_COLORS)
    for (const kind of BOARD_RESOURCE_KINDS) {
      const left = resources[color][kind];
      if (left === null || left >= 0) continue;
      if (only !== undefined && only[color][kind] <= 0) continue;
      out.push(
        `${COLOR_LABELS[color]}の${BOARD_RESOURCE_LABELS[kind]} ${(-left).toLocaleString("ja-JP")}`,
      );
    }
  return out;
}
