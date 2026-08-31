<script setup lang="ts">
import { cardById } from "../data";
import type { Card } from "../data/types";
import type { CandidateView } from "../composables/useOptimizer";
import { formatScore, holomenName, TYPE_LABELS } from "../ui/labels";

const props = defineProps<{
  candidates: CandidateView[];
  fixedIds: string[];
}>();

function memberCards(ids: string[]): Card[] {
  return ids.map((id) => cardById.get(id)).filter((c): c is Card => c !== undefined);
}

function hasUnstructured(candidate: CandidateView): boolean {
  return candidate.memberIds.some((id) => cardById.get(id)?.passiveSkill.structured === null);
}
</script>

<template>
  <ol class="results">
    <li
      v-for="(candidate, rank) in props.candidates"
      :key="rank"
      class="result"
      :class="{ [`medal-${rank + 1}`]: rank < 3 }"
    >
      <div class="result-head">
        <span class="rank" :class="{ [`rank-${rank + 1}`]: rank < 3 }">{{ rank + 1 }}位</span>
        <span class="score">{{ formatScore(candidate.breakdown.unitScore) }}</span>
        <span v-if="!candidate.breakdown.costumeSkillActive" class="warn">衣装スキル不発</span>
      </div>
      <ul class="members">
        <li
          v-for="card in memberCards(candidate.memberIds)"
          :key="card.id"
          class="member"
          :class="`type-${card.type}`"
        >
          <span class="member-name">{{ holomenName(card.holomenId) }}</span>
          <span class="card-name">{{ card.name }}</span>
          <span class="badges">
            <span class="type-badge">{{ TYPE_LABELS[card.type] }}</span>
            <span v-if="props.fixedIds.includes(card.id)" class="fixed-badge">固定</span>
            <span
              v-if="card.passiveSkill.structured === null"
              class="unstructured"
              :title="`パッシブスキル未反映: ${card.passiveSkill.raw}`"
              >※</span
            >
          </span>
        </li>
      </ul>
      <p class="breakdown">
        パフォーマンス {{ formatScore(candidate.breakdown.finalTotals.performance) }} ・ テクニック
        {{ formatScore(candidate.breakdown.finalTotals.technique) }} ・ センス
        {{ formatScore(candidate.breakdown.finalTotals.sense) }}
      </p>
    </li>
  </ol>
  <p v-if="props.candidates.some((c) => hasUnstructured(c))" class="note">
    ※
    印のカードはスキル効果を構造化できておらず、計算に反映されていません(スコアが実際より低く出ます)。
  </p>
</template>

<style scoped>
.results {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.result {
  background: var(--bg);
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.7rem 0.9rem;
}

.result.medal-1 {
  border-color: var(--gold);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--gold) 25%, transparent);
}

.result.medal-2 {
  border-color: var(--silver);
}

.result.medal-3 {
  border-color: var(--bronze);
}

.result-head {
  align-items: baseline;
  display: flex;
  gap: 0.7rem;
}

.rank {
  border-radius: 999px;
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 700;
}

.rank-1,
.rank-2,
.rank-3 {
  color: #fff;
  padding: 0.05rem 0.6rem;
}

.rank-1 {
  background: var(--gold);
}

.rank-2 {
  background: var(--silver);
}

.rank-3 {
  background: var(--bronze);
}

.score {
  font-size: 1.35rem;
  font-weight: 900;
}

.warn {
  color: #d14343;
  font-size: 0.8rem;
}

.members {
  display: grid;
  gap: 0.35rem;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  list-style: none;
  margin: 0.55rem 0 0;
  padding: 0;
}

.member {
  align-items: baseline;
  background: var(--surface);
  border-radius: var(--radius-sm);
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  padding: 0.3rem 0.55rem;
}

.member.type-cute {
  border-left: 5px solid var(--cute);
}

.member.type-happy {
  border-left: 5px solid var(--happy);
}

.member.type-pure {
  border-left: 5px solid var(--pure);
}

.member-name {
  font-size: 0.9rem;
  font-weight: 700;
}

.card-name {
  color: var(--text-muted);
  font-size: 0.72rem;
}

.badges {
  display: inline-flex;
  gap: 0.25rem;
  margin-left: auto;
}

.type-badge {
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.05rem 0.45rem;
}

.type-cute .type-badge {
  background: var(--cute-soft);
  color: var(--cute);
}

.type-happy .type-badge {
  background: var(--happy-soft);
  color: var(--happy);
}

.type-pure .type-badge {
  background: var(--pure-soft);
  color: var(--pure);
}

.fixed-badge {
  background: var(--primary-soft);
  border-radius: 999px;
  color: var(--primary-strong);
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.05rem 0.45rem;
}

.unstructured {
  color: #d14343;
  font-weight: 700;
}

.breakdown {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin: 0.45rem 0 0;
}

.note {
  color: var(--text-muted);
  font-size: 0.8rem;
}
</style>
