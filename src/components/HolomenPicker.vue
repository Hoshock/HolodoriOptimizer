<script lang="ts">
/** モーダルを閉じても絞り込み・並び順を復元するための保持領域(ページ再読み込みでリセット — 2026-09-06 ユーザー判断) */
type SortKey = "unlocked" | "name";
type SortDirection = "desc" | "asc";

interface HolomenFilterMemory {
  query: string;
  affiliation: string | null;
  sortKey: SortKey;
  sortDirection: Record<SortKey, SortDirection>;
}
let filterMemory: HolomenFilterMemory | undefined;
</script>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watchEffect } from "vue";

import CloseButton from "./CloseButton.vue";
import SkillIcon from "./SkillIcon.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { holomen } from "../data";
import type { BoardMap } from "../storage/boards";
import { AFFILIATION_ORDER, affiliationName, matchesHolomenQuery, sortHolomen } from "../ui/labels";

/**
 * ホロメンボードを入れるホロメンを選ぶピッカー(Step 0 アカウント)。行はホロメン名と
 * 解放したマス数(六角形)だけ。行を押すとそのホロメンのボード画面(BoardSheet)が上に開く
 */
const props = defineProps<{
  /** ホロメン ID → 解放した青マス ID(件数表示に使う) */
  boards: BoardMap;
}>();

const emit = defineEmits<{ pick: [holomenId: string]; close: [] }>();

const query = ref(filterMemory?.query ?? "");
const affiliationFilter = ref<string | null>(filterMemory?.affiliation ?? null);
/** 並び順: 五十音順(既定) / ボード解放数。解放数の同数は五十音順(2026-09-06 ユーザー指定)。閉じても保持 */
const sortKey = ref<SortKey>(filterMemory?.sortKey ?? "name");
const sortDirection = ref<Record<SortKey, SortDirection>>(
  filterMemory?.sortDirection ?? { name: "asc", unlocked: "desc" },
);
const sheet = useTemplateRef("sheet");

watchEffect(() => {
  filterMemory = {
    query: query.value,
    affiliation: affiliationFilter.value,
    sortKey: sortKey.value,
    sortDirection: { ...sortDirection.value },
  };
});

function countOf(holomenId: string): number {
  return props.boards[holomenId]?.length ?? 0;
}

const filtered = computed(() => {
  let list = holomen.filter((h) => matchesHolomenQuery(h, query.value));
  if (affiliationFilter.value !== null) {
    const aff = affiliationFilter.value;
    list = list.filter((h) => h.affiliations.includes(aff));
  }
  const byName = sortHolomen(list);
  const sign = sortDirection.value[sortKey.value] === "desc" ? -1 : 1;
  if (sortKey.value === "name") return sign === 1 ? byName : byName.reverse();
  return byName.sort((a, b) => sign * (countOf(a.id) - countOf(b.id)));
});

/** 同じキーの再タップで向きを反転、別のキーならそのキーの現在の向きのまま切り替える */
function selectSort(key: SortKey): void {
  if (sortKey.value === key) {
    sortDirection.value[key] = sortDirection.value[key] === "desc" ? "asc" : "desc";
  } else {
    sortKey.value = key;
  }
}

const SORT_LABELS: Record<SortKey, Record<SortDirection, string>> = {
  name: { asc: "五十音順", desc: "五十音逆順" },
  unlocked: { desc: "解放の多い順", asc: "解放の少ない順" },
};
const SORT_KEYS: SortKey[] = ["name", "unlocked"];

useModalChrome(() => emit("close"));
onMounted(() => {
  void nextTick(() => sheet.value?.focus());
});
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div
      ref="sheet"
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-label="ホロメンボード"
      tabindex="-1"
    >
      <header class="sheet-head">
        <h3>ホロメンボード</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="controls">
        <input
          v-model="query"
          type="search"
          class="search"
          placeholder="ホロメン名で検索"
          aria-label="ホロメン検索"
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

        <div
          class="segment sort-segment"
          role="radiogroup"
          aria-label="並び順（1つ選択。もう一度押すと逆順）"
        >
          <button
            v-for="k in SORT_KEYS"
            :key="k"
            type="button"
            class="seg"
            role="radio"
            :aria-checked="sortKey === k"
            :class="{ active: sortKey === k }"
            :aria-label="
              sortKey === k
                ? `${SORT_LABELS[k][sortDirection[k]]}（もう一度押すと${SORT_LABELS[k][sortDirection[k] === 'desc' ? 'asc' : 'desc']}）`
                : SORT_LABELS[k][sortDirection[k]]
            "
            @click="selectSort(k)"
          >
            {{ SORT_LABELS[k][sortDirection[k]] }}
            <span v-if="sortKey === k" class="seg-flip" aria-hidden="true">
              {{ sortDirection[k] === "desc" ? "▼" : "▲" }}
            </span>
          </button>
        </div>
      </div>

      <div class="list">
        <button
          v-for="h in filtered"
          :key="h.id"
          type="button"
          class="row"
          @click="emit('pick', h.id)"
        >
          <span class="name">{{ h.name }}</span>
          <SkillIcon
            kind="board"
            :count="countOf(h.id)"
            :label="`解放 ${String(countOf(h.id))} マス`"
          />
        </button>
        <p v-if="filtered.length === 0" class="empty">条件に合うホロメンがいません</p>
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

.sheet {
  background: var(--surface);
  box-shadow: var(--shadow-sheet);
  display: flex;
  flex-direction: column;
  height: 100dvh;
  outline: none;
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

/* ページヘッダ・カードピッカーと同寸法(77px) */
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

.controls {
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 8px;
  padding: 12px 16px;
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

/* 並び順: キーのセグメント。選択中の再タップで向きを反転(曲ピッカーと同形) */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-template-columns: 1fr 1fr;
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

.seg.active {
  background: var(--ink);
  color: #fff;
  font-weight: 700;
}

.seg-flip {
  font-size: 10px;
  margin-left: 6px;
  opacity: 0.8;
}

/* 1 行 1 人。名前左・解放数右の設定行パターン */
.list {
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow-y: auto;
  padding: 8px 16px 16px;
}

.row {
  align-items: center;
  background: var(--surface);
  border: none;
  border-bottom: 1px solid var(--line);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-shrink: 0; /* flex 列の中で潰れて細くならないように(「細くて間違えそう」— 2026-09-06) */
  height: 56px;
  justify-content: space-between;
  padding: 0 4px;
  text-align: left;
  width: 100%;
}

.row:active {
  background: var(--bg);
}

.name {
  font-size: 16px;
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  color: var(--ink-2);
  margin: 16px 0;
  text-align: center;
}
</style>
