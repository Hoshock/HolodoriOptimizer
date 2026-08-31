<script setup lang="ts">
import { computed, ref } from "vue";

import CardPicker from "./components/CardPicker.vue";
import CardTile from "./components/CardTile.vue";
import ResultList from "./components/ResultList.vue";
import { useOptimizer } from "./composables/useOptimizer";
import { cardById, datasetMeta } from "./data";
import { formatScore, holomenName } from "./ui/labels";

const MEMBER_SLOTS = 5;

const leaderId = ref<string | null>(null);
const fixedIds = ref<(string | null)[]>(Array.from({ length: MEMBER_SLOTS }, () => null));
const excludedIds = ref<string[]>([]);
const topN = ref(10);

type PickerState =
  | { mode: "leader" }
  | { mode: "member"; slot: number }
  | { mode: "exclude" }
  | null;
const picker = ref<PickerState>(null);

const optimizer = useOptimizer();

const leader = computed(() => (leaderId.value ? (cardById.get(leaderId.value) ?? null) : null));
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

function clearSlot(slot: number): void {
  fixedIds.value[slot] = null;
}

const canRun = computed(() => leader.value !== null && !optimizer.running.value);

function run(): void {
  if (!leaderId.value || !canRun.value) return;
  // リアクティブ Proxy は postMessage で複製できないため、プレーン配列に写す
  optimizer.run({
    leaderId: leaderId.value,
    fixedMemberIds: [...chosenFixedIds.value],
    excludedCardIds: [...excludedIds.value],
    topN: Math.min(50, Math.max(1, Math.floor(topN.value))),
  });
}

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
  <div class="page">
    <header class="site-head">
      <h1>ホロドリ最適化ツール</h1>
      <p class="tagline">『hololive Dreams』のユニット編成をいちばんスコアが出る形に。</p>
      <ol class="steps" aria-label="使い方">
        <li><span class="step-num">1</span>リーダーを選ぶ</li>
        <li><span class="step-num">2</span>好みでカスタム</li>
        <li><span class="step-num">3</span>さがす</li>
      </ol>
    </header>

    <main class="content">
      <section class="panel" aria-labelledby="leader-heading">
        <h2 id="leader-heading"><span class="step-badge">1</span>リーダーを選ぶ</h2>
        <div v-if="leader" class="leader-row">
          <div class="slot">
            <CardTile :card="leader" selected @activate="picker = { mode: 'leader' }" />
          </div>
          <p class="skill-note">
            <strong>衣装スキル</strong>: {{ leader.costumeSkill.raw }}
            <span v-if="leaderCostumeUnstructured" class="warn-text">
              (未構造化のため計算に反映されません)
            </span>
          </p>
        </div>
        <button v-else type="button" class="primary-button" @click="picker = { mode: 'leader' }">
          リーダーを選ぶ
        </button>
        <p class="hint">
          リーダーの衣装スキルが編成全体にかかります。リーダーと同じカードをメンバーに入れることもできます。
        </p>
      </section>

      <section class="panel" aria-labelledby="member-heading">
        <h2 id="member-heading">
          <span class="step-badge">2</span>好みでカスタム
          <span class="heading-note">(そのままでも OK)</span>
        </h2>
        <p class="hint">
          空きの「おまかせ」枠をツールが最適化します。推しを必ず入れたいときは枠をタップして固定。5
          枠すべて固定すると、その編成のスコア試算になります。
        </p>
        <div class="slot-grid">
          <template v-for="(id, slot) in fixedIds" :key="slot">
            <div v-if="cardOf(id)" class="slot">
              <CardTile
                :card="cardOf(id)!"
                selected
                @activate="picker = { mode: 'member', slot }"
              />
              <button
                type="button"
                class="slot-clear"
                :aria-label="`枠${slot + 1}の固定を解除`"
                @click="clearSlot(slot)"
              >
                ✕
              </button>
            </div>
            <button
              v-else
              type="button"
              class="slot-empty"
              @click="picker = { mode: 'member', slot }"
            >
              <span class="slot-empty-label">おまかせ</span>
              <span class="slot-empty-sub">タップで固定</span>
            </button>
          </template>
        </div>

        <div class="exclude-block">
          <button type="button" class="secondary-button" @click="picker = { mode: 'exclude' }">
            持っていないカードを除外する
          </button>
          <ul v-if="excludedIds.length > 0" class="excluded-chips" aria-label="除外中のカード">
            <li v-for="id in excludedIds" :key="id">
              <button
                type="button"
                class="excluded-chip"
                :title="`${cardOf(id)?.name ?? id} の除外を解除`"
                @click="onToggleExclude(id)"
              >
                {{ cardOf(id) ? holomenName(cardOf(id)!.holomenId) : id }}
                <span class="excluded-chip-name">{{ cardOf(id)?.name }}</span>
                <span aria-hidden="true">✕</span>
              </button>
            </li>
            <li>
              <button type="button" class="excluded-clear" @click="excludedIds = []">
                すべて解除
              </button>
            </li>
          </ul>
        </div>
      </section>

      <section class="panel" aria-labelledby="run-heading">
        <h2 id="run-heading"><span class="step-badge">3</span>さがす</h2>
        <label class="topn">
          表示する候補数
          <input v-model.number="topN" type="number" min="1" max="50" aria-label="候補数" />
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

      <section v-if="optimizer.candidates.value" class="panel" aria-labelledby="results-heading">
        <h2 id="results-heading">
          結果
          <span class="heading-note">
            {{ formatScore(optimizer.evaluated.value) }} 通りから上位
            {{ optimizer.candidates.value.length }} 件
          </span>
        </h2>
        <p v-if="optimizer.candidates.value.length === 0" class="hint">
          条件を満たす編成がありません。固定・除外の条件を見直してください。
        </p>
        <ResultList v-else :candidates="optimizer.candidates.value" :fixed-ids="chosenFixedIds" />
        <p class="hint">
          スコアはコミュニティの解析に基づく試算値(ユニットスコア相当)で、実際のゲーム内の値と異なる場合があります。
        </p>
      </section>
    </main>

    <footer class="site-footer">
      <p>
        本ツールはファンによる非公式ツールであり、カバー株式会社・株式会社QualiArtsとは一切関係ありません。ゲーム内の名称等の権利はすべて各権利者に帰属します。スコアはコミュニティの解析に基づく試算値であり、実際のゲーム内の値と異なる場合があります。権利者からの要請があれば速やかに公開を停止します。
      </p>
      <p>
        データ確認日: {{ datasetMeta.asOf }} /
        <a
          href="https://github.com/Hoshock/HolodoriOptimizer"
          rel="noopener noreferrer"
          target="_blank"
          >ソースコード (GitHub)</a
        >
      </p>
    </footer>

    <CardPicker
      v-if="picker?.mode === 'leader'"
      title="リーダーを選ぶ"
      mode="pick"
      :selected-id="leaderId"
      @pick="onPick"
      @close="picker = null"
    />
    <CardPicker
      v-else-if="picker?.mode === 'member'"
      :title="`メンバー枠 ${picker.slot + 1} に固定するカード`"
      mode="pick"
      :selected-id="fixedIds[picker.slot] ?? null"
      :disabled="memberDisabled"
      @pick="onPick"
      @close="picker = null"
    />
    <CardPicker
      v-else-if="picker?.mode === 'exclude'"
      title="持っていないカードを除外"
      mode="exclude"
      :excluded-ids="excludedIds"
      :disabled="excludeDisabled"
      @toggle="onToggleExclude"
      @close="picker = null"
    />
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.site-head {
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  padding: 20px 16px 16px;
}

.site-head h1 {
  font-size: 24px;
  font-weight: 900;
  line-height: 1.35;
  margin: 0;
}

.tagline {
  color: var(--ink-2);
  font-size: 13px;
  margin: 4px 0 12px;
}

/* 各ステップは途中で改行させない(項目間でのみ折り返す) */
.steps {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.steps li {
  align-items: center;
  color: var(--ink-2);
  display: flex;
  font-size: 13px;
  font-weight: 600;
  gap: 6px;
  white-space: nowrap;
}

.step-num {
  align-items: center;
  background: var(--ink);
  border-radius: 50%;
  color: #fff;
  display: inline-flex;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  height: 20px;
  justify-content: center;
  width: 20px;
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

.content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  margin: 0 auto;
  max-width: 44rem;
  padding: 16px;
  width: 100%;
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

.leader-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@media (min-width: 40rem) {
  .leader-row {
    align-items: start;
    display: grid;
    gap: 12px;
    grid-template-columns: minmax(13rem, 15rem) 1fr;
  }
}

.skill-note {
  font-size: 13px;
  margin: 0;
}

.slot-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  margin-top: 8px;
}

.slot {
  display: flex;
  position: relative;
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
  height: 24px;
  justify-content: center;
  position: absolute;
  right: -6px;
  top: -6px;
  width: 24px;
}

.slot-empty {
  align-items: center;
  background: transparent;
  border: 2px dashed var(--line);
  border-radius: var(--r-m);
  color: var(--ink-2);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  justify-content: center;
  min-height: 96px;
}

.slot-empty-label {
  font-size: 14px;
  font-weight: 700;
}

.slot-empty-sub {
  font-size: 11px;
}

.exclude-block {
  border-top: 1px solid var(--line);
  margin-top: 16px;
  padding-top: 12px;
}

.excluded-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

.excluded-chip {
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

.excluded-chip-name {
  color: var(--ink-2);
  font-weight: 400;
  max-width: 8em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.excluded-clear {
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

.site-footer {
  border-top: 1px solid var(--line);
  color: var(--ink-2);
  font-size: 12px;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.site-footer p {
  margin: 4px 0;
}
</style>
