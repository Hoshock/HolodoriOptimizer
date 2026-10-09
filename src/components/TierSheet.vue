<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";

import CloseButton from "./CloseButton.vue";
import InfoButton from "./InfoButton.vue";
import InfoDialog from "./InfoDialog.vue";
import SkillIcon from "./SkillIcon.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { useScrollTopOnChange } from "../composables/useScrollTopOnChange";
import { cardById } from "../data";
import { BLOOM_MAX } from "../data/bloom";
import tierJson from "../data/tierList.json";
import { evaluateTier, TIER_RANKS } from "../engine/tier";
import type { TierDataset } from "../engine/tier";
import { TIER_INFO } from "../ui/infoContent";
import { holomenName } from "../ui/labels";

/**
 * ティア表(サイドメニュー「ティア表」。カード一覧の上の行。2026-10-09 ユーザー指示)。★5 だけ。
 * リーダー / メンバーで表を分け(同日ユーザー指示「リーダーとメンバーで Tier 表を分ける」「リーダータブが左」)、上のセグメントで切り替える。
 * 段(SS〜D)ごとに見出しを置き、その下に**細いカードタイル**(結果詳細のメンバー 5 人と同じ 5 列の形。下の行は右に星だけ —
 * 「細いカードにパーセントを書くな」)を全体の最高に近い順に並べる(同日ユーザー指示「表の画面では細いカード表示にし、カードをクリックした時に評価画面に移る」)。
 * 押すと評価画面(`TierCardSheet`。総評 + 評価軸の表)。評価の前提と段の意味は見出しの ⓘ(`TIER_INFO`)。
 * 評価は事前計算のデータ(`src/data/tierList.json`。ADR-024)から導くので、開いても計算しない
 */
const emit = defineEmits<{ pick: [cardId: string, role: Role]; close: [] }>();

type Role = "member" | "leader";
const ROLES: readonly { key: Role; label: string }[] = [
  { key: "leader", label: "リーダー" },
  { key: "member", label: "メンバー" },
];
const role = ref<Role>("leader");
const infoOpen = ref(false);

const dataset = tierJson as TierDataset;
const evaluations = computed(() => evaluateTier(dataset, role.value));

/** 段ごと(空の段は出さない)。カードが引けない評価は出さない */
const groups = computed(() =>
  TIER_RANKS.map((rank) => ({
    rank,
    items: evaluations.value
      .filter((e) => e.rank === rank)
      .map((e) => ({ evaluation: e, card: cardById.get(e.cardId) }))
      .filter((x) => x.card !== undefined)
      .map((x) => ({ evaluation: x.evaluation, card: x.card! })),
  })).filter((g) => g.items.length > 0),
);

const list = useTemplateRef("list");
useScrollTopOnChange(list, [role]);
useModalChrome(() => emit("close"));
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="ティア表" tabindex="-1">
      <header class="sheet-head">
        <div class="head-title">
          <h3>ティア表</h3>
          <InfoButton label="ティア表の説明" @click="infoOpen = true" />
        </div>
        <CloseButton @close="emit('close')" />
      </header>

      <!-- リーダー / メンバーの切り替え(排他なのでセグメント。さがすの 3 択と同じ 40px。リーダーが左) -->
      <div class="controls">
        <div class="segment" role="radiogroup" aria-label="役割（1つ選択）">
          <button
            v-for="r in ROLES"
            :key="r.key"
            type="button"
            class="seg"
            role="radio"
            :aria-checked="role === r.key"
            :class="{ 'seg-active': role === r.key }"
            @click="role = r.key"
          >
            {{ r.label }}
          </button>
        </div>
      </div>

      <div ref="list" class="body">
        <section
          v-for="g in groups"
          :key="g.rank"
          class="tier"
          :aria-label="`${g.rank}（${g.items.length}枚）`"
        >
          <h4 class="tier-head">
            <span class="tier-rank">{{ g.rank }}</span>
            <span class="tier-count">{{ g.items.length }}枚</span>
          </h4>
          <div class="tile-grid" role="list">
            <button
              v-for="x in g.items"
              :key="x.card.id"
              type="button"
              class="tile"
              :class="`type-${x.card.type}`"
              role="listitem"
              aria-haspopup="dialog"
              @click="emit('pick', x.card.id, role)"
            >
              <span class="tile-name">{{ holomenName(x.card.holomenId) }}</span>
              <span class="tile-card-name">{{ x.card.name }}</span>
              <!-- 下の行は 開花(評価の前提の最大 = 5凸)と星(数字は書かない — 2026-10-09 ユーザー指示) -->
              <span class="tile-foot">
                <SkillIcon kind="bloom" :count="BLOOM_MAX" :label="`開花${BLOOM_MAX}`" />
                <SkillIcon kind="rarity" :count="x.card.rarity" :label="`★${x.card.rarity}`" />
              </span>
            </button>
          </div>
        </section>
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
  z-index: 10;
}

.sheet {
  background: var(--surface);
  box-shadow: var(--shadow-sheet);
  display: flex;
  flex-direction: column;
  height: 100dvh;
  outline: none;
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

/* ページヘッダ・ピッカーと同寸法(77px)・同文字サイズ(24px/900) */
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

/* 見出しと ⓘ(見出しのすぐ右。右端は閉じるボタン) */
.head-title {
  align-items: center;
  display: flex;
  gap: 8px;
  min-width: 0;
}

/* セグメントの下の 12px はここに持つ(本文の上端の余白にすると、貼り付いた段の見出しの上から前の段のタイルが覗く) */
.controls {
  flex-shrink: 0;
  padding: 12px 16px;
}

.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  overflow: hidden;
}

.seg {
  background: var(--surface);
  border: none;
  border-left: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  height: 40px;
}

.seg:first-child {
  border-left: none;
}

.seg-active {
  background: var(--selected);
  color: var(--selected-ink);
  font-weight: 700;
}

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 16px calc(16px + env(safe-area-inset-bottom));
}

/* 段の見出し: 大きな文字の段と、右に枚数。本文のスクロールの上端に貼り付く */
.tier-head {
  align-items: baseline;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 10px;
  margin: 0 0 8px;
  padding: 4px 0 6px;
  position: sticky;
  top: 0;
  z-index: 1;
}

.tier-rank {
  font-size: 24px;
  font-weight: 900;
  letter-spacing: 0.02em;
  line-height: 1;
}

.tier-count {
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
}

/* 細いカードタイル: 結果詳細のメンバー 5 人と同じ形(5 列・タイプ淡色の面・中央揃え・2 行クランプ) */
.tile-grid {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(5, 1fr);
}

@media (min-width: 48rem) {
  .tile-grid {
    grid-template-columns: repeat(8, 1fr);
  }
}

.tile {
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

.tile.type-cute {
  background: var(--cute-tint);
  border-color: var(--cute-tint);
}

.tile.type-happy {
  background: var(--happy-tint);
  border-color: var(--happy-tint);
}

.tile.type-pure {
  background: var(--pure-tint);
  border-color: var(--pure-tint);
}

.tile-name {
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

.tile-card-name {
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

/* 下の行: 開花と星(26px)を中央に寄せて 2px の間隔(ほかの細いタイルと同じ) */
.tile-foot {
  align-items: center;
  display: flex;
  gap: 2px;
  justify-content: center;
  margin-top: 2px;
}
</style>
