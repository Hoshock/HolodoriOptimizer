<script setup lang="ts">
import { computed } from "vue";

import CloseButton from "./CloseButton.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { songById } from "../data";
import type { Difficulty } from "../data/types";
import { formatDuration } from "../ui/labels";

/**
 * 曲 1 件の詳細(サイドメニュー「曲一覧」→ ピッカー → ここ。2026-09-07 ユーザー指示)。
 * 歌唱・種別・演奏時間・難易度別の Lv とノーツ数を見せる。データにない情報
 * (作詞・作曲・編曲、確認できていないノーツ数)は「未確認」で埋める
 */
const props = defineProps<{ songId: string }>();
const emit = defineEmits<{ close: [] }>();

const song = computed(() => songById.get(props.songId) ?? null);

const DIFFICULTIES: { key: Difficulty; label: string }[] = [
  { key: "easy", label: "EASY" },
  { key: "normal", label: "NORMAL" },
  { key: "hard", label: "HARD" },
  { key: "expert", label: "EXPERT" },
];

useModalChrome(() => emit("close"));
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div
      v-if="song"
      class="sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="`「${song.title}」の詳細`"
    >
      <header class="sheet-head">
        <h3>{{ song.title }}</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <section class="block">
          <table class="param-table">
            <tbody>
              <tr>
                <th scope="row">歌唱</th>
                <td>{{ song.artists.join("、") }}</td>
              </tr>
              <tr>
                <th scope="row">種別</th>
                <td>{{ song.kind === "original" ? "オリジナル" : "カバー" }}</td>
              </tr>
              <tr>
                <th scope="row">演奏時間</th>
                <td>
                  {{
                    song.durationSeconds !== null ? formatDuration(song.durationSeconds) : "未確認"
                  }}
                </td>
              </tr>
              <tr>
                <th scope="row">作詞</th>
                <td class="placeholder">未確認</td>
              </tr>
              <tr>
                <th scope="row">作曲</th>
                <td class="placeholder">未確認</td>
              </tr>
              <tr>
                <th scope="row">編曲</th>
                <td class="placeholder">未確認</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="block">
          <h4>難易度</h4>
          <table class="param-table">
            <thead>
              <tr>
                <th scope="col">難易度</th>
                <th scope="col" class="num">Lv</th>
                <th scope="col" class="num">ノーツ</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in DIFFICULTIES" :key="d.key">
                <th scope="row">{{ d.label }}</th>
                <td class="num" :class="{ placeholder: !song.charts[d.key] }">
                  {{ song.charts[d.key]?.level ?? "未確認" }}
                </td>
                <td class="num" :class="{ placeholder: song.charts[d.key]?.combo == null }">
                  {{
                    song.charts[d.key]?.combo != null
                      ? song.charts[d.key]?.combo?.toLocaleString("ja-JP")
                      : "未確認"
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  background: rgba(35, 48, 61, 0.4);
  inset: 0;
  position: fixed;
  z-index: 11; /* 曲一覧のピッカー(10)の上に重ねる */
}

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

/* ページヘッダ・ピッカーと同寸法(77px) */
.sheet-head {
  align-items: center;
  background: var(--chrome);
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

.block h4 {
  font-size: 15px;
  margin: 0 0 8px;
}

.param-table {
  border-collapse: collapse;
  font-size: 13px;
  width: 100%;
}

.param-table th,
.param-table td {
  border-bottom: 1px solid var(--line);
  padding: 8px 4px;
  text-align: left;
}

.param-table tbody tr:last-child th,
.param-table tbody tr:last-child td {
  border-bottom: none;
}

.param-table th {
  color: var(--ink-2);
  font-weight: 600;
  white-space: nowrap;
}

.param-table .num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.placeholder {
  color: var(--ink-2);
}
</style>
