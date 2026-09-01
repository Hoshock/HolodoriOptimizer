<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef } from "vue";

import { useModalChrome } from "../composables/useModalChrome";
import { songs } from "../data";
import { formatDuration } from "../ui/labels";

const props = defineProps<{
  selectedId: string | null;
}>();

const emit = defineEmits<{
  pick: [songId: string];
  close: [];
}>();

const query = ref("");
const searchInput = useTemplateRef("searchInput");

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (q === "") return songs;
  return songs.filter((s) => s.title.toLowerCase().includes(q));
});

useModalChrome(() => emit("close"));
onMounted(() => {
  void nextTick(() => searchInput.value?.focus());
});
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="曲を選ぶ">
      <header class="sheet-head">
        <h3>曲を選ぶ</h3>
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
          placeholder="曲名で検索"
          aria-label="曲検索"
        />
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
          <span class="song-title">{{ song.title }}</span>
          <span class="song-info">
            {{
              song.durationSeconds !== null ? formatDuration(song.durationSeconds) : "-:--"
            }}・EXPERT Lv {{ song.charts.expert?.level ?? "?" }}
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
  flex-shrink: 0;
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

.song-row {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 2px;
  padding: 10px 12px;
  text-align: left;
}

.song-row.selected {
  border: 2px solid var(--ink);
  padding: 9px 11px; /* 太枠でも寸法を変えない */
}

.song-title {
  color: var(--ink);
  font-size: 15px;
  font-weight: 700;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.song-info {
  color: var(--ink-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 16px;
}

.empty {
  color: var(--ink-2);
  text-align: center;
}
</style>
