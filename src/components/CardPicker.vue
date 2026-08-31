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
  /** ダイアログの見出し */
  title: string;
  /** pick: 1 枚選んで閉じる / exclude: タップでトグル(複数) */
  mode: "pick" | "exclude";
  /** 強調するカード ID(pick: 現在の選択、exclude では未使用) */
  selectedId?: string | null;
  /** 除外中として表示するカード ID */
  excludedIds?: string[];
  /** 選択不可のカード ID → 理由 */
  disabled?: Map<string, string>;
}>();

const emit = defineEmits<{
  pick: [cardId: string];
  toggle: [cardId: string];
  close: [];
}>();

const query = ref("");
const affiliationFilter = ref<string | null>(null);
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

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
  void nextTick(() => searchInput.value?.focus());
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
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
        <div class="chips" role="group" aria-label="期生・所属で絞り込み">
          <button
            type="button"
            class="chip"
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
            :class="{ active: affiliationFilter === aff }"
            @click="affiliationFilter = affiliationFilter === aff ? null : aff"
          >
            {{ affiliationName(aff) }}
          </button>
        </div>
        <div class="chips" role="group" aria-label="タイプで絞り込み">
          <button
            v-for="t in TYPE_KEYS"
            :key="t"
            type="button"
            class="chip"
            :class="[`chip-${t}`, { active: typeFilter === t }]"
            @click="typeFilter = typeFilter === t ? null : t"
          >
            {{ TYPE_LABELS[t] }}
          </button>
        </div>
      </div>

      <p v-if="props.mode === 'exclude'" class="mode-hint">
        タップで除外 ⇄ 解除できます(除外中 {{ props.excludedIds?.length ?? 0 }} 枚)
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
  align-items: center;
  background: rgba(40, 30, 25, 0.45);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 1rem;
  position: fixed;
  z-index: 10;
}

.sheet {
  background: var(--bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lift);
  display: flex;
  flex-direction: column;
  max-height: min(85dvh, 46rem);
  max-width: 44rem;
  overflow: hidden;
  width: 100%;
}

.sheet-head {
  align-items: center;
  display: flex;
  justify-content: space-between;
  padding: 0.9rem 1.1rem 0.4rem;
}

.sheet-head h3 {
  font-size: 1.05rem;
  margin: 0;
}

.close-button {
  background: var(--surface-2);
  border: none;
  border-radius: 999px;
  cursor: pointer;
  color: var(--text);
  font-size: 0.9rem;
  height: 2rem;
  width: 2rem;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0 1.1rem 0.6rem;
}

.search {
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: 999px;
  color: var(--text);
  font-size: 0.95rem;
  padding: 0.5rem 1rem;
}

.search:focus {
  border-color: var(--primary);
  outline: none;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.chip {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.15rem 0.7rem;
  transition:
    background 0.1s,
    color 0.1s;
}

.chip.active {
  background: var(--text);
  border-color: var(--text);
  color: var(--bg);
}

.chip-cute.active {
  background: var(--cute);
  border-color: var(--cute);
  color: #fff;
}

.chip-happy.active {
  background: var(--happy);
  border-color: var(--happy);
  color: #fff;
}

.chip-pure.active {
  background: var(--pure);
  border-color: var(--pure);
  color: #fff;
}

.mode-hint {
  color: var(--text-muted);
  font-size: 0.8rem;
  margin: 0;
  padding: 0 1.1rem 0.4rem;
}

.grid {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr));
  overflow-y: auto;
  padding: 0.2rem 1.1rem 1rem;
}

.empty {
  color: var(--text-muted);
  grid-column: 1 / -1;
  text-align: center;
}

.sheet-foot {
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  padding: 0.7rem 1.1rem;
}

.done-button {
  background: var(--primary);
  border: none;
  border-radius: 999px;
  color: #fff;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 700;
  padding: 0.45rem 1.6rem;
}
</style>
