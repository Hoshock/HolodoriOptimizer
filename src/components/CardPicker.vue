<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef } from "vue";

import CardTile from "./CardTile.vue";
import { cards } from "../data";
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
  /** pick: 1 枚選んで閉じる / exclude: タップでトグル(複数) */
  mode: "pick" | "exclude";
  selectedId?: string | null;
  excludedIds?: string[];
  disabled?: Map<string, string>;
}>();

const emit = defineEmits<{
  pick: [cardId: string];
  toggle: [cardId: string];
  close: [];
}>();

const query = ref("");
/** 所属: 単一選択(null = すべて) */
const affiliationFilter = ref<string | null>(null);
/** タイプ: セグメンテッドコントロール(単一選択、null = すべて) */
const typeFilter = ref<CardType | null>(null);
const searchInput = useTemplateRef("searchInput");

const filtered = computed(() => {
  let list = cards.filter((c) => matchesQuery(c, query.value));
  if (affiliationFilter.value !== null) {
    const aff = affiliationFilter.value;
    list = list.filter((c) => affiliationsOfCard(c).includes(aff));
  }
  if (typeFilter.value !== null) {
    list = list.filter((c) => c.type === typeFilter.value);
  }
  return sortCards(list);
});

function isExcluded(card: Card): boolean {
  return props.excludedIds?.includes(card.id) ?? false;
}

function activate(card: Card): void {
  if (props.mode === "pick") {
    emit("pick", card.id);
  } else {
    emit("toggle", card.id);
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") emit("close");
}

/** iOS Safari 対応の背景スクロールロック(body を position:fixed にして退避/復元) */
let savedScrollY = 0;
onMounted(() => {
  document.addEventListener("keydown", onKeydown);
  savedScrollY = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${String(savedScrollY)}px`;
  document.body.style.width = "100%";
  void nextTick(() => searchInput.value?.focus());
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.width = "";
  window.scrollTo(0, savedScrollY);
});

const TYPE_KEYS: CardType[] = ["cute", "happy", "pure"];
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" :aria-label="props.title">
      <header class="sheet-head">
        <h3>{{ props.title }}</h3>
        <button type="button" class="close-button" aria-label="閉じる" @click="emit('close')">
          ✕
        </button>
      </header>

      <div class="controls">
        <input
          ref="searchInput"
          v-model="query"
          type="search"
          class="search"
          placeholder="ホロメン名・カード名で検索"
          aria-label="カード検索"
        />

        <div class="chip-scroll-wrap">
          <div class="chip-scroll" role="radiogroup" aria-label="所属で絞り込み(1つ選択)">
            <button
              type="button"
              class="chip"
              role="radio"
              :aria-checked="affiliationFilter === null"
              :class="{ active: affiliationFilter === null }"
              @click="affiliationFilter = null"
            >
              <span v-if="affiliationFilter === null" class="chip-check">✓</span>すべて
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
              <span v-if="affiliationFilter === aff" class="chip-check">✓</span
              >{{ affiliationName(aff) }}
            </button>
          </div>
        </div>

        <div class="segment" role="radiogroup" aria-label="タイプで絞り込み(1つ選択)">
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
            :class="[`seg-${t}`, { active: typeFilter === t }]"
            @click="typeFilter = t"
          >
            {{ TYPE_LABELS[t] }}
          </button>
        </div>
      </div>

      <p v-if="props.mode === 'exclude'" class="mode-hint">
        タップで除外 ⇄ 解除(除外中 {{ props.excludedIds?.length ?? 0 }} 枚)
      </p>

      <div class="grid" role="list">
        <CardTile
          v-for="card in filtered"
          :key="card.id"
          role="listitem"
          :card="card"
          :selected="props.mode === 'pick' && props.selectedId === card.id"
          :excluded="isExcluded(card)"
          :disabled="props.disabled?.has(card.id) ?? false"
          :disabled-reason="props.disabled?.get(card.id)"
          @activate="activate(card)"
        />
        <p v-if="filtered.length === 0" class="empty">条件に合うカードがありません</p>
      </div>

      <footer v-if="props.mode === 'exclude'" class="sheet-foot">
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

.sheet-head {
  align-items: center;
  display: flex;
  flex-shrink: 0;
  justify-content: space-between;
  padding: 12px 16px 4px;
}

.sheet-head h3 {
  font-size: 18px;
  margin: 0;
}

.close-button {
  align-items: center;
  background: var(--bg);
  border: none;
  border-radius: 50%;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-size: 15px;
  height: 44px;
  justify-content: center;
  width: 44px;
}

.controls {
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 8px;
  padding: 0 16px 12px;
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

.chip-check {
  margin-right: 4px;
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

.seg-all-active {
  background: var(--ink);
  color: #fff;
  font-weight: 700;
}

.seg-cute.active {
  background: var(--cute-tint);
  box-shadow: inset 0 -2px 0 var(--cute);
  color: var(--cute-text);
  font-weight: 700;
}

.seg-happy.active {
  background: var(--happy-tint);
  box-shadow: inset 0 -2px 0 var(--happy);
  color: var(--happy-text);
  font-weight: 700;
}

.seg-pure.active {
  background: var(--pure-tint);
  box-shadow: inset 0 -2px 0 var(--pure);
  color: var(--pure-text);
  font-weight: 700;
}

.mode-hint {
  color: var(--ink-2);
  flex-shrink: 0;
  font-size: 13px;
  margin: 0;
  padding: 8px 16px 0;
}

.grid {
  align-content: start;
  display: grid;
  flex: 1;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
}

.empty {
  color: var(--ink-2);
  grid-column: 1 / -1;
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
