import { ref, watch } from "vue";
import type { Ref } from "vue";

import {
  loadBoardResources,
  parseBoardResources,
  saveBoardResources,
  setBoardResource,
} from "../storage/boardResources";
import type { BoardResourceKind, BoardResources } from "../storage/boardResources";
import type { BoardColor } from "../storage/boards";

/**
 * 余っているボード用リソース(色ごとのキューブ・コアキューブ。保存形式は `src/storage/boardResources.ts`)。
 * アプリ全体で 1 つの状態。登録値は**いまのボードを開けた上で余っている個数**で、使うのは組み直しプランと結果の「組み直すと」(ボードの段)だけ
 * (いまのボードへ投入済みの資材 + この余りを総量として全ホロメンで共有して再配分する。`src/engine/boardOptimize.ts`)。
 * **手動のボード操作(マスを開ける・コネクトを開ける・すべて解放)はこの値で制限せず、手動の編集でこの値を自動で増減もしない**
 * (ユーザーがゲームの実際の余りを登録する入力のため)。自動で書き換えるのは、最適化の推奨を反映するときの `replaceBoardResources` だけ
 */
const resources = ref<BoardResources>(loadBoardResources());
watch(resources, (value) => saveBoardResources(value), { deep: true });

export function useBoardResources(): Ref<BoardResources> {
  return resources;
}

/**
 * 余りを丸ごと置き換える。**組み直しプランの推奨を反映するときだけ**使う(推奨のボードへ組み替えたあとの余り —
 * 総量(投入済み + 余り)を増減させないため。`BoardPlanResult.remainingAfter`)
 */
export function replaceBoardResources(next: BoardResources): void {
  resources.value = parseBoardResources(JSON.stringify({ resources: next }));
}

/** 1 色 × 1 種類の個数を置き換える(null で未登録 = ∞ に戻す) */
export function setResourceCount(
  color: BoardColor,
  kind: BoardResourceKind,
  count: number | null,
): void {
  resources.value = setBoardResource(resources.value, color, kind, count);
}
