<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";

import CloseButton from "./CloseButton.vue";
import PageCarousel from "./PageCarousel.vue";
import UnitBreakdown from "./UnitBreakdown.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { useModalChrome } from "../composables/useModalChrome";
import type { BloomMap } from "../data/bloom";
import type { GreenBoardEffects } from "../data/greenBoard";
import type { Card } from "../data/types";
import type { BoardMap } from "../storage/boards";

/**
 * 1 ページ = 登録番号 1 つ。未登録の番号も同じ並びで出すので、ページ番号 = ユニットの番号になる
 * (登録ぶんだけを並べた版は「ユニット3なのに2ページしかないのはどういうことだ？」— 2026-09-09)
 */
export interface UnitPage {
  /** 登録番号(1〜UNIT_SLOT_COUNT) */
  slot: number;
  /** null = その番号は未登録 */
  unit: { candidate: CandidateView; leader: Card } | null;
}

/**
 * Step 0「ユニット」から開く、お気に入りユニットの詳細シート(2026-09-09 ユーザー指定)。
 * 中身は結果詳細と同じ UnitBreakdown で、番号順に左右のページ送りで切り替える。
 * 数値は登録した時点のものではなく、いまの開花・ボード・アカウント補正で計算し直した値
 * (呼び出し側が毎回評価して渡す)
 */
const props = defineProps<{
  /** 番号 1〜10 の全ページ(未登録の番号も含む。1 件も登録がないときは入口のボタンを disabled にする) */
  pages: UnitPage[];
  /** カード ID → 開花段階。スキル文言の解決と開花アイコンに使う */
  blooms?: BloomMap;
  /** ホロメン ID → 青ボードの解放マス */
  boards?: BoardMap;
  /** 緑ボード(アカウント全体の合計) */
  green?: GreenBoardEffects | null;
}>();

const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const sheet = useTemplateRef<HTMLElement>("sheet");
/** 開いた直後は最初に登録されている番号を出す(未登録のページから始めない) */
const page = ref(
  Math.max(
    0,
    props.pages.findIndex((p) => p.unit !== null),
  ),
);
const currentSlot = computed(() => props.pages[page.value]?.slot ?? 1);
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div
      ref="sheet"
      class="sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="`ユニット${currentSlot}の詳細`"
    >
      <header class="sheet-head">
        <h3>ユニット{{ currentSlot }}</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <!-- 1 ページが縦に長いので「n / N」と三角は上に置く。スワイプはシート全体で拾う -->
        <PageCarousel
          v-model="page"
          :items="props.pages"
          label="ユニット（横にスクロール）"
          nav-position="top"
          :swipe-element="sheet"
        >
          <template #page="{ item }">
            <UnitBreakdown
              v-if="item.unit"
              :candidate="item.unit.candidate"
              :leader="item.unit.leader"
              :blooms="props.blooms"
              :boards="props.boards"
              :green="props.green"
            />
            <p v-else class="empty-msg">未登録</p>
          </template>
        </PageCarousel>
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

/* ページヘッダ・ピッカーと同寸法(77px)・同文字サイズ(24px/900) */
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

/* 未登録の番号のページ。空プレースホルダは中央の 1 行値のみ(UnitSlot / SongRow と同じ字送り) */
.empty-msg {
  align-items: center;
  color: var(--ink-2);
  display: flex;
  font-size: 14px;
  font-weight: 600;
  justify-content: center;
  margin: 0;
  min-height: 120px;
}
</style>
