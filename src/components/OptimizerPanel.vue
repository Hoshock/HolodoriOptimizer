<script setup lang="ts">
import { computed, ref, watch } from "vue";

import CardPicker from "./CardPicker.vue";
import ResultDetail from "./ResultDetail.vue";
import ResultList from "./ResultList.vue";
import UnitSlot from "./UnitSlot.vue";
import { useOptimizer } from "../composables/useOptimizer";
import { cardById, cards } from "../data";
import type { Card } from "../data/types";
import { formatScore, holomenName, sortCards } from "../ui/labels";

const MEMBER_SLOTS = 5;
/** 所持カード ID の保存先(このブラウザ内のみ。サーバ送信なし) */
const OWNED_STORAGE_KEY = "holodori-optimizer:owned-card-ids";

const props = defineProps<{
  /** all: 全カードから探索 / owned: 登録した所持カードだけから探索 */
  variant: "all" | "owned";
}>();

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

const ownedIds = ref<string[]>(props.variant === "owned" ? loadOwnedIds() : []);
watch(
  ownedIds,
  (ids) => {
    if (props.variant !== "owned") return;
    try {
      localStorage.setItem(OWNED_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // 保存できない環境(プライベートブラウズ等)でも動作は継続する
    }
  },
  { deep: true },
);

/** 探索・選択の対象プール。null = 全カード */
const pool = computed<Card[] | null>(() => {
  if (props.variant !== "owned") return null;
  return ownedIds.value
    .map((id) => cardById.get(id))
    .filter((card): card is Card => card !== undefined);
});
const sortedOwnedCards = computed(() => sortCards(pool.value ?? []));

const leaderId = ref<string | null>(null);
const fixedIds = ref<(string | null)[]>(Array.from({ length: MEMBER_SLOTS }, () => null));
const excludedIds = ref<string[]>([]);
const topN = ref(5);
/** 詳細モーダルを開いている結果の順位(0 始まり)。null = 閉 */
const detailRank = ref<number | null>(null);

// 所持カードの登録が外れたら、そのカードのリーダー・固定枠も外す
watch(pool, (nextPool) => {
  if (nextPool === null) return;
  const ids = new Set(nextPool.map((c) => c.id));
  if (leaderId.value !== null && !ids.has(leaderId.value)) leaderId.value = null;
  fixedIds.value = fixedIds.value.map((id) => (id !== null && !ids.has(id) ? null : id));
});

type PickerState =
  | { mode: "leader" }
  | { mode: "member"; slot: number }
  | { mode: "exclude" }
  | { mode: "owned" }
  | null;
const picker = ref<PickerState>(null);

const optimizer = useOptimizer();

const leader = computed(() => (leaderId.value ? (cardById.get(leaderId.value) ?? null) : null));
const chosenFixedIds = computed(() => fixedIds.value.filter((id): id is string => id !== null));
const openSlots = computed(() => MEMBER_SLOTS - chosenFixedIds.value.length);

/** 見出しのステップ番号(owned はステップ 1 が所持カード登録になるため 1 つずれる) */
const stepOffset = computed(() => (props.variant === "owned" ? 1 : 0));

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
      map.set(card.id, `${holomenName(card.holomenId)} は別の枠で固定中(メンバー同士は重複不可)`);
    } else if (excludedIds.value.includes(card.id)) {
      map.set(card.id, "除外中のカードです(除外を解除すると選べます)");
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
  fixedIds.value[slot] = null;
}

const canRun = computed(() => leader.value !== null && !optimizer.running.value);

function run(): void {
  if (!leaderId.value || !canRun.value) return;
  detailRank.value = null;
  // owned は所持カード以外の全カードを除外することでプールを絞る(エンジンは共通)
  let excluded: string[];
  if (pool.value === null) {
    excluded = [...excludedIds.value];
  } else {
    const poolIdSet = new Set(pool.value.map((c) => c.id));
    excluded = cards.filter((c) => !poolIdSet.has(c.id)).map((c) => c.id);
  }
  // リアクティブ Proxy は postMessage で複製できないため、プレーン配列に写す
  optimizer.run({
    leaderId: leaderId.value,
    fixedMemberIds: [...chosenFixedIds.value],
    excludedCardIds: excluded,
    topN: Math.min(100, Math.max(1, Math.floor(topN.value))),
  });
}

const detailCandidate = computed(() => {
  if (detailRank.value === null) return null;
  return optimizer.candidates.value?.[detailRank.value] ?? null;
});

const progressPercent = computed(() => {
  const p = optimizer.progress.value;
  if (!p || p.total === 0) return 0;
  return Math.min(100, Math.round((p.done / p.total) * 100));
});

const leaderCostumeUnstructured = computed(
  () => leader.value !== null && leader.value.costumeSkill.structured === null,
);
</script>

<template>
  <div class="panel-group">
    <section
      v-if="props.variant === 'owned'"
      class="panel"
      :aria-labelledby="`${props.variant}-owned-heading`"
    >
      <h2 :id="`${props.variant}-owned-heading`">
        <span class="step-badge">1</span>持っているカードを選ぶ
        <span class="heading-note">(登録済み {{ ownedIds.length }} 枚)</span>
      </h2>
      <button type="button" class="secondary-button" @click="picker = { mode: 'owned' }">
        カードを選ぶ
      </button>
      <ul v-if="sortedOwnedCards.length > 0" class="card-chips" aria-label="持っているカード">
        <li v-for="card in sortedOwnedCards" :key="card.id">
          <button
            type="button"
            class="card-chip"
            :title="`${card.name} の登録を解除`"
            @click="onToggleOwned(card.id)"
          >
            {{ holomenName(card.holomenId) }}
            <span class="card-chip-name">{{ card.name }}</span>
            <span aria-hidden="true">✕</span>
          </button>
        </li>
        <li>
          <button type="button" class="chips-clear" @click="ownedIds = []">すべて解除</button>
        </li>
      </ul>
    </section>

    <section class="panel" :aria-labelledby="`${props.variant}-leader-heading`">
      <h2 :id="`${props.variant}-leader-heading`">
        <span class="step-badge">{{ 1 + stepOffset }}</span
        >リーダーを選ぶ
      </h2>
      <div class="slot-list">
        <UnitSlot
          label="リーダー枠"
          variant="leader"
          :card="leader"
          empty-text="タップしてリーダーを選ぶ"
          @activate="picker = { mode: 'leader' }"
        />
      </div>
      <p v-if="props.variant === 'owned' && ownedIds.length === 0" class="hint">
        先に持っているカードを登録してください。
      </p>
      <p v-if="leaderCostumeUnstructured" class="warn-text">
        この衣装スキルは構造化できておらず、試算スコアには反映されません。
      </p>
    </section>

    <section class="panel" :aria-labelledby="`${props.variant}-member-heading`">
      <h2 :id="`${props.variant}-member-heading`">
        <span class="step-badge">{{ 2 + stepOffset }}</span
        >メンバーを選ぶ
        <span class="heading-note">(おまかせでもOK)</span>
      </h2>
      <div class="slot-list">
        <UnitSlot
          v-for="(id, slot) in fixedIds"
          :key="slot"
          :label="`メンバー枠${slot + 1}`"
          variant="member"
          :card="cardOf(id)"
          empty-text="タップしてメンバーを選ぶ"
          @activate="picker = { mode: 'member', slot }"
          @clear="clearSlot(slot)"
        />
      </div>

      <div v-if="props.variant === 'all'" class="exclude-block">
        <button type="button" class="secondary-button" @click="picker = { mode: 'exclude' }">
          カードを除外する
        </button>
        <ul v-if="excludedIds.length > 0" class="card-chips" aria-label="除外中のカード">
          <li v-for="id in excludedIds" :key="id">
            <button
              type="button"
              class="card-chip"
              :title="`${cardOf(id)?.name ?? id} の除外を解除`"
              @click="onToggleExclude(id)"
            >
              {{ cardOf(id) ? holomenName(cardOf(id)!.holomenId) : id }}
              <span class="card-chip-name">{{ cardOf(id)?.name }}</span>
              <span aria-hidden="true">✕</span>
            </button>
          </li>
          <li>
            <button type="button" class="chips-clear" @click="excludedIds = []">すべて解除</button>
          </li>
        </ul>
      </div>
    </section>

    <section class="panel" :aria-labelledby="`${props.variant}-run-heading`">
      <h2 :id="`${props.variant}-run-heading`">
        <span class="step-badge">{{ 3 + stepOffset }}</span
        >さがす
      </h2>
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
              : openSlots === 0
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
      <p v-if="!leader" class="hint">まずはリーダーを選んでください。</p>

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

    <section
      v-if="optimizer.candidates.value"
      class="panel"
      :aria-labelledby="`${props.variant}-results-heading`"
    >
      <h2 :id="`${props.variant}-results-heading`">
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
        @select="detailRank = $event"
      />
    </section>

    <ResultDetail
      v-if="detailRank !== null && detailCandidate && leader"
      :rank="detailRank + 1"
      :candidate="detailCandidate"
      :leader="leader"
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

/* リーダー/メンバー枠: 全枠を横幅いっぱいの縦積みにする */
.slot-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.exclude-block {
  border-top: 1px solid var(--line);
  margin-top: 16px;
  padding-top: 12px;
}

/* 登録済み・除外中カードのチップ一覧(タップで解除) */
.card-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

.card-chip {
  align-items: center;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-size: 12px;
  font-weight: 600;
  gap: 4px;
  height: 28px;
  max-width: 100%;
  padding: 0 10px;
}

.card-chip-name {
  color: var(--ink-2);
  font-weight: 400;
  max-width: 8em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chips-clear {
  background: none;
  border: none;
  color: var(--link);
  cursor: pointer;
  font-size: 12px;
  height: 28px;
  text-decoration: underline;
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
