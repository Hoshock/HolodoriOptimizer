<script setup lang="ts">
import { cardById } from "../data";
import type { Card } from "../data/types";
import type { CandidateView } from "../composables/useOptimizer";
import { formatScore, holomenName, TYPE_LABELS } from "../ui/labels";

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
            <span class="type-badge">{{ TYPE_LABELS[card.type] }}</span>
            <span class="member-name">{{ holomenName(card.holomenId) }}</span>
            <span class="card-name">{{ card.name }}</span>
            <span class="fixed-cell">
              <span v-if="props.fixedIds.includes(card.id)" class="fixed-badge">固定</span>
            </span>
          </span>
        </span>
      </button>
    </li>
  </ol>
  <p class="note">編成をタップすると、スコア内訳と各カードのスキルの詳細を確認できます。</p>
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
 * メンバー行はグリッドで列を共有し、バッジ・名前・カード名・固定の縦の線を
 * 全行で揃える(名前の長さで開始位置がずれない)
 */
.members {
  display: grid;
  gap: 4px 8px;
  grid-template-columns: max-content max-content 1fr max-content;
  margin-top: 8px;
}

.member {
  display: contents;
}

.type-badge {
  align-self: center;
  border-radius: var(--r-s);
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  width: 4.5em;
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
  align-self: center;
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  white-space: nowrap;
}

.card-name {
  align-self: center;
  color: var(--ink-2);
  font-size: 12px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fixed-cell {
  align-self: center;
  font-size: 11px;
  width: 3.5em;
}

.fixed-badge {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink-2);
  display: block;
  font-size: 11px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}

.note {
  color: var(--ink-2);
  font-size: 12px;
  margin: 8px 0 0;
}
</style>
