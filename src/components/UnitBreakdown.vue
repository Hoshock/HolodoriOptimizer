<script setup lang="ts">
import { computed, ref } from "vue";

import SkillIcon from "./SkillIcon.vue";
import UnitScoreBlock from "./UnitScoreBlock.vue";
import UnitScoreNotes from "./UnitScoreNotes.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { cardById } from "../data";
import { bloomOf } from "../data/bloom";
import type { BloomMap } from "../data/bloom";
import type { ConnectFactorMap } from "../data/connect";
import type { GreenBoardEffects } from "../data/greenBoard";
import { resolveCard } from "../data/resolve";
import type { Card } from "../data/types";
import type { BoardMap } from "../storage/boards";
import { formatScore, holomenName } from "../ui/labels";

/**
 * 1 編成ぶんの内訳表示（モーダルの中身だけを持ち、ヘッダ・閉じるボタンは持たない）。
 * 結果の詳細（ResultDetail）とお気に入りユニットの詳細（UnitSheet）で同じ中身を出すための共通部品 —
 * 同じ対象を見せる画面を別実装で似せない（.claude/rules/ui-parts.md）。
 * 並びはユニットスコア（＋「詳細」で開く総合力・スコアボーナス。`UnitScoreBlock`）→ リーダー（パネル）→
 * メンバー 5 人（横並びのタイル）→ メンバー別の表 → 「発動頻度の最適化」→ 脚注
 * （2026-09-10 ユーザー指示。「リーダー」「メンバー」の見出しは置かない）
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
  /** ホロメン ID → 色 → マス ID → コネクト倍率（src/data/connect.ts。省略で増幅なし） */
  connect?: ConnectFactorMap;
  /**
   * 「検索画面に入力」（この編成をメイン画面のリーダー・メンバー欄へ入れる）を右半分に出す。お気に入りだけ true
   * （2026-09-12 ユーザー指示。結果詳細はその編成が探索結果そのものなので置かない）
   */
  loadable?: boolean;
}>();

const emit = defineEmits<{
  /** 「発動頻度の最適化」を開く（ライブ最適化。表示ユニットスコアとは別モデル — ADR-007） */
  frequency: [];
  /** 「検索画面に入力」— この編成をメイン画面のリーダー・メンバー欄へ入れる（さがすのオプションは触らない） */
  load: [];
  /** リーダー・メンバーのタイルを押した（カード詳細を開く。2026-09-10 ユーザー指示） */
  card: [cardId: string];
}>();

/** メンバー（スキル文言を表示に使う開花段階に解決したカード） */
const members = computed(() =>
  props.candidate.memberIds
    .map((id) => cardById.get(id))
    .filter((c): c is Card => c !== undefined)
    .map((c) => resolveCard(c, props.blooms, props.boards, props.green, props.connect)),
);

function bloomLevel(cardId: string): number {
  return bloomOf(props.blooms, cardId);
}

const costumeActive = computed(
  () =>
    props.leader.costumeSkill.structured !== null && props.candidate.breakdown.costumeSkillActive,
);

/**
 * 総合力・スコアボーナスの表は既定で畳む（2026-09-10 ユーザー指示）。開閉は保存しない。
 * 主数値と内訳は `UnitScoreBlock`、脚注の本文は `UnitScoreNotes` が持つので、状態はここで持って両方へ渡す
 */
const detailOpen = ref(false);

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
      <!-- ユニットスコアと、畳める総合力・スコアボーナス（発動頻度の最適化のシートと同じ部品） -->
      <UnitScoreBlock v-model:open="detailOpen" :candidate="props.candidate">
        <template #score-end><slot name="score-end" /></template>
      </UnitScoreBlock>

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
      <section class="block action-row" :class="{ pair: props.loadable }">
        <button type="button" class="frequency-open" @click="emit('frequency')">
          発動頻度の最適化
        </button>
        <button v-if="props.loadable" type="button" class="frequency-open" @click="emit('load')">
          検索画面に入力
        </button>
      </section>
    </div>

    <div class="footnotes">
      <UnitScoreNotes :open="detailOpen" />
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

/* お気に入りでは「発動頻度の最適化 / 検索画面に入力」の 2 つを左右半分ずつ（同じ secondary の器） */
.action-row.pair {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr 1fr;
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
