<script setup lang="ts">
import { computed, ref } from "vue";

import CloseButton from "./CloseButton.vue";
import ConnectFigure from "./ConnectFigure.vue";
import ConnectInventoryDialog from "./ConnectInventoryDialog.vue";
import { useConnectPlacements } from "../composables/useBoards";
import { useConnectInventory } from "../composables/useConnectInventory";
import { useModalChrome } from "../composables/useModalChrome";
import {
  CONNECT_EXTENT_DISPLAY_ORDER,
  CONNECT_EXTENT_LABELS,
  CONNECT_EXTENTS,
} from "../data/connect";
import type { ConnectExtentId } from "../data/connect";
import { toConnectPlacementMap } from "../storage/connect";
import { connectUsage } from "../storage/connectInventory";
import { badgeAtBottom } from "../ui/connectBadge";

/**
 * アカウントの「コネクト」: 持っているコネクト(所持カードと開花段階から導く — ADR-023)を**見るだけ**の画面
 * (2026-10-09 ユーザー指示。登録はしない — 2026-10-02 の 形 × ％ × 枚数 を手で入れる ＋ / － は外した)。
 * 範囲の形 17 種を図形のタイルで 4 列に並べ(並びと図形は `ConnectSheet` と同じ)、置いているか持っている形には
 * 「使用 / 所持」(ボードに置いている数 / 持っている枚数。どちらも ％ を合わせた合計)を右上に出す(2026-10-10 ユーザー指示)。
 * どれかの ％ で持っている枚数より多く置いていれば、その数字の地を赤にする。数字が図形にかかる形(上十字)だけ右下に置く(`badgeAtBottom`)。
 * タップすると、その形の ％ ごとの 使用 / 所持 と使っているホロメンを見るダイアログが開く
 */
const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const entries = useConnectInventory();
const placements = useConnectPlacements();
const usage = computed(() => connectUsage(toConnectPlacementMap(placements.value), entries.value));
/** 形ごとの 使用 / 所持 の合計と、どれかの ％ で所持を超えているか */
const totals = computed(() => {
  const map = new Map<ConnectExtentId, { used: number; owned: number; over: boolean }>();
  for (const r of usage.value) {
    const t = map.get(r.extent) ?? { used: 0, owned: 0, over: false };
    t.used += r.used;
    t.owned += r.owned;
    t.over ||= r.used > r.owned;
    map.set(r.extent, t);
  }
  return map;
});
const editing = ref<ConnectExtentId | null>(null);
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="コネクト">
      <header class="sheet-head">
        <h3>コネクト</h3>
        <CloseButton @close="emit('close')" />
      </header>
      <ul class="shapes">
        <li v-for="id in CONNECT_EXTENT_DISPLAY_ORDER" :key="id">
          <button
            type="button"
            class="shape"
            :class="{ owned: (totals.get(id)?.owned ?? 0) > 0 }"
            :aria-label="CONNECT_EXTENT_LABELS[id]"
            @click="editing = id"
          >
            <ConnectFigure :cells="CONNECT_EXTENTS[id]" />
            <span
              v-if="totals.has(id)"
              class="count"
              :class="{ over: totals.get(id)?.over, bottom: badgeAtBottom(id) }"
              :aria-label="`使用 ${totals.get(id)?.used} / 所持 ${totals.get(id)?.owned}`"
            >
              {{ totals.get(id)?.used }}/{{ totals.get(id)?.owned }}
            </span>
          </button>
        </li>
      </ul>
    </div>

    <ConnectInventoryDialog
      v-if="editing !== null"
      :extent="editing"
      :usage="usage"
      @close="editing = null"
    />
  </div>
</template>

<style scoped>
.overlay {
  background: rgba(35, 48, 61, 0.4);
  inset: 0;
  position: fixed;
  z-index: 10;
}

/* モバイルはフルスクリーンシート、広い画面では中央のダイアログ(ResultDetail と同型) */
.sheet {
  background: var(--surface);
  box-shadow: var(--shadow-sheet);
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  width: 100%;
}

@media (min-width: 48rem) {
  .overlay {
    align-items: center;
    display: flex;
    justify-content: center;
    padding: 24px;
  }

  .sheet {
    border-radius: var(--r-m);
    height: min(85dvh, 46rem);
    max-width: 46rem;
  }
}

/* ページヘッダ・ピッカーと同寸法(77px)・同文字サイズ(24px/900) */
.sheet-head {
  align-items: center;
  background: var(--chrome-head);
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  justify-content: space-between;
  padding: 16px;
}

.sheet-head h3 {
  font-size: 24px;
  font-weight: 900;
  line-height: 1.35;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 図形のタイル(ConnectSheet と同じ器。1 行 4 列 — 2026-10-06 ユーザー指示): 全部同じ大きさの正方形。持っている形は濃色の輪と図形の濃色 */
.shapes {
  align-content: start; /* 縦に余っても行を引き伸ばさない */
  display: grid;
  flex: 1;
  gap: 8px;
  grid-template-columns: repeat(4, 1fr);
  list-style: none;
  margin: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.shape {
  --board: var(--ink-2);
  align-items: center;
  aspect-ratio: 1 / 1;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 10px;
  position: relative;
  width: 100%;
}

.shape.owned {
  --board: var(--ink);
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}

/* 使用 / 所持: タイルの右上(図形の使わない角)。選択スタイルと同じ地で、所持を超えて置いているときは赤の地 */
.count {
  background: var(--selected);
  border-radius: var(--r-pill);
  color: var(--selected-ink);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 16px;
  padding: 0 6px;
  position: absolute;
  right: 5px;
  top: 5px;
}

/* 右上の角にマスがある形は右下へ */
.count.bottom {
  bottom: 5px;
  top: auto;
}

/* 文字は面の色(ダークモードでは明るい赤の地に暗い文字) */
.count.over {
  background: var(--error);
  color: var(--surface);
}
</style>
