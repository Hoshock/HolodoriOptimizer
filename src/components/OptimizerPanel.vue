<script setup lang="ts">
import { computed, ref, watch } from "vue";

import CardPicker from "./CardPicker.vue";
import ResultDetail from "./ResultDetail.vue";
import ResultList from "./ResultList.vue";
import SongPicker from "./SongPicker.vue";
import UnitSlot from "./UnitSlot.vue";
import { useOptimizer } from "../composables/useOptimizer";
import { cardById, cards, songById } from "../data";
import type { Card } from "../data/types";
import { formatDuration, formatScore, holomenName } from "../ui/labels";

const MEMBER_SLOTS = 5;
/** 所持カード ID の保存先(このブラウザ内のみ。サーバ送信なし) */
const OWNED_STORAGE_KEY = "holodori-optimizer:owned-card-ids";
/** 「全カード」トグルの保存先 */
const SEARCH_ALL_STORAGE_KEY = "holodori-optimizer:search-all";

function loadOwnedIds(): string[] {
  try {
    const raw = localStorage.getItem(OWNED_STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && cardById.has(id));
  } catch {
    return [];
  }
}

function loadSearchAll(): boolean {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_ALL_STORAGE_KEY) ?? "true") !== false;
  } catch {
    return true;
  }
}

const ownedIds = ref<string[]>(loadOwnedIds());
watch(
  ownedIds,
  (ids) => {
    try {
      localStorage.setItem(OWNED_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // 保存できない環境(プライベートブラウズ等)でも動作は継続する
    }
  },
  { deep: true },
);

/** true = 所持リストを使わず全カードからさがす(リストは保持したまま) */
const searchAll = ref(loadSearchAll());
watch(searchAll, (value) => {
  try {
    localStorage.setItem(SEARCH_ALL_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 保存できない環境でも動作は継続する
  }
});

/** 探索・選択の対象プール。null = 全カード */
const pool = computed<Card[] | null>(() => {
  if (searchAll.value) return null;
  return ownedIds.value
    .map((id) => cardById.get(id))
    .filter((card): card is Card => card !== undefined);
});
const leaderId = ref<string | null>(null);
const fixedIds = ref<(string | null)[]>(Array.from({ length: MEMBER_SLOTS }, () => null));
const excludedIds = ref<string[]>([]);
/** 曲別最適化の対象。null = 代表曲条件(全曲の中央値)で期待値を計算する */
const songId = ref<string | null>(null);
const topN = ref(5);
/** 詳細モーダルを開いている結果の順位(0 始まり)。null = 閉 */
const detailRank = ref<number | null>(null);
/** 直近の実行がリーダー探索(リーダー未指定)だったか。結果にリーダー行を出す判定に使う */
const ranLeaderSearch = ref(false);

// プールが所持カードに絞られたら、プール外のカードのリーダー・固定枠は外す(枠は上詰めを保つ)
watch(pool, (nextPool) => {
  if (nextPool === null) return;
  const ids = new Set(nextPool.map((c) => c.id));
  if (leaderId.value !== null && !ids.has(leaderId.value)) leaderId.value = null;
  const kept = fixedIds.value.filter((id): id is string => id !== null && ids.has(id));
  fixedIds.value = [...kept, ...Array.from({ length: MEMBER_SLOTS - kept.length }, () => null)];
});

type PickerState =
  | { mode: "leader" }
  | { mode: "member"; slot: number }
  | { mode: "exclude" }
  | { mode: "owned" }
  | { mode: "song" }
  | null;
const picker = ref<PickerState>(null);

const optimizer = useOptimizer();

const leader = computed(() => (leaderId.value ? (cardById.get(leaderId.value) ?? null) : null));
const song = computed(() => (songId.value ? (songById.get(songId.value) ?? null) : null));
const chosenFixedIds = computed(() => fixedIds.value.filter((id): id is string => id !== null));
const openSlots = computed(() => MEMBER_SLOTS - chosenFixedIds.value.length);

function cardOf(id: string | null) {
  return id ? (cardById.get(id) ?? null) : null;
}

/** メンバーピッカーで選択不可のカード(他枠と同一ホロメン・除外中)。リーダーとの重複は可 */
const memberDisabled = computed(() => {
  const slot = picker.value?.mode === "member" ? picker.value.slot : -1;
  const map = new Map<string, string>();
  const takenHolomen = new Map<string, string>();
  fixedIds.value.forEach((id, i) => {
    if (i === slot || id === null) return;
    const card = cardById.get(id);
    if (card) takenHolomen.set(card.holomenId, holomenName(card.holomenId));
  });
  for (const card of cardById.values()) {
    if (takenHolomen.has(card.holomenId) && fixedIds.value[slot] !== card.id) {
      map.set(card.id, `${holomenName(card.holomenId)} は別の枠で固定中（メンバー同士は重複不可）`);
    } else if (excludedIds.value.includes(card.id)) {
      map.set(card.id, "除外中のカードです（除外を解除すると選べます）");
    }
  }
  return map;
});

/** 除外ピッカーで選択不可のカード(固定中のもの) */
const excludeDisabled = computed(() => {
  const map = new Map<string, string>();
  for (const id of chosenFixedIds.value) {
    map.set(id, "固定中のカードは除外できません");
  }
  return map;
});

/** メンバー枠は上から順に埋める(先頭の空き枠だけが選択可能) */
const firstEmptySlot = computed(() => fixedIds.value.indexOf(null));

function onPick(cardId: string): void {
  const state = picker.value;
  if (!state) return;
  if (state.mode === "leader") {
    leaderId.value = cardId;
  } else if (state.mode === "member") {
    fixedIds.value[state.slot] = cardId;
  }
  picker.value = null;
}

function onToggleExclude(cardId: string): void {
  const index = excludedIds.value.indexOf(cardId);
  if (index >= 0) {
    excludedIds.value.splice(index, 1);
  } else {
    excludedIds.value.push(cardId);
  }
}

function onToggleOwned(cardId: string): void {
  const index = ownedIds.value.indexOf(cardId);
  if (index >= 0) {
    ownedIds.value.splice(index, 1);
  } else {
    ownedIds.value.push(cardId);
  }
}

function clearSlot(slot: number): void {
  // 解除したら後続を上へ詰め、空き枠を常に末尾へまとめる
  const ids = fixedIds.value.slice();
  ids.splice(slot, 1);
  ids.push(null);
  fixedIds.value = ids;
}

/**
 * 実行可否。リーダーは常におまかせ(未指定なら全リーダー候補を探索)でよいため、
 * 探索プールが空のときだけ実行できない
 */
const canRun = computed(() => {
  if (optimizer.running.value) return false;
  return pool.value === null || pool.value.length > 0;
});

function run(): void {
  if (!canRun.value) return;
  detailRank.value = null;
  ranLeaderSearch.value = leaderId.value === null;
  // 所持しぼりこみ時は所持カード以外を除外に足してプールを絞る(エンジンは共通)
  const excluded = new Set(excludedIds.value);
  if (pool.value !== null) {
    const poolIdSet = new Set(pool.value.map((c) => c.id));
    for (const card of cards) {
      if (!poolIdSet.has(card.id)) excluded.add(card.id);
    }
  }
  // リアクティブ Proxy は postMessage で複製できないため、プレーン配列に写す
  optimizer.run({
    leaderId: leaderId.value,
    fixedMemberIds: [...chosenFixedIds.value],
    excludedCardIds: [...excluded],
    songId: songId.value,
    topN: Math.min(100, Math.max(1, Math.floor(topN.value))),
  });
}

const detailCandidate = computed(() => {
  if (detailRank.value === null) return null;
  return optimizer.candidates.value?.[detailRank.value] ?? null;
});

/** 詳細モーダルに出すリーダー(候補ごとに持つ leaderId から引く) */
const detailLeader = computed(() =>
  detailCandidate.value ? (cardById.get(detailCandidate.value.leaderId) ?? null) : null,
);

const progressPercent = computed(() => {
  const p = optimizer.progress.value;
  if (!p || p.total === 0) return 0;
  return Math.min(100, Math.round((p.done / p.total) * 100));
});
</script>

<template>
  <div class="panel-group">
    <section class="panel" aria-labelledby="owned-heading">
      <h2 id="owned-heading"><span class="step-badge">1</span>さがす対象</h2>
      <div class="scope-segment" role="radiogroup" aria-label="さがす対象">
        <button
          type="button"
          class="seg"
          role="radio"
          :aria-checked="searchAll"
          :class="{ active: searchAll }"
          @click="searchAll = true"
        >
          全カード
        </button>
        <button
          type="button"
          class="seg"
          role="radio"
          :aria-checked="!searchAll"
          :class="{ active: !searchAll }"
          @click="searchAll = false"
        >
          持っているカード
        </button>
      </div>
      <button
        type="button"
        class="picker-button"
        :disabled="searchAll"
        @click="picker = { mode: 'owned' }"
      >
        <span>カードを選ぶ</span>
        <span class="picker-value">{{ ownedIds.length }}枚</span>
      </button>
    </section>

    <section class="panel" aria-labelledby="exclude-heading">
      <h2 id="exclude-heading"><span class="step-badge">2</span>除外するカード</h2>
      <button type="button" class="picker-button" @click="picker = { mode: 'exclude' }">
        <span>カードを選ぶ</span>
        <span class="picker-value">{{ excludedIds.length }}枚</span>
      </button>
    </section>

    <section class="panel" aria-labelledby="leader-heading">
      <h2 id="leader-heading"><span class="step-badge">3</span>リーダー</h2>
      <div class="slot-list">
        <UnitSlot
          label="リーダー枠"
          variant="leader"
          :card="leader"
          empty-text="おまかせ"
          clearable
          @activate="picker = { mode: 'leader' }"
          @clear="leaderId = null"
        />
      </div>
    </section>

    <section class="panel" aria-labelledby="member-heading">
      <h2 id="member-heading"><span class="step-badge">4</span>メンバー</h2>
      <div class="slot-list">
        <UnitSlot
          v-for="(id, slot) in fixedIds"
          :key="slot"
          :label="`メンバー枠${slot + 1}`"
          variant="member"
          :card="cardOf(id)"
          empty-text="おまかせ"
          clearable
          :disabled="id === null && slot !== firstEmptySlot"
          @activate="picker = { mode: 'member', slot }"
          @clear="clearSlot(slot)"
        />
      </div>
    </section>

    <section class="panel" aria-labelledby="song-heading">
      <h2 id="song-heading"><span class="step-badge">5</span>曲</h2>
      <div class="song-slot">
        <button
          type="button"
          class="song-body"
          :class="song ? 'filled' : 'empty'"
          aria-label="曲"
          @click="picker = { mode: 'song' }"
        >
          <template v-if="song">
            <span class="song-title">{{ song.title }}</span>
            <span class="song-info">
              {{
                song.durationSeconds !== null ? formatDuration(song.durationSeconds) : "-:--"
              }}・EXPERT Lv {{ song.charts.expert?.level ?? "?" }}
            </span>
          </template>
          <span v-else class="empty-msg">おまかせ</span>
        </button>
        <button
          v-if="song"
          type="button"
          class="slot-clear"
          aria-label="曲の選択を解除"
          @click="songId = null"
        >
          ✕
        </button>
      </div>
    </section>

    <section class="panel" aria-labelledby="run-heading">
      <h2 id="run-heading"><span class="step-badge">6</span>さがす</h2>
      <label class="topn">
        表示する候補数
        <input v-model.number="topN" type="number" min="1" max="100" aria-label="候補数" />
        件
      </label>
      <div class="run-row">
        <button type="button" class="primary-button" :disabled="!canRun" @click="run">
          {{
            optimizer.running.value
              ? "計算中…"
              : leader && openSlots === 0
                ? "この編成のスコアを試算"
                : "ベスト編成をさがす"
          }}
        </button>
        <button
          v-if="optimizer.running.value"
          type="button"
          class="secondary-button"
          @click="optimizer.cancel"
        >
          中止
        </button>
      </div>
      <div v-if="optimizer.running.value" class="progress" role="status">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${progressPercent}%` }"></div>
        </div>
        <p class="hint">
          {{ progressPercent }}% —
          {{ optimizer.progress.value ? formatScore(optimizer.progress.value.done) : "0" }}
          通りを評価済み
        </p>
      </div>

      <p v-if="optimizer.error.value" class="warn-text" role="alert">
        {{ optimizer.error.value }}
      </p>
    </section>

    <section v-if="optimizer.candidates.value" class="panel" aria-labelledby="results-heading">
      <h2 id="results-heading">
        結果
        <span class="heading-note">
          {{ formatScore(optimizer.evaluated.value) }} 通りから上位
          {{ optimizer.candidates.value.length }} 件
        </span>
      </h2>
      <p v-if="optimizer.candidates.value.length === 0" class="hint">
        条件を満たす編成がありません。カードの登録・固定・除外の条件を見直してください。
      </p>
      <ResultList
        v-else
        :candidates="optimizer.candidates.value"
        :fixed-ids="chosenFixedIds"
        :show-leader="ranLeaderSearch"
        @select="detailRank = $event"
      />
    </section>

    <ResultDetail
      v-if="detailRank !== null && detailCandidate && detailLeader"
      :rank="detailRank + 1"
      :candidate="detailCandidate"
      :leader="detailLeader"
      :fixed-ids="chosenFixedIds"
      @close="detailRank = null"
    />

    <CardPicker
      v-if="picker?.mode === 'leader'"
      title="リーダーを選ぶ"
      mode="pick"
      skill-view="costume"
      :pool="pool ?? undefined"
      :selected-id="leaderId"
      @pick="onPick"
      @close="picker = null"
    />
    <CardPicker
      v-else-if="picker?.mode === 'member'"
      :title="`メンバー枠 ${picker.slot + 1} に固定するカード`"
      mode="pick"
      skill-view="member"
      :pool="pool ?? undefined"
      :selected-id="fixedIds[picker.slot] ?? null"
      :disabled="memberDisabled"
      @pick="onPick"
      @close="picker = null"
    />
    <CardPicker
      v-else-if="picker?.mode === 'exclude'"
      title="カードを除外する"
      mode="exclude"
      skill-view="member"
      :excluded-ids="excludedIds"
      :disabled="excludeDisabled"
      @toggle="onToggleExclude"
      @close="picker = null"
    />
    <CardPicker
      v-else-if="picker?.mode === 'owned'"
      title="持っているカードを選ぶ"
      mode="multi"
      skill-view="member"
      :selected-ids="ownedIds"
      @toggle="onToggleOwned"
      @close="picker = null"
    />
    <SongPicker
      v-else-if="picker?.mode === 'song'"
      :selected-id="songId"
      @pick="
        (id) => {
          songId = id;
          picker = null;
        }
      "
      @close="picker = null"
    />
  </div>
</template>

<style scoped>
/* .content の gap と同じ間隔でセクションを縦積みする */
.panel-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-card);
  padding: 16px;
}

.panel h2 {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  font-size: 18px;
  gap: 8px;
  margin: 0 0 8px;
}

.step-badge {
  align-items: center;
  background: var(--ink);
  border-radius: 50%;
  color: #fff;
  display: inline-flex;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  height: 24px;
  justify-content: center;
  width: 24px;
}

.heading-note {
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.hint {
  color: var(--ink-2);
  font-size: 13px;
  margin: 8px 0 0;
}

.warn-text {
  color: #b3261e;
  font-size: 13px;
}

.primary-button {
  background: var(--primary);
  border: none;
  border-radius: var(--r-m);
  color: #fff;
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  height: 48px;
  padding: 0 24px;
  width: 100%;
}

.primary-button:active:not(:disabled) {
  background: var(--primary-press);
}

.primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.secondary-button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  padding: 0 16px;
}

/* 選択モーダルを開く行ボタン: ラベル左・現在値(件数)右の設定行パターン */
.picker-button {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  justify-content: space-between;
  padding: 0 16px;
  width: 100%;
}

.picker-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.picker-value {
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}

/* さがす対象の状態選択(ピッカーのセグメンテッドコントロールと同形) */
.scope-segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-bottom: 8px;
  overflow: hidden;
}

.seg {
  background: var(--surface);
  border: none;
  border-left: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
}

.seg:first-child {
  border-left: none;
}

.seg.active {
  background: var(--ink);
  color: #fff;
  font-weight: 700;
}

/* リーダー/メンバー枠: 全枠を横幅いっぱいの縦積みにする */
.slot-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

/* 曲枠: カード枠と同じ「空・充填で寸法不変」の固定高スロット */
.song-slot {
  margin-top: 8px;
  position: relative;
  width: 100%;
}

.song-body {
  border: 1px solid transparent;
  border-radius: var(--r-m);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  height: 64px;
  justify-content: center;
  padding: 12px;
  text-align: left;
  width: 100%;
}

.song-body.empty {
  align-items: center;
  background: var(--bg);
  border-color: var(--line);
  border-style: dashed;
}

.song-body.filled {
  background: var(--bg);
}

.empty-msg {
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 600;
}

.song-title {
  color: var(--ink);
  font-size: 15px;
  font-weight: 700;
  line-height: 20px;
  overflow: hidden;
  padding-right: 28px;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.song-info {
  color: var(--ink-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 16px;
}

.slot-clear {
  align-items: center;
  background: var(--ink);
  border: 2px solid var(--surface);
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  display: flex;
  font-size: 11px;
  height: 28px;
  justify-content: center;
  position: absolute;
  right: 8px;
  top: 8px;
  width: 28px;
}

.topn {
  align-items: center;
  color: var(--ink-2);
  display: flex;
  font-size: 13px;
  gap: 6px;
  margin-bottom: 8px;
}

.topn input {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink);
  font-size: 16px; /* iOS の自動ズーム防止 */
  padding: 6px 8px;
  width: 4.5rem;
}

.run-row {
  align-items: center;
  display: flex;
  gap: 8px;
}

.progress {
  margin-top: 12px;
}

.progress-bar {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  height: 10px;
  overflow: hidden;
}

.progress-fill {
  background: var(--link);
  height: 100%;
  transition: width 0.2s;
}
</style>
