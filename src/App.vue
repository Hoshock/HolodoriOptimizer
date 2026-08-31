<script setup lang="ts">
import { computed, ref } from "vue";

import CardSelect from "./components/CardSelect.vue";
import ResultList from "./components/ResultList.vue";
import { useOptimizer } from "./composables/useOptimizer";
import { cardById, cards, datasetMeta } from "./data";
import { cardLabel, formatScore, holomenName, sortCards } from "./ui/labels";

const leaderId = ref<string | null>(null);
const fixedIds = ref<(string | null)[]>([null, null, null, null]);
const excludedIds = ref<string[]>([]);
const topN = ref(10);

const optimizer = useOptimizer();

const leader = computed(() => (leaderId.value ? (cardById.get(leaderId.value) ?? null) : null));

const chosenFixedIds = computed(() => fixedIds.value.filter((id): id is string => id !== null));

/** リーダー・固定メンバー間のホロメン重複(編成不能)を検出する */
const duplicateError = computed(() => {
  const ids = [leaderId.value, ...chosenFixedIds.value].filter((id): id is string => id !== null);
  const seenCards = new Set<string>();
  const seenHolomen = new Set<string>();
  for (const id of ids) {
    const card = cardById.get(id);
    if (!card) continue;
    if (seenCards.has(id) || seenHolomen.has(card.holomenId)) {
      return `${holomenName(card.holomenId)} が重複しています(同一ホロメンは 1 枚まで)`;
    }
    seenCards.add(id);
    seenHolomen.add(card.holomenId);
  }
  return null;
});

/** 固定メンバー枠の選択肢(リーダー・他の固定枠・除外カードを除く) */
function fixedOptions(slot: number) {
  const takenHolomen = new Set(
    [leaderId.value, ...fixedIds.value.filter((_, i) => i !== slot)]
      .filter((id): id is string => id !== null)
      .map((id) => cardById.get(id)?.holomenId),
  );
  const current = fixedIds.value[slot];
  return cards.filter(
    (c) =>
      c.id === current || (!takenHolomen.has(c.holomenId) && !excludedIds.value.includes(c.id)),
  );
}

const excludableCards = computed(() => sortCards(cards));

const canRun = computed(
  () => leader.value !== null && duplicateError.value === null && !optimizer.running.value,
);

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
    <header class="site-header">
      <h1>ホロドリ最適化ツール</h1>
      <p class="tagline">
        『hololive Dreams』のユニット編成(リーダー1人+メンバー5人)を最適化する非公式ファンツール
      </p>
    </header>

    <main class="content">
      <section class="panel" aria-labelledby="settings-heading">
        <h2 id="settings-heading">編成の条件</h2>

        <div class="field">
          <label for="leader-select">リーダー(必須)</label>
          <CardSelect
            id="leader-select"
            v-model="leaderId"
            :options="cards"
            allow-empty
            empty-label="(リーダーを選択)"
          />
          <p v-if="leader" class="hint">衣装スキル: {{ leader.costumeSkill.raw }}</p>
          <p v-if="leaderCostumeUnstructured" class="field-warn">
            このリーダーの衣装スキルは未構造化のため計算に反映されません(スコアが実際より低く出ます)
          </p>
        </div>

        <fieldset class="field">
          <legend>固定メンバー(任意・最大4人)</legend>
          <p class="hint">
            指定したカードを必ず編成に入れ、残り枠だけを最適化します。5人全員の試算は固定4人+残り1枠で上位を確認してください。
          </p>
          <div class="fixed-grid">
            <CardSelect
              v-for="slot in 4"
              :key="slot"
              v-model="fixedIds[slot - 1]!"
              :options="fixedOptions(slot - 1)"
              allow-empty
            />
          </div>
        </fieldset>

        <details class="field">
          <summary>除外カード({{ excludedIds.length }}枚)</summary>
          <p class="hint">チェックしたカードは編成候補から外します(未所持カードなど)。</p>
          <ul class="exclude-list">
            <li v-for="card in excludableCards" :key="card.id">
              <label>
                <input v-model="excludedIds" type="checkbox" :value="card.id" />
                {{ cardLabel(card) }}
              </label>
            </li>
          </ul>
        </details>

        <div class="field field-inline">
          <label for="topn-input">候補数(TOP n)</label>
          <input id="topn-input" v-model.number="topN" type="number" min="1" max="50" />
        </div>

        <p v-if="duplicateError" class="field-warn" role="alert">{{ duplicateError }}</p>

        <div class="actions">
          <button type="button" class="run-button" :disabled="!canRun" @click="run">
            {{ optimizer.running.value ? "計算中…" : "最適化する" }}
          </button>
          <button
            v-if="optimizer.running.value"
            type="button"
            class="cancel-button"
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
      </section>

      <section v-if="optimizer.error.value" class="panel" role="alert">
        <p class="field-warn">{{ optimizer.error.value }}</p>
      </section>

      <section v-if="optimizer.candidates.value" class="panel" aria-labelledby="results-heading">
        <h2 id="results-heading">
          最適化結果
          <span class="results-meta">
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
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.site-header {
  border-bottom: 1px solid var(--border);
  padding: 1.25rem 1rem;
}

.site-header h1 {
  font-size: 1.35rem;
  margin: 0;
}

.tagline {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0.4rem 0 0;
}

.content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1.2rem;
  margin: 0 auto;
  max-width: 52rem;
  padding: 1.5rem 1rem;
  width: 100%;
}

.panel {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1rem 1.1rem;
}

.panel h2 {
  font-size: 1.05rem;
  margin: 0 0 0.8rem;
}

.results-meta {
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 400;
  margin-left: 0.5rem;
}

.field {
  border: none;
  margin: 0 0 1rem;
  padding: 0;
}

.field > label,
.field > legend {
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 0.3rem;
  padding: 0;
}

.field-inline {
  align-items: center;
  display: flex;
  gap: 0.6rem;
}

.field-inline > label {
  margin: 0;
}

.field-inline input {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 0.4rem 0.5rem;
  width: 5rem;
}

.fixed-grid {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
}

.exclude-list {
  columns: 2;
  font-size: 0.9rem;
  list-style: none;
  margin: 0.4rem 0 0;
  max-height: 16rem;
  overflow-y: auto;
  padding: 0;
}

@media (max-width: 40rem) {
  .exclude-list {
    columns: 1;
  }
}

.hint {
  color: var(--text-muted);
  font-size: 0.8rem;
  margin: 0.3rem 0 0.4rem;
}

.field-warn {
  color: #b3261e;
  font-size: 0.85rem;
  margin: 0.4rem 0;
}

.actions {
  display: flex;
  gap: 0.6rem;
}

.run-button {
  background: var(--accent);
  border: none;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  padding: 0.55rem 1.4rem;
}

.run-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.cancel-button {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
  padding: 0.55rem 1rem;
}

.progress {
  margin-top: 0.8rem;
}

.progress-bar {
  background: var(--border);
  border-radius: 999px;
  height: 0.5rem;
  overflow: hidden;
}

.progress-fill {
  background: var(--accent);
  height: 100%;
  transition: width 0.2s;
}

.site-footer {
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.8rem;
  padding: 1rem;
}

.site-footer p {
  margin: 0.3rem 0;
}
</style>
