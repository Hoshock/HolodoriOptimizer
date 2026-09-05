<script setup lang="ts">
import { computed } from "vue";

import SkillIcon from "./SkillIcon.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById, holomenById } from "../data";
import { bloomOf, cardAtBloom } from "../data/bloom";
import type { BloomMap } from "../data/bloom";
import type { Card, ParamKind } from "../data/types";
import { isConditionMet, PARAM_KINDS } from "../engine/score";
import { formatScore, holomenName } from "../ui/labels";

const props = defineProps<{
  /** 1 始まりの順位 */
  rank: number;
  candidate: CandidateView;
  /** リーダー(実行時の開花段階に解決済みのカード) */
  leader: Card;
  fixedIds: string[];
  /** 実行時のカード ID → 開花段階。スキル文言の解決と開花アイコンに使う */
  blooms?: BloomMap;
}>();

const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const PARAM_LABELS: Record<ParamKind, string> = {
  performance: "パフォーマンス",
  technique: "テクニック",
  sense: "センス",
};

/** メンバー(スキル文言を実行時の開花段階に解決したカード) */
const members = computed(() =>
  props.candidate.memberIds
    .map((id) => cardById.get(id))
    .filter((c): c is Card => c !== undefined)
    .map((c) => cardAtBloom(c, bloomOf(props.blooms, c.id))),
);

function bloomLevel(cardId: string): number {
  return bloomOf(props.blooms, cardId);
}

/** スキル適用前(カードの素の値)の合算 */
const rawTotals = computed(() => {
  const totals: Record<ParamKind, number> = { performance: 0, technique: 0, sense: 0 };
  for (const m of members.value) {
    for (const p of PARAM_KINDS) totals[p] += m.stats[p];
  }
  return totals;
});

/** 発動していない(=試算スコアに効いていない)スキル行はグレーアウトで示す */
function passiveActive(card: Card): boolean {
  const structured = card.passiveSkill.structured;
  if (structured === null) return false;
  return isConditionMet(structured.condition, members.value, holomenById);
}

const costumeActive = computed(
  () =>
    props.leader.costumeSkill.structured !== null && props.candidate.breakdown.costumeSkillActive,
);

/** 期待寄与(スコア比)を +12.3% 形式にする */
function formatBonus(ratio: number): string {
  return `+${(ratio * 100).toFixed(1)}%`;
}

/**
 * 総合期待スコアの内訳(絶対値)。表示上の 3 行の和が見出しの総合期待スコアと
 * 一致する(検算できる)よう、丸め誤差は SP 行に寄せる
 */
const scoreParts = computed(() => {
  const unit = Math.round(props.candidate.breakdown.unitScore);
  const expected = Math.round(props.candidate.live.expectedScore);
  const active = Math.round(props.candidate.breakdown.unitScore * props.candidate.live.active);
  return { unit, active, sp: expected - unit - active };
});

/** パラメータ表の 1 行(丸め後)。前段から変化していないセルは淡色にする */
function stageRow(p: ParamKind) {
  const raw = Math.round(rawTotals.value[p]);
  const base = Math.round(props.candidate.breakdown.baseTotals[p]);
  const final = Math.round(props.candidate.breakdown.finalTotals[p]);
  return { raw, base, final, baseChanged: base !== raw, finalChanged: final !== base };
}

/** パラメータ表の合計行。衣装スキル後の合計 = ユニットスコア(内訳表の 1 行目と一致する) */
const stageTotals = computed(() => {
  let raw = 0;
  let base = 0;
  for (const p of PARAM_KINDS) {
    raw += rawTotals.value[p];
    base += props.candidate.breakdown.baseTotals[p];
  }
  return {
    raw: Math.round(raw),
    base: Math.round(base),
    final: Math.round(props.candidate.breakdown.unitScore),
  };
});
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" :aria-label="`${rank}位の編成の詳細`">
      <header class="sheet-head">
        <h3>{{ props.rank }}位の編成</h3>
        <button type="button" class="close-button" aria-label="閉じる" @click="emit('close')">
          ✕
        </button>
      </header>

      <div class="body">
        <section class="block">
          <p class="score-line">
            <span class="score">{{ formatScore(props.candidate.live.expectedScore) }}</span>
            <span class="score-caption">総合期待スコア（試算値）</span>
          </p>
          <table class="param-table">
            <tbody>
              <tr>
                <th scope="row">ユニットスコア</th>
                <td class="num">{{ formatScore(scoreParts.unit) }}</td>
              </tr>
              <tr>
                <th scope="row">アクティブスキル期待値</th>
                <td class="num">
                  +{{ formatScore(scoreParts.active)
                  }}<span class="sub">（{{ formatBonus(props.candidate.live.active) }}）</span>
                </td>
              </tr>
              <tr>
                <th scope="row">SPスキル期待値</th>
                <td class="num">
                  +{{ formatScore(scoreParts.sp)
                  }}<span class="sub">（{{ formatBonus(props.candidate.live.sp) }}）</span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="block">
          <h4>ユニットスコア</h4>
          <table class="param-table">
            <thead>
              <tr>
                <th scope="col">パラメータ</th>
                <th scope="col" class="num">素の合計</th>
                <th scope="col" class="num">パッシブ後</th>
                <th scope="col" class="num">衣装スキル後</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in PARAM_KINDS" :key="p">
                <th scope="row">{{ PARAM_LABELS[p] }}</th>
                <td class="num">{{ formatScore(stageRow(p).raw) }}</td>
                <td class="num" :class="{ dim: !stageRow(p).baseChanged }">
                  {{ formatScore(stageRow(p).base) }}
                </td>
                <td class="num" :class="{ dim: !stageRow(p).finalChanged }">
                  {{ formatScore(stageRow(p).final) }}
                </td>
              </tr>
              <tr class="total-row">
                <th scope="row">合計</th>
                <td class="num">{{ formatScore(stageTotals.raw) }}</td>
                <td class="num">{{ formatScore(stageTotals.base) }}</td>
                <td class="num">{{ formatScore(stageTotals.final) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="block">
          <h4>リーダー（衣装スキル）</h4>
          <div class="unit-card" :class="`type-${props.leader.type}`">
            <p class="unit-name">{{ holomenName(props.leader.holomenId) }}</p>
            <p class="unit-card-name">{{ props.leader.name }}</p>
            <ul class="unit-skills">
              <li :class="{ inactive: !costumeActive }">
                <span class="skill-tag"><SkillIcon kind="costume" label="衣装" /></span>
                <span class="skill-text">{{ props.leader.costumeSkill.raw }}</span>
              </li>
            </ul>
          </div>
        </section>

        <section class="block">
          <h4>メンバー</h4>
          <div class="unit-list">
            <div
              v-for="card in members"
              :key="card.id"
              class="unit-card"
              :class="`type-${card.type}`"
            >
              <p class="unit-name">
                {{ holomenName(card.holomenId) }}
                <SkillIcon
                  kind="bloom"
                  :count="bloomLevel(card.id)"
                  :label="`開花${bloomLevel(card.id)}`"
                />
              </p>
              <p class="unit-card-name">{{ card.name }}</p>
              <ul class="unit-skills">
                <li>
                  <span class="skill-tag"><SkillIcon kind="sp" label="SP" /></span>
                  <span class="skill-text">{{ card.specialSkill.raw }}</span>
                </li>
                <li>
                  <span class="skill-tag"><SkillIcon kind="active" label="アクティブ" /></span>
                  <span class="skill-text">{{ card.activeSkill.raw }}</span>
                </li>
                <li :class="{ inactive: !passiveActive(card) }">
                  <span class="skill-tag"><SkillIcon kind="passive" label="パッシブ" /></span>
                  <span class="skill-text">{{ card.passiveSkill.raw }}</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <p class="note">
          数値・スキルはレベル・開花が最大のときの値を基準に、設定した開花段階に応じて試算します。段階ごとの実数値は非公開のため、確認できていない段階は仮定の倍率で割り戻した概算です（表示中のスキル文言は開花最大時のもの）。スコアはコミュニティの解析に基づく試算値で、実際のゲーム内の値と異なる場合があります。アクティブ・SPスキルの期待値は、発動確率・SP発動回数などの仮定値と曲の長さ（曲未選択時は全曲の中央値）に基づく概算です。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  background: rgba(35, 48, 61, 0.4);
  inset: 0;
  position: fixed;
  z-index: 10;
}

/* モバイルはフルスクリーンシート、広い画面では中央のダイアログ(CardPicker と同型) */
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

.sheet-head {
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-shrink: 0;
  justify-content: space-between;
  padding: 12px 16px;
}

.sheet-head h3 {
  font-size: 18px;
  margin: 0;
}

.close-button {
  align-items: center;
  background: var(--bg);
  border: none;
  border-radius: 50%;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-size: 15px;
  height: 44px;
  justify-content: center;
  width: 44px;
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

.score-line {
  align-items: baseline;
  display: flex;
  gap: 8px;
  margin: 0 0 8px;
}

.score {
  font-size: 28px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.score-caption {
  color: var(--ink-2);
  font-size: 12px;
}

.param-table {
  border-collapse: collapse;
  font-size: 12px;
  width: 100%;
}

/* 内訳の % は絶対値の補足として淡く小さく添える */
.param-table .sub {
  color: var(--ink-2);
  font-size: 11px;
  margin-left: 2px;
}

/* 前段から変化していない値は淡色にして、効いた列だけ目立たせる */
.param-table .dim {
  color: var(--ink-2);
}

.param-table .total-row th,
.param-table .total-row td {
  border-bottom: none;
  font-weight: 700;
}

.param-table th,
.param-table td {
  border-bottom: 1px solid var(--line);
  padding: 6px 4px;
  text-align: left;
}

.param-table thead th {
  color: var(--ink-2);
  font-weight: 600;
}

.param-table .num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* カード表現はステップ 1・2 の充填スロットと同じ: タイプ淡色の面+基準色の枠 */
.unit-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  align-items: center;
  display: flex;
  font-size: 17px;
  font-weight: 700;
  gap: 8px;
  justify-content: space-between;
  line-height: 24px;
  margin: 0;
  min-height: 26px; /* 役割アイコン(正円)の有無で高さを揺らさない */
}

/* サブタイトルはホロメン名に隣接させる(一覧と同じ — 2026-09-05) */
.unit-card-name {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 14px;
  margin: -1px 0 0;
}

.unit-skills {
  display: flex;
  flex-direction: column;
  gap: 6px;
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

/* スキル 1 件は最低 2 行ぶんを占有(1 行なら下を 1 行空ける)。詳細では全文を出すため上限は設けない */
.unit-skills li {
  align-items: center; /* 本文が 1 行でも複数行でもアイコンは縦中央に揃う */
  display: flex;
  gap: 8px;
  min-height: 36px;
}

/* アイコン+名称の併記列(一覧側のアイコンの凡例を兼ねる) */
.skill-tag {
  display: flex;
  flex-shrink: 0;
}

.skill-text {
  font-size: 12px;
  line-height: 18px;
}

/* 発動していないスキル(条件未達など)は行ごとグレーアウトして示す */
.unit-skills li.inactive {
  filter: grayscale(1);
  opacity: 0.45;
}

.note {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.7;
  margin: 0 0 8px;
}

.body > .note {
  margin: 0;
}
</style>
