<script setup lang="ts">
import { ref, watch } from "vue";

import PageCarousel from "./PageCarousel.vue";
import SkillIcon from "./SkillIcon.vue";
import UnitStar from "./UnitStar.vue";
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
  /** おかゆモードで実行したときのおかゆんのホロメン ID。その行はピンの列におにぎりを出す */
  okayuHolomenId?: string | null;
  /** 左右スワイプを拾う要素(結果のパネル全体)。省略時はカルーセルの範囲 */
  swipeElement?: HTMLElement | null;
  /** 候補ごとのお気に入りユニットの登録番号(未登録は null)。並びは candidates と同じ */
  unitSlots?: (number | null)[];
}>();

const emit = defineEmits<{ select: [rank: number]; favorite: [rank: number] }>();

/** 結果は 1 件ずつの横スクロール(PageCarousel)。新しい結果が来たら 1 位へ戻す(2026-09-08 ユーザー指示) */
const page = ref(0);
watch(
  () => props.candidates,
  () => {
    page.value = 0;
  },
);

function memberCards(ids: string[]): Card[] {
  return ids.map((id) => cardById.get(id)).filter((c): c is Card => c !== undefined);
}

function leaderCard(candidate: CandidateView): Card | null {
  return cardById.get(candidate.leaderId) ?? null;
}

/** その候補が登録されている番号(未登録は null) */
function unitSlot(rank: number): number | null {
  return props.unitSlots?.[rank] ?? null;
}

function isOkayu(card: Card): boolean {
  return (
    props.okayuHolomenId !== null &&
    props.okayuHolomenId !== undefined &&
    card.holomenId === props.okayuHolomenId
  );
}
</script>

<template>
  <PageCarousel
    v-model="page"
    :items="props.candidates"
    label="結果（横にスクロール）"
    :swipe-element="props.swipeElement"
  >
    <template #page="{ item: candidate, index: rank }">
      <div class="result-card">
        <button type="button" class="result" aria-haspopup="dialog" @click="emit('select', rank)">
          <span class="result-head">
            <span class="rank-circle">{{ rank + 1 }}</span>
            <span class="score">{{ formatScore(candidate.modifiers.adjustedUnitScore) }}</span>
            <span v-if="!candidate.breakdown.costumeSkillActive" class="warn">衣装スキル不発</span>
          </span>
          <span class="members">
            <!--
              リーダーはメンバーとの境のセパレータで区別する(タイプの表現は一覧内で常に文字色)。
              開花はリーダー枠のスコアに関係しないためアイコンを出さず、
              その列(最右)には衣装スキルの供給元であることを示す衣装アイコンを置く。
              ピンの列はメンバー行と共通(リーダー指定で実行したときに出る)
            -->
            <template v-if="leaderCard(candidate)">
              <span class="member leader-band" :class="`type-${leaderCard(candidate)!.type}`">
                <span class="name-row">
                  <span class="member-name">{{
                    holomenName(leaderCard(candidate)!.holomenId)
                  }}</span>
                  <span class="right-icons">
                    <SkillIcon
                      v-if="isOkayu(leaderCard(candidate)!)"
                      kind="okayu"
                      label="おかゆん"
                    />
                    <SkillIcon v-else-if="props.leaderFixed" kind="fixed" label="固定" />
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
                  <SkillIcon v-if="isOkayu(card)" kind="okayu" label="おかゆん" />
                  <SkillIcon
                    v-else-if="props.fixedIds.includes(card.id)"
                    kind="fixed"
                    label="固定"
                  />
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
        <!--
          お気に入りの星は結果の 1 件（スコアの数字があるパネル）の右上の角に、星の中心が角に重なるように
          置く（2026-09-09 ユーザー指定。結果パネルの外・その内側の右角・パネル内の右上はいずれも差し戻された）。
          大きさは順位の円と同じ 28px
        -->
        <button
          type="button"
          class="favorite"
          aria-haspopup="dialog"
          :aria-label="
            unitSlot(rank) === null ? 'ユニットに登録' : `ユニット${unitSlot(rank)}の登録を解除`
          "
          @click="emit('favorite', rank)"
        >
          <UnitStar
            :slot-number="unitSlot(rank)"
            :registered="unitSlot(rank) !== null"
            :size="28"
          />
        </button>
      </div>
    </template>
  </PageCarousel>
</template>

<style scoped>
/*
 * 1 件のパネルと、その右上の角に重ねるお気に入りの星(星の中心が角 — 2026-09-09 ユーザー指定)。
 * パネルの寸法は変えない(内側へ寄せて星の場所を作る案は「元のパネルのサイズを小さくするな」で差し戻し)。
 * はみ出す半分は、カルーセルのトラックの overflow-clip-margin で描かれる
 */
.result-card {
  position: relative;
}

.favorite {
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  height: 36px;
  justify-content: center;
  padding: 0;
  position: absolute;
  right: -18px;
  top: -18px;
  width: 36px;
}

.result {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  cursor: pointer;
  display: block;
  padding: 10px 12px;
  text-align: left;
  width: 100%;
}

.result-head {
  align-items: center;
  display: flex;
  gap: 8px;
  /* 角に置いた星の内側の半分（14px）に文字が潜らないぶんの余白 */
  padding-right: 16px;
}

/* 順位は同径の円で統一。全順位を白地+枠線のフラットにする(1〜3 位のメダル色は 2026-09-09 に「やめて」) */
.rank-circle {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 50%;
  color: var(--ink-2);
  display: flex;
  flex-shrink: 0;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  height: 28px;
  justify-content: center;
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

/*
 * リーダー(セパレータの上) + メンバー 5 行。
 * タイプはバッジや面でなくタレント名の文字色(タイプ濃色)で判別する(リーダーも同じ)。
 * 右端のアイコン列(開花 / 衣装)の縦の線は全行で一致させる。
 */
/* メンバー同士の間隔は 6px(2026-09-05「ホロメンとホロメンの間」を詰める指示。名前+サブタイトルは隣接) */
.members {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

/* リーダーとメンバーの境はセパレータ(罫線)で示す(面バンドは廃止 — 2026-09-01) */
.leader-band {
  border-bottom: 1px solid var(--line);
  padding-bottom: 6px;
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

/* サブタイトルはホロメン名に隣接させる(行間を詰め、名前行の下 3px の余白ぶん引き上げる — 2026-09-05) */
.card-name {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 14px;
  margin-top: -3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
