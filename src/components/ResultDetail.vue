<script setup lang="ts">
import CloseButton from "./CloseButton.vue";
import UnitBreakdown from "./UnitBreakdown.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { useModalChrome } from "../composables/useModalChrome";
import type { BloomMap } from "../data/bloom";
import type { GreenBoardEffects } from "../data/greenBoard";
import type { Card } from "../data/types";
import type { BoardMap } from "../storage/boards";

/** 結果一覧の 1 件を開く詳細シート。中身（内訳）は UnitBreakdown が持つ */
const props = defineProps<{
  /** 1 始まりの順位 */
  rank: number;
  candidate: CandidateView;
  /** リーダー(実行時の開花段階に解決済みのカード) */
  leader: Card;
  /** 実行時のカード ID → 開花段階。スキル文言の解決と開花アイコンに使う */
  blooms?: BloomMap;
  /** 実行時のホロメン ID → 青ボードの解放マス。素の値(ボード込み)の検算に使う */
  boards?: BoardMap;
  /** 実行時の緑ボード(アカウント全体の合計)。null なら効かせていない */
  green?: GreenBoardEffects | null;
}>();

const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" :aria-label="`${props.rank}位の編成の詳細`">
      <header class="sheet-head">
        <h3>{{ props.rank }}位の編成</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <UnitBreakdown
          :candidate="props.candidate"
          :leader="props.leader"
          :blooms="props.blooms"
          :boards="props.boards"
          :green="props.green"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  background: rgba(35, 48, 61, 0.4);
  inset: 0;
  position: fixed;
  z-index: 10;
}

/* モバイルはフルスクリーンシート、広い画面では中央のダイアログ(CardPicker と同型) */
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

/* ページヘッダ・ピッカーと同寸法(77px)・同文字サイズ(24px/900)— 12px/18px のままで「他のヘッダと合ってる？」— 2026-09-07 */
.sheet-head {
  align-items: center;
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
</style>
