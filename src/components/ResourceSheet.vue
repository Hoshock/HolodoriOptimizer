<script setup lang="ts">
import { ref } from "vue";

import CloseButton from "./CloseButton.vue";
import NumberPad from "./NumberPad.vue";
import { setResourceCount, useBoardResources } from "../composables/useBoardResources";
import { useModalChrome } from "../composables/useModalChrome";
import {
  BOARD_RESOURCE_KINDS,
  BOARD_RESOURCE_LABELS,
  BOARD_RESOURCE_MAX,
} from "../storage/boardResources";
import type { BoardResourceKind } from "../storage/boardResources";
import { BOARD_COLOR_ORDER } from "../storage/boards";
import type { BoardColor } from "../storage/boards";

/**
 * アカウントの「リソース」(2026-10-04 ユーザー指示)。色ごとに**余っているキューブ・コアキューブの個数**を登録する。
 * ゲームではボードのマスを開けるのにキューブ・コアキューブが要るが、**このツールのボードの解放は個数に左右されない**。
 * ここに入れるのはボードを開けた上で余っている個数で、ボードの最適化が必要量を逆算しつつ余りも使うための入力として使う予定
 * (受け入れだけ先に用意。今は計算に使わない)。値は 1 行 1 つのボタンで、押すと自前のテンキー(`NumberPad`)で入れる。
 * **未登録は ∞(制限なし)**: テンキーの小数点のキーを ∞ のキーにしてあり、決定すると未登録(null)に戻る(2026-10-04 ユーザー指示)
 */
const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const COLOR_LABELS: Record<BoardColor, string> = {
  red: "赤",
  blue: "青",
  yellow: "黄",
  green: "緑",
};

const resources = useBoardResources();
const editing = ref<{ color: BoardColor; kind: BoardResourceKind } | null>(null);

/** 未登録(null)は ∞(制限なし) */
const label = (value: number | null): string =>
  value === null ? "∞" : value.toLocaleString("ja-JP");

/** 決定(数値)と、∞ のキーで決定(未登録に戻す) */
function onSubmit(value: number | null): void {
  const target = editing.value;
  editing.value = null;
  if (target !== null) setResourceCount(target.color, target.kind, value);
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="リソース">
      <header class="sheet-head">
        <h3>リソース</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <!-- 脚注より上の本文。脚注の区切り線が画面の下端にちょうど来る高さを最低限確保し、スクロールして初めて脚注が出る -->
        <div class="sheet-main">
          <section v-for="color in BOARD_COLOR_ORDER" :key="color" class="color-block">
            <h4>{{ COLOR_LABELS[color] }}<sup class="fn">※1</sup></h4>
            <div class="rows">
              <button
                v-for="kind in BOARD_RESOURCE_KINDS"
                :key="kind"
                type="button"
                class="row"
                :aria-label="`${COLOR_LABELS[color]}の${BOARD_RESOURCE_LABELS[kind]}`"
                @click="editing = { color, kind }"
              >
                <span class="row-name">{{ BOARD_RESOURCE_LABELS[kind] }}</span>
                <span class="row-value">{{ label(resources[color][kind]) }}</span>
              </button>
            </div>
          </section>
        </div>

        <div class="footnotes">
          <p>
            <span class="fn-num">※1</span>
            <span
              >ボードを開けた上で、余っているキューブ・コアキューブの個数を登録します。未登録は
              ∞（制限なし）です。</span
            >
          </p>
        </div>
      </div>
    </div>

    <!-- 数値の入力は自前のテンキーで(OS のキーボードを出させない) -->
    <NumberPad
      v-if="editing !== null"
      :label="`${COLOR_LABELS[editing.color]}の${BOARD_RESOURCE_LABELS[editing.kind]}`"
      :value="resources[editing.color][editing.kind] ?? 0"
      :infinite="resources[editing.color][editing.kind] === null"
      infinity-key
      :decimals="0"
      :max="BOARD_RESOURCE_MAX"
      unit="個"
      @submit="onSubmit"
      @clear="onSubmit(null)"
      @cancel="editing = null"
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

/* モバイルはフルスクリーンシート、広い画面では中央のダイアログ(ConnectInventorySheet と同型) */
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

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

/* 本文(脚注より上)の最低の高さ: ヘッダ 77 + 本文の上余白 16 + 区分の間隔 16 を viewport から引くと、脚注の区切り線が画面の下端に来る。
   広い画面のシートは 100dvh ではないので 0 に戻す */
.sheet-main {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 16px;
  min-height: calc(100dvh - 109px - env(safe-area-inset-bottom));
}

@media (min-width: 48rem) {
  .sheet-main {
    min-height: 0;
  }
}

.footnotes {
  flex-shrink: 0;
}

.color-block h4 {
  font-size: 15px;
  line-height: 20px;
  margin: 0 0 8px;
}

.fn {
  font-size: 10px;
  font-weight: 600;
  line-height: 0;
  margin-left: 1px;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* アカウントのイベントメモリー / メンバー強化ボーナスのボタン(OptimizerPanel の .bonus-button)と同じ器: ラベルを左端・値を右端 */
.row {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  gap: 4px;
  height: 44px;
  justify-content: space-between;
  padding: 0 10px;
}

.row-name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.row-value {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
</style>
