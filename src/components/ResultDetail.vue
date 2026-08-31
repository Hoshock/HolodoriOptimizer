<script setup lang="ts">
import { computed } from "vue";

import type { CandidateView } from "../composables/useOptimizer";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById, holomenById } from "../data";
import type { Card, ParamKind } from "../data/types";
import { isConditionMet, PARAM_KINDS } from "../engine/score";
import { formatScore, holomenName, TYPE_LABELS } from "../ui/labels";

const props = defineProps<{
  /** 1 始まりの順位 */
  rank: number;
  candidate: CandidateView;
  leader: Card;
  fixedIds: string[];
}>();

const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const PARAM_LABELS: Record<ParamKind, string> = {
  performance: "パフォーマンス",
  technique: "テクニック",
  sense: "センス",
};

const members = computed(() =>
  props.candidate.memberIds.map((id) => cardById.get(id)).filter((c): c is Card => c !== undefined),
);

/** スキル適用前(カードの素の値)の合算 */
const rawTotals = computed(() => {
  const totals: Record<ParamKind, number> = { performance: 0, technique: 0, sense: 0 };
  for (const m of members.value) {
    for (const p of PARAM_KINDS) totals[p] += m.stats[p];
  }
  return totals;
});

const finalMax = computed(() =>
  Math.max(...PARAM_KINDS.map((p) => props.candidate.breakdown.finalTotals[p]), 1),
);

type SkillState = "active" | "unmet" | "unstructured";

const STATE_LABELS: Record<SkillState, string> = {
  active: "スコアに反映中",
  unmet: "条件未達",
  unstructured: "未反映(構造化前)",
};

function passiveState(card: Card): SkillState {
  const structured = card.passiveSkill.structured;
  if (structured === null) return "unstructured";
  return isConditionMet(structured.condition, members.value, holomenById) ? "active" : "unmet";
}

const costumeState = computed<SkillState>(() => {
  if (props.leader.costumeSkill.structured === null) return "unstructured";
  return props.candidate.breakdown.costumeSkillActive ? "active" : "unmet";
});

function total(card: Card): number {
  return card.stats.performance + card.stats.technique + card.stats.sense;
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" :aria-label="`${rank}位の編成の詳細`">
      <header class="sheet-head">
        <h3>{{ props.rank }}位の編成</h3>
        <button type="button" class="close-button" aria-label="閉じる" @click="emit('close')">
          ✕
        </button>
      </header>

      <div class="body">
        <section class="block">
          <p class="score-line">
            <span class="score">{{ formatScore(props.candidate.breakdown.unitScore) }}</span>
            <span class="score-caption">ユニットスコア(試算値)</span>
          </p>
          <table class="param-table">
            <thead>
              <tr>
                <th scope="col">パラメータ</th>
                <th scope="col" class="num">素の合計</th>
                <th scope="col" class="num">パッシブ後</th>
                <th scope="col" class="num">衣装スキル後</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in PARAM_KINDS" :key="p">
                <th scope="row">{{ PARAM_LABELS[p] }}</th>
                <td class="num">{{ formatScore(rawTotals[p]) }}</td>
                <td class="num">{{ formatScore(props.candidate.breakdown.baseTotals[p]) }}</td>
                <td class="num">{{ formatScore(props.candidate.breakdown.finalTotals[p]) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="bars" aria-hidden="true">
            <div v-for="p in PARAM_KINDS" :key="p" class="bar-row">
              <span class="bar-label">{{ PARAM_LABELS[p] }}</span>
              <span class="bar-track">
                <span
                  class="bar-fill"
                  :style="{
                    width: `${(props.candidate.breakdown.finalTotals[p] / finalMax) * 100}%`,
                  }"
                ></span>
              </span>
              <span class="bar-value">{{
                formatScore(props.candidate.breakdown.finalTotals[p])
              }}</span>
            </div>
          </div>
        </section>

        <section class="block">
          <h4>衣装スキル(リーダー)</h4>
          <p class="skill-holder">
            {{ holomenName(props.leader.holomenId) }}
            <span class="skill-card-name">{{ props.leader.name }}</span>
          </p>
          <p class="skill-text">
            <span class="state" :class="`state-${costumeState}`">{{
              STATE_LABELS[costumeState]
            }}</span>
            {{ props.leader.costumeSkill.raw }}
          </p>
        </section>

        <section class="block">
          <h4>メンバーの内訳</h4>
          <p class="note">
            アクティブ・SP スキルはライブ中に発動する効果のため、この試算スコアには含まれません。
          </p>
          <article v-for="card in members" :key="card.id" class="member">
            <p class="member-head">
              <span class="type-badge" :class="`type-${card.type}`">
                {{ TYPE_LABELS[card.type] }}
              </span>
              <span class="member-name">{{ holomenName(card.holomenId) }}</span>
              <span class="member-card">{{ card.name }}</span>
              <span v-if="props.fixedIds.includes(card.id)" class="fixed-badge">固定</span>
            </p>
            <p class="member-stats">
              パフォーマンス {{ formatScore(card.stats.performance) }} / テクニック
              {{ formatScore(card.stats.technique) }} / センス {{ formatScore(card.stats.sense) }} /
              合計 {{ formatScore(total(card)) }}
            </p>
            <ul class="member-skills">
              <li>
                <span class="skill-tag">パッシブ</span>
                <span class="state" :class="`state-${passiveState(card)}`">{{
                  STATE_LABELS[passiveState(card)]
                }}</span>
                {{ card.passiveSkill.raw }}
              </li>
              <li><span class="skill-tag">アクティブ</span>{{ card.activeSkill.raw }}</li>
              <li><span class="skill-tag">SP</span>{{ card.specialSkill.raw }}</li>
            </ul>
          </article>
        </section>

        <p class="note">
          数値・スキル効果はすべて最大強化(レベル・開花が最大)時の値です。育成途中のレベル・開花段階ごとの数値には対応していません。スコアはコミュニティの解析に基づく試算値で、実際のゲーム内の値と異なる場合があります。
        </p>
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
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-shrink: 0;
  justify-content: space-between;
  padding: 12px 16px;
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

.score-line {
  align-items: baseline;
  display: flex;
  gap: 8px;
  margin: 0 0 8px;
}

.score {
  font-size: 28px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.score-caption {
  color: var(--ink-2);
  font-size: 12px;
}

.param-table {
  border-collapse: collapse;
  font-size: 12px;
  width: 100%;
}

.param-table th,
.param-table td {
  border-bottom: 1px solid var(--line);
  padding: 6px 4px;
  text-align: left;
}

.param-table thead th {
  color: var(--ink-2);
  font-weight: 600;
}

.param-table .num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.bar-row {
  align-items: center;
  display: flex;
  gap: 8px;
}

.bar-label {
  color: var(--ink-2);
  flex-shrink: 0;
  font-size: 11px;
  white-space: nowrap;
  width: 7em;
}

.bar-track {
  background: var(--bg);
  border-radius: var(--r-pill);
  flex: 1;
  height: 10px;
  overflow: hidden;
}

.bar-fill {
  background: var(--link);
  border-radius: var(--r-pill);
  display: block;
  height: 100%;
}

.bar-value {
  color: var(--ink-2);
  flex-shrink: 0;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  width: 4.5em;
}

.skill-holder {
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 4px;
}

.skill-card-name {
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 400;
  margin-left: 6px;
}

.skill-text {
  font-size: 13px;
  line-height: 1.7;
  margin: 0;
}

.state {
  border-radius: var(--r-s);
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  margin-right: 6px;
  padding: 0 8px;
  vertical-align: 1px;
}

.state-active {
  background: var(--ink);
  color: #fff;
}

.state-unmet {
  background: var(--bg);
  border: 1px solid var(--line);
  color: var(--ink-2);
  line-height: 16px;
}

.state-unstructured {
  background: #fbeae9;
  color: #b3261e;
}

.note {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.7;
  margin: 0 0 8px;
}

.body > .note {
  margin: 0;
}

.member {
  border-top: 1px solid var(--line);
  padding: 10px 0;
}

.member:last-of-type {
  padding-bottom: 0;
}

.member-head {
  align-items: center;
  display: flex;
  gap: 8px;
  margin: 0;
  min-width: 0;
}

.type-badge {
  border-radius: var(--r-s);
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  padding: 0 8px;
}

.type-badge.type-cute {
  background: var(--cute-tint);
  color: var(--cute-text);
}

.type-badge.type-happy {
  background: var(--happy-tint);
  color: var(--happy-text);
}

.type-badge.type-pure {
  background: var(--pure-tint);
  color: var(--pure-text);
}

.member-name {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
}

.member-card {
  color: var(--ink-2);
  flex: 1;
  font-size: 12px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fixed-badge {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink-2);
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  line-height: 16px;
  padding: 0 6px;
}

.member-stats {
  color: var(--ink-2);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  margin: 4px 0 6px;
}

.member-skills {
  display: flex;
  flex-direction: column;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.member-skills li {
  font-size: 12px;
  line-height: 1.7;
}

.skill-tag {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink-2);
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  margin-right: 6px;
  min-width: 4.5em;
  padding: 0 6px;
  text-align: center;
}
</style>
