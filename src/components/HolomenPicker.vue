<script lang="ts">
/** モーダルを閉じても絞り込み・並び順を復元するための保持領域(ページ再読み込みでリセット — 2026-09-06 ユーザー判断) */
type SortKey = "unlocked" | "rank" | "name";
type SortDirection = "desc" | "asc";

interface HolomenFilterMemory {
  query: string;
  affiliation: string | null;
  sortKey: SortKey;
  sortDirection: Record<SortKey, SortDirection>;
}
let filterMemory: HolomenFilterMemory | undefined;
/** 各並び順の基準の向き(解放マス・ランクは多い方から、五十音は あ から) */
const DEFAULT_DIRECTION: Record<SortKey, SortDirection> = {
  unlocked: "desc",
  rank: "desc",
  name: "asc",
};
</script>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watchEffect } from "vue";

import CloseButton from "./CloseButton.vue";
import StepperDialog from "./StepperDialog.vue";
import SkillIcon from "./SkillIcon.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { useScrollTopOnChange } from "../composables/useScrollTopOnChange";
import { holomen } from "../data";
import { totalUnlockedCount } from "../data/boardCount";
import { HOLOMEN_RANK_DEFAULT, HOLOMEN_RANK_MAX } from "../data/boardPoints";
import type { BoardConnectMap } from "../storage/boardConnects";
import type { BoardMap } from "../storage/boards";
import type { HolomenRankMap } from "../storage/holomenRank";
import { AFFILIATION_ORDER, affiliationName, matchesHolomenQuery, sortHolomen } from "../ui/labels";

/**
 * ホロメンボードを入れるホロメンを選ぶピッカー(Step 0 アカウント)。行はホロメン名・ホロメンランク(Rank 27。未登録は Rank --)・
 * 解放したマス数(六角形)。名前か六角形を押すとそのホロメンのボード画面(BoardSheet)が上に開き、ランクを押すと +/- ボタン(1 ずつと 10 ずつ。
 * 開始は未登録なら 30)でランクを入れられる(2026-10-04 ユーザー指示。未登録 = ボードPt の制限なし。「未登録に戻す」も同じダイアログから)
 */
const props = defineProps<{
  /** ホロメン ID → 解放した赤マス ID(件数は青と合算) */
  redBoards: BoardMap;
  /** ホロメン ID → 解放した青マス ID(件数表示に使う) */
  boards: BoardMap;
  /** ホロメン ID → 解放した黄マス ID(件数は青と合算) */
  yellowBoards: BoardMap;
  /** ホロメン ID → 解放した緑マス ID(件数は青と合算) */
  greenBoards: BoardMap;
  /** ホロメン ID → 解放済みのコネクトマス(赤 / 青 / 黄。件数に数える)。省略なら解放なし */
  connects?: BoardConnectMap;
  /** ホロメン ID → ホロメンランク(登録済みのホロメンだけ)。省略なら全員未登録 */
  ranks?: HolomenRankMap;
}>();

const emit = defineEmits<{
  pick: [holomenId: string];
  /** ホロメンランクの登録(null で未登録へ戻す) */
  rank: [holomenId: string, rank: number | null];
  close: [];
}>();

/** ランクを入力しているホロメン(null = テンキーを開いていない) */
const rankTarget = ref<string | null>(null);
const rankTargetName = computed(() => holomen.find((h) => h.id === rankTarget.value)?.name ?? "");
function rankLabel(holomenId: string): string {
  const rank = props.ranks?.[holomenId];
  return rank === undefined ? "Rank --" : `Rank ${String(rank)}`;
}
function onRankSubmit(value: number): void {
  const id = rankTarget.value;
  rankTarget.value = null;
  if (id !== null) emit("rank", id, value);
}
function onRankClear(): void {
  const id = rankTarget.value;
  rankTarget.value = null;
  if (id !== null) emit("rank", id, null);
}

const query = ref(filterMemory?.query ?? "");
const affiliationFilter = ref<string | null>(filterMemory?.affiliation ?? null);
/**
 * 並び順: 解放マス順(既定 — 2026-09-11 ユーザー指示) / ランク順 / 五十音順の 3 つ(2026-10-06 ユーザー指示)。それぞれの向きが基準(解放マス・ランクは多い方から、
 * 五十音は あ から)で、同じキーをもう一度押すと逆になり、ラベルに「逆順」が付く。同数は五十音順(2026-09-06 ユーザー指定)。ランク未登録は
 * どちらの向きでも最後。閉じても保持
 */
const sortKey = ref<SortKey>(filterMemory?.sortKey ?? "unlocked");
const sortDirection = ref<Record<SortKey, SortDirection>>(
  filterMemory?.sortDirection ?? { ...DEFAULT_DIRECTION },
);
const sheet = useTemplateRef("sheet");
const listEl = useTemplateRef("list");
/** 絞り込み・並び替え(向きも)を変えたら一覧を先頭へ戻す */
useScrollTopOnChange(listEl, [
  query,
  affiliationFilter,
  sortKey,
  () => sortDirection.value[sortKey.value],
]);

watchEffect(() => {
  filterMemory = {
    query: query.value,
    affiliation: affiliationFilter.value,
    sortKey: sortKey.value,
    sortDirection: { ...sortDirection.value },
  };
});

/** 解放したマス数(赤 + 青 + 黄 + 緑 + 解放済みのコネクトマス。中心は数えない — src/data/boardCount.ts) */
const counts = computed(() => {
  const map = new Map<string, number>();
  for (const h of holomen)
    map.set(
      h.id,
      totalUnlockedCount(
        {
          red: props.redBoards[h.id] ?? [],
          blue: props.boards[h.id] ?? [],
          yellow: props.yellowBoards[h.id] ?? [],
          green: props.greenBoards[h.id] ?? [],
        },
        props.connects?.[h.id] ?? [],
      ),
    );
  return map;
});
function countOf(holomenId: string): number {
  return counts.value.get(holomenId) ?? 0;
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
  if (sortKey.value === "rank") {
    // 未登録は向きに関わらず最後(同数は五十音順のまま — sort は安定)
    const rankOf = (id: string): number | null => props.ranks?.[id] ?? null;
    return byName.sort((a, b) => {
      const ra = rankOf(a.id);
      const rb = rankOf(b.id);
      if (ra === null || rb === null) return ra === rb ? 0 : ra === null ? 1 : -1;
      return sign * (ra - rb);
    });
  }
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

const SORT_LABELS: Record<SortKey, string> = {
  unlocked: "解放マス順",
  rank: "ランク順",
  name: "五十音順",
};
const SORT_KEYS: SortKey[] = ["unlocked", "rank", "name"];
/** 基準の向きから外れているか(= 逆順。ラベルの末尾に「逆順」を付ける) */
const isReversed = (key: SortKey): boolean => sortDirection.value[key] !== DEFAULT_DIRECTION[key];

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
            :aria-label="`${SORT_LABELS[k]}${isReversed(k) ? ' 逆順' : ''}`"
            @click="selectSort(k)"
          >
            {{ SORT_LABELS[k] }}<span v-if="isReversed(k)" class="seg-suffix"> 逆順</span>
          </button>
        </div>
      </div>

      <div ref="list" class="list">
        <div v-for="h in filtered" :key="h.id" class="row">
          <button type="button" class="row-main" @click="emit('pick', h.id)">
            <span class="name">{{ h.name }}</span>
          </button>
          <button
            type="button"
            class="rank-chip"
            :class="{ empty: props.ranks?.[h.id] === undefined }"
            :aria-label="`${h.name}のホロメンランク（${props.ranks?.[h.id] === undefined ? '未登録' : String(props.ranks[h.id])}）を入力`"
            @click="rankTarget = h.id"
          >
            {{ rankLabel(h.id) }}
          </button>
          <button type="button" class="row-icon" @click="emit('pick', h.id)">
            <SkillIcon
              kind="board"
              :count="countOf(h.id)"
              :label="`解放 ${String(countOf(h.id))} マス`"
            />
          </button>
        </div>
        <p v-if="filtered.length === 0" class="empty">条件に合うホロメンがいません</p>
      </div>
    </div>
    <StepperDialog
      v-if="rankTarget !== null"
      :label="`${rankTargetName}のホロメンランク`"
      :value="props.ranks?.[rankTarget] ?? null"
      :initial="HOLOMEN_RANK_DEFAULT"
      unit=""
      :decimals="0"
      :min="1"
      :max="HOLOMEN_RANK_MAX"
      :fine="1"
      :coarse="10"
      clear-label="未登録に戻す"
      @submit="onRankSubmit"
      @clear="onRankClear"
      @cancel="rankTarget = null"
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
  background: var(--selected);
  border-color: var(--ink);
  color: var(--selected-ink);
}

/* 並び順: 3 つのキーのセグメント。選択中の再タップで向きを反転し、ラベルの末尾に「逆順」が付く(曲ピッカーと同形) */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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
  padding: 0 2px;
  white-space: nowrap;
}

.seg:first-child {
  border-left: none;
}

.seg.active {
  background: var(--selected);
  color: var(--selected-ink);
  font-weight: 700;
}

.seg-suffix {
  font-size: 11px;
}

/* 1 行 1 人。名前左・解放数右の設定行パターン。上の余白は置かない — 先頭の行の上だけ下より広く見えた(2026-09-11 ユーザー指摘) */
.list {
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow-y: auto;
  padding: 0 16px 16px;
}

.row {
  align-items: center;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  color: var(--ink);
  display: flex;
  flex-shrink: 0; /* flex 列の中で潰れて細くならないように(「細くて間違えそう」— 2026-09-06) */
  gap: 8px;
  height: 56px;
  padding: 0 4px;
  width: 100%;
}

/* 名前(ボードを開く)。残りの幅を使い、右にランクと解放数 */
.row-main {
  align-items: center;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  display: flex;
  flex: 1;
  height: 100%;
  min-width: 0;
  padding: 0;
  text-align: left;
}

/* ホロメンランク(押すとテンキー)。未登録は淡く Rank -- */
.rank-chip {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  color: var(--ink);
  cursor: pointer;
  flex-shrink: 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  height: 32px;
  padding: 0;
  text-align: center;
  width: 80px;
}

.rank-chip.empty {
  color: var(--ink-2);
  font-weight: 600;
}

.row-icon {
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  height: 100%;
  padding: 0;
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
