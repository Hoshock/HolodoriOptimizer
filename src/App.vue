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
    <header class="hero">
      <h1>ホロドリ最適化ツール</h1>
      <p class="tagline">『hololive Dreams』のユニット編成をいちばんスコアが出る形に。</p>
      <ol class="steps" aria-label="使い方">
        <li><span class="step-num">1</span>リーダーを選ぶ</li>
        <li><span class="step-num">2</span>好みでメンバー固定・除外</li>
        <li><span class="step-num">3</span>さがす!</li>
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
        <button v-else type="button" class="big-choose" @click="picker = { mode: 'leader' }">
          ＋ リーダーを選ぶ
        </button>
        <p class="hint">
          リーダーの衣装スキルが編成全体にかかります。リーダーと同じカードをメンバーに入れることもできます。
        </p>
      </section>

      <section class="panel" aria-labelledby="member-heading">
        <h2 id="member-heading">
          <span class="step-badge">2</span>メンバーをカスタム
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
        <div class="exclude-row">
          <button type="button" class="exclude-button" @click="picker = { mode: 'exclude' }">
            持っていないカードを除外する
          </button>
          <span v-if="excludedIds.length > 0" class="exclude-count">
            {{ excludedIds.length }} 枚除外中
            <button type="button" class="exclude-clear" @click="excludedIds = []">
              すべて解除
            </button>
          </span>
        </div>
      </section>

      <section class="panel" aria-labelledby="run-heading">
        <h2 id="run-heading"><span class="step-badge">3</span>さがす</h2>
        <div class="run-row">
          <button type="button" class="run-button" :disabled="!canRun" @click="run">
            {{
              optimizer.running.value
                ? "計算中…"
                : openSlots === 0
                  ? "この編成のスコアを試算"
                  : "ベスト編成をさがす"
            }}
          </button>
          <label class="topn">
            上位
            <input v-model.number="topN" type="number" min="1" max="50" aria-label="候補数" />
            件
          </label>
          <button
            v-if="optimizer.running.value"
            type="button"
            class="cancel-button"
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

.hero {
  background: linear-gradient(
    120deg,
    var(--cute-soft) 0%,
    var(--happy-soft) 50%,
    var(--pure-soft) 100%
  );
  padding: 1.6rem 1rem 1.4rem;
  text-align: center;
}

.hero h1 {
  font-size: 1.7rem;
  font-weight: 900;
  letter-spacing: 0.02em;
  margin: 0;
}

.tagline {
  color: var(--text-muted);
  font-size: 0.95rem;
  margin: 0.3rem 0 0.8rem;
}

.steps {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.1rem;
  justify-content: center;
  list-style: none;
  margin: 0;
  padding: 0;
}

.steps li {
  align-items: center;
  display: flex;
  font-size: 0.85rem;
  font-weight: 700;
  gap: 0.35rem;
}

.step-num,
.step-badge {
  align-items: center;
  background: var(--primary);
  border-radius: 999px;
  color: #fff;
  display: inline-flex;
  flex-shrink: 0;
  font-size: 0.8rem;
  font-weight: 700;
  height: 1.5rem;
  justify-content: center;
  width: 1.5rem;
}

.content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1.1rem;
  margin: 0 auto;
  max-width: 52rem;
  padding: 1.3rem 1rem;
  width: 100%;
}

.panel {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 1.1rem 1.2rem;
}

.panel h2 {
  align-items: center;
  display: flex;
  font-size: 1.1rem;
  gap: 0.5rem;
  margin: 0 0 0.6rem;
}

.heading-note {
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 500;
}

.hint {
  color: var(--text-muted);
  font-size: 0.8rem;
  margin: 0.4rem 0 0;
}

.warn-text {
  color: #d14343;
  font-size: 0.85rem;
}

.big-choose {
  background: var(--primary);
  border: none;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  color: #fff;
  cursor: pointer;
  font-size: 1.05rem;
  font-weight: 700;
  padding: 0.9rem 1.5rem;
  transition: transform 0.08s;
  width: 100%;
}

.big-choose:hover {
  transform: translateY(-1px);
}

.leader-row {
  align-items: start;
  display: grid;
  gap: 0.8rem;
  grid-template-columns: minmax(13rem, 16rem) 1fr;
}

@media (max-width: 40rem) {
  .leader-row {
    grid-template-columns: 1fr;
  }
}

.skill-note {
  font-size: 0.85rem;
  margin: 0;
}

.slot-grid {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr));
  margin-top: 0.6rem;
}

.slot {
  position: relative;
}

.slot-clear {
  background: var(--text);
  border: 2px solid var(--bg);
  border-radius: 999px;
  color: var(--bg);
  cursor: pointer;
  font-size: 0.7rem;
  height: 1.5rem;
  position: absolute;
  right: -0.4rem;
  top: -0.4rem;
  width: 1.5rem;
}

.slot-empty {
  align-items: center;
  background: transparent;
  border: 2px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  justify-content: center;
  min-height: 5.4rem;
  transition: border-color 0.1s;
}

.slot-empty:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.slot-empty-label {
  font-size: 0.95rem;
  font-weight: 700;
}

.slot-empty-sub {
  font-size: 0.7rem;
}

.exclude-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.8rem;
}

.exclude-button {
  background: var(--surface-2);
  border: none;
  border-radius: 999px;
  color: var(--text);
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.4rem 1rem;
}

.exclude-count {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.exclude-clear {
  background: none;
  border: none;
  color: var(--sky);
  cursor: pointer;
  font-size: 0.8rem;
  text-decoration: underline;
}

.run-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

.run-button {
  background: linear-gradient(120deg, var(--primary) 0%, var(--primary-strong) 100%);
  border: none;
  border-radius: 999px;
  box-shadow: var(--shadow);
  color: #fff;
  cursor: pointer;
  font-size: 1.1rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  padding: 0.7rem 2.2rem;
  transition: transform 0.08s;
}

.run-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.run-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.topn {
  align-items: center;
  color: var(--text-muted);
  display: inline-flex;
  font-size: 0.85rem;
  gap: 0.3rem;
}

.topn input {
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 0.95rem;
  padding: 0.3rem 0.4rem;
  width: 4rem;
}

.cancel-button {
  background: var(--surface-2);
  border: none;
  border-radius: 999px;
  color: var(--text);
  cursor: pointer;
  padding: 0.5rem 1.1rem;
}

.progress {
  margin-top: 0.8rem;
}

.progress-bar {
  background: var(--surface-2);
  border-radius: 999px;
  height: 0.6rem;
  overflow: hidden;
}

.progress-fill {
  background: linear-gradient(90deg, var(--cute), var(--happy), var(--pure));
  height: 100%;
  transition: width 0.2s;
}

.site-footer {
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.75rem;
  padding: 1rem;
}

.site-footer p {
  margin: 0.3rem 0;
}
</style>
