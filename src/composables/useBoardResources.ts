import { ref, watch } from "vue";
import type { Ref } from "vue";

import {
  loadBoardResources,
  saveBoardResources,
  setBoardResource,
} from "../storage/boardResources";
import type { BoardResourceKind, BoardResources } from "../storage/boardResources";
import type { BoardColor } from "../storage/boards";

/**
 * 余っているボード用リソース(色ごとのキューブ・コアキューブ。保存形式は `src/storage/boardResources.ts`)。
 * アプリ全体で 1 つの状態。アカウントの「リソース」で登録するだけで、ボードの解放・探索・最適化は今のところ使わない
 */
const resources = ref<BoardResources>(loadBoardResources());
watch(resources, (value) => saveBoardResources(value), { deep: true });

export function useBoardResources(): Ref<BoardResources> {
  return resources;
}

/** 1 色 × 1 種類の個数を置き換える */
export function setResourceCount(color: BoardColor, kind: BoardResourceKind, count: number): void {
  resources.value = setBoardResource(resources.value, color, kind, count);
}
