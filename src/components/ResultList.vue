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
    <li v-for="(candidate, rank) in props.candidates" :key="rank" class="result">
      <div class="result-head">
        <span class="rank">{{ rank + 1 }}位</span>
        <span class="score">{{ formatScore(candidate.breakdown.unitScore) }}</span>
        <span v-if="!candidate.breakdown.costumeSkillActive" class="warn"> 衣装スキル不発 </span>
      </div>
      <ul class="members">
        <li v-for="card in memberCards(candidate.memberIds)" :key="card.id" class="member">
          <span class="member-name">{{ holomenName(card.holomenId) }}</span>
          <span class="card-name">{{ card.name }}</span>
          <span class="badges">
            <span :class="['type-badge', card.type]">{{ TYPE_LABELS[card.type] }}</span>
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
        パフォーマンス {{ formatScore(candidate.breakdown.finalTotals.performance) }} / テクニック
        {{ formatScore(candidate.breakdown.finalTotals.technique) }} / センス
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
  gap: 0.8rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.result {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.7rem 0.9rem;
}

.result-head {
  align-items: baseline;
  display: flex;
  gap: 0.7rem;
}

.rank {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.score {
  font-size: 1.2rem;
  font-weight: 700;
}

.warn {
  color: #b3261e;
  font-size: 0.8rem;
}

.members {
  display: grid;
  gap: 0.2rem 1rem;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
}

.member {
  align-items: baseline;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.member-name {
  font-weight: 600;
}

.card-name {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.badges {
  display: inline-flex;
  gap: 0.25rem;
}

.type-badge {
  border-radius: 999px;
  font-size: 0.7rem;
  padding: 0.05rem 0.5rem;
}

.type-badge.cute {
  background: color-mix(in srgb, #e05a8c 18%, var(--bg));
}

.type-badge.happy {
  background: color-mix(in srgb, #e0a13c 22%, var(--bg));
}

.type-badge.pure {
  background: color-mix(in srgb, #4a7fd0 18%, var(--bg));
}

.fixed-badge {
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  font-size: 0.7rem;
  padding: 0.05rem 0.5rem;
}

.unstructured {
  color: #b3261e;
}

.breakdown {
  color: var(--text-muted);
  font-size: 0.8rem;
  margin: 0.45rem 0 0;
}

.note {
  color: var(--text-muted);
  font-size: 0.8rem;
}
</style>
