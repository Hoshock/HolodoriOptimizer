<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";

import CloseButton from "./CloseButton.vue";
import PageCarousel from "./PageCarousel.vue";
import PageNav from "./PageNav.vue";
import UnitBreakdown from "./UnitBreakdown.vue";
import UnitStar from "./UnitStar.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { useCopyTuning } from "../composables/useCopyTuning";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById } from "../data";
import { cardLabel } from "../ui/labels";
import { shareUnit } from "../ui/share";
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

/*
 * 結果の共有(2026-09-14 ユーザー指示)。渡すのは画面に出ている 2 つの値(リーダーと表示中のユニットスコア)と
 * トップページの URL だけで、所持カードの一覧や保存内容は渡さない。共有シートが使えない環境では X の
 * 投稿画面を開き、それも塞がれていたらテキストをコピーする(src/ui/share.ts)
 */
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;
// 共有文の言い回しは開発用の「文言・配置」で試せる
const { tuning } = useCopyTuning();
async function share(candidate: CandidateView): Promise<void> {
  const leader = leaderOf(candidate);
  if (!leader) return;
  const outcome = await shareUnit(
    { leaderLabel: cardLabel(leader), unitScore: candidate.modifiers.adjustedUnitScore },
    {
      share:
        typeof navigator !== "undefined" && "share" in navigator
          ? (data) => navigator.share(data)
          : undefined,
      openUrl: (url) => window.open(url, "_blank", "noopener,noreferrer") !== null,
      writeText:
        typeof navigator !== "undefined" && "clipboard" in navigator
          ? (text) => navigator.clipboard.writeText(text)
          : undefined,
    },
    { lead: tuning.value.shareLead, tag: tuning.value.shareTag },
  );
  // コピーへ落ちたときだけ、押した結果が見えないので 2 秒だけ印を変える(CopyButton と同じ 2 秒)
  if (outcome !== "copied") return;
  copied.value = true;
  if (copiedTimer !== null) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    copied.value = false;
  }, 2000);
}
onUnmounted(() => {
  if (copiedTimer !== null) clearTimeout(copiedTimer);
});
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
                   星は主数値の行の反対の端。その左に共有(2026-09-14) -->
              <template #score-end>
                <button
                  type="button"
                  class="share"
                  :aria-label="copied ? 'コピーしました' : '結果を共有'"
                  @click="void share(candidate)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <!-- 共有: 3 点を線でつないだ形。コピーへ落ちたときだけチェックに変える -->
                    <template v-if="!copied">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <path d="M8.6 10.6l6.8-4M8.6 13.4l6.8 4" />
                    </template>
                    <path v-else d="M4.5 12.5l5 5 10-11" />
                  </svg>
                </button>
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

/* 星の左に置く共有。星より控えめな線のアイコンだけにして、結果の主数値を圧迫しない(2026-09-14) */
.share {
  align-items: center;
  background: none;
  border: none;
  color: var(--ink-2);
  cursor: pointer;
  display: flex;
  height: 42px;
  justify-content: center;
  padding: 0;
  transform: translateY(-4px);
  width: 42px;
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
