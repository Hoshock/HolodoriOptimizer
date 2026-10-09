<script setup lang="ts">
import { ref } from "vue";

import CloseButton from "./CloseButton.vue";
import InfoButton from "./InfoButton.vue";
import InfoDialog from "./InfoDialog.vue";
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
import { RESOURCE_INFO } from "../ui/infoContent";
import type { BoardColor } from "../storage/boards";

/**
 * アカウントの「リソース」(2026-10-04 ユーザー指示)。色ごとに**余っているキューブ・コアキューブの個数**を登録する。
 * ゲームではボードのマスを開けるのにキューブ・コアキューブが要るが、**このツールで手動でボードを開ける操作は個数に左右されない**。
 * ここに入れるのはボードを開けた上で余っている個数で、組み直しプランと結果の「組み直すと」(ボードの段)だけが、いまのボードへ投入済みの資材 + この余りを
 * 総量として全ホロメンで共有して配り直す(推奨を反映するとこの値も新しい盤面に合わせて置き換わる)。値は色ごとのカードの中のボタンで、押すと自前のテンキー(`NumberPad`)で入れる。
 * **未登録は ∞(制限なし)**: テンキーの小数点のキーを ∞ のキーにしてあり、決定すると未登録(null)に戻る(2026-10-04 ユーザー指示)。
 * 使い方(余りを入れる・未登録は ∞・マイナスは不足)は見出しの右の ⓘ から開く(2026-10-08 ユーザー指示で脚注 ※1 から移した — `RESOURCE_INFO`)
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
const infoOpen = ref(false);

/** 未登録(null)は ∞(制限なし)。負は不足(最適化の推奨を反映したときだけ入る)で、マイナス記号つきで出す */
const label = (value: number | null): string =>
  value === null
    ? "∞"
    : value < 0
      ? `−${(-value).toLocaleString("ja-JP")}`
      : value.toLocaleString("ja-JP");

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
        <div class="head-title">
          <h3>リソース</h3>
          <InfoButton label="リソースの説明" @click="infoOpen = true" />
        </div>
        <CloseButton @close="emit('close')" />
      </header>

      <!--
        色ごとのカードを 2 列(広い画面は 4 列)に並べる(2026-10-08 ユーザー指示「キューブとかの入力ダサいからいい感じの UI にして」。
        それまでは 色の見出し + 「キューブ」「コアキューブ」の設定行 × 4 色 の 8 行)。カードは色の淡い地で、中にキューブ・コアキューブの
        ボタン(アイコン + 名前 + 大きな値)。押すとテンキー
      -->
      <div class="body">
        <div class="cards">
          <section
            v-for="color in BOARD_COLOR_ORDER"
            :key="color"
            class="card"
            :style="{ '--c': `var(--board-${color})` }"
            :aria-label="COLOR_LABELS[color]"
          >
            <h4><span class="swatch" aria-hidden="true"></span>{{ COLOR_LABELS[color] }}</h4>
            <button
              v-for="kind in BOARD_RESOURCE_KINDS"
              :key="kind"
              type="button"
              class="cell"
              :aria-label="`${COLOR_LABELS[color]}の${BOARD_RESOURCE_LABELS[kind]}`"
              @click="editing = { color, kind }"
            >
              <svg class="cube" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <template v-if="kind === 'cube'">
                  <path d="M12 2 21 7 12 12 3 7Z" opacity="0.4" />
                  <path d="M3 7 12 12 12 22 3 17Z" opacity="0.7" />
                  <path d="M21 7 21 17 12 22 12 12Z" />
                </template>
                <!-- コアキューブ: 半透明のキューブの中に、濃い小さなキューブ(核) -->
                <template v-else>
                  <path d="M12 2 21 7 12 12 3 7Z" opacity="0.2" />
                  <path d="M3 7 12 12 12 22 3 17Z" opacity="0.3" />
                  <path d="M21 7 21 17 12 22 12 12Z" opacity="0.4" />
                  <path d="M12 8 16 10.3 12 12.6 8 10.3Z" opacity="0.6" />
                  <path d="M8 10.3 12 12.6 12 17.2 8 14.9Z" opacity="0.85" />
                  <path d="M16 10.3 16 14.9 12 17.2 12 12.6Z" />
                </template>
              </svg>
              <span class="cell-text">
                <span class="cell-name">{{ BOARD_RESOURCE_LABELS[kind] }}</span>
                <span class="cell-value" :class="{ deficit: (resources[color][kind] ?? 0) < 0 }">{{
                  label(resources[color][kind])
                }}</span>
              </span>
            </button>
          </section>
        </div>
      </div>
    </div>

    <!-- シートのオーバーレイの子として出すので、シートの上に載る -->
    <InfoDialog v-if="infoOpen" :text="RESOURCE_INFO" @close="infoOpen = false" />

    <!-- 数値の入力は自前のテンキーで(OS のキーボードを出させない) -->
    <NumberPad
      v-if="editing !== null"
      :label="`${COLOR_LABELS[editing.color]}の${BOARD_RESOURCE_LABELS[editing.kind]}`"
      :value="Math.max(0, resources[editing.color][editing.kind] ?? 0)"
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

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

/* 見出しと ⓘ(見出しのすぐ右。右端は閉じるボタン) */
.head-title {
  align-items: center;
  display: flex;
  gap: 8px;
  min-width: 0;
}

/* 色ごとのカード: 2 列(広い画面は 4 列)。地は色の淡い面、枠はその色を少し混ぜた線 */
.cards {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (min-width: 48rem) {
  .cards {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.card {
  background: color-mix(in srgb, var(--c) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--c) 35%, var(--line));
  border-radius: var(--r-m);
  display: grid;
  gap: 8px;
  padding: 8px;
}

.card h4 {
  align-items: center;
  display: flex;
  font-size: 15px;
  gap: 6px;
  line-height: 20px;
  margin: 0 0 2px 2px;
}

.swatch {
  background: var(--c);
  border-radius: 50%;
  height: 10px;
  width: 10px;
}

/* キューブ・コアキューブ: アイコン(その色) + 名前(小さく淡く)の下に大きな値。押すとテンキー */
.cell {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  gap: 6px;
  min-height: 58px;
  padding: 8px;
  text-align: left;
}

.cube {
  color: var(--c);
  fill: currentColor;
  flex: none;
}

.cell-text {
  display: grid;
  min-width: 0;
}

.cell-name {
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
  white-space: nowrap;
}

.cell-value {
  font-size: 19px;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  line-height: 24px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 不足(負の余り): 注意色 */
.cell-value.deficit {
  color: var(--error);
}
</style>
