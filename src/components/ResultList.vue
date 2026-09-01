<script setup lang="ts">
import SkillIcon from "./SkillIcon.vue";
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

function leaderCard(candidate: CandidateView): Card | null {
  return cardById.get(candidate.leaderId) ?? null;
}
</script>

<template>
  <ol class="results">
    <li v-for="(candidate, rank) in props.candidates" :key="rank">
      <button type="button" class="result" aria-haspopup="dialog" @click="emit('select', rank)">
        <span class="result-head">
          <span class="rank-circle" :class="`rank-${Math.min(rank + 1, 4)}`">{{ rank + 1 }}</span>
          <span class="score">{{ formatScore(candidate.live.expectedScore) }}</span>
          <span v-if="!candidate.breakdown.costumeSkillActive" class="warn">衣装スキル不発</span>
          <span class="detail-hint">詳細 ›</span>
        </span>
        <span class="members">
          <template v-if="leaderCard(candidate)">
            <span class="member" :class="`type-${leaderCard(candidate)!.type}`">
              <span class="name-row">
                <span class="member-name">{{ holomenName(leaderCard(candidate)!.holomenId) }}</span>
                <SkillIcon class="role-icon" kind="leader" label="リーダー" />
              </span>
              <span class="card-name">{{ leaderCard(candidate)!.name }}</span>
            </span>
          </template>
          <span
            v-for="card in memberCards(candidate.memberIds)"
            :key="card.id"
            class="member"
            :class="`type-${card.type}`"
          >
            <span class="name-row">
              <span class="member-name">{{ holomenName(card.holomenId) }}</span>
              <SkillIcon
                v-if="props.fixedIds.includes(card.id)"
                class="role-icon"
                kind="fixed"
                label="固定"
              />
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
  min-height: 26px; /* 役割アイコン(正円)の有無で行の高さを揺らさない */
  min-width: 0;
}

/* 役割アイコン(リーダー=王冠 / 固定=ピン)は右端の固定列に置き、全行で縦の線を揃える */
.role-icon {
  margin-left: auto;
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
