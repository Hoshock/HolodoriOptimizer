<script setup lang="ts">
import { computed, ref } from "vue";

import CloseButton from "./CloseButton.vue";
import SkillIcon from "./SkillIcon.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById } from "../data";
import { BLOOM_MAX, cardAtBloomWithProvenance } from "../data/bloom";
import type { ParamKind } from "../data/types";
import { PARAM_KINDS } from "../engine/score";
import { affiliationName, affiliationsOfCard, formatScore, holomenName } from "../ui/labels";

/**
 * カード 1 枚の詳細(サイドメニュー「カード一覧」→ ピッカー → ここ。2026-09-07 ユーザー指示。
 * 2026-09-10 から結果詳細・ユニット詳細のリーダー／メンバーのタイルからも開く)。
 * 本体パラメータと 4 系統のスキルを見せる。
 *
 * スキルの見出しの右端に 0〜5凸 のトグルを置き、SP / アクティブ / パッシブの文言を
 * その開花段階のものへ切り替える(2026-09-15 ユーザー指示。既定は 5凸)。衣装スキルは開花段階で
 * 変わらないので切り替えない。実機で確認できていない段階は `cardAtBloomWithProvenance` が
 * 「未確認」を返すので、そのまま出す(推定値を文言として見せない)。
 * 同じ指示で「開花」「コネクト効果」のセクションは外した — どの段階で何が強くなるかはトグルで分かる
 */
const props = defineProps<{
  cardId: string;
  /**
   * ヘッダの見出し。既定は入口の一覧名（`.claude/rules/ui-parts.md`）。
   * 一覧を経由しない入口（結果詳細・ユニット詳細のタイル）からは「カード」で開く
   */
  title?: string;
}>();
const emit = defineEmits<{ close: [] }>();

const card = computed(() => cardById.get(props.cardId) ?? null);

/** スキルを見せる開花段階。既定は最大(5凸) */
const bloom = ref(BLOOM_MAX);
const BLOOM_STAGES: readonly number[] = Array.from({ length: BLOOM_MAX + 1 }, (_, i) => i);

/** その開花段階のスキル文言(記録のない段階は「未確認」) */
const shown = computed(() => {
  const c = card.value;
  return c ? cardAtBloomWithProvenance(c, bloom.value).card : null;
});

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
        <h3>{{ props.title ?? "カード一覧" }}</h3>
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

        <section v-if="shown" class="block">
          <!-- 見出しの右端に開花のトグル(0〜5凸)。切り替えると下の SP / アクティブ / パッシブが入れ替わる -->
          <div class="block-head">
            <h4>スキル<span class="fn">※2</span></h4>
            <div class="segment" role="radiogroup" aria-label="開花段階">
              <button
                v-for="b in BLOOM_STAGES"
                :key="b"
                type="button"
                class="seg"
                role="radio"
                :class="{ 'seg-active': b === bloom }"
                :aria-checked="b === bloom"
                :aria-label="`開花${String(b)}凸`"
                @click="bloom = b"
              >
                <SkillIcon kind="bloom" :count="b" />
              </button>
            </div>
          </div>
          <ul class="unit-skills">
            <li>
              <span class="skill-tag"><SkillIcon kind="sp" label="SP" /></span>
              <span class="skill-text">{{ shown.specialSkill.raw }}</span>
            </li>
            <li>
              <span class="skill-tag"><SkillIcon kind="active" label="アクティブ" /></span>
              <span class="skill-text">{{ shown.activeSkill.raw }}</span>
            </li>
            <li>
              <span class="skill-tag"><SkillIcon kind="passive" label="パッシブ" /></span>
              <span class="skill-text">{{ shown.passiveSkill.raw }}</span>
            </li>
          </ul>
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
              見出し右の開花段階で
              SP・アクティブ・パッシブの文言が切り替わります（衣装スキルは開花で変わりません）。実機で確認できていない段階は「未確認」と表示し、試算にはいちばん近い段階の内容をそのまま使っています。
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
  z-index: 11; /* カード一覧のピッカー・結果詳細・ユニット詳細(10)の上に重ねる */
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

/* 見出しと開花トグルを 1 行に並べる(トグルは右端) */
.block-head {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-bottom: 8px;
}

.block-head h4 {
  margin: 0;
}

/* 開花段階の切り替え(ボードシートのセグメンテッドコントロールと同形。中身はアイコン) */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  flex-shrink: 0;
  grid-template-columns: repeat(6, 34px);
  overflow: hidden;
}

.seg {
  align-items: center;
  background: var(--surface);
  border: none;
  border-left: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
  display: flex;
  height: 34px;
  justify-content: center;
  padding: 0;
}

.seg:first-child {
  border-left: none;
}

.seg-active {
  background: var(--selected);
  color: var(--selected-ink);
}

/* 選択中は開花アイコンも反転させる(SkillIcon が自前で --ink-2 を持つので :deep で上書きする) */
.seg-active :deep(.skill-icon) {
  color: var(--selected-ink);
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

.unit-skills {
  display: flex;
  flex-direction: column;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.unit-skills li {
  align-items: center;
  display: flex;
  gap: 8px;
  min-height: 36px;
}

.skill-tag {
  display: flex;
  flex-shrink: 0;
}

.skill-text {
  font-size: 12px;
  line-height: 18px;
}
</style>
