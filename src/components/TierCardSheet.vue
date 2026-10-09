<script setup lang="ts">
import { computed, ref } from "vue";

import CloseButton from "./CloseButton.vue";
import InfoButton from "./InfoButton.vue";
import InfoDialog from "./InfoDialog.vue";
import SkillIcon from "./SkillIcon.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById } from "../data";
import { BLOOM_MAX } from "../data/bloom";
import tierJson from "../data/tierList.json";
import { evaluateTierCard } from "../engine/tier";
import type { TierDataset } from "../engine/tier";
import type { Card } from "../data/types";
import { TIER_INFO } from "../ui/infoContent";
import { formatScore, holomenName } from "../ui/labels";
import { adoptionText, tierAxes, tierSummary } from "../ui/tier";

/**
 * ティア表の 1 枚の評価画面(2026-10-09 ユーザー指示「カードをクリックした時に評価画面に移る。そこで文が長すぎると意味不明なので
 * 適切な評価軸の表であらわす。表の前に総評を書く」「最良編成のメンバーも名前だけだとわからんだろ。もろもろわかりやすく、かつ定量性も大事」)。
 * 並びは カード(タイプ淡色の面。押すとカード詳細)→ 役割・段・採用率(段の根拠) → 総評 → 最高スコアの編成
 * (リーダーのパネル + メンバー 5 人の細いタイル。結果詳細と同じ形で、このカードはタイプ色の太枠。押すとカード詳細)→ 評価軸の表
 * (項目 / 内容 / 順位)→ 脚注。「比」とは言わず、点数と全体の最高との差(点・%)で言う。中身は `src/ui/tier.ts`、評価は `src/engine/tier.ts`
 */
const props = defineProps<{ cardId: string; role: "member" | "leader" }>();
const emit = defineEmits<{ card: [cardId: string]; close: [] }>();

const dataset = tierJson as TierDataset;
const card = computed(() => cardById.get(props.cardId) ?? null);
const evaluation = computed(() => evaluateTierCard(dataset, props.cardId, props.role));
const summary = computed(() => (evaluation.value ? tierSummary(evaluation.value) : ""));
const axes = computed(() => (evaluation.value ? tierAxes(dataset, evaluation.value) : []));
const roleLabel = computed(() => (props.role === "member" ? "メンバー" : "リーダー"));
/** 最高スコアのときの編成(リーダーとメンバー 5 人。カードが引けないものは出さない) */
const teamLeader = computed(() =>
  evaluation.value ? (cardById.get(evaluation.value.team.leaderId) ?? null) : null,
);
const teamMembers = computed(() =>
  (evaluation.value?.team.memberIds ?? [])
    .map((id) => cardById.get(id))
    .filter((c): c is Card => c !== undefined),
);

const infoOpen = ref(false);

useModalChrome(() => emit("close"));
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div
      v-if="card && evaluation"
      class="sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="`${holomenName(card.holomenId)}「${card.name}」の評価`"
    >
      <!-- 見出しの ⓘ は一覧(TierSheet)と同じ — 評価画面を開いても消さない(2026-10-09 ユーザー指摘) -->
      <header class="sheet-head">
        <div class="head-title">
          <h3>ティア表</h3>
          <InfoButton label="ティア表の説明" @click="infoOpen = true" />
        </div>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <!-- カード表現はカード詳細と同じ: タイプ淡色の面にホロメン名とカード名。押すとカード詳細 -->
        <button
          type="button"
          class="unit-card"
          :class="`type-${card.type}`"
          aria-haspopup="dialog"
          @click="emit('card', card.id)"
        >
          <span class="unit-name">
            {{ holomenName(card.holomenId) }}
            <SkillIcon kind="rarity" :count="card.rarity" :label="`★${card.rarity}`" />
          </span>
          <span class="unit-card-name">{{ card.name }}</span>
        </button>

        <!-- 役割と段(左)、採用率(右。段の根拠) -->
        <p class="verdict">
          <span class="verdict-role">{{ roleLabel }}</span>
          <span class="verdict-rank">{{ evaluation.rank }}</span>
          <span class="verdict-score">
            <span class="verdict-score-value">{{ adoptionText(evaluation.adoptionRate) }}</span>
            <span class="verdict-score-diff">採用率<span class="fn">※1</span></span>
          </span>
        </p>

        <section class="block">
          <h4>総評</h4>
          <p class="summary">{{ summary }}</p>
        </section>

        <!-- 最高スコアのときの編成: 結果詳細と同じ リーダーのパネル + メンバー 5 人の細いタイル。このカードはタイプ色の太枠 -->
        <section v-if="teamLeader" class="block">
          <h4>最高スコアの編成<span class="fn">※2</span></h4>
          <div class="team" role="list">
            <button
              type="button"
              class="unit-card team-leader"
              :class="[
                `type-${teamLeader.type}`,
                { mine: teamLeader.id === card.id && role === 'leader' },
              ]"
              role="listitem"
              aria-haspopup="dialog"
              @click="emit('card', teamLeader.id)"
            >
              <span class="unit-name">
                {{ holomenName(teamLeader.holomenId) }}
                <span class="unit-icons">
                  <SkillIcon kind="costume" label="衣装" />
                  <SkillIcon
                    kind="rarity"
                    :count="teamLeader.rarity"
                    :label="`★${teamLeader.rarity}`"
                  />
                </span>
              </span>
              <span class="unit-card-name">{{ teamLeader.name }}</span>
            </button>
            <div class="member-grid">
              <button
                v-for="m in teamMembers"
                :key="m.id"
                type="button"
                class="member-tile"
                :class="[`type-${m.type}`, { mine: m.id === card.id && role === 'member' }]"
                role="listitem"
                aria-haspopup="dialog"
                @click="emit('card', m.id)"
              >
                <span class="member-name">{{ holomenName(m.holomenId) }}</span>
                <span class="member-card-name">{{ m.name }}</span>
                <span class="member-icons">
                  <SkillIcon kind="bloom" :count="BLOOM_MAX" :label="`開花${BLOOM_MAX}`" />
                  <SkillIcon kind="rarity" :count="m.rarity" :label="`★${m.rarity}`" />
                </span>
              </button>
            </div>
          </div>
        </section>

        <section class="block">
          <h4>評価<span class="fn">※3</span></h4>
          <table class="axis-table">
            <thead>
              <tr>
                <th scope="col">項目</th>
                <th scope="col">内容</th>
                <th scope="col" class="num">順位</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in axes" :key="row.key">
                <th scope="row">{{ row.label }}</th>
                <td>{{ row.value }}</td>
                <td class="num">{{ row.rank === null ? "" : `${row.rank}位` }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <div class="footnotes">
          <p>
            <span class="fn-num">※1</span>
            <span
              >採用率は、★5 から 20〜50 枚（平均約 30 枚）を持つ仮想のアカウントを
              {{ formatScore(dataset.accounts.count) }} 件作り（どのカードも
              {{ formatScore(dataset.accounts.rounds) }}
              件ずつ所持）、それぞれで全カード・開花最大・ボード全解放・曲なし・コネクトなし・アカウント補正なしの前提のおまかせのさがすを行って、このカードを持っていたアカウントのうち最高編成に{{
                roleLabel
              }}として入った割合です（リーダーは、選ばれたカードと同じ衣装スキルの所持カード全部に数えます）。±は
              95% 信頼区間の半幅（pt）。段は採用率で決め、最高ユニットスコアは参考です。いまの ★5
              の中での相対的な値なので、強いカードが増えるとほかのカードの採用率は下がり、噛み合う相手が
              1
              枚しかないカードは、その相手を持たないアカウントで落ちます。評価はユニットスコア（編成画面の表示値）の試算で、ライブの点数の強さではありません。</span
            >
          </p>
          <p>
            <span class="fn-num">※2</span>
            <span
              >同じ前提で、このカードを{{
                roleLabel
              }}に固定して残りをおまかせでさがした、いちばん高いユニットスコア（試算）の編成です。リーダーはメンバーと同じカードでもよいので、同じカードが
              2
              回出ることがあります。さがすと同じ近似の探索なので、わずかに取りこぼすことがあります。</span
            >
          </p>
          <p>
            <span class="fn-num">※3</span>
            <span
              >順位は ★5
              全枚の中の順位（同じ値は同じ順位）。アクティブの順位は追加条件（ライフ・コンボなど）が満たされたものとして付けています。パッシブと衣装スキルは条件や対象で効き方が違うので順位を付けていません。</span
            >
          </p>
        </div>
      </div>
    </div>
    <InfoDialog v-if="infoOpen" :text="TIER_INFO" @close="infoOpen = false" />
  </div>
</template>

<style scoped>
.overlay {
  background: rgba(35, 48, 61, 0.4);
  inset: 0;
  position: fixed;
  z-index: 11; /* ティア表(10)の上。カード詳細(11)は App がこの後に描くので上に載る */
}

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

/* ページヘッダ・ピッカーと同寸法(77px) */
.sheet-head {
  align-items: center;
  background: var(--chrome-head);
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  justify-content: space-between;
  padding: 16px;
}

/* 見出しと ⓘ(見出しのすぐ右。右端は閉じるボタン。一覧と同じ) */
.head-title {
  align-items: center;
  display: flex;
  gap: 8px;
  min-width: 0;
}

.sheet-head h3 {
  font-size: 24px;
  font-weight: 900;
  line-height: 1.35;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* カード表現(カード詳細と同じ)。ボタンなので文字の寄せを戻す */
.unit-card {
  border: none;
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  display: block;
  font-size: inherit;
  padding: 12px;
  text-align: left;
  width: 100%;
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
}

/* カード名はカード詳細・結果詳細と同じ寸法(ここから開くカード詳細で面の高さが変わらないように — 2026-10-09 ユーザー指摘) */
.unit-card-name {
  color: var(--ink-2);
  display: block;
  font-size: 12px;
  line-height: 14px;
  margin-top: -1px;
}

/* 役割(淡色)→ 大きな段の文字 → 右端に最高ユニットスコア(大きく)とその下に全体の最高との差(小さく) */
.verdict {
  align-items: center;
  display: flex;
  gap: 10px;
  margin: 0;
}

.verdict-score {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-left: auto;
}

.verdict-score-value {
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 24px;
}

.verdict-score-diff {
  color: var(--ink-2);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  line-height: 16px;
}

.verdict-role {
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 600;
}

.verdict-rank {
  font-size: 32px;
  font-weight: 900;
  letter-spacing: 0.02em;
  line-height: 1;
}

/* 最高スコアの編成: リーダーのパネルの下にメンバー 5 人(結果詳細と同じ形)。このカードはタイプ色の太枠(ピッカーの選択中と同じ表し方) */
.team {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.unit-icons {
  align-items: center;
  display: flex;
  gap: 6px;
}

.unit-card.mine.type-cute,
.member-tile.mine.type-cute {
  box-shadow: inset 0 0 0 3px var(--cute);
}

.unit-card.mine.type-happy,
.member-tile.mine.type-happy {
  box-shadow: inset 0 0 0 3px var(--happy);
}

.unit-card.mine.type-pure,
.member-tile.mine.type-pure {
  box-shadow: inset 0 0 0 3px var(--pure);
}

.member-grid {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(5, 1fr);
}

.member-tile {
  align-items: stretch;
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font-size: inherit;
  gap: 2px;
  padding: 6px 2px;
  text-align: center;
}

.member-tile.type-cute {
  background: var(--cute-tint);
  border-color: var(--cute-tint);
}

.member-tile.type-happy {
  background: var(--happy-tint);
  border-color: var(--happy-tint);
}

.member-tile.type-pure {
  background: var(--pure-tint);
  border-color: var(--pure-tint);
}

.member-name {
  display: -webkit-box;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.3;
  min-height: calc(11px * 1.3 * 2);
  overflow: hidden;
  word-break: break-all;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.member-card-name {
  color: var(--ink-2);
  display: -webkit-box;
  font-size: 10px;
  line-height: 1.3;
  min-height: calc(10px * 1.3 * 2);
  overflow: hidden;
  word-break: break-all;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

/* 下の行は 開花(前提の最大 = 5凸)と星を中央に寄せて並べる(ほかの細いタイルと同じ) */
.member-icons {
  display: flex;
  gap: 2px;
  justify-content: center;
  margin-top: 2px;
}

.block h4 {
  font-size: 15px;
  margin: 0 0 8px;
}

.summary {
  font-size: 13px;
  line-height: 1.7;
  margin: 0;
}

/* 評価軸の表(結果詳細のメンバー別の表と同じ様式)。内容の列は折り返す */
.axis-table {
  border-collapse: collapse;
  font-size: 12px;
  width: 100%;
}

.axis-table th,
.axis-table td {
  border-bottom: 1px solid var(--line);
  padding: 6px 4px;
  text-align: left;
  vertical-align: top;
}

.axis-table thead th {
  color: var(--ink-2);
  font-weight: 600;
  white-space: nowrap;
}

.axis-table tbody th {
  font-weight: 600;
  white-space: nowrap;
}

.axis-table td {
  word-break: break-all;
}

.axis-table .num {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
</style>
