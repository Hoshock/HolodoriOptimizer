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
        <span v-if="rank < 3" class="rank-medal" :class="`rank-${rank + 1}`">{{ rank + 1 }}</span>
        <span v-else class="rank-num">{{ rank + 1 }}</span>
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
          <span class="type-badge">{{ TYPE_LABELS[card.type] }}</span>
          <span class="member-name">{{ holomenName(card.holomenId) }}</span>
          <span class="card-name">{{ card.name }}</span>
          <span v-if="props.fixedIds.includes(card.id)" class="fixed-badge">固定</span>
          <span
            v-if="card.passiveSkill.structured === null"
            class="unstructured"
            :title="`パッシブスキル未反映: ${card.passiveSkill.raw}`"
            >※</span
          >
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
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.result {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  padding: 12px;
}

.result-head {
  align-items: center;
  display: flex;
  gap: 8px;
}

/* 1〜3 位はメダル色の円バッジ、4 位以下は等幅数字のみ */
.rank-medal {
  align-items: center;
  border-radius: 50%;
  color: #3d3d3d;
  display: flex;
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
  height: 28px;
  justify-content: center;
  width: 28px;
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

.rank-num {
  color: var(--ink-2);
  flex-shrink: 0;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  text-align: center;
  width: 28px;
}

.score {
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.warn {
  color: #b3261e;
  font-size: 12px;
}

/* メンバー行: 1 行固定構造(バッジ / 名前 / カード名 ellipsis)で高さが揃う */
.members {
  display: flex;
  flex-direction: column;
  gap: 4px;
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

.member {
  align-items: center;
  display: flex;
  gap: 8px;
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

.type-cute .type-badge {
  background: var(--cute-tint);
  color: var(--cute-text);
}

.type-happy .type-badge {
  background: var(--happy-tint);
  color: var(--happy-text);
}

.type-pure .type-badge {
  background: var(--pure-tint);
  color: var(--pure-text);
}

.member-name {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
}

.card-name {
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

.unstructured {
  color: #b3261e;
  flex-shrink: 0;
  font-weight: 700;
}

.breakdown {
  color: var(--ink-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  margin: 8px 0 0;
}

.note {
  color: var(--ink-2);
  font-size: 13px;
}
</style>
