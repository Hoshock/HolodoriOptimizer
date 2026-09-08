<script setup lang="ts">
import { computed } from "vue";

import CloseButton from "./CloseButton.vue";
import SkillIcon from "./SkillIcon.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById, holomenById } from "../data";
import { bloomOf } from "../data/bloom";
import type { BloomMap } from "../data/bloom";
import type { GreenBoardEffects } from "../data/greenBoard";
import { resolveCard } from "../data/resolve";
import type { Card } from "../data/types";
import type { BoardMap } from "../storage/boards";
import type { AccountBonus } from "../engine/power";
import { isConditionMet } from "../engine/score";
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
  /** 実行時のホロメン ID → 青ボードの解放マス。素の値(ボード込み)の検算に使う */
  boards?: BoardMap;
  /** 実行時の緑ボード(アカウント全体の合計)。null なら効かせていない */
  green?: GreenBoardEffects | null;
  /** 実行時のアカウント補正(メモリー % ・強化ボーナス %)。内訳の補足表示に使う */
  account?: AccountBonus;
}>();

const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

/** メンバー(スキル文言を実行時の開花段階に解決したカード) */
const members = computed(() =>
  props.candidate.memberIds
    .map((id) => cardById.get(id))
    .filter((c): c is Card => c !== undefined)
    .map((c) => resolveCard(c, props.blooms, props.boards, props.green)),
);

function bloomLevel(cardId: string): number {
  return bloomOf(props.blooms, cardId);
}

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

/** メニュー画面のスコアボーナス 4 項目とユニットスコアの試算(src/engine/displayScore.ts) */
const display = computed(() => props.candidate.display);

/** スコアボーナスの項目(%)。ゲーム内表示と同じ小数 1 桁 */
function formatPoint(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

/** 総合力の内訳(ゲームのユニット編成画面と同じ 6 項目。src/engine/power.ts) */
const power = computed(() => props.candidate.breakdown);

/** 内訳の % の補足(メモリー 6.0% のように、ゲーム内表示と同じ桁で) */
function formatPercent(percent: number): string {
  return `${percent.toFixed(percent % 1 === 0 || Math.round(percent * 10) === percent * 10 ? 1 : 2)}%`;
}

/** メンバー別の総合力(ゲームの各メンバー下の表示値に相当。四捨五入) */
const memberRows = computed(() =>
  power.value.members.map((m) => ({
    id: m.card.id,
    name: holomenName(m.card.holomenId),
    natural: m.natural,
    total: Math.round(m.total),
  })),
);
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" :aria-label="`${rank}位の編成の詳細`">
      <header class="sheet-head">
        <h3>{{ props.rank }}位の編成</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <section class="block">
          <!-- 見出しの値はユニットスコア(試算。曲を指定していれば黄・イベントのスコアボーナス込み)。説明文は置かない(2026-09-08 ユーザー指示) -->
          <p class="score-line">
            <span class="score">{{ formatScore(props.candidate.live.expectedScore) }}</span>
            <span class="fn">※1</span>
          </p>
          <!-- メンバー別: 素の P/T/S(ボード前の本体値)と、そのメンバーの総合力(ゲームの各メンバー下の表示値に相当)。一番上に置く(2026-09-08 ユーザー指示) -->
          <table class="param-table">
            <thead>
              <tr>
                <th scope="col">メンバー</th>
                <th scope="col" class="num">P</th>
                <th scope="col" class="num">T</th>
                <th scope="col" class="num">S</th>
                <th scope="col" class="num">総合力</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in memberRows" :key="row.id">
                <th scope="row">{{ row.name }}</th>
                <td class="num">{{ formatScore(row.natural.performance) }}</td>
                <td class="num">{{ formatScore(row.natural.technique) }}</td>
                <td class="num">{{ formatScore(row.natural.sense) }}</td>
                <td class="num">{{ formatScore(row.total) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="block">
          <h4>総合力<span class="fn">※2</span></h4>
          <!-- ゲームのユニット編成画面の内訳と同じ 6 項目(2026-09-08 実機観測)。効いていない項目は淡色 -->
          <table class="param-table">
            <tbody>
              <tr>
                <th scope="row">メンバーパラメータ</th>
                <td class="num">{{ formatScore(power.memberParameters) }}</td>
              </tr>
              <tr>
                <th scope="row">衣装スキル</th>
                <td class="num" :class="{ dim: power.costumeEffect === 0 }">
                  +{{ formatScore(power.costumeEffect) }}
                </td>
              </tr>
              <tr>
                <th scope="row">ホロメンボード効果</th>
                <td class="num" :class="{ dim: power.boardEffect === 0 }">
                  +{{ formatScore(power.boardEffect)
                  }}<span v-if="power.redEffect !== 0" class="sub"
                    >（赤 +{{ formatScore(power.redEffect) }}）</span
                  >
                </td>
              </tr>
              <tr>
                <th scope="row">パッシブスキル</th>
                <td class="num" :class="{ dim: power.passiveEffect === 0 }">
                  +{{ formatScore(power.passiveEffect) }}
                </td>
              </tr>
              <tr>
                <th scope="row">メモリー効果</th>
                <td class="num" :class="{ dim: power.memoryEffect === 0 }">
                  +{{ formatScore(power.memoryEffect)
                  }}<span v-if="props.account" class="sub"
                    >（{{ formatPercent(props.account.memoryPercent) }}）</span
                  >
                </td>
              </tr>
              <tr>
                <th scope="row">メンバー強化ボーナス</th>
                <td class="num" :class="{ dim: power.memberEnhancementEffect === 0 }">
                  +{{ formatScore(power.memberEnhancementEffect)
                  }}<span v-if="props.account" class="sub"
                    >（{{ formatPercent(props.account.enhancementPercent) }}）</span
                  >
                </td>
              </tr>
              <tr class="total-row">
                <th scope="row">総合力</th>
                <td class="num">{{ formatScore(power.totalPower) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="block">
          <h4>スコアボーナス<span class="fn">※3</span></h4>
          <!-- ゲームのユニット編成画面のスコアボーナス 4 項目(仮定モデル。src/engine/displayScore.ts) -->
          <table class="param-table">
            <tbody>
              <tr>
                <th scope="row">アクティブスキル</th>
                <td class="num" :class="{ dim: display.active === 0 }">
                  {{ formatPoint(display.active) }}
                </td>
              </tr>
              <tr>
                <th scope="row">ホロメンボード効果</th>
                <td class="num" :class="{ dim: display.board === 0 }">
                  {{ formatPoint(display.board) }}
                </td>
              </tr>
              <tr>
                <th scope="row">パッシブスキル</th>
                <td class="num" :class="{ dim: display.passive === 0 }">
                  {{ formatPoint(display.passive) }}
                </td>
              </tr>
              <tr>
                <th scope="row">スペシャルスキル</th>
                <td class="num" :class="{ dim: display.special === 0 }">
                  {{ formatPoint(display.special) }}
                </td>
              </tr>
              <tr class="total-row">
                <th scope="row">合計</th>
                <td class="num">{{ formatPoint(display.total) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="block">
          <h4>リーダー</h4>
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

        <div class="footnotes">
          <p>
            <span class="fn-num">※1</span>
            <span
              >ユニットスコアは試算値で、実際のゲーム内の値と異なる場合があります。総合力 ×（1 +
              スコアボーナス）× 約
              2.037（実機のユニットスコアから逆算した係数）で求め、曲を指定したときは黄ボードの楽曲スコアボーナス（登録した全ホロメン分の合計、上限
              10.0%）とイベントスコアボーナスを掛けます（掛け方はゲーム内の式が未確認のため仮定）。</span
            >
          </p>
          <p>
            <span class="fn-num">※2</span>
            <span
              >総合力はゲームのユニット編成画面の内訳と同じ 6
              項目を別々に求めて加算します（2026-09-08
              の実機観測に基づく試算）。衣装スキル・パッシブ・赤ボードの割合・メモリーは、カード詳細の値ではなくホロメンボードを含まない本体値（メンバー別の表の
              P/T/S）を基準に、パラメータごとに小数を切り上げます。「◯◯2人の」は条件に合うメンバーのうちその
              パラメータが高い 2
              人にだけ効きます。メンバー強化ボーナスはメモリーを除く合計にメンバーごとに掛かります。開花途中のカードの本体値は
              2凸の +10%
              から割り戻した推定で、合計で数点の誤差があります。「開花状況を考慮する」「ボード状況を考慮する」を外したとき（全カードからさがすときも）は、開花最大・ホロメンボード全解放の状態として試算します。ホロメンボードはマスの表記値の合計で、コネクトマスによる増幅は含みません。赤ボードはリーダーのホロメンのものだけが効き、固定値はメンバー各自に、割合は
              5
              人の本体値の合計に掛けます（歌唱者条件は曲を指定し、リーダーのホロメンがその曲の歌唱者に含まれるときだけ。ライフ・判定強化・ライフ回復・報酬は試算に含めません）。</span
            >
          </p>
          <p>
            <span class="fn-num">※3</span>
            <span
              >スコアボーナスはゲームのユニット編成画面の 4 項目を、曲を選ばない約 200
              秒の仮想タイムラインで試算します（仮定に基づくモデルで、実機とは数ポイントずれます。特にスペシャルスキルは式が未確定）。アクティブスキルは青ボードを含まない基準値、青ボードの発動率・発動頻度とリーダーの赤ボードの「全員のスコアサポート効果」による増分はホロメンボード効果に、パッシブ・衣装スキルのスコアサポート効果による増分はパッシブスキルに入れます。</span
            >
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

/* ページヘッダ・ピッカーと同寸法(77px)・同文字サイズ(24px/900)— 12px/18px のままで「他のヘッダと合ってる？」— 2026-09-07 */
.sheet-head {
  align-items: center;
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

/* 列見出しは「〜後」を付けず 1 行に収める(5 列目の赤ボードを足したときに 2 行になった — 2026-09-08 ユーザー指示)。行見出しも折り返さない */
.param-table thead th {
  color: var(--ink-2);
  font-weight: 600;
  white-space: nowrap;
}

.param-table tbody th {
  white-space: nowrap;
}

.param-table .num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* カード表現はStep 2・3 の充填スロットと同じ: タイプ淡色の面+基準色の枠 */
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
</style>
