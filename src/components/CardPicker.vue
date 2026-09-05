<script lang="ts">
import type { CardType as CardTypeForMemory } from "../data/types";

/** モーダルを閉じても絞り込みを復元するための保持領域(memoryKey ごと。ページ再読み込みでリセット) */
interface PickerFilterMemory {
  query: string;
  affiliation: string | null;
  type: CardTypeForMemory | null;
  selectedOnly: boolean;
}
const filterMemory = new Map<string, PickerFilterMemory>();
</script>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watchEffect } from "vue";

import CardTile from "./CardTile.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { cards } from "../data";
import { bloomOf, cardAtBloom } from "../data/bloom";
import type { BloomMap } from "../data/bloom";
import type { Card, CardType } from "../data/types";
import {
  AFFILIATION_ORDER,
  affiliationName,
  affiliationsOfCard,
  matchesQuery,
  sortCards,
  TYPE_LABELS,
} from "../ui/labels";

const props = defineProps<{
  title: string;
  /** pick: 1 枚選んで閉じる / exclude: タップで除外トグル(複数) / multi: タップで登録トグル(複数) */
  mode: "pick" | "exclude" | "multi";
  /** タイルに出すスキル(リーダー選択= costume、メンバー・除外= member) */
  skillView: "costume" | "member";
  /** 選択候補のカードプール(省略時は全カード) */
  pool?: Card[];
  selectedId?: string | null;
  /** multi: 登録済み(選択中)のカード ID */
  selectedIds?: string[];
  excludedIds?: string[];
  disabled?: Map<string, string>;
  /** カード ID → 開花段階(未登録は 0)。スキル文言の表示解決に使う */
  blooms?: BloomMap;
  /** multi: 登録済みカードに開花段階のステッパーを出す(所持ピッカー) */
  bloomControl?: boolean;
  /** 指定すると、閉じても絞り込み(検索・所属・タイプ・状態)を保持して次回復元する */
  memoryKey?: string;
}>();

const emit = defineEmits<{
  pick: [cardId: string];
  toggle: [cardId: string];
  bloom: [cardId: string, delta: number];
  close: [];
}>();

const saved = props.memoryKey ? filterMemory.get(props.memoryKey) : undefined;
const query = ref(saved?.query ?? "");
/** 所属: 単一選択(null = すべて) */
const affiliationFilter = ref<string | null>(saved?.affiliation ?? null);
/** タイプ: セグメンテッドコントロール(単一選択、null = すべて) */
const typeFilter = ref<CardType | null>(saved?.type ?? null);
/** 状態: 選択済み(登録済み / 除外中)だけに絞る(multi / exclude のみ。既定はすべて) */
const selectedOnly = ref(saved?.selectedOnly ?? false);
const sheet = useTemplateRef("sheet");

watchEffect(() => {
  if (!props.memoryKey) return;
  filterMemory.set(props.memoryKey, {
    query: query.value,
    affiliation: affiliationFilter.value,
    type: typeFilter.value,
    selectedOnly: selectedOnly.value,
  });
});

/**
 * 開いた時点で選択中のカードをリストの先頭にフィーチャーする(単一選択のみ)。
 * 持ち上げは開いた瞬間の 1 回だけで、開いている間に並びは動かさない
 */
const featuredId = props.mode === "pick" ? (props.selectedId ?? null) : null;

const filtered = computed(() => {
  let list = (props.pool ?? cards).filter((c) => matchesQuery(c, query.value));
  if (affiliationFilter.value !== null) {
    const aff = affiliationFilter.value;
    list = list.filter((c) => affiliationsOfCard(c).includes(aff));
  }
  if (typeFilter.value !== null) {
    list = list.filter((c) => c.type === typeFilter.value);
  }
  if (selectedOnly.value && props.mode !== "pick") {
    list = list.filter((c) => (props.mode === "exclude" ? isExcluded(c) : isSelected(c)));
  }
  const sorted = sortCards(list);
  if (featuredId !== null) {
    const index = sorted.findIndex((c) => c.id === featuredId);
    if (index > 0) {
      const [featured] = sorted.splice(index, 1);
      if (featured) sorted.unshift(featured);
    }
  }
  return sorted;
});

function isExcluded(card: Card): boolean {
  return props.excludedIds?.includes(card.id) ?? false;
}

function isSelected(card: Card): boolean {
  if (props.mode === "pick") return props.selectedId === card.id;
  if (props.mode === "multi") return props.selectedIds?.includes(card.id) ?? false;
  return false;
}

/** 表示するカード(スキル文言を開花段階に解決したもの)。id 等は元と同じ */
function displayCard(card: Card): Card {
  return cardAtBloom(card, bloomOf(props.blooms, card.id));
}

function activate(card: Card): void {
  if (props.mode === "pick") {
    emit("pick", card.id);
  } else {
    emit("toggle", card.id);
  }
}

useModalChrome(() => emit("close"));
// フォーカスは検索入力でなくシート自体へ(入力に当てるとモバイルでキーボードが開いてしまう)
onMounted(() => {
  void nextTick(() => sheet.value?.focus());
});

const TYPE_KEYS: CardType[] = ["cute", "happy", "pure"];
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div
      ref="sheet"
      class="sheet"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      :aria-label="props.title"
    >
      <div class="controls">
        <input
          v-model="query"
          type="search"
          class="search"
          placeholder="ホロメン名・カード名で検索"
          aria-label="カード検索"
        />

        <div class="chip-scroll-wrap">
          <div class="chip-scroll" role="radiogroup" aria-label="所属で絞り込み（1つ選択）">
            <button
              type="button"
              class="chip"
              role="radio"
              :aria-checked="affiliationFilter === null"
              :class="{ active: affiliationFilter === null }"
              @click="affiliationFilter = null"
            >
              すべて
            </button>
            <button
              v-for="aff in AFFILIATION_ORDER"
              :key="aff"
              type="button"
              class="chip"
              role="radio"
              :aria-checked="affiliationFilter === aff"
              :class="{ active: affiliationFilter === aff }"
              @click="affiliationFilter = aff"
            >
              {{ affiliationName(aff) }}
            </button>
          </div>
        </div>

        <div class="segment" role="radiogroup" aria-label="タイプで絞り込み（1つ選択）">
          <button
            type="button"
            class="seg"
            role="radio"
            :aria-checked="typeFilter === null"
            :class="{ 'seg-all-active': typeFilter === null }"
            @click="typeFilter = null"
          >
            すべて
          </button>
          <button
            v-for="t in TYPE_KEYS"
            :key="t"
            type="button"
            class="seg"
            role="radio"
            :aria-checked="typeFilter === t"
            :class="{ 'seg-all-active': typeFilter === t }"
            @click="typeFilter = t"
          >
            {{ TYPE_LABELS[t] }}
          </button>
        </div>

        <div
          v-if="props.mode !== 'pick'"
          class="segment state-segment"
          role="radiogroup"
          aria-label="選択状態で絞り込み（1つ選択）"
        >
          <button
            type="button"
            class="seg"
            role="radio"
            :aria-checked="!selectedOnly"
            :class="{ 'seg-all-active': !selectedOnly }"
            @click="selectedOnly = false"
          >
            すべて
          </button>
          <button
            type="button"
            class="seg"
            role="radio"
            :aria-checked="selectedOnly"
            :class="{ 'seg-all-active': selectedOnly }"
            @click="selectedOnly = true"
          >
            {{ props.mode === "exclude" ? "除外中" : "登録済み" }}
          </button>
        </div>
      </div>

      <div class="grid" role="list">
        <CardTile
          v-for="card in filtered"
          :key="card.id"
          role="listitem"
          :card="displayCard(card)"
          :skill-view="props.skillView"
          :selected="isSelected(card)"
          :excluded="isExcluded(card)"
          :disabled="props.disabled?.has(card.id) ?? false"
          :disabled-reason="props.disabled?.get(card.id)"
          :bloom-control="props.bloomControl"
          :bloom="bloomOf(props.blooms, card.id)"
          @activate="activate(card)"
          @bloom-change="(delta) => emit('bloom', card.id, delta)"
        />
        <p v-if="filtered.length === 0" class="empty">条件に合うカードがありません</p>
      </div>

      <!--
        ヘッダ(タイトル・✕)は置かない(2026-09-05 ユーザー指示)。単一選択はカードをタップした時点で完了なので
        ボタンも置かず、複数選択(除外・所持)だけ下に「完了」を置く。件数はメイン画面の行ボタンに出ているので添えない
      -->
      <footer v-if="props.mode !== 'pick'" class="sheet-foot">
        <button type="button" class="done-button" @click="emit('close')">完了</button>
      </footer>
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

/* モバイルはフルスクリーンシート、広い画面では中央のダイアログ */
.sheet {
  background: var(--surface);
  box-shadow: var(--shadow-sheet);
  display: flex;
  flex-direction: column;
  height: 100dvh;
  outline: none; /* 開いた直後のフォーカス先(tabindex=-1)なのでリングを出さない */
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

/*
 * ピッカーは白い 1 枚のシート(ヘッダ → 絞り込み → 一覧)。カードの入れ子や内側スクロールにしない
 * (カードスタイル案は「キモすぎるしわかりにくすぎる」で却下 — 2026-09-05)。
 * 部品(タイル・曲行)はメインのパネルと同じ固定高で、幅はシート幅に従う
 */
.controls {
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 8px;
  padding: 16px 16px 12px;
}

.search {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink);
  font-size: 16px; /* iOS の自動ズーム防止のため 16px 未満にしない */
  padding: 8px 12px;
  width: 100%;
}

.search:focus {
  border-color: var(--link);
  outline: 2px solid var(--link);
  outline-offset: -1px;
}

/* 所属: 横スクロール 1 行チップ。右端フェードでスクロール可能性を示す */
.chip-scroll-wrap {
  margin-right: -16px;
  position: relative;
}

.chip-scroll-wrap::after {
  background: linear-gradient(to left, var(--surface), transparent);
  content: "";
  height: 100%;
  pointer-events: none;
  position: absolute;
  right: 0;
  top: 0;
  width: 24px;
}

.chip-scroll {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-right: 24px;
  scrollbar-width: none;
  white-space: nowrap;
}

.chip-scroll::-webkit-scrollbar {
  display: none;
}

.chip {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  color: var(--ink-2);
  cursor: pointer;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  height: 32px;
  padding: 0 14px;
}

.chip.active {
  background: var(--ink);
  border-color: var(--ink);
  color: #fff;
}

/* タイプ: 4 分割セグメンテッドコントロール(単一選択) */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  overflow: hidden;
}

.seg {
  background: var(--surface);
  border: none;
  border-left: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  height: 40px;
}

.seg:first-child {
  border-left: none;
}

/* 状態(すべて / 登録済み・除外中): 2 分割 */
.state-segment {
  grid-template-columns: 1fr 1fr;
}

.seg-all-active {
  background: var(--ink);
  color: #fff;
  font-weight: 700;
}

/* 1 行 1 枚の縦リスト(タイルがスキル情報を持つため) */
.grid {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
}

.empty {
  color: var(--ink-2);
  text-align: center;
}

.sheet-foot {
  border-top: 1px solid var(--line);
  flex-shrink: 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
}

.done-button {
  background: var(--primary);
  border: none;
  border-radius: var(--r-m);
  color: #fff;
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  height: 48px;
  width: 100%;
}

.done-button:active {
  background: var(--primary-press);
}
</style>
