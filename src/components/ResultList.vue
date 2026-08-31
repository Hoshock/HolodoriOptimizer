<script setup lang="ts">
import { cardById } from "../data";
import type { Card } from "../data/types";
import type { CandidateView } from "../composables/useOptimizer";
import { formatScore, holomenName } from "../ui/labels";

const props = defineProps<{
  candidates: CandidateView[];
  fixedIds: string[];
}>();

const emit = defineEmits<{ select: [rank: number] }>();

function memberCards(ids: string[]): Card[] {
  return ids.map((id) => cardById.get(id)).filter((c): c is Card => c !== undefined);
}
</script>

<template>
  <ol class="results">
    <li v-for="(candidate, rank) in props.candidates" :key="rank">
      <button type="button" class="result" aria-haspopup="dialog" @click="emit('select', rank)">
        <span class="result-head">
          <span class="rank-circle" :class="`rank-${Math.min(rank + 1, 4)}`">{{ rank + 1 }}</span>
          <span class="score">{{ formatScore(candidate.breakdown.unitScore) }}</span>
          <span v-if="!candidate.breakdown.costumeSkillActive" class="warn">衣装スキル不発</span>
          <span class="detail-hint">詳細 ›</span>
        </span>
        <span class="members">
          <span
            v-for="card in memberCards(candidate.memberIds)"
            :key="card.id"
            class="member"
            :class="`type-${card.type}`"
          >
            <span class="name-row">
              <span class="member-name">{{ holomenName(card.holomenId) }}</span>
              <span v-if="props.fixedIds.includes(card.id)" class="fixed-badge">固定</span>
            </span>
            <span class="card-name">{{ card.name }}</span>
          </span>
        </span>
      </button>
    </li>
  </ol>
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
  cursor: pointer;
  display: block;
  padding: 12px;
  text-align: left;
  width: 100%;
}

.result-head {
  align-items: center;
  display: flex;
  gap: 8px;
}

/* 順位は同径の円で統一: 1〜3 位はメダル色、4 位以下は白地+枠線 */
.rank-circle {
  align-items: center;
  border-radius: 50%;
  color: #3d3d3d;
  display: flex;
  flex-shrink: 0;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
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

.rank-4 {
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink-2);
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

.detail-hint {
  color: var(--ink-2);
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  margin-left: auto;
}

/*
 * メンバー = 名前(+固定バッジは名前のすぐ右)/カード名の 2 行。
 * タイプはバッジではなくタレント名の文字色(タイプ濃色)で判別する。
 */
.members {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.member {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.name-row {
  align-items: center;
  display: flex;
  gap: 8px;
  min-width: 0;
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
  width: 3.5em;
}

.member-name {
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-cute .member-name {
  color: var(--cute-text);
}

.type-happy .member-name {
  color: var(--happy-text);
}

.type-pure .member-name {
  color: var(--pure-text);
}

.card-name {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
