<script setup lang="ts">
import { computed } from "vue";

import CloseButton from "./CloseButton.vue";
import PageCarousel from "./PageCarousel.vue";
import PageNav from "./PageNav.vue";
import UnitBreakdown from "./UnitBreakdown.vue";
import UnitStar from "./UnitStar.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById } from "../data";
import type { BloomMap } from "../data/bloom";
import type { ConnectFactorMap } from "../data/connect";
import type { GreenBoardEffects } from "../data/greenBoard";
import { resolveCard } from "../data/resolve";
import type { Card } from "../data/types";
import type { BoardMap } from "../storage/boards";

/**
 * 結果一覧の 1 件を開く詳細シート。中身（内訳）は UnitBreakdown が持つ。
 * 隣の順位も見られるように、下端の固定エリアの三角で前後の順位へ送る
 * （2026-09-09 ユーザー指示「隣接する結果見れるように」。スワイプは許さずボタンだけ）
 */
const props = defineProps<{
  /** 実行結果の全候補（順位の昇順） */
  candidates: CandidateView[];
  /** 実行時のカード ID → 開花段階。スキル文言の解決と開花アイコンに使う */
  blooms?: BloomMap;
  /** 実行時のホロメン ID → 青ボードの解放マス。素の値(ボード込み)の検算に使う */
  boards?: BoardMap;
  /** 実行時の緑ボード(アカウント全体の合計)。null なら効かせていない */
  green?: GreenBoardEffects | null;
  /** ホロメン ID → 色 → マス ID → コネクト倍率（src/data/connect.ts。省略で増幅なし） */
  connect?: ConnectFactorMap;
  /** 候補ごとのお気に入りユニットの登録番号(未登録は null)。並びは candidates と同じ */
  unitSlots?: (number | null)[];
}>();

const emit = defineEmits<{
  close: [];
  favorite: [rank: number];
  /** 「発動頻度の最適化」を開く（ライブ最適化。対象は開いている候補） */
  frequency: [candidate: CandidateView];
  /** 内訳のリーダー・メンバーのタイルを押した（カード詳細を開く） */
  card: [cardId: string];
}>();

useModalChrome(() => emit("close"));

/** 開いている順位（0 始まり）。結果一覧の現在位置と共有する */
const rank = defineModel<number>("rank", { default: 0 });

/** その候補のリーダー（候補ごとに持つ leaderId から引き、実行時の開花段階に解決する） */
function leaderOf(candidate: CandidateView): Card | null {
  const card = cardById.get(candidate.leaderId) ?? null;
  return card ? resolveCard(card, props.blooms, props.boards, props.green, props.connect) : null;
}

const title = computed(() => `${String(rank.value + 1)}位の編成`);

/** 開いている候補が登録されている番号(未登録は null) */
const unitSlot = computed(() => props.unitSlots?.[rank.value] ?? null);
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" :aria-label="`${title}の詳細`">
      <header class="sheet-head">
        <h3>{{ title }}</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <PageCarousel
          v-model="rank"
          :items="props.candidates"
          label="結果"
          nav-position="none"
          no-swipe
        >
          <template #page="{ item: candidate, index: i }">
            <UnitBreakdown
              v-if="leaderOf(candidate)"
              :candidate="candidate"
              :leader="leaderOf(candidate)!"
              :blooms="props.blooms"
              :boards="props.boards"
              :green="props.green"
              :connect="props.connect"
              @frequency="emit('frequency', candidate)"
              @card="emit('card', $event)"
            >
              <!-- お気に入りの登録・解除は結果一覧と同じくここでもできる(2026-09-09 ユーザー指示)。
                   星は主数値の行の反対の端 -->
              <template #score-end>
                <button
                  type="button"
                  class="favorite"
                  aria-haspopup="dialog"
                  :aria-label="
                    unitSlot === null ? 'ユニットに登録' : `ユニット${unitSlot}の登録を解除`
                  "
                  @click="emit('favorite', i)"
                >
                  <UnitStar :slot-number="unitSlot" :registered="unitSlot !== null" :size="42" />
                </button>
              </template>
            </UnitBreakdown>
          </template>
        </PageCarousel>
      </div>

      <!-- 本文の外の固定エリア。縦に長い内訳をスクロールしても順位の送りが残る -->
      <div class="sheet-foot">
        <PageNav v-model="rank" :count="props.candidates.length" />
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

/* 主数値の行の右端に置くお気に入りの星。一覧の 28px の 1.5 倍(2026-09-09 ユーザー指示。2 倍は「デカすぎた」) */
.favorite {
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  height: 42px;
  justify-content: center;
  padding: 0;
  /* 行の中央に揃えると数字の中心線より下に見えるので少し持ち上げる(2026-09-09 ユーザー指示) */
  transform: translateY(-4px);
  width: 42px;
}

/* 下端の固定エリア(順位の送り)。ヘッダと同じ罫線でシートの端に張り付ける */
.sheet-foot {
  background: var(--chrome-foot);
  border-top: 1px solid var(--line);
  flex-shrink: 0;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
}
</style>
