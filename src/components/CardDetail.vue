<script setup lang="ts">
import { computed } from "vue";

import CloseButton from "./CloseButton.vue";
import SkillIcon from "./SkillIcon.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById } from "../data";
import { ASSUMED_PARAM_UPGRADE_RATIO, BLOOM_UPGRADE_STAGE } from "../data/bloom";
import type { BloomVariant, ParamKind } from "../data/types";
import { PARAM_KINDS } from "../engine/score";
import { affiliationName, affiliationsOfCard, formatScore, holomenName } from "../ui/labels";

/**
 * カード 1 枚の詳細(サイドメニュー「カード一覧」→ ピッカー → ここ。2026-09-07 ユーザー指示)。
 * 本体パラメータ・4 系統のスキル(開花最大の文言)・コネクト効果・開花段階ごとの強化内容を見せる。
 * データにない情報(コネクト効果の内容、開花前の文言)は「未確認」で埋める
 */
const props = defineProps<{ cardId: string }>();
const emit = defineEmits<{ close: [] }>();

const card = computed(() => cardById.get(props.cardId) ?? null);

const PARAM_LABELS: Record<ParamKind, string> = {
  performance: "パフォーマンス",
  technique: "テクニック",
  sense: "センス",
};

const statTotal = computed(() => {
  const c = card.value;
  if (!c) return 0;
  return PARAM_KINDS.reduce((sum, p) => sum + c.stats[p], 0);
});

/** 所属タグ(色つきカードの下に左から並べる。フブキのように複数所属なら全部) */
const affiliationTags = computed(() =>
  card.value ? affiliationsOfCard(card.value).map(affiliationName) : [],
);

/** 強化前(指定段階より前)に確認済みの文言。なければ null(= 未確認) */
function textBefore<S>(variants: BloomVariant<S>[] | undefined, stage: number): string | null {
  let found: string | null = null;
  for (const v of variants ?? []) if (v.bloom < stage) found = v.raw;
  return found;
}

/** 開花段階ごとの強化内容(1凸=アクティブ / 2凸=パラメータ / 3凸=SP / 4凸=パッシブ / 5凸=コネクト) */
const bloomRows = computed(() => {
  const c = card.value;
  if (!c) return [];
  const paramPercent = Math.round((ASSUMED_PARAM_UPGRADE_RATIO - 1) * 100);
  return [
    {
      stage: BLOOM_UPGRADE_STAGE.active,
      title: "アクティブスキル強化",
      before: textBefore(c.activeSkill.bloomVariants, BLOOM_UPGRADE_STAGE.active),
    },
    {
      stage: BLOOM_UPGRADE_STAGE.params,
      title: `全パラメータ +${String(paramPercent)}%`,
      before: undefined,
    },
    {
      stage: BLOOM_UPGRADE_STAGE.special,
      title: "SPスキル強化",
      before: textBefore(c.specialSkill.bloomVariants, BLOOM_UPGRADE_STAGE.special),
    },
    {
      stage: BLOOM_UPGRADE_STAGE.passive,
      title: "パッシブスキル強化",
      before: textBefore(c.passiveSkill.bloomVariants, BLOOM_UPGRADE_STAGE.passive),
    },
    { stage: 5, title: "コネクト効果", before: undefined },
  ];
});

useModalChrome(() => emit("close"));
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div
      v-if="card"
      class="sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="`${holomenName(card.holomenId)}「${card.name}」の詳細`"
    >
      <header class="sheet-head">
        <h3>カード一覧</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <!-- カード表現はスロット・詳細モーダルと同じ: タイプ淡色の面にタレント名とサブタイトルだけ。所属はその下のタグ -->
        <section class="unit-card" :class="`type-${card.type}`">
          <p class="unit-name">{{ holomenName(card.holomenId) }}</p>
          <p class="unit-card-name">{{ card.name }}</p>
        </section>
        <ul class="tags" aria-label="所属">
          <li v-for="tag in affiliationTags" :key="tag" class="tag">{{ tag }}</li>
        </ul>

        <section class="block">
          <h4>パラメータ<span class="fn">※1</span></h4>
          <table class="param-table">
            <tbody>
              <tr v-for="p in PARAM_KINDS" :key="p">
                <th scope="row">{{ PARAM_LABELS[p] }}</th>
                <td class="num">{{ formatScore(card.stats[p]) }}</td>
              </tr>
              <tr class="total-row">
                <th scope="row">合計</th>
                <td class="num">{{ formatScore(statTotal) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="block">
          <h4>衣装スキル</h4>
          <ul class="unit-skills">
            <li>
              <span class="skill-tag"><SkillIcon kind="costume" label="衣装" /></span>
              <span class="skill-text">{{ card.costumeSkill.raw }}</span>
            </li>
          </ul>
        </section>

        <section class="block">
          <h4>スキル</h4>
          <ul class="unit-skills">
            <li>
              <span class="skill-tag"><SkillIcon kind="sp" label="SP" /></span>
              <span class="skill-text">{{ card.specialSkill.raw }}</span>
            </li>
            <li>
              <span class="skill-tag"><SkillIcon kind="active" label="アクティブ" /></span>
              <span class="skill-text">{{ card.activeSkill.raw }}</span>
            </li>
            <li>
              <span class="skill-tag"><SkillIcon kind="passive" label="パッシブ" /></span>
              <span class="skill-text">{{ card.passiveSkill.raw }}</span>
            </li>
          </ul>
        </section>

        <section class="block">
          <h4>開花<span class="fn">※2</span></h4>
          <ul class="bloom-list">
            <li v-for="row in bloomRows" :key="row.stage">
              <span class="skill-tag">
                <SkillIcon kind="bloom" :count="row.stage" :label="`開花${String(row.stage)}`" />
              </span>
              <span class="bloom-text">
                <span class="bloom-title">{{ row.title }}</span>
                <span v-if="row.before" class="bloom-before">強化前: {{ row.before }}</span>
                <span v-else-if="row.before === null || row.stage === 5" class="bloom-before">
                  未確認
                </span>
              </span>
            </li>
          </ul>
        </section>

        <section class="block">
          <h4>コネクト効果</h4>
          <p class="placeholder">未確認</p>
        </section>

        <div class="footnotes">
          <p>
            <span class="fn-num">※1</span>
            <span
              >レベル最大・2凸以上の本体値です（ホロメンボード・所属ボーナスを含みません）。</span
            >
          </p>
          <p>
            <span class="fn-num">※2</span>
            <span>
              スキルの文言は開花最大時のものです。開花途中の文言は確認できたものだけを表示し、それ以外は「未確認」としています。
            </span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  background: rgba(35, 48, 61, 0.4);
  inset: 0;
  position: fixed;
  z-index: 11; /* カード一覧のピッカー(10)の上に重ねる */
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
  background: var(--chrome);
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

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.block h4 {
  font-size: 15px;
  margin: 0 0 8px;
}

.unit-card {
  border-radius: var(--r-m);
  padding: 12px;
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
  font-size: 17px;
  font-weight: 700;
  line-height: 24px;
  margin: 0;
}

.unit-card-name {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 14px;
  margin: -1px 0 0;
}

/* 所属タグ: ピッカーの所属チップを小さくした形(表示のみ)。色つきカードの直下に左から並べる */
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  margin: -8px 0 0; /* body の gap 16px を 8px に詰めてカードに寄せる */
  padding: 0;
}

.tag {
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
  line-height: 24px;
  padding: 0 10px;
}

.param-table {
  border-collapse: collapse;
  font-size: 12px;
  width: 100%;
}

.param-table th,
.param-table td {
  border-bottom: 1px solid var(--line);
  padding: 6px 4px;
  text-align: left;
}

.param-table .total-row th,
.param-table .total-row td {
  border-bottom: none;
  font-weight: 700;
}

.param-table .num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.unit-skills,
.bloom-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.unit-skills li,
.bloom-list li {
  align-items: center;
  display: flex;
  gap: 8px;
  min-height: 36px;
}

.skill-tag {
  display: flex;
  flex-shrink: 0;
}

.skill-text,
.bloom-title {
  font-size: 12px;
  line-height: 18px;
}

.bloom-text {
  display: flex;
  flex-direction: column;
}

.bloom-before,
.placeholder {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 18px;
  margin: 0;
}
</style>
