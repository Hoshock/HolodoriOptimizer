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
import type { BoardMaterials } from "../data/boardMaterials";
import { spendResources } from "../ui/boardSpend";

/**
 * 余っているボード用リソース(色ごとのキューブ・コアキューブ。保存形式は `src/storage/boardResources.ts`)。
 * アプリ全体で 1 つの状態。登録値は**いまのボードを開けた上で余っている個数**で、最適化(組み直しプランと結果の「組み直すと」のボードの段)は
 * いまのボードへ投入済みの資材 + この余りを総量として全ホロメンで共有して再配分する(`src/engine/boardOptimize.ts`)。
 * **ボード画面の手動の解放・解除はこの値を増減する**(開けたマスのぶん引き、外したマスのぶん戻す — `spendBoardResources`。
 * 2026-10-10 ユーザー指示「ボードで解放すると資材が減るべきなのに減らない」。それまでは手動の編集では増減しなかった)。
 * 足りなくても止めず、ボードのシートで確認してから負(不足)のまま入れる。推奨を反映するときは `replaceBoardResources` で置き換える
 */
const resources = ref<BoardResources>(loadBoardResources());
watch(resources, (value) => saveBoardResources(value), { deep: true });

export function useBoardResources(): Ref<BoardResources> {
  return resources;
}

/**
 * 余りを丸ごと置き換える。組み直しプランの推奨を反映するとき(推奨のボードへ組み替えたあとの余り —
 * 総量(投入済み + 余り)を増減させないため。`BoardPlanResult.remainingAfter`)と、ボード画面の戻る / 進むで写しへ戻すときに使う
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

/**
 * ボード画面の手動の解放・解除で使った資材(正)・戻った資材(負)を余りに反映する(未登録 = ∞ の項目は変えない。
 * 足りなければ負 = 不足のまま。`src/ui/boardSpend.ts`)
 */
export function spendBoardResources(delta: BoardMaterials): void {
  resources.value = spendResources(resources.value, delta);
}
