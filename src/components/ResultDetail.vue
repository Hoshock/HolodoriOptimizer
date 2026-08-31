<script setup lang="ts">
import { computed } from "vue";

import type { CandidateView } from "../composables/useOptimizer";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById, holomenById } from "../data";
import type { Card, ParamKind } from "../data/types";
import { isConditionMet, PARAM_KINDS } from "../engine/score";
import { formatScore, holomenName } from "../ui/labels";

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

type SkillState = "active" | "unmet" | "unstructured";

const STATE_LABELS: Record<SkillState, string> = {
  active: "反映中",
  unmet: "条件未達",
  unstructured: "未反映",
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
        </section>

        <section class="block">
          <h4>リーダー(衣装スキル)</h4>
          <div class="unit-card" :class="`type-${props.leader.type}`">
            <p class="unit-name">{{ holomenName(props.leader.holomenId) }}</p>
            <p class="unit-card-name">{{ props.leader.name }}</p>
            <ul class="unit-skills">
              <li>
                <span class="skill-tag">衣装</span>
                <span class="skill-text">
                  <span class="state" :class="`state-${costumeState}`">{{
                    STATE_LABELS[costumeState]
                  }}</span>
                  {{ props.leader.costumeSkill.raw }}
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section class="block">
          <h4>メンバー</h4>
          <p class="note">
            アクティブ・SP スキルはライブ中に発動する効果のため、この試算スコアには含まれません。
          </p>
          <div class="unit-list">
            <div
              v-for="card in members"
              :key="card.id"
              class="unit-card"
              :class="`type-${card.type}`"
            >
              <p class="unit-name">
                {{ holomenName(card.holomenId) }}
                <span v-if="props.fixedIds.includes(card.id)" class="fixed-badge">固定</span>
              </p>
              <p class="unit-card-name">{{ card.name }}</p>
              <p class="unit-stats">
                パフォーマンス {{ formatScore(card.stats.performance) }} / テクニック
                {{ formatScore(card.stats.technique) }} / センス
                {{ formatScore(card.stats.sense) }}
              </p>
              <ul class="unit-skills">
                <li>
                  <span class="skill-tag">SP</span>
                  <span class="skill-text">{{ card.specialSkill.raw }}</span>
                </li>
                <li>
                  <span class="skill-tag">アクティブ</span>
                  <span class="skill-text">{{ card.activeSkill.raw }}</span>
                </li>
                <li>
                  <span class="skill-tag">パッシブ</span>
                  <span class="skill-text">
                    <span class="state" :class="`state-${passiveState(card)}`">{{
                      STATE_LABELS[passiveState(card)]
                    }}</span>
                    {{ card.passiveSkill.raw }}
                  </span>
                </li>
              </ul>
            </div>
          </div>
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

/* カード表現はステップ 1・2 の充填スロットと同じ: タイプ淡色の面+基準色の枠 */
.unit-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.unit-card {
  border-radius: var(--r-m);
  padding: 12px;
}

.unit-card.type-cute {
  background: var(--cute-tint);
}

.unit-card.type-happy {
  background: var(--happy-tint);
}

.unit-card.type-pure {
  background: var(--pure-tint);
}

.unit-name {
  align-items: center;
  display: flex;
  font-size: 17px;
  font-weight: 700;
  gap: 8px;
  justify-content: space-between;
  line-height: 24px;
  margin: 0;
}

.unit-card-name {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 18px;
  margin: 2px 0 0;
}

.unit-stats {
  color: var(--ink-2);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 16px;
  margin: 4px 0 0;
}

.unit-skills {
  display: flex;
  flex-direction: column;
  gap: 6px;
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

/* スキル 1 件は最低 2 行ぶんを占有(1 行なら下を 1 行空ける)。詳細では全文を出すため上限は設けない */
.unit-skills li {
  display: flex;
  gap: 8px;
  min-height: 36px;
}

.skill-tag {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink-2);
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  height: 18px;
  line-height: 16px;
  text-align: center;
  width: 5.5em;
}

.skill-text {
  font-size: 12px;
  line-height: 18px;
}

.fixed-badge {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink-2);
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  width: 4.5em;
}

.state {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink-2);
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  margin-right: 4px;
  padding: 0 6px;
  vertical-align: 1px;
}

.state-active {
  background: var(--ink);
  border-color: var(--ink);
  color: #fff;
}

.state-unstructured {
  background: #fbeae9;
  border-color: #e6b3b0;
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
</style>
