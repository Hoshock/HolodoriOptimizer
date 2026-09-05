<script lang="ts">
import type { Song as SongForMemory } from "../data/types";

/** モーダルを閉じても絞り込みを復元するための保持領域(ページ再読み込みでリセット) */
/** 並び順のキー(曲長 / EXPERT Lv)と、キーごとの向き。既定は曲長の長い順 */
type SortKey = "duration" | "level";
type SortDirection = "desc" | "asc";

interface SongFilterMemory {
  query: string;
  affiliation: string | null;
  kind: SongForMemory["kind"] | null;
  sortKey: SortKey;
  sortDirection: Record<SortKey, SortDirection>;
}
let filterMemory: SongFilterMemory | undefined;
</script>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watchEffect } from "vue";

import MarqueeText from "./MarqueeText.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { songs } from "../data";
import type { Song } from "../data/types";
import {
  AFFILIATION_ORDER,
  affiliationName,
  affiliationsOfSong,
  artistsLabel,
  formatDuration,
  matchesSongQuery,
} from "../ui/labels";

const props = defineProps<{
  selectedId: string | null;
}>();

const emit = defineEmits<{
  pick: [songId: string];
  close: [];
}>();

const query = ref(filterMemory?.query ?? "");
/** 所属: 単一選択(null = すべて)。曲の所属はアーティストから導く */
const affiliationFilter = ref<string | null>(filterMemory?.affiliation ?? null);
/** オリジナル / カバー: セグメンテッドコントロール(単一選択、null = すべて) */
const kindFilter = ref<Song["kind"] | null>(filterMemory?.kind ?? null);
/**
 * 並び順: キーはセグメンテッドコントロール(単一選択)、向きは選択中のセグメントをもう一度
 * タップして反転する(2026-09-05 ユーザー指定)。同値はゲーム内の並びを保つ
 */
const sortKey = ref<SortKey>(filterMemory?.sortKey ?? "duration");
const sortDirection = ref<Record<SortKey, SortDirection>>(
  filterMemory?.sortDirection ?? { duration: "desc", level: "desc" },
);
const sheet = useTemplateRef("sheet");

watchEffect(() => {
  filterMemory = {
    query: query.value,
    affiliation: affiliationFilter.value,
    kind: kindFilter.value,
    sortKey: sortKey.value,
    sortDirection: { ...sortDirection.value },
  };
});

/**
 * 開いた時点で選択中の曲をリストの先頭にフィーチャーする。
 * 持ち上げは開いた瞬間の 1 回だけで、開いている間に並びは動かさない
 */
const featuredId = props.selectedId;

const filtered = computed(() => {
  let list = songs.filter((s) => matchesSongQuery(s, query.value));
  if (affiliationFilter.value !== null) {
    const aff = affiliationFilter.value;
    list = list.filter((s) => affiliationsOfSong(s).includes(aff));
  }
  if (kindFilter.value !== null) {
    list = list.filter((s) => s.kind === kindFilter.value);
  }
  const key = sortKey.value === "duration" ? durationOf : levelOf;
  const sign = sortDirection.value[sortKey.value] === "desc" ? -1 : 1;
  list.sort((a, b) => sign * (key(a) - key(b)));
  if (featuredId !== null) {
    const index = list.findIndex((s) => s.id === featuredId);
    if (index > 0) {
      const [featured] = list.splice(index, 1);
      if (featured) list.unshift(featured);
    }
  }
  return list;
});

/** 不明値は向きに関わらず末尾に寄せる */
function unknownValue(): number {
  return sortDirection.value[sortKey.value] === "desc" ? -1 : Number.MAX_SAFE_INTEGER;
}

function durationOf(song: Song): number {
  return song.durationSeconds ?? unknownValue();
}

function levelOf(song: Song): number {
  return song.charts.expert?.level ?? unknownValue();
}

/** 選択中のキーをタップしたら向きを反転、別のキーならそのキーの向きのまま切り替える */
function selectSort(key: SortKey): void {
  if (sortKey.value === key) {
    sortDirection.value[key] = sortDirection.value[key] === "desc" ? "asc" : "desc";
  } else {
    sortKey.value = key;
  }
}

/** 並び順のキーになっている値を右列の上段(強調)に出す */
const sortByLevel = computed(() => sortKey.value === "level");

/** ラベルはそのキーの現在の向きを言葉で示す(選択中は再タップで反転) */
const SORT_LABELS: Record<SortKey, Record<SortDirection, string>> = {
  duration: { desc: "長い順", asc: "短い順" },
  level: { desc: "Lv 高い順", asc: "Lv 低い順" },
};
const SORT_KEYS: SortKey[] = ["duration", "level"];

const KIND_LABELS: Record<Song["kind"], string> = {
  original: "オリジナル",
  cover: "カバー",
};
const KIND_KEYS: Song["kind"][] = ["original", "cover"];

useModalChrome(() => emit("close"));
// フォーカスは検索入力でなくシート自体へ(入力に当てるとモバイルでキーボードが開いてしまう)
onMounted(() => {
  void nextTick(() => sheet.value?.focus());
});
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div ref="sheet" class="sheet" role="dialog" aria-modal="true" tabindex="-1" aria-label="曲">
      <header class="sheet-head">
        <h3>曲</h3>
        <button type="button" class="close-button" aria-label="閉じる" @click="emit('close')">
          ✕
        </button>
      </header>

      <div class="controls">
        <input
          v-model="query"
          type="search"
          class="search"
          placeholder="曲名・ホロメン名で検索"
          aria-label="曲検索"
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

        <div class="segment" role="radiogroup" aria-label="オリジナル・カバーで絞り込み（1つ選択）">
          <button
            type="button"
            class="seg"
            role="radio"
            :aria-checked="kindFilter === null"
            :class="{ 'seg-all-active': kindFilter === null }"
            @click="kindFilter = null"
          >
            すべて
          </button>
          <button
            v-for="k in KIND_KEYS"
            :key="k"
            type="button"
            class="seg"
            role="radio"
            :aria-checked="kindFilter === k"
            :class="{ 'seg-all-active': kindFilter === k }"
            @click="kindFilter = k"
          >
            {{ KIND_LABELS[k] }}
          </button>
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
            :class="{ 'seg-all-active': sortKey === k }"
            :aria-label="
              sortKey === k
                ? `${SORT_LABELS[k][sortDirection[k]]}（もう一度押すと${SORT_LABELS[k][sortDirection[k] === 'desc' ? 'asc' : 'desc']}）`
                : SORT_LABELS[k][sortDirection[k]]
            "
            @click="selectSort(k)"
          >
            {{ SORT_LABELS[k][sortDirection[k]] }}
            <!-- 選択中だけ現在の向き(▼ 降順 / ▲ 昇順)を出す。再タップで反転する(2026-09-05 ユーザー指定) -->
            <span v-if="sortKey === k" class="seg-flip" aria-hidden="true">
              {{ sortDirection[k] === "desc" ? "▼" : "▲" }}
            </span>
          </button>
        </div>
      </div>

      <div class="list" role="list">
        <button
          v-for="song in filtered"
          :key="song.id"
          type="button"
          role="listitem"
          class="song-row"
          :class="{ selected: song.id === props.selectedId }"
          @click="emit('pick', song.id)"
        >
          <span class="song-main">
            <MarqueeText class="song-title" :text="song.title" />
            <MarqueeText class="song-artists" :text="artistsLabel(song)" />
          </span>
          <span class="song-meta" :class="{ 'by-level': sortByLevel }">
            <span class="song-duration">
              {{ song.durationSeconds !== null ? formatDuration(song.durationSeconds) : "-:--" }}
            </span>
            <span class="song-level">Lv {{ song.charts.expert?.level ?? "?" }}</span>
          </span>
        </button>
        <p v-if="filtered.length === 0" class="empty">条件に合う曲がありません</p>
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

/* 絞り込み: 検索 → 所属チップ → オリジナル/カバー セグメント(CardPicker と同型) */
.controls {
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 10px;
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

/* オリジナル / カバー: 3 分割セグメンテッドコントロール(単一選択) */
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
}

.seg:first-child {
  border-left: none;
}

/* 並び順: 2 分割(キー)。向きは選択中のセグメントの再タップで反転し、ラベルが変わる */
.sort-segment {
  grid-template-columns: 1fr 1fr;
}

.seg-flip {
  font-size: 10px;
  margin-left: 6px;
  opacity: 0.8;
}

.seg-all-active {
  background: var(--ink);
  color: #fff;
  font-weight: 700;
}

/* 1 行 1 曲の縦リスト */
.list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
}

/* 左: 曲名 + アーティスト / 右: 演奏時間(試算に効く値)+ EXPERT Lv */
.song-row {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  gap: 12px;
  padding: 10px 12px;
  text-align: left;
}

.song-row.selected {
  border: 2px solid var(--ink);
  padding: 9px 11px; /* 太枠でも寸法を変えない */
}

.song-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/* 曲名・アーティストは 1 行固定。収まらないときは MarqueeText がゆっくり横スクロールして全文を見せる */
.song-title {
  color: var(--ink);
  font-size: 15px;
  font-weight: 700;
  line-height: 20px;
}

.song-artists {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 16px;
}

.song-meta {
  align-items: flex-end;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 2px;
  text-align: right;
}

.song-duration {
  color: var(--ink);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  line-height: 20px;
}

.song-level {
  color: var(--ink-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 16px;
}

/* Lv で並べているときは Lv を上段・強調にし、曲長を下段・補足にする(値の書式はそのまま) */
.song-meta.by-level {
  flex-direction: column-reverse;
}

.song-meta.by-level .song-level {
  color: var(--ink);
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}

.song-meta.by-level .song-duration {
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
}

.empty {
  color: var(--ink-2);
  text-align: center;
}
</style>
