<script setup lang="ts">
import { computed, useId } from "vue";

import type { CandidateView } from "../composables/useOptimizer";
import { formatScore } from "../ui/labels";

/**
 * ユニットスコア（主数値）と、畳める総合力・スコアボーナスの内訳。
 * 結果詳細・ユニット詳細（`UnitBreakdown`）と発動頻度の最適化（`FrequencyPlanSheet`）で
 * 同じものを同じ形で出すための共通部品 — 同じ対象を見せる画面を別実装で似せない
 * （`.claude/rules/ui-parts.md`。2026-09-15 ユーザー指示で発動頻度のシートにも出した）。
 * 脚注の本文は `UnitScoreNotes` が持ち（置き場が末尾の脚注区分なので部品を分ける）、
 * 開閉の状態は親が両方へ渡す。
 */
const props = defineProps<{
  candidate: CandidateView;
  /** 脚注の番号の起点。ユニットスコア = noteBase、総合力 = +1、スコアボーナス = +2（既定は 1〜3） */
  noteBase?: number;
}>();

/** 総合力・スコアボーナスの表の開閉（既定は畳む — 2026-09-10 ユーザー指示）。開閉は保存しない */
const open = defineModel<boolean>("open", { default: false });

const note = computed(() => props.noteBase ?? 1);

/** 同じ部品が同時に複数出る（ページ送りの各順位・重ねたシート）ので、id は実体ごとに作る */
const tablesId = `unit-detail-tables-${useId()}`;

/** メニュー画面のスコアボーナス 5 項目とユニットスコアの試算(src/engine/displayScore.ts) */
const display = computed(() => props.candidate.display);

/** 総合力の内訳(ゲームのユニット編成画面と同じ 6 項目。src/engine/power.ts) */
const power = computed(() => props.candidate.breakdown);

/** スコアボーナスの項目(%)。ゲーム内表示と同じ小数 1 桁 */
function formatPoint(percent: number): string {
  return `${percent.toFixed(1)}%`;
}
</script>

<template>
  <div class="unit-score">
    <section class="block score-block">
      <!-- 見出しの値はユニットスコア(試算。曲を指定していれば黄はスコアボーナスのボード欄に入り、イベントは倍率で掛かる)。説明文は置かない(2026-09-08 ユーザー指示) -->
      <p class="score-line">
        <!-- ※n は数字の右上（上付き）。フレックスの子にすると vertical-align が効かないので数字と同じ span に入れる -->
        <span class="score"
          >{{ formatScore(props.candidate.modifiers.adjustedUnitScore)
          }}<span class="fn">※{{ note }}</span></span
        >
        <!-- 総合力・スコアボーナスの表の開閉（既定は畳む — 2026-09-10 ユーザー指示） -->
        <button
          type="button"
          class="detail-toggle"
          :aria-expanded="open"
          :aria-controls="tablesId"
          @click="open = !open"
        >
          <span>詳細</span>
          <span aria-hidden="true">{{ open ? "▲" : "▼" }}</span>
        </button>
        <!-- 行の反対の端（お気に入りの星を置く場所。詳細シートだけが使う — 2026-09-09 ユーザー指定） -->
        <span class="score-end"><slot name="score-end" /></span>
      </p>
    </section>

    <!--
      総合力とスコアボーナスは「詳細」で畳む。開いたときはユニットスコアのすぐ下に出す
      （2026-09-10 ユーザー指示）
    -->
    <div v-show="open" :id="tablesId" class="detail-area">
      <section class="block">
        <h4>
          総合力<span class="fn">※{{ note + 1 }}</span>
        </h4>
        <!-- 見出しの値が総合力そのもの。表は内訳だけを持ち、同じ値の合計行は置かない(2026-09-09 ユーザー指示) -->
        <p class="score-line">
          <span class="sub-score">{{ formatScore(power.totalPower) }}</span>
        </p>
        <!--
          ゲームのユニット編成画面の内訳と同じ 6 項目(2026-09-08 実機観測)を、この順で
          左から右・上から下へ 2 列に並べる(2026-09-14 ユーザー指示)。効いていない項目も
          0 として必ず出す(淡色にするだけで、欄そのものを省略しない)。
          2 列だと項目名と数値が横に並ばないので、項目名の下に数値を置く
        -->
        <dl class="param-grid">
          <div class="param-cell">
            <dt>メンバーパラメータ</dt>
            <dd class="num">{{ formatScore(power.memberParameters) }}</dd>
          </div>
          <div class="param-cell">
            <dt>衣装スキル</dt>
            <dd class="num" :class="{ dim: power.costumeEffect === 0 }">
              {{ formatScore(power.costumeEffect) }}
            </dd>
          </div>
          <div class="param-cell">
            <dt>ホロメンボード効果</dt>
            <dd class="num" :class="{ dim: power.boardEffect === 0 }">
              {{ formatScore(power.boardEffect) }}
            </dd>
          </div>
          <div class="param-cell">
            <dt>パッシブスキル</dt>
            <dd class="num" :class="{ dim: power.passiveEffect === 0 }">
              {{ formatScore(power.passiveEffect) }}
            </dd>
          </div>
          <div class="param-cell">
            <dt>メモリー効果</dt>
            <dd class="num" :class="{ dim: power.memoryEffect === 0 }">
              {{ formatScore(power.memoryEffect) }}
            </dd>
          </div>
          <div class="param-cell">
            <dt>メンバー強化ボーナス</dt>
            <dd class="num" :class="{ dim: power.memberEnhancementEffect === 0 }">
              {{ formatScore(power.memberEnhancementEffect) }}
            </dd>
          </div>
        </dl>
      </section>

      <section class="block">
        <h4>
          スコアボーナス<span class="fn">※{{ note + 2 }}</span>
        </h4>
        <!-- 見出しの値が 5 項目の合計。総合力と同じ形で、表に同じ値の合計行は置かない -->
        <p class="score-line">
          <span class="sub-score">{{ formatPoint(display.total) }}</span>
        </p>
        <!--
          ゲームのユニット編成画面のスコアボーナス 5 項目(仮定モデル。src/engine/displayScore.ts)を、
          総合力と同じく この順で 左から右・上から下へ 2 列に並べる(2026-09-14 ユーザー指示)。
          リーダー衣装にスコアサポートがないときの衣装スキルのように 0 になる欄も、
          ゲームの表示と違って省略せず 0 として出す(淡色にするだけ)
        -->
        <dl class="param-grid">
          <div class="param-cell">
            <dt>衣装スキル</dt>
            <dd class="num" :class="{ dim: display.costume === 0 }">
              {{ formatPoint(display.costume) }}
            </dd>
          </div>
          <div class="param-cell">
            <dt>アクティブスキル</dt>
            <dd class="num" :class="{ dim: display.active === 0 }">
              {{ formatPoint(display.active) }}
            </dd>
          </div>
          <div class="param-cell">
            <dt>ホロメンボード効果</dt>
            <dd class="num" :class="{ dim: display.board === 0 }">
              {{ formatPoint(display.board) }}
            </dd>
          </div>
          <div class="param-cell">
            <dt>パッシブスキル</dt>
            <dd class="num" :class="{ dim: display.passive === 0 }">
              {{ formatPoint(display.passive) }}
            </dd>
          </div>
          <div class="param-cell">
            <dt>スペシャルスキル</dt>
            <dd class="num" :class="{ dim: display.special === 0 }">
              {{ formatPoint(display.special) }}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  </div>
</template>

<style scoped>
/*
 * 主数値と（開いたときの）内訳。区分の間隔は置き場と同じ 16px。
 * 次の区分との間だけ少し詰める（2026-09-10 ユーザー指示で発動頻度の最適化を少し上へ）
 */
.unit-score {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.score-block {
  margin-bottom: -8px;
}

/* 畳んでいるときは display:none になり、区分の間隔も生まない */
.detail-area {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

/*
 * 総合力・スコアボーナスの内訳(2026-09-14 ユーザー指示で 1 列の表から 2 列へ)。
 * grid の流し込み順がそのまま 左→右・上→下 なので、テンプレートの並び順が表示順になる。
 * 2 列にすると項目名と数値が同じ行に収まらないので、項目名の下に数値を置く
 */
.param-grid {
  display: grid;
  font-size: 12px;
  grid-template-columns: 1fr 1fr;
  margin: 0;
}

.param-cell {
  border-bottom: 1px solid var(--line);
  padding: 6px 4px;
}

/* 項目名は折り返さずに縮める(「メンバー強化ボーナス」が最長) */
.param-cell dt {
  color: var(--ink-2);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.param-cell dd {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  margin: 2px 0 0;
}

/*
 * 最終行の下線は引かない。項目が奇数(スコアボーナスの 5 項目)のときに、最後の 1 つだけの行で
 * 左半分にだけ線が残るのを防ぐ(偶数のときは最後の 2 つ、奇数のときは最後の 1 つが対象)
 */
.param-cell:last-child,
.param-cell:nth-last-child(2):nth-child(odd) {
  border-bottom: none;
}

/* 効いていない項目(0)は淡色にする。欄そのものは省略しない */
.param-cell .dim {
  color: var(--ink-2);
}
</style>
