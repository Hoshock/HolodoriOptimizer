<script setup lang="ts">
import { computed, ref } from "vue";

import CloseButton from "./CloseButton.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById, holomenById, medianSongDurationSeconds, songById } from "../data";
import type { BloomMap } from "../data/bloom";
import { formatBoardPercent } from "../data/boardGraph";
import type { GreenBoardEffects } from "../data/greenBoard";
import { resolveCard } from "../data/resolve";
import type { Card } from "../data/types";
import type { BoardMap } from "../storage/boards";
import {
  buildFrequencyMembers,
  FREQUENCY_RECOMMEND_POLICY,
  optimizeFrequency,
} from "../engine/liveFrequencyOptimizer";
import type { FrequencyPlan } from "../engine/liveFrequencyOptimizer";
import { holomenName } from "../ui/labels";

/**
 * 「発動頻度の青マスを誰に何個開けるか」のおすすめ（src/engine/liveFrequencyOptimizer.ts。ADR-007）。
 *
 * 結果詳細・ユニット詳細と同じ編成をそのまま使い、リーダー・メンバー・開花・ボードを再入力させない。
 * 主指標は 2 つだけ（期待値重視 / 理論最大重視）。カバレッジ・空白は補助として脇に置く。
 * ここに出る値はユニット編成画面の表示ユニットスコアではなく、ライブ中のアクティブスキルの試算で、
 * ライブスコアそのものでもない（ADR-006 のとおり実ライブスコアのエンジンは未実装）。
 */
const props = defineProps<{
  /** 対象の編成（結果の 1 件、またはお気に入りユニット） */
  candidate: CandidateView;
  /** カード ID → 開花段階 */
  blooms?: BloomMap;
  /** ホロメン ID → 青ボードの解放マス（いま登録している状態。ここからの追加解放を提案する） */
  boards?: BoardMap;
  /** 緑ボード（アカウント全体の合計） */
  green?: GreenBoardEffects | null;
  /** 曲を指定していれば、その曲の演奏時間を評価区間に使う */
  songId?: string | null;
}>();

const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

/** 対象のメンバー 5 人（開花段階まで解決したカード。青ボードは候補ごとに変えるので使わない） */
const members = computed(() =>
  props.candidate.memberIds
    .map((id) => cardById.get(id))
    .filter((c): c is Card => c !== undefined)
    .map((c) => resolveCard(c, props.blooms, props.boards, props.green)),
);

const song = computed(() => (props.songId ? (songById.get(props.songId) ?? null) : null));

/** 曲を指定していないときの評価区間（秒）。既定は全曲の演奏時間の中央値（データ由来） */
const manualSeconds = ref<number>(medianSongDurationSeconds);

/** 評価区間（秒）。曲を指定していればその演奏時間 */
const horizonSeconds = computed(() => {
  const fromSong = song.value?.durationSeconds ?? null;
  if (fromSong !== null && fromSong > 0) return fromSong;
  const value = manualSeconds.value;
  if (!Number.isFinite(value) || value < 10) return medianSongDurationSeconds;
  return Math.min(600, Math.round(value));
});

/** 探索の入力（メンバーごとの合法な発動頻度の候補）。表示にも同じものを使う */
const frequencyMembers = computed(() =>
  buildFrequencyMembers(members.value, props.boards, holomenById),
);

const result = computed(() => optimizeFrequency(frequencyMembers.value, horizonSeconds.value));

interface PlanRow {
  holomenId: string;
  name: string;
  nodeCount: number;
  frequencyPercent: number;
  additionalNodeCount: number;
}

function rowsOf(plan: FrequencyPlan): PlanRow[] {
  return frequencyMembers.value.map((member, i) => {
    const candidate = member.candidates[plan.choice[i] ?? 0];
    return {
      holomenId: member.holomenId,
      name: holomenName(member.holomenId),
      nodeCount: candidate?.frequencyNodeCount ?? 0,
      frequencyPercent: candidate?.effectiveFrequencyPercent ?? 0,
      additionalNodeCount: candidate?.additionalNodeCount ?? 0,
    };
  });
}

const percent = (value: number): string => `${value.toFixed(2)}%`;
const ratio = (value: number): string => `${(value * 100).toFixed(2)}%`;
const seconds = (value: number): string => `${value.toFixed(1)} 秒`;
const point = (value: number): string =>
  `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)} pt`;

const same = (a: FrequencyPlan, b: FrequencyPlan): boolean =>
  a.choice.join(",") === b.choice.join(",");

interface PlanBlock {
  key: string;
  title: string;
  /** 主数値（そのモードの目的関数） */
  main: string;
  /** 主数値の下に出す、現在の設定との差 */
  diff: string | null;
  plan: FrequencyPlan;
  /** 補助指標の行 */
  aux: { label: string; value: string; dim?: boolean }[];
  /** 省素材案（そのモードの最良と違うときだけ） */
  saving: { nodes: string; additional: number; diff: string } | null;
}

/**
 * 見せる案。主指標は 2 モードだけで、両モードのおすすめが同じなら 1 つにまとめる。
 * 補助指標（期待カバレッジ・最大空白）は各案の下に小さく置く。
 */
const blocks = computed<PlanBlock[]>(() => {
  const r = result.value;
  const modes = same(r.expected.best, r.perfect.best)
    ? [{ key: "both", title: "おすすめ（期待値重視・理論最大重視とも同じ）", side: r.expected }]
    : [
        { key: "expected", title: "期待値重視", side: r.expected },
        { key: "perfect", title: "理論最大重視", side: r.perfect },
      ];
  const list = modes.map(({ key, title, side }) => {
    const isPerfect = key === "perfect";
    const plan = side.best;
    const main = isPerfect
      ? percent(plan.metrics.averagePerfectActivationScorePercent)
      : percent(plan.metrics.averageExpectedActiveScorePercent);
    const currentMain = isPerfect
      ? r.current.metrics.averagePerfectActivationScorePercent
      : r.current.metrics.averageExpectedActiveScorePercent;
    const planMain = isPerfect
      ? plan.metrics.averagePerfectActivationScorePercent
      : plan.metrics.averageExpectedActiveScorePercent;
    const savingPlan = side.saving;
    return {
      key,
      title,
      main,
      diff: same(plan, r.current) ? null : `現在から ${point(planMain - currentMain)}`,
      plan,
      aux: [
        {
          label: isPerfect ? "アクティブ期待値" : "理論最大",
          value: isPerfect
            ? percent(plan.metrics.averageExpectedActiveScorePercent)
            : percent(plan.metrics.averagePerfectActivationScorePercent),
        },
        { label: "期待カバレッジ", value: ratio(plan.metrics.expectedCoverage) },
        { label: "最大空白", value: seconds(plan.metrics.maximumGapSeconds) },
        {
          label: "追加で解放するマス",
          value: String(plan.additionalNodeCount),
          dim: plan.additionalNodeCount === 0,
        },
      ],
      saving: same(savingPlan, plan)
        ? null
        : {
            nodes: rowsOf(savingPlan)
              .map((row) => row.nodeCount)
              .join(" / "),
            additional: savingPlan.additionalNodeCount,
            diff: point(
              (isPerfect
                ? savingPlan.metrics.averagePerfectActivationScorePercent
                : savingPlan.metrics.averageExpectedActiveScorePercent) - planMain,
            ),
          },
    };
  });
  // 現在の設定（おすすめと同じなら出さない）
  if (!list.some((block) => same(block.plan, r.current))) {
    list.push({
      key: "current",
      title: "現在の設定",
      main: percent(r.current.metrics.averageExpectedActiveScorePercent),
      diff: null,
      plan: r.current,
      aux: [
        {
          label: "理論最大",
          value: percent(r.current.metrics.averagePerfectActivationScorePercent),
        },
        { label: "期待カバレッジ", value: ratio(r.current.metrics.expectedCoverage) },
        { label: "最大空白", value: seconds(r.current.metrics.maximumGapSeconds) },
      ],
      saving: null,
    });
  }
  return list;
});

/** いまの設定が両モードとも最良か */
const currentIsBest = computed(
  () =>
    same(result.value.current, result.value.expected.best) &&
    same(result.value.current, result.value.perfect.best),
);
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="発動頻度のおすすめ">
      <header class="sheet-head">
        <h3>発動頻度のおすすめ</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <p class="lead">
          いま登録しているホロメンボードから、青ボードの「アクティブスキル発動頻度」のマスを誰に何個開けるとよいかを全通り比べます。平均的に高いスコアを狙う「期待値重視<span
            class="fn"
            >※1</span
          >」と、発動抽選がすべて成功した上振れで高いスコアを狙う「理論最大重視<span class="fn"
            >※2</span
          >」の 2
          つで出します（どちらも試算値）。編成・開花・ボードはこの編成のものをそのまま使います。
        </p>

        <section class="block">
          <h4>評価区間</h4>
          <p v-if="song" class="value-line">{{ song.title }}（{{ horizonSeconds }} 秒）</p>
          <label v-else class="field">
            <span class="field-label">評価区間</span>
            <span class="field-input">
              <input
                v-model.number="manualSeconds"
                type="number"
                inputmode="numeric"
                min="10"
                max="600"
                step="1"
                aria-label="評価区間（秒）"
              />
              <span class="field-unit">秒</span>
            </span>
          </label>
          <p class="hint">
            結果は評価区間の長さで変わります。曲を指定するとその曲の演奏時間になります（指定しないときは全曲の中央値
            {{ medianSongDurationSeconds }} 秒）。
          </p>
        </section>

        <section v-for="block in blocks" :key="block.key" class="block">
          <h4>{{ block.title }}</h4>
          <p class="score-line">
            <span class="sub-score">{{ block.main }}</span>
            <span v-if="block.diff" class="diff">{{ block.diff }}</span>
          </p>
          <table class="param-table">
            <thead>
              <tr>
                <th scope="col">メンバー</th>
                <th scope="col" class="num">マス</th>
                <th scope="col" class="num">実効</th>
                <th scope="col" class="num">追加</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rowsOf(block.plan)" :key="row.holomenId">
                <th scope="row">{{ row.name }}</th>
                <td class="num" :class="{ dim: row.nodeCount === 0 }">{{ row.nodeCount }}</td>
                <td class="num" :class="{ dim: row.frequencyPercent === 0 }">
                  {{ formatBoardPercent(row.frequencyPercent) }}
                </td>
                <td class="num" :class="{ dim: row.additionalNodeCount === 0 }">
                  {{ row.additionalNodeCount }}
                </td>
              </tr>
            </tbody>
          </table>
          <table class="param-table">
            <tbody>
              <tr v-for="row in block.aux" :key="row.label">
                <th scope="row">{{ row.label }}</th>
                <td class="num" :class="{ dim: row.dim }">{{ row.value }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="block.saving" class="hint">
            省素材案<span class="fn">※3</span>: マス {{ block.saving.nodes }}（追加
            {{ block.saving.additional }} マス・{{ block.saving.diff }}）
          </p>
        </section>

        <p v-if="currentIsBest" class="hint">
          いまのボード状況で、この編成のアクティブスキルはすでに最良です。
        </p>

        <section class="block">
          <h4>ほかの案（期待値重視）</h4>
          <table class="param-table">
            <thead>
              <tr>
                <th scope="col">マス（メンバー順）</th>
                <th scope="col" class="num">期待値</th>
                <th scope="col" class="num">追加</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(plan, i) in result.expected.ranking"
                :key="plan.choice.join(',') + String(i)"
              >
                <th scope="row">
                  {{
                    rowsOf(plan)
                      .map((row) => row.nodeCount)
                      .join(" / ")
                  }}
                </th>
                <td class="num">
                  {{ percent(plan.metrics.averageExpectedActiveScorePercent) }}
                </td>
                <td class="num">{{ plan.additionalNodeCount }}</td>
              </tr>
            </tbody>
          </table>
          <p class="hint">{{ result.evaluated }} 通りを全部評価しています。</p>
        </section>

        <div class="footnotes">
          <p>
            <span class="fn-num">※1</span>
            <span
              >期待値重視は、各アクティブスキルの発動確率を考慮した期待値を評価区間で時間平均した値（アクティブ期待値）が最大になる設定です。各メンバーのアクティブは
              k × 周期 から効果時間ぶん発動候補になるとし、同時に発動した中で最も高いスコア UP
              だけが有効という前提で計算します。発動頻度 +f% は 周期 ÷（1 + f/100）、発動率 +r% は
              発動確率 ×（1 + r/100、上限
              1）として反映します（どちらも仮説。ユニット編成画面のスコアボーナスの試算とは別のモデルで、そちらの未解明な近似は使っていません）。ホロメンボードはマスの表記値の合計で、コネクトマスによる増幅は含みません。リーダー枠のアクティブは発動しないものとして扱います。この値はライブスコアそのものではありません（譜面のノーツ・コンボ・判定・スペシャルスキルの発動位置・スコアサポートは含みません）。</span
            >
          </p>
          <p>
            <span class="fn-num">※2</span>
            <span
              >理論最大重視は、発動抽選がすべて成功した前提で、各時点に有効になる最大のスコア UP
              を時間平均した値が最大になる設定です。発動確率を無視するぶん上振れの目安になります（候補のある時間の割合＝カバレッジではなく、スコア
              UP の大きさで比べています）。期待カバレッジ（少なくとも 1
              つが発動している時間の期待割合）と最大空白（発動候補が 1
              つもない時間の最長）は補助の目安で、おすすめの決定には主指標が同値のときだけ使います。</span
            >
          </p>
          <p>
            <span class="fn-num">※3</span>
            <span
              >省素材案は「その指標の最高値との差が
              {{ FREQUENCY_RECOMMEND_POLICY.nearOptimalTolerancePoint }}
              ポイント以内の案のうち、追加で解放するマスが最も少ないもの」です。これはゲームの仕様ではなく、このツールの推薦の方針です。マスは初期地点からつながっている必要があるので、追加数には頻度マスまでの経路も含みます（経路上の発動率のマスも一緒に開くものとして計算しています）。</span
            >
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 結果詳細（ResultDetail）と同じシート。結果詳細の上に重ねるので z-index を 1 段上げる */
.overlay {
  background: rgba(35, 48, 61, 0.4);
  inset: 0;
  position: fixed;
  z-index: 12;
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

.hint {
  color: var(--ink-2);
  font-size: 13px;
  margin: 8px 0 0;
}

.lead {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.7;
  margin: 0;
}

.block h4 {
  font-size: 15px;
  margin: 0 0 8px;
}

/* 区分の主数値（結果詳細の総合力・スコアボーナスと同寸法） */
.score-line {
  align-items: baseline;
  display: flex;
  gap: 8px;
  margin: 0 0 8px;
}

.sub-score {
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.diff {
  color: var(--ink-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.value-line {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
}

/* 数値を入れる設定行（Step 0 のメモリー・強化ボーナスと同形） */
.field {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-bottom: 8px;
}

.field-label {
  color: var(--ink);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.field-input {
  align-items: center;
  display: flex;
  gap: 2px;
}

.field-input input {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink);
  font-size: 16px; /* iOS の自動ズーム防止のため 16px 未満にしない */
  font-variant-numeric: tabular-nums;
  height: 36px;
  padding: 0 8px;
  text-align: right;
  width: 84px;
}

.field-unit {
  color: var(--ink-2);
  font-size: 12px;
}

.param-table {
  border-collapse: collapse;
  font-size: 12px;
  width: 100%;
}

.param-table + .param-table {
  margin-top: 8px;
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
  white-space: nowrap;
}

.param-table tbody th {
  white-space: nowrap;
}

.param-table .num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.param-table .dim {
  color: var(--ink-2);
}
</style>
