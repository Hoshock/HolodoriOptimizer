<script setup lang="ts">
import { computed, ref } from "vue";

import CloseButton from "./CloseButton.vue";
import SongPicker from "./SongPicker.vue";
import SongRow from "./SongRow.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById, holomenById, medianSongDurationSeconds, songById } from "../data";
import type { BloomMap } from "../data/bloom";
import { formatBoardPercent } from "../data/boardGraph";
import type { GreenBoardEffects } from "../data/greenBoard";
import { resolveCard } from "../data/resolve";
import type { Card } from "../data/types";
import type { BoardMap } from "../storage/boards";
import { buildFrequencyMembers, optimizeFrequency } from "../engine/liveFrequencyOptimizer";
import type { FrequencyPlan } from "../engine/liveFrequencyOptimizer";
import { holomenName } from "../ui/labels";

/**
 * 「発動頻度の青マスを誰に何個開けるか」のおすすめ（src/engine/liveFrequencyOptimizer.ts。ADR-007）。
 *
 * 結果詳細・ユニット詳細と同じ編成をそのまま使い、リーダー・メンバー・開花・ボードを再入力させない。
 * 見せるのは 2 つのおすすめ（期待値重視 / 理論最大重視）だけで、それぞれ「誰の発動頻度を何%にするか」を出す。
 * 用語の説明・試算の前提はすべて末尾の脚注に置く（2026-09-10 ユーザー指示で説明文・現在の設定・ほかの案・
 * マス数と追加解放数の列は削除した）。
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
  /** 編成をさがしたときに指定していた曲。評価区間の初期値になる */
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

/** 評価区間に使う曲。既定は編成をさがしたときに指定していた曲で、ここで変えられる */
const songId = ref<string | null>(props.songId ?? null);
const song = computed(() => (songId.value ? (songById.get(songId.value) ?? null) : null));
const pickerOpen = ref(false);

/** 評価区間（秒）。曲の演奏時間。曲を指定していないときは全曲の中央値 */
const horizonSeconds = computed(() => {
  const duration = song.value?.durationSeconds ?? null;
  return duration !== null && duration > 0 ? duration : medianSongDurationSeconds;
});

/** 探索の入力（メンバーごとの合法な発動頻度の候補）。表示にも同じものを使う */
const frequencyMembers = computed(() =>
  buildFrequencyMembers(members.value, props.boards, holomenById),
);

const result = computed(() => optimizeFrequency(frequencyMembers.value, horizonSeconds.value));

interface PlanRow {
  holomenId: string;
  name: string;
  frequencyPercent: number;
}

function rowsOf(plan: FrequencyPlan): PlanRow[] {
  return frequencyMembers.value.map((member, i) => ({
    holomenId: member.holomenId,
    name: holomenName(member.holomenId),
    frequencyPercent: member.candidates[plan.choice[i] ?? 0]?.effectiveFrequencyPercent ?? 0,
  }));
}

const percent = (value: number): string => `${value.toFixed(2)}%`;
const ratio = (value: number): string => `${(value * 100).toFixed(2)}%`;
const seconds = (value: number): string => `${value.toFixed(1)} 秒`;

const same = (a: FrequencyPlan, b: FrequencyPlan): boolean =>
  a.choice.join(",") === b.choice.join(",");

/** 見せるおすすめ。2 つのモードはセグメンテッドコントロールで切り替える（既定は期待値重視 — 2026-09-10 ユーザー指示） */
const MODES = [
  { key: "expected", label: "期待値重視" },
  { key: "perfect", label: "理論最大重視" },
] as const;
type ModeKey = (typeof MODES)[number]["key"];
const mode = ref<ModeKey>("expected");

/** 選んでいるモードのおすすめ（主数値は「発動頻度」と紛れないよう、指標の表の 1 行目に置く） */
const shown = computed(() => {
  const r = result.value;
  const perfect = mode.value === "perfect";
  const plan = perfect ? r.perfect.best : r.expected.best;
  return {
    plan,
    scoreLabel: perfect ? "アクティブ理論最大" : "アクティブ期待値",
    score: percent(
      perfect
        ? plan.metrics.averagePerfectActivationScorePercent
        : plan.metrics.averageExpectedActiveScorePercent,
    ),
  };
});

/** いまのボード状況が両モードとも最良か（＝これ以上開ける必要がない） */
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
        <!--
          脚注より上の本文。脚注の区切り線が画面の下端にちょうど来る高さを最低限確保し、
          初期表示では長い脚注を出さない（スクロールして初めて見える — 2026-09-10 ユーザー指示）
        -->
        <div class="sheet-main">
          <section class="block">
            <h4>評価区間<span class="fn">※1</span></h4>
            <!-- 秒数の直接入力はやめ、曲ピッカーで選ぶ（2026-09-10 ユーザー指示）。部品はメイン画面の Step 3 と同じ -->
            <div class="song-slot">
              <SongRow
                :song="song"
                :clearable="song !== null"
                aria-label="評価区間に使う曲"
                @activate="pickerOpen = true"
              />
              <button
                v-if="song"
                type="button"
                class="slot-clear"
                aria-label="曲の選択を解除"
                @click="songId = null"
              >
                ✕
              </button>
            </div>
          </section>

          <section class="block">
            <!-- 2 つのおすすめは排他の 2 択なのでセグメンテッドコントロール（既定は期待値重視） -->
            <div class="segment" role="radiogroup" aria-label="おすすめの決め方（1つ選択）">
              <button
                v-for="m in MODES"
                :key="m.key"
                type="button"
                class="seg"
                role="radio"
                :aria-checked="mode === m.key"
                :class="{ 'seg-active': mode === m.key }"
                @click="mode = m.key"
              >
                {{ m.label }}
              </button>
            </div>
            <table class="param-table">
              <thead>
                <tr>
                  <th scope="col">メンバー</th>
                  <th scope="col" class="num">発動頻度</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rowsOf(shown.plan)" :key="row.holomenId">
                  <th scope="row">{{ row.name }}</th>
                  <td class="num" :class="{ dim: row.frequencyPercent === 0 }">
                    {{ formatBoardPercent(row.frequencyPercent) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <!--
            見込みの数値は発動頻度の表と続けて置くと「発動頻度」の列の続きに見えるので、
            区分と見出しを分ける（2026-09-10 ユーザー指摘）
          -->
          <section class="block">
            <h4>見込み</h4>
            <table class="param-table">
              <tbody>
                <tr>
                  <th scope="row">{{ shown.scoreLabel }}<span class="fn">※2</span></th>
                  <td class="num">{{ shown.score }}</td>
                </tr>
                <tr>
                  <th scope="row">期待カバレッジ<span class="fn">※3</span></th>
                  <td class="num">{{ ratio(shown.plan.metrics.expectedCoverage) }}</td>
                </tr>
                <tr>
                  <th scope="row">最大空白<span class="fn">※4</span></th>
                  <td class="num">{{ seconds(shown.plan.metrics.maximumGapSeconds) }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <p v-if="currentIsBest" class="hint">
            いまのボード状況がすでに最良です（追加で開けるマスはありません）。
          </p>
        </div>

        <div class="footnotes">
          <p>
            <span class="fn-num">※1</span>
            <span
              >評価区間は指定した曲の演奏時間です（曲を指定しないときは全曲の演奏時間の中央値
              {{ medianSongDurationSeconds }}
              秒）。アクティブスキルは周期ごとに発動するので、区間の長さで結果が変わります。</span
            >
          </p>
          <p>
            <span class="fn-num">※2</span>
            <span
              >数字は評価区間のあいだに得られる「アクティブスキルのスコア UP
              の時間平均（%）」の試算値です。「期待値重視」は各スキルの発動確率を考慮した期待値、「理論最大重視」は発動抽選がすべて成功した前提での値で、それぞれを最大にする発動頻度の組み合わせを全通りから選んでいます（同時に発動したときは最も高いスコア
              UP だけが有効という前提）。実際のライブスコアではありません —
              譜面のノーツ・コンボ・判定・スペシャルスキルの発動位置・スコアサポートは含みません。発動頻度
              +f% は 周期 ÷（1 + f/100）、発動率 +r% は 発動確率 ×（1 + r/100、上限
              1）として反映する仮説モデルで、ユニット編成画面のスコアボーナスの試算とは別の計算です。ホロメンボードはマスの表記値の合計で、コネクトマスによる増幅は含みません。リーダー枠のアクティブは発動しないものとして扱います。表の発動頻度は、いま登録しているボードから実際に到達できる状態（頻度のマスまでの経路も解放する前提）だけを候補にしています。</span
            >
          </p>
          <p>
            <span class="fn-num">※3</span>
            <span
              >期待カバレッジは、評価区間のうち「少なくとも 1
              つのアクティブスキルが発動している時間」の割合（期待値）です。スコア UP
              の大きさは見ないので、スキルが途切れにくいかの目安として添えています（おすすめの決定には使いません）。</span
            >
          </p>
          <p>
            <span class="fn-num">※4</span>
            <span
              >最大空白は、どのアクティブスキルも発動候補になっていない時間のうち最も長いものです（発動確率は見ません）。こちらも目安で、おすすめの決定には使いません。</span
            >
          </p>
        </div>
      </div>
    </div>

    <!-- 評価区間の曲を選ぶピッカー（このシートの上に重ねる。z-index はこのオーバーレイの中で解決される） -->
    <SongPicker
      v-if="pickerOpen"
      :selected-id="songId"
      @pick="
        songId = $event;
        pickerOpen = false;
      "
      @close="pickerOpen = false"
    />
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

/*
 * 本文（脚注より上）の最低の高さ。ヘッダ 77px + 本文の上余白 16px + 区分の間隔 16px を viewport から引くと、
 * 脚注の区切り線がちょうど画面の下端に来る（このシートには下端の固定エリアがない）
 */
.sheet-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: calc(100dvh - 109px);
}

@media (min-width: 48rem) {
  /* 広い画面のシートは 100dvh ではないので、自然な高さに戻す */
  .sheet-main {
    min-height: 0;
  }
}

.hint {
  color: var(--ink-2);
  font-size: 13px;
  margin: 0;
}

.block h4 {
  font-size: 15px;
  margin: 0 0 8px;
}

/* 2 択の切り替え（ピッカーのセグメンテッドコントロールと同形） */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-bottom: 8px;
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

/* 曲の行（メイン画面の Step 3 と同形。選択中は右上に解除ボタンを重ねる） */
.song-slot {
  position: relative;
  width: 100%;
}

.slot-clear {
  align-items: center;
  background: var(--selected);
  border: 2px solid var(--surface);
  border-radius: 50%;
  color: var(--selected-ink);
  cursor: pointer;
  display: flex;
  font-size: 11px;
  height: 28px;
  justify-content: center;
  position: absolute;
  right: 8px;
  top: 8px;
  width: 28px;
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
