<script setup lang="ts">
import { computed, ref } from "vue";

import SkillIcon from "./SkillIcon.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { cardById } from "../data";
import { bloomOf } from "../data/bloom";
import type { BloomMap } from "../data/bloom";
import type { GreenBoardEffects } from "../data/greenBoard";
import { resolveCard } from "../data/resolve";
import type { Card } from "../data/types";
import type { BoardMap } from "../storage/boards";
import { formatScore, holomenName } from "../ui/labels";

/**
 * 1 編成ぶんの内訳表示（モーダルの中身だけを持ち、ヘッダ・閉じるボタンは持たない）。
 * 結果の詳細（ResultDetail）とお気に入りユニットの詳細（UnitSheet）で同じ中身を出すための共通部品 —
 * 同じ対象を見せる画面を別実装で似せない（.claude/rules/ui-parts.md）。
 * 並びはユニットスコア → リーダー（パネル）→ メンバー 5 人（横並びのタイル）→ メンバー別の表 →
 * 総合力 → スコアボーナス → 脚注（2026-09-10 ユーザー指示。「リーダー」「メンバー」の見出しは置かない）
 */
const props = defineProps<{
  candidate: CandidateView;
  /** リーダー（表示に使う開花段階・ボードに解決済みのカード） */
  leader: Card;
  /** カード ID → 開花段階。スキル文言の解決と開花アイコンに使う */
  blooms?: BloomMap;
  /** ホロメン ID → 青ボードの解放マス。素の値（ボード込み）の検算に使う */
  boards?: BoardMap;
  /** 緑ボード（アカウント全体の合計）。null なら効かせていない */
  green?: GreenBoardEffects | null;
}>();

const emit = defineEmits<{
  /** 「発動頻度のおすすめ」を開く（ライブ最適化。表示ユニットスコアとは別モデル — ADR-007） */
  frequency: [];
  /** リーダー・メンバーのタイルを押した（カード詳細を開く。2026-09-10 ユーザー指示） */
  card: [cardId: string];
}>();

/** メンバー（スキル文言を表示に使う開花段階に解決したカード） */
const members = computed(() =>
  props.candidate.memberIds
    .map((id) => cardById.get(id))
    .filter((c): c is Card => c !== undefined)
    .map((c) => resolveCard(c, props.blooms, props.boards, props.green)),
);

function bloomLevel(cardId: string): number {
  return bloomOf(props.blooms, cardId);
}

const costumeActive = computed(
  () =>
    props.leader.costumeSkill.structured !== null && props.candidate.breakdown.costumeSkillActive,
);

/**
 * 総合力・スコアボーナスの表は既定で畳む（2026-09-10 ユーザー指示）。開くとメンバー別の表の下に出るので、
 * 「発動頻度のおすすめ」のボタンはスコアボーナスの下へ送られる。開閉は保存しない
 */
const detailOpen = ref(false);

/** メニュー画面のスコアボーナス 4 項目とユニットスコアの試算(src/engine/displayScore.ts) */
const display = computed(() => props.candidate.display);

/** スコアボーナスの項目(%)。ゲーム内表示と同じ小数 1 桁 */
function formatPoint(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

/** 総合力の内訳(ゲームのユニット編成画面と同じ 6 項目。src/engine/power.ts) */
const power = computed(() => props.candidate.breakdown);

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
  <div class="breakdown">
    <!-- 脚注より上の本文（この塊の高さで、脚注の区切り線が下端の固定エリアに掛かる位置に決まる） -->
    <div class="breakdown-main">
      <section class="block score-block">
        <!-- 見出しの値はユニットスコア(試算。曲を指定していれば黄はスコアボーナスのボード欄に入り、イベントは倍率で掛かる)。説明文は置かない(2026-09-08 ユーザー指示) -->
        <p class="score-line">
          <!-- ※1 は数字の右上（上付き）。フレックスの子にすると vertical-align が効かないので数字と同じ span に入れる -->
          <span class="score"
            >{{ formatScore(props.candidate.modifiers.adjustedUnitScore)
            }}<span class="fn">※1</span></span
          >
          <!-- 総合力・スコアボーナスの表の開閉（既定は畳む — 2026-09-10 ユーザー指示） -->
          <button
            type="button"
            class="detail-toggle"
            :aria-expanded="detailOpen"
            aria-controls="unit-detail-tables"
            @click="detailOpen = !detailOpen"
          >
            <span>詳細</span>
            <span aria-hidden="true">{{ detailOpen ? "▲" : "▼" }}</span>
          </button>
          <!-- 行の反対の端（お気に入りの星を置く場所。詳細シートだけが使う — 2026-09-09 ユーザー指定） -->
          <span class="score-end"><slot name="score-end" /></span>
        </p>
      </section>

      <!--
        総合力とスコアボーナスは「詳細」で畳む。開いたときはユニットスコアのすぐ下に出す
        （2026-09-10 ユーザー指示）
      -->
      <div v-show="detailOpen" id="unit-detail-tables" class="detail-area">
        <section class="block">
          <h4>総合力<span class="fn">※2</span></h4>
          <!-- 見出しの値が総合力そのもの。表は内訳だけを持ち、同じ値の合計行は置かない(2026-09-09 ユーザー指示) -->
          <p class="score-line">
            <span class="sub-score">{{ formatScore(power.totalPower) }}</span>
          </p>
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
                  {{ formatScore(power.costumeEffect) }}
                </td>
              </tr>
              <tr>
                <th scope="row">ホロメンボード効果</th>
                <td class="num" :class="{ dim: power.boardEffect === 0 }">
                  {{ formatScore(power.boardEffect) }}
                </td>
              </tr>
              <tr>
                <th scope="row">パッシブスキル</th>
                <td class="num" :class="{ dim: power.passiveEffect === 0 }">
                  {{ formatScore(power.passiveEffect) }}
                </td>
              </tr>
              <tr>
                <th scope="row">メモリー効果</th>
                <td class="num" :class="{ dim: power.memoryEffect === 0 }">
                  {{ formatScore(power.memoryEffect) }}
                </td>
              </tr>
              <tr>
                <th scope="row">メンバー強化ボーナス</th>
                <td class="num" :class="{ dim: power.memberEnhancementEffect === 0 }">
                  {{ formatScore(power.memberEnhancementEffect) }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="block">
          <h4>スコアボーナス<span class="fn">※3</span></h4>
          <!-- 見出しの値が 4 項目の合計。総合力と同じ形で、表に同じ値の合計行は置かない -->
          <p class="score-line">
            <span class="sub-score">{{ formatPoint(display.total) }}</span>
          </p>
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
            </tbody>
          </table>
        </section>
      </div>

      <!--
        リーダー（パネル）とメンバー 5 人（仮想ガチャの結果タイルと同じ形の横並び）。
        「リーダー」「メンバー」という見出しは置かない（2026-09-10 ユーザー指示）
      -->
      <section class="block">
        <button
          type="button"
          class="unit-card"
          :class="`type-${props.leader.type}`"
          aria-haspopup="dialog"
          @click="emit('card', props.leader.id)"
        >
          <!--
            衣装スキルの効果文は出さず、リーダーであることは結果一覧と同じ右端の衣装アイコンで示す
            （2026-09-10 ユーザー指示）。発動していないときはアイコンをグレーアウトする
          -->
          <span class="unit-name">
            {{ holomenName(props.leader.holomenId) }}
            <span class="costume-icon" :class="{ inactive: !costumeActive }">
              <SkillIcon kind="costume" label="衣装スキル" />
            </span>
          </span>
          <span class="unit-card-name">{{ props.leader.name }}</span>
        </button>
      </section>

      <section class="block">
        <div class="member-grid" role="list">
          <button
            v-for="card in members"
            :key="card.id"
            type="button"
            class="member-tile"
            :class="`type-${card.type}`"
            role="listitem"
            aria-haspopup="dialog"
            @click="emit('card', card.id)"
          >
            <span class="member-name">{{ holomenName(card.holomenId) }}</span>
            <span class="member-card-name">{{ card.name }}</span>
            <span class="member-bloom">
              <SkillIcon
                kind="bloom"
                :count="bloomLevel(card.id)"
                :label="`開花${bloomLevel(card.id)}`"
              />
            </span>
          </button>
        </div>
      </section>

      <section class="block">
        <!-- メンバー別: 素の P/T/S(ボード前の本体値)と、そのメンバーの総合力(ゲームの各メンバー下の表示値に相当) -->
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

      <!--
        ライブ最適化（発動頻度の青マスを何個開けるか）の入口。上の内訳は編成画面の表示ユニットスコアの
        再現で、こちらは別モデル（アクティブスキル期待値）なので区分を分ける — ADR-007
      -->
      <section class="block">
        <button type="button" class="frequency-open" @click="emit('frequency')">
          発動頻度のおすすめ
        </button>
      </section>
    </div>

    <div class="footnotes">
      <p>
        <span class="fn-num">※1</span>
        <span
          >ユニットスコアは試算値で、実際のゲーム内の値と異なる場合があります。総合力 ×（1 +
          スコアボーナス）× 約
          2.037（実機のユニットスコアから逆算した係数）で求めます。曲を指定したときは黄ボードの楽曲スコアボーナス（登録した全ホロメン分の合計、上限
          10.0%）がスコアボーナスのホロメンボード効果に加わり（2026-09-11
          の実機観測に基づく）、イベントスコアボーナスはユニットスコアに掛けます（イベントの掛け方はゲーム内の式が未確認のため仮定）。</span
        >
      </p>
      <p v-if="detailOpen">
        <span class="fn-num">※2</span>
        <span
          >総合力はゲームのユニット編成画面の内訳と同じ 6 項目を別々に求めて加算します（2026-09-08
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
      <p v-if="detailOpen">
        <span class="fn-num">※3</span>
        <span
          >スコアボーナスはゲームのユニット編成画面の 4 項目を、曲を選ばない約 200
          秒の仮想タイムラインで試算します（仮定に基づくモデルで、実機とは数ポイントずれます。特にスペシャルスキルは式が未確定）。アクティブスキルは青ボードを含まない基準値、青ボードの発動率・発動頻度とリーダーの赤ボードの「全員のスコアサポート効果」による増分はホロメンボード効果に、パッシブ・衣装スキルのスコアサポート効果による増分はパッシブスキルに入れます。</span
        >
      </p>
    </div>
  </div>
</template>

<style scoped>
/* 区分（ユニットスコア・総合力・スコアボーナス・リーダー・メンバー）を 16px 空けて縦に積む */
.breakdown {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/*
 * 脚注より上（本文）は、脚注の区切り線が下端の固定エリア（PageNav）にちょうど掛かる高さを
 * 最低限確保する。本文が短い画面でも区切り線が画面の途中に浮かず、スクロールして初めて脚注が見える
 * （2026-09-10 ユーザー指示）。内訳: ヘッダ 77px + 下端の固定エリア 57px + 本文の上余白 16px
 * + 区分の間隔 16px（iPhone の下端の安全領域は固定エリアの padding に入っている）
 */
.breakdown-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: calc(100dvh - 166px - env(safe-area-inset-bottom));
}

@media (min-width: 48rem) {
  /* 広い画面のシートは 100dvh ではないので、自然な高さに戻す */
  .breakdown-main {
    min-height: 0;
  }
}

/* 別モデル（ライブ最適化）へ渡る全幅の secondary ボタン（OptimizerPanel の .secondary-button と同寸法） */
.frequency-open {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  padding: 0 16px;
  width: 100%;
}

.block h4 {
  font-size: 15px;
  margin: 0 0 8px;
}

/* 主数値の行。下の余白は持たせず、区分の 16px の間隔だけにする（2026-09-10 に少し上へ詰めた） */
.score-line {
  align-items: baseline;
  display: flex;
  gap: 8px;
  margin: 0;
}

/*
 * 総合力・スコアボーナスの開閉（さがすステップの「オプション ▼」と同じ形の、行内に置く小さい版）。
 * ベースラインに乗るので、数字の右下（もとの ※1 の位置）に出る（2026-09-10 ユーザー指示）
 */
.detail-toggle {
  align-items: center;
  background: none;
  border: none;
  color: var(--ink-2);
  cursor: pointer;
  display: flex;
  font-size: 12px;
  font-weight: 600;
  gap: 2px;
  padding: 4px 2px;
}

/* ユニットスコアとリーダーの間だけ少し詰める（発動頻度のおすすめを少し上へ — 2026-09-10 ユーザー指示） */
.score-block {
  margin-bottom: -8px;
}

/* 畳んでいるときは display:none になり、区分の間隔も生まない */
.detail-area {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 主数値の行の右端（お気に入りの星）。数値はベースライン揃えなので、こちらは行の中央に置く */
.score-end {
  align-self: center;
  display: flex;
  margin-left: auto;
}

.score {
  font-size: 28px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

/* 総合力・スコアボーナスの見出し値。主数値(ユニットスコア 28px)より一段小さく、両者は同寸法(2026-09-09 ユーザー指示) */
.sub-score {
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.param-table {
  border-collapse: collapse;
  font-size: 12px;
  width: 100%;
}

/* 前段から変化していない値は淡色にして、効いた列だけ目立たせる */
.param-table .dim {
  color: var(--ink-2);
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

/*
 * メンバー 5 人は仮想ガチャの結果タイルと同じ形（5 列・タイプ淡色の面・中央揃え・2 行クランプ）で横並びにする
 * （2026-09-10 ユーザー指示）。開花段階は計算の前提なので常に出す。
 * タイルはボタン（押すとカード詳細）— ブラウザの既定で中央寄せになる align-items を戻す
 */
.member-grid {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(5, 1fr);
}

.member-tile {
  align-items: stretch;
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font-size: inherit;
  gap: 2px;
  padding: 6px 4px;
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

.member-bloom {
  display: flex;
  justify-content: center;
  margin-top: 2px;
}

/* リーダーのカード表現は Step 2・3 の充填スロットと同じ: タイプ淡色の面。押すとカード詳細 */
.unit-card {
  border: none;
  border-radius: var(--r-m);
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
  margin: 0;
  min-height: 26px; /* 役割アイコン(正円)の有無で高さを揺らさない */
}

/* サブタイトルはホロメン名に隣接させる(一覧と同じ — 2026-09-05) */
.unit-card-name {
  color: var(--ink-2);
  display: block;
  font-size: 12px;
  line-height: 14px;
  margin: -1px 0 0;
}

/* 発動していないスキル(条件未達など)はアイコンをグレーアウトして示す */
.costume-icon.inactive {
  filter: grayscale(1);
  opacity: 0.45;
}

/* リーダーの行の右端（結果一覧のアイコン列と同じ位置） */
.costume-icon {
  align-items: center;
  display: flex;
  flex-shrink: 0;
}
</style>
