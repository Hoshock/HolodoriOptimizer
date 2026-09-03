<script setup lang="ts">
import { computed, ref, watch } from "vue";

import CardPicker from "./CardPicker.vue";
import ResultDetail from "./ResultDetail.vue";
import ResultList from "./ResultList.vue";
import SongPicker from "./SongPicker.vue";
import UnitSlot from "./UnitSlot.vue";
import { OKAYU_HOLOMEN_ID, okayuCardIds, useOkayuMode } from "../composables/useOkayuMode";
import { useOptimizer } from "../composables/useOptimizer";
import { cardById, cards, songById } from "../data";
import { BLOOM_MAX, bloomOf, cardAtBloom } from "../data/bloom";
import type { BloomMap } from "../data/bloom";
import type { Card } from "../data/types";
import { loadOwned, saveOwned } from "../storage/owned";
import type { OwnedCard } from "../storage/owned";
import { formatDuration, formatScore, holomenName } from "../ui/labels";

const MEMBER_SLOTS = 5;
/** 「全カード」トグルの保存先 */
const SEARCH_ALL_STORAGE_KEY = "holodori-optimizer:search-all";

function loadSearchAll(): boolean {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_ALL_STORAGE_KEY) ?? "true") !== false;
  } catch {
    return true;
  }
}

/**
 * 所持カードの登録(保存形式と後方互換は src/storage/owned.ts)。
 * 現在のデータにない ID も配列に残して書き戻す(登録を消さない)。UI で使うのは既知の ID のみ
 */
const ownedCards = ref<OwnedCard[]>(loadOwned());
watch(ownedCards, (owned) => saveOwned(owned), { deep: true });
const ownedIds = computed(() => ownedCards.value.map((o) => o.id).filter((id) => cardById.has(id)));

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
/** 常に上位 100 件まで計算し、結果側で 10 件ずつ逐次表示する(実行前の件数入力は置かない) */
const TOP_N = 100;
/** 詳細モーダルを開いている結果の順位(0 始まり)。null = 閉 */
const detailRank = ref<number | null>(null);

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

/**
 * おかゆモード(開発者のお遊び機能。フッター右下のおにぎりで ON / OFF、再読み込みで解除)。
 * - リーダーはおかゆんのカード(おまかせならおかゆんのカードの中から探索)
 * - メンバーにもおかゆんが 1 枚入る(メンバー同士は同一ホロメン不可なのでちょうど 1 枚)
 * - 全カード: 上記のみ。持っているカード: おかゆんを登録するまでリーダー・メンバー・実行を止め、
 *   所持ピッカーのボタンで「おかゆんを選んでください」と案内する(エラー表示ではなく方針として)
 */
const okayu = useOkayuMode();
const okayuMode = computed(() => okayu.active.value);
const isOkayuCard = (id: string | null): boolean => id !== null && okayuCardIds.includes(id);
/** おかゆモードの前提が満たされているか: 全カードなら常に、持っているカードならおかゆんを登録済みのとき */
const okayuReady = computed(
  () => !okayuMode.value || searchAll.value || ownedIds.value.some((id) => isOkayuCard(id)),
);
/** おかゆモードで枠の操作と実行を止めるか(持っているカードモードでおかゆん未登録) */
const okayuBlocked = computed(() => okayuMode.value && !okayuReady.value);

/**
 * 現在の設定でのカード ID → 開花段階(0 は持たない疎な map)。
 * 全カード時は常に 0凸で計算し(2026-09-01 ユーザー指定)、
 * 持っているカード時はカードごとの登録値(既定 0凸、所持ピッカー内で設定)を使う
 */
const currentBlooms = computed<BloomMap>(() => {
  const map: BloomMap = {};
  if (searchAll.value) return map;
  for (const o of ownedCards.value) {
    if (o.bloom > 0) map[o.id] = o.bloom;
  }
  return map;
});

/** 直近の実行に使った開花段階(結果・詳細の表示用スナップショット) */
const ranBlooms = ref<BloomMap>({});
/** 直近の実行でリーダーを指定していたか(結果のリーダー行のピン表示) */
const ranLeaderFixed = ref(false);
/** 直近の実行がおかゆモードだったか(結果のおかゆん行のおにぎり表示・位置の散らし) */
const ranOkayu = ref(false);

const leader = computed(() => cardOf(leaderId.value));
const song = computed(() => (songId.value ? (songById.get(songId.value) ?? null) : null));
const chosenFixedIds = computed(() => fixedIds.value.filter((id): id is string => id !== null));
const openSlots = computed(() => MEMBER_SLOTS - chosenFixedIds.value.length);

/** スロット表示用: スキル文言を現在の開花段階に解決したカード */
function cardOf(id: string | null) {
  const card = id ? (cardById.get(id) ?? null) : null;
  return card ? cardAtBloom(card, bloomOf(currentBlooms.value, card.id)) : null;
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
  // おかゆモード: 最後の 1 枠までおかゆんがいなければ、その枠はおかゆんしか選べない
  const needOkayu =
    okayuMode.value && slot === MEMBER_SLOTS - 1 && !takenHolomen.has(OKAYU_HOLOMEN_ID);
  for (const card of cardById.values()) {
    if (takenHolomen.has(card.holomenId) && fixedIds.value[slot] !== card.id) {
      map.set(card.id, `${holomenName(card.holomenId)} は別の枠で固定中（メンバー同士は重複不可）`);
    } else if (excludedIds.value.includes(card.id)) {
      map.set(card.id, "除外中のカードです（除外を解除すると選べます）");
    } else if (needOkayu && card.holomenId !== OKAYU_HOLOMEN_ID) {
      map.set(card.id, "最後の 1 枠はおかゆんです（おかゆモード）");
    }
  }
  return map;
});

/** 除外ピッカーで選択不可のカード(固定中のもの。おかゆモードではおかゆんも) */
const excludeDisabled = computed(() => {
  const map = new Map<string, string>();
  for (const id of chosenFixedIds.value) {
    map.set(id, "固定中のカードは除外できません");
  }
  if (okayuMode.value) {
    for (const id of okayuCardIds) map.set(id, "おかゆモードではおかゆんを除外できません");
  }
  return map;
});

/** リーダーピッカーで選択不可のカード(おかゆモードではおかゆん以外) */
const leaderDisabled = computed(() => {
  const map = new Map<string, string>();
  if (!okayuMode.value) return map;
  for (const card of cardById.values()) {
    if (card.holomenId !== OKAYU_HOLOMEN_ID)
      map.set(card.id, "リーダーはおかゆんです（おかゆモード）");
  }
  return map;
});

/** メンバー枠は上から順に埋める(先頭の空き枠だけが選択可能) */
const firstEmptySlot = computed(() => fixedIds.value.indexOf(null));

// おかゆモードに入ったら矛盾する設定を外す: 除外中のおかゆん・おかゆん以外のリーダー・
// おかゆんの入る余地のない固定 5 枠(最後の枠を空ける)
watch(okayuMode, (on) => {
  if (!on) return;
  excludedIds.value = excludedIds.value.filter((id) => !isOkayuCard(id));
  if (!isOkayuCard(leaderId.value)) leaderId.value = null;
  const fixedHasOkayu = chosenFixedIds.value.some((id) => isOkayuCard(id));
  if (chosenFixedIds.value.length === MEMBER_SLOTS && !fixedHasOkayu) clearSlot(MEMBER_SLOTS - 1);
});

/**
 * おかゆモードの結果では、おまかせで入ったおかゆんの枠位置を候補ごとにランダムに散らす
 * (メンバーの並びはスコアに影響しない。固定メンバーの枠は動かさない)
 */
watch(optimizer.candidates, (list) => {
  if (!list || !ranOkayu.value) return;
  const fixedCount = chosenFixedIds.value.length;
  for (const candidate of list) {
    const ids = candidate.memberIds;
    const from = ids.findIndex((id, i) => i >= fixedCount && isOkayuCard(id));
    if (from < 0 || ids.length <= fixedCount) continue;
    const to = fixedCount + Math.floor(Math.random() * (ids.length - fixedCount));
    const moved = ids[from];
    const other = ids[to];
    if (moved === undefined || other === undefined) continue;
    ids[from] = other;
    ids[to] = moved;
  }
});

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
  const index = ownedCards.value.findIndex((o) => o.id === cardId);
  if (index >= 0) {
    ownedCards.value.splice(index, 1);
  } else {
    ownedCards.value.push({ id: cardId, bloom: 0 });
  }
}

function onOwnedBloom(cardId: string, delta: number): void {
  const owned = ownedCards.value.find((o) => o.id === cardId);
  if (!owned) return;
  owned.bloom = Math.min(BLOOM_MAX, Math.max(0, owned.bloom + delta));
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
  if (okayuBlocked.value) return false;
  return pool.value === null || pool.value.length > 0;
});

function run(): void {
  if (!canRun.value) return;
  detailRank.value = null;
  // 所持しぼりこみ時は所持カード以外を除外に足してプールを絞る(エンジンは共通)
  const excluded = new Set(excludedIds.value);
  if (pool.value !== null) {
    const poolIdSet = new Set(pool.value.map((c) => c.id));
    for (const card of cards) {
      if (!poolIdSet.has(card.id)) excluded.add(card.id);
    }
  }
  // リアクティブ Proxy は postMessage で複製できないため、プレーン配列・オブジェクトに写す
  const blooms = { ...currentBlooms.value };
  ranBlooms.value = blooms;
  ranLeaderFixed.value = leaderId.value !== null;
  ranOkayu.value = okayuMode.value;
  optimizer.run({
    leaderId: leaderId.value,
    fixedMemberIds: [...chosenFixedIds.value],
    excludedCardIds: [...excluded],
    // おかゆモード: リーダーおまかせはおかゆんのカードから、メンバーにもおかゆんを必ず入れる
    leaderCandidateIds: okayuMode.value ? [...okayuCardIds] : null,
    requiredMemberHolomenIds: okayuMode.value ? [OKAYU_HOLOMEN_ID] : [],
    songId: songId.value,
    blooms,
    topN: TOP_N,
  });
}

const detailCandidate = computed(() => {
  if (detailRank.value === null) return null;
  return optimizer.candidates.value?.[detailRank.value] ?? null;
});

/** 詳細モーダルに出すリーダー(候補ごとに持つ leaderId から引き、実行時の開花段階に解決する) */
const detailLeader = computed(() => {
  if (!detailCandidate.value) return null;
  const card = cardById.get(detailCandidate.value.leaderId) ?? null;
  return card ? cardAtBloom(card, bloomOf(ranBlooms.value, card.id)) : null;
});

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
        <!-- おかゆモードでは、おかゆんを登録するまでこのボタンが案内を兼ねる(エラー表示ではなく方針) -->
        <span>{{ okayuBlocked ? "おかゆんを選んでください" : "カードを選ぶ" }}</span>
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
          :empty-text="okayuMode ? 'おかゆん（おまかせ）' : 'おまかせ'"
          clearable
          :disabled="okayuBlocked"
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
          :disabled="okayuBlocked || (id === null && slot !== firstEmptySlot)"
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
      <h2 id="results-heading">結果</h2>
      <p v-if="optimizer.candidates.value.length === 0" class="hint">
        条件を満たす編成がありません。カードの登録・固定・除外の条件を見直してください。
      </p>
      <ResultList
        v-else
        :candidates="optimizer.candidates.value"
        :fixed-ids="chosenFixedIds"
        :blooms="ranBlooms"
        :leader-fixed="ranLeaderFixed"
        :okayu-holomen-id="ranOkayu ? OKAYU_HOLOMEN_ID : null"
        @select="detailRank = $event"
      />
    </section>

    <ResultDetail
      v-if="detailRank !== null && detailCandidate && detailLeader"
      :rank="detailRank + 1"
      :candidate="detailCandidate"
      :leader="detailLeader"
      :fixed-ids="chosenFixedIds"
      :blooms="ranBlooms"
      @close="detailRank = null"
    />

    <CardPicker
      v-if="picker?.mode === 'leader'"
      title="リーダー"
      mode="pick"
      skill-view="costume"
      :pool="pool ?? undefined"
      :selected-id="leaderId"
      :disabled="leaderDisabled"
      :blooms="currentBlooms"
      @pick="onPick"
      @close="picker = null"
    />
    <CardPicker
      v-else-if="picker?.mode === 'member'"
      :title="`メンバー枠${picker.slot + 1}`"
      mode="pick"
      skill-view="member"
      :pool="pool ?? undefined"
      :selected-id="fixedIds[picker.slot] ?? null"
      :disabled="memberDisabled"
      :blooms="currentBlooms"
      @pick="onPick"
      @close="picker = null"
    />
    <CardPicker
      v-else-if="picker?.mode === 'exclude'"
      title="除外するカード"
      mode="exclude"
      skill-view="member"
      :excluded-ids="excludedIds"
      :disabled="excludeDisabled"
      :blooms="currentBlooms"
      memory-key="exclude"
      @toggle="onToggleExclude"
      @close="picker = null"
    />
    <CardPicker
      v-else-if="picker?.mode === 'owned'"
      title="持っているカード"
      mode="multi"
      skill-view="member"
      :selected-ids="ownedIds"
      :blooms="currentBlooms"
      bloom-control
      memory-key="owned"
      @toggle="onToggleOwned"
      @bloom="onOwnedBloom"
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
