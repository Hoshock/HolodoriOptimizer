<script setup lang="ts">
import { computed, ref, watch } from "vue";

import CloseButton from "./CloseButton.vue";
import PageCarousel from "./PageCarousel.vue";
import PageNav from "./PageNav.vue";
import ShareButton from "./ShareButton.vue";
import UnitBreakdown from "./UnitBreakdown.vue";
import UnitNameDialog from "./UnitNameDialog.vue";
import UnitStar from "./UnitStar.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { useModalChrome } from "../composables/useModalChrome";
import { useUnitShare } from "../composables/useUnitShare";
import { cardLabel } from "../ui/labels";
import { unitDisplayName } from "../storage/units";
import type { BloomMap } from "../data/bloom";
import type { ConnectFactorMap } from "../data/connect";
import type { GreenBoardEffects } from "../data/greenBoard";
import type { Card } from "../data/types";
import type { BoardMap } from "../storage/boards";

/**
 * 1 ページ = 登録済みのユニット 1 つ。**空のページは出さない**(2026-09-16 ユーザー指示)。
 * 番号は 1 から連続しているので、ページ番号 = ユニットの番号のままになる
 * (2026-09-09 の「未登録の番号も並べる」は、番号が飛べなくなったこの指示で置き換えた)
 */
export interface UnitPage {
  /** 登録番号(1〜UNIT_SLOT_COUNT) */
  slot: number;
  /** 付けた名前(付けていなければ null。表示は unitDisplayName で「ユニット{番号}」へ落とす) */
  name: string | null;
  /** 中身。カードデータで解決できなかったときだけ null */
  unit: { candidate: CandidateView; leader: Card } | null;
}

/**
 * サイドメニューの「お気に入り」から開く、お気に入りユニットの詳細シート(2026-09-09 ユーザー指定。入口は Step 0「ユニット」から
 * 2026-09-11 にサイドメニューへ移し「お気に入り」と改名)。
 * 中身は結果詳細と同じ UnitBreakdown で、番号順に左右のページ送りで切り替える。
 * 数値は登録した時点のものではなく、いまの開花・ボード・アカウント補正で計算し直した値
 * (呼び出し側が毎回評価して渡す)
 */
const props = defineProps<{
  /** 登録しているぶんのページ(空は含まない)。1 件も登録がなくても開ける — 2026-09-09 ユーザー指示 */
  pages: UnitPage[];
  /** カード ID → 開花段階。スキル文言の解決と開花アイコンに使う */
  blooms?: BloomMap;
  /** ホロメン ID → 青ボードの解放マス */
  boards?: BoardMap;
  /** 緑ボード(アカウント全体の合計) */
  green?: GreenBoardEffects | null;
  /** ホロメン ID → 色 → マス ID → コネクト倍率（src/data/connect.ts。省略で増幅なし） */
  connect?: ConnectFactorMap;
}>();

const emit = defineEmits<{
  close: [];
  release: [slot: number];
  /** 「発動頻度の最適化」を開く（ライブ最適化。対象は開いているユニット） */
  frequency: [candidate: CandidateView];
  /** 「検索画面に入力」— 開いているユニットをメイン画面のリーダー・メンバー欄へ入れる */
  load: [candidate: CandidateView];
  /** 名前を付け直す（2026-09-15 ユーザー指示。空文字なら名前なしへ戻す） */
  rename: [slot: number, name: string];
  /** 内訳のリーダー・メンバーのタイルを押した（カード詳細を開く） */
  card: [cardId: string, bloom: number];
}>();

useModalChrome(() => emit("close"));

/** 開いた直後は 1 件目から */
const page = ref(0);
const currentSlot = computed(() => props.pages[page.value]?.slot ?? 1);
const currentPage = computed(() => props.pages[page.value] ?? null);
/** 1 件も登録がないか(そのときだけ「未登録」の 1 枚を出す) */
const empty = computed(() => props.pages.length === 0);
/**
 * ヘッダに出す名前。付けていなければ「ユニット{番号}」。
 * 登録が 1 件もないときは番号を名乗らず「お気に入り」(入口の名前 — 2026-09-16 ユーザー指示)
 */
const currentName = computed(() =>
  empty.value ? "お気に入り" : unitDisplayName(currentSlot.value, currentPage.value?.name),
);
// 解除で後ろのユニットが前へ詰まるので、末尾を消したときは 1 つ手前のページへ寄せる
watch(
  () => props.pages.length,
  (length) => {
    if (page.value > Math.max(0, length - 1)) page.value = Math.max(0, length - 1);
  },
);

/** 名前を付け直すダイアログの開閉（開いている番号が対象） */
const renaming = ref(false);
function onRename(name: string): void {
  renaming.value = false;
  emit("rename", currentSlot.value, name);
}

/** 共有（結果詳細と同じ形。2026-09-15 ユーザー指示「ユニットのページに共有ボタンがない」） */
const { copied, share } = useUnitShare();
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" :aria-label="`${currentName}の詳細`">
      <header class="sheet-head">
        <!-- 名前は編集できる（鉛筆は名前のすぐ隣。未登録の番号では出さない — 2026-09-15 ユーザー指示） -->
        <h3>{{ currentName }}</h3>
        <button
          v-if="currentPage?.unit"
          type="button"
          class="rename"
          aria-haspopup="dialog"
          :aria-label="`${currentName}の名前を変える`"
          @click="renaming = true"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <!-- 鉛筆（自作。公式アセットは使わない — ADR-002） -->
            <path d="M4 20h4l10.5-10.5a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z" />
            <path d="M14.5 6.5l3.5 3.5" />
          </svg>
        </button>
        <span class="head-gap" />
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <!-- 1 件も登録がないときだけ、カルーセルの代わりに 1 枚ぶんの「未登録」を出す -->
        <p v-if="empty" class="empty-msg">未登録</p>
        <!-- 送りは下端の固定エリアの三角と、左右のスワイプ(2026-09-16 ユーザー指示で追加) -->
        <PageCarousel
          v-else
          v-model="page"
          :items="props.pages"
          label="ユニット"
          nav-position="none"
        >
          <template #page="{ item }">
            <UnitBreakdown
              v-if="item.unit"
              :candidate="item.unit.candidate"
              :leader="item.unit.leader"
              :blooms="props.blooms"
              :boards="props.boards"
              :green="props.green"
              :connect="props.connect"
              loadable
              @frequency="emit('frequency', item.unit.candidate)"
              @load="emit('load', item.unit.candidate)"
              @card="(id, b) => emit('card', id, b)"
            >
              <!-- ここからも外せる(2026-09-09 ユーザー指示)。位置と大きさは結果詳細の星と同じ。
                   登録済みなので常に金の星で、押すと解除の確認が出る(番号は出さない — 2026-09-16) -->
              <template #score-end>
                <ShareButton
                  :copied="copied"
                  @share="
                    void share(
                      cardLabel(item.unit.leader),
                      item.unit.candidate.modifiers.adjustedUnitScore,
                    )
                  "
                />
                <button
                  type="button"
                  class="favorite"
                  aria-haspopup="dialog"
                  aria-label="お気に入りから外す"
                  @click="emit('release', item.slot)"
                >
                  <UnitStar registered :size="42" />
                </button>
              </template>
            </UnitBreakdown>
            <p v-else class="empty-msg">未登録</p>
          </template>
        </PageCarousel>
      </div>

      <UnitNameDialog
        v-if="renaming"
        :value="currentPage?.name ?? ''"
        :slot-number="currentSlot"
        @submit="onRename"
        @cancel="renaming = false"
      />

      <!-- 本文の外の固定エリア。縦に長い内訳をスクロールしても番号の送りが残る -->
      <div class="sheet-foot">
        <PageNav v-model="page" :count="Math.max(1, props.pages.length)" />
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
  background: var(--chrome-head);
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  justify-content: space-between;
  padding: 16px;
}

/* 鉛筆はヘッダの見出しのすぐ隣。ヘッダの高さ(77px)は変えない */
.rename {
  align-items: center;
  background: none;
  border: none;
  color: var(--ink-2);
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  height: 32px;
  justify-content: center;
  padding: 0;
  width: 32px;
}

/* 見出し + 鉛筆 と ✕ の間を空ける(justify-content: space-between の相手) */
.head-gap {
  flex: 1;
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

/* 主数値の行の右端に置くお気に入りの星(押すと解除の確認)。一覧の 28px の 1.5 倍(2026-09-09 ユーザー指示。2 倍は「デカすぎた」) */
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

/* 下端の固定エリア(ページ送り)。ヘッダと同じ罫線でシートの端に張り付ける */
.sheet-foot {
  background: var(--chrome-foot);
  border-top: 1px solid var(--line);
  flex-shrink: 0;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
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
