<script setup lang="ts">
import { computed, ref, watch } from "vue";

import SkillIcon from "./SkillIcon.vue";
import { cardById } from "../data";
import { bloomOf } from "../data/bloom";
import type { BloomMap } from "../data/bloom";
import type { Card } from "../data/types";
import type { CandidateView } from "../composables/useOptimizer";
import { formatScore, holomenName } from "../ui/labels";

const props = defineProps<{
  candidates: CandidateView[];
  fixedIds: string[];
  /** リーダーを指定して実行したか(リーダー行のピン表示) */
  leaderFixed?: boolean;
  /** 実行時のカード ID → 開花段階。0凸(既定)のカードにはアイコンを出さない */
  blooms?: BloomMap;
}>();

const emit = defineEmits<{ select: [rank: number] }>();

/** 逐次表示の単位。まず 10 件出し、「さらに10件」で継ぎ足す */
const PAGE_SIZE = 10;
const visibleCount = ref(PAGE_SIZE);
watch(
  () => props.candidates,
  () => {
    visibleCount.value = PAGE_SIZE;
  },
);

const visible = computed(() => props.candidates.slice(0, visibleCount.value));
const hasMore = computed(() => visibleCount.value < props.candidates.length);

function memberCards(ids: string[]): Card[] {
  return ids.map((id) => cardById.get(id)).filter((c): c is Card => c !== undefined);
}

function leaderCard(candidate: CandidateView): Card | null {
  return cardById.get(candidate.leaderId) ?? null;
}
</script>

<template>
  <ol class="results">
    <li v-for="(candidate, rank) in visible" :key="rank">
      <button type="button" class="result" aria-haspopup="dialog" @click="emit('select', rank)">
        <span class="result-head">
          <span class="rank-circle" :class="`rank-${Math.min(rank + 1, 4)}`">{{ rank + 1 }}</span>
          <span class="score">{{ formatScore(candidate.live.expectedScore) }}</span>
          <span v-if="!candidate.breakdown.costumeSkillActive" class="warn">衣装スキル不発</span>
        </span>
        <span class="members">
          <!--
            リーダーは無彩色の面(--bg、空スロット・曲枠と同じ「枠」の面)で区別する。
            タイプの表現は一覧内で常に文字色に統一する(面のタイプ淡色と混ぜない — 2026-09-01)。
            開花はリーダー枠のスコアに関係しないためアイコンを出さず、
            その列(最右)には衣装スキルの供給元であることを示す衣装アイコンを置く。
            ピンの列はメンバー行と共通(リーダー指定で実行したときに出る)
          -->
          <template v-if="leaderCard(candidate)">
            <span class="member leader-band" :class="`type-${leaderCard(candidate)!.type}`">
              <span class="name-row">
                <span class="member-name">{{ holomenName(leaderCard(candidate)!.holomenId) }}</span>
                <span class="right-icons">
                  <SkillIcon v-if="props.leaderFixed" kind="fixed" label="固定" />
                  <SkillIcon kind="costume" label="衣装スキル" />
                </span>
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
              <span class="right-icons">
                <SkillIcon v-if="props.fixedIds.includes(card.id)" kind="fixed" label="固定" />
                <SkillIcon
                  kind="bloom"
                  :count="bloomOf(props.blooms, card.id)"
                  :label="`開花${bloomOf(props.blooms, card.id)}`"
                />
              </span>
            </span>
            <span class="card-name">{{ card.name }}</span>
          </span>
        </span>
      </button>
    </li>
    <li v-if="hasMore">
      <button type="button" class="more-button" @click="visibleCount += PAGE_SIZE">
        さらに10件
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

/* 行全体がタップ対象であることを押下フィードバックで示す(誘導テキストは置かない) */
.result:active {
  background: var(--bg);
}

.more-button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  width: 100%;
}

.more-button:active {
  background: var(--bg);
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

/*
 * リーダー = 無彩色の面(バンド)、メンバー = 白地の 5 行。
 * タイプはバッジや面でなくタレント名の文字色(タイプ濃色)で判別する(リーダーも同じ)。
 * バンドと各行の左右 padding を揃え、右端の開花アイコンの縦の線を全行で一致させる。
 */
.members {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.leader-band {
  background: var(--bg);
  border-radius: var(--r-s);
  padding: 6px 10px;
}

.member {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 0 10px;
}

.name-row {
  align-items: center;
  display: flex;
  gap: 8px;
  min-height: 26px; /* 役割アイコン(正円)の有無で行の高さを揺らさない */
  min-width: 0;
}

/* アイコンは右端の固定列: 最右は開花(リーダー行は衣装)、固定(ピン)はその左の列 */
.right-icons {
  align-items: center;
  display: flex;
  flex-shrink: 0;
  gap: 4px;
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
