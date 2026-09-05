<script setup lang="ts">
import { DEFAULT_SONG_DURATION_SECONDS } from "../data/live";
import type { Song } from "../data/types";
import { artistsLabel, formatDuration } from "../ui/labels";

/**
 * 曲 1 件の行。曲ピッカーの一覧とメイン画面の Step 5 で同じ部品を使い、幅・高さを一致させる。
 * 左: 曲名 + アーティスト(1 行固定、収まらないときは省略記号 — スクロール表示は 2026-09-05 に廃止)/ 右: 演奏時間 + EXPERT Lv。
 * song が null のときは「指定なし」(曲は選ばず、全曲の演奏時間の中央値で試算する)を同じ形で示す
 */
const props = defineProps<{
  song: Song | null;
  /** ピッカーで選択中(太枠) */
  selected?: boolean;
  /** Lv で並べているとき: Lv を上段・強調にし、曲長を下段・補足にする */
  byLevel?: boolean;
  /** 右上に解除ボタンを重ねる文脈で、右の値をその左に避ける */
  clearable?: boolean;
  ariaLabel?: string;
}>();

const emit = defineEmits<{ activate: [] }>();
</script>

<template>
  <button
    type="button"
    class="song-row"
    :class="{ selected: props.selected, empty: props.song === null, clearable: props.clearable }"
    :aria-label="props.ariaLabel"
    @click="emit('activate')"
  >
    <template v-if="props.song">
      <span class="song-main">
        <span class="song-title">{{ props.song.title }}</span>
        <span class="song-artists">{{ artistsLabel(props.song) }}</span>
      </span>
      <span class="song-meta" :class="{ 'by-level': props.byLevel }">
        <span class="song-duration">
          {{
            props.song.durationSeconds !== null
              ? formatDuration(props.song.durationSeconds)
              : "-:--"
          }}
        </span>
        <span class="song-level">Lv {{ props.song.charts.expert?.level ?? "?" }}</span>
      </span>
    </template>
    <template v-else>
      <span class="song-main">
        <span class="song-title empty-msg">指定なし</span>
      </span>
      <span class="song-meta">
        <span class="song-duration empty-msg">
          {{ formatDuration(DEFAULT_SONG_DURATION_SECONDS) }}
        </span>
        <span class="song-level">全曲の中央値</span>
      </span>
    </template>
  </button>
</template>

<style scoped>
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
  width: 100%;
}

.song-row:active {
  background: var(--bg);
}

.song-row.selected {
  border: 2px solid var(--ink);
  padding: 9px 11px; /* 太枠でも寸法を変えない */
}

/* 未指定: 点線枠(空プレースホルダの規約)。寸法は充填時と同じ */
.song-row.empty {
  background: var(--bg);
  border-style: dashed;
}

/* 右上の解除ボタン(28px + 余白)を避ける */
.song-row.clearable {
  padding-right: 44px;
}

.song-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
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

.song-artists {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* 未指定の実値(指定なし・中央値)はプレースホルダの色で */
.empty-msg {
  color: var(--ink-2);
  font-weight: 600;
}
</style>
