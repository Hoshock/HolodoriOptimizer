<script setup lang="ts">
import { computed, ref } from "vue";

import CloseButton from "./CloseButton.vue";
import FrequencyFixDialog from "./FrequencyFixDialog.vue";
import SongPicker from "./SongPicker.vue";
import SongRow from "./SongRow.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById, holomenById, medianSongDurationSeconds, songById } from "../data";
import type { BloomMap } from "../data/bloom";
import { formatBoardPercent } from "../data/boardGraph";
import type { ConnectFactorMap } from "../data/connect";
import type { GreenBoardEffects } from "../data/greenBoard";
import { resolveCard } from "../data/resolve";
import type { Card } from "../data/types";
import type { BoardMap } from "../storage/boards";
import {
  buildFrequencyMembers,
  evaluateFrequencyPlan,
  fixFrequencies,
  frequencyChoicesOf,
  optimizeFrequency,
} from "../engine/liveFrequencyOptimizer";
import type { FrequencyPlanMetrics } from "../engine/liveFrequencyOptimizer";
import { optimizeFrequencyUnitScore } from "../engine/frequencyUnitScore";
import type { AccountBonus } from "../engine/power";
import { holomenName } from "../ui/labels";

/**
 * 「発動頻度の青マスを誰に何個開けるか」のおすすめ（src/engine/liveFrequencyOptimizer.ts。ADR-007）。
 *
 * 結果詳細・ユニット詳細と同じ編成をそのまま使い、リーダー・メンバー・開花・ボードを再入力させない。
 * 見せるのは 3 つのおすすめ（期待値重視 / 理論値重視 / ユニットスコア重視）で、それぞれ「誰の発動頻度を
 * 何%にするか」を出す。表は メンバー / 発動頻度(現在) / 発動頻度(推奨) の 3 列で、案の見込み 3 つは
 * その下に横並び（2026-09-16 ユーザー指示。2026-09-15 の左右 2 列を置き換え）。
 * **主数値は 3 モードとも「スコアUP」の %** — ユニットスコア重視は案の選び方だけが表示側のモデルで、
 * ユニットスコアの値は出さない（2026-09-30 ユーザー指示「実際のユニットスコアとは違うっぽいので、値として出さない」。
 * 2026-09-16 に入れていた値の表示を外した）。
 * 用語の説明・試算の前提はすべて末尾の脚注に置く（2026-09-10 ユーザー指示で説明文・現在の設定・ほかの案・
 * マス数と追加解放数の列は削除した）。脚注には当然の前提（ボードを外すと素材が返る・同時発動は最大だけ有効など）や
 * 決定に使わない旨の注記を書かない（2026-09-30 ユーザー指示）。
 * ライブ側 2 つの値はユニット編成画面の表示ユニットスコアではなく、ライブ中のアクティブスキルの試算で、
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
  /** ホロメン ID → 色 → マス ID → コネクト倍率（src/data/connect.ts。省略で増幅なし） */
  connect?: ConnectFactorMap;
  /** 編成をさがしたときに指定していた曲。評価区間（試算する時間の長さ）の初期値になる */
  songId?: string | null;
  /** ホロメン ID → 黄ボードの解放マス（「ユニットスコア重視」で曲の楽曲スコアボーナスに使う） */
  yellowBoards?: BoardMap;
  /** ホロメン ID → 赤ボードの解放マス（同じく、リーダーのホロメンぶんが編成に効く） */
  redBoards?: BoardMap;
  /** メモリー・メンバー強化ボーナス（同じく総合力に加算する） */
  account?: AccountBonus;
}>();

const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

/** 対象のメンバー 5 人（開花段階まで解決したカード。青ボードは候補ごとに変えるので使わない） */
const members = computed(() =>
  props.candidate.memberIds
    .map((id) => cardById.get(id))
    .filter((c): c is Card => c !== undefined)
    .map((c) => resolveCard(c, props.blooms, props.boards, props.green, props.connect)),
);

/**
 * 評価区間に使う曲。既定は編成をさがしたときに指定していた曲で、ここで変えられる。
 * ライブ側の 2 モードでは評価区間の長さにだけ効き（脚注 ※1）、「ユニットスコア重視」では
 * 黄の楽曲スコアボーナスと赤の歌唱者条件にも効く（脚注 ※3）
 */
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
  buildFrequencyMembers(members.value, props.boards, holomenById, props.connect),
);

/**
 * メンバーごとに固定した発動頻度（実効 %。ホロメン ID → 値）。固定したメンバーはその頻度の候補だけで探索し直す
 * （2026-09-30 ユーザー指示「頻度を 0, 4, 8, 12 のいずれかで固定した再探索を許容する」）。
 * 選ぶだけでは探索し直さない — 表でつけた固定（draft）は下端の「一部固定で最適化」を押して初めて
 * 探索に使われる（applied。同日ユーザー指示）。「推奨頻度をリセット」は両方を空に戻す
 */
const draftFixed = ref<Record<string, number>>({});
const appliedFixed = ref<Record<string, number>>({});
const fixingHolomenId = ref<string | null>(null);

const sameFixed = (a: Record<string, number>, b: Record<string, number>): boolean => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};
/** 押す意味があるのは、表の固定が探索に使った固定と違うとき（固定を全部外して探索し直すのも含む） */
const canOptimize = computed(() => !sameFixed(draftFixed.value, appliedFixed.value));
/** 戻す先（固定なしの推奨）と違うのは、どちらかに固定が残っているとき */
const canReset = computed(
  () => Object.keys(draftFixed.value).length > 0 || Object.keys(appliedFixed.value).length > 0,
);
function optimizeWithFixed(): void {
  appliedFixed.value = { ...draftFixed.value };
}
function resetFixed(): void {
  draftFixed.value = {};
  appliedFixed.value = {};
}

/**
 * 探索・評価に使うメンバー。固定なしでは frequencyMembers そのもの。**固定すると候補が絞られて添字が
 * 変わる**ので、案（plan.choice）を表示に引くのはこちら。現在の値の表示だけは絞る前の frequencyMembers を使う
 */
const searchMembers = computed(() => fixFrequencies(frequencyMembers.value, appliedFixed.value));
const hasFixed = computed(() =>
  searchMembers.value.some((m, i) => m !== frequencyMembers.value[i]),
);

const fixingMember = computed(
  () => frequencyMembers.value.find((m) => m.holomenId === fixingHolomenId.value) ?? null,
);

function pickFixed(value: number | null): void {
  const id = fixingHolomenId.value;
  if (id === null) return;
  const next = { ...draftFixed.value };
  if (value === null) delete next[id];
  else next[id] = value;
  draftFixed.value = next;
  fixingHolomenId.value = null;
}

const result = computed(() => optimizeFrequency(searchMembers.value, horizonSeconds.value));

interface PlanRow {
  holomenId: string;
  name: string;
  /** 発動頻度を固定しているか（表の推奨の値を選択スタイルにする） */
  fixed: boolean;
  /** いま登録しているボードでの発動頻度 */
  currentPercent: number;
  /** その案が勧める発動頻度 */
  planPercent: number;
}

function rowsOf(plan: { choice: readonly number[] }): PlanRow[] {
  return frequencyMembers.value.map((member, i) => {
    // 案の添字は固定で絞ったあとの候補に対するもの（searchMembers）。現在の値は絞る前の候補で引く
    const fixedValue = draftFixed.value[member.holomenId];
    const planPercent =
      fixedValue ??
      searchMembers.value[i]?.candidates[plan.choice[i] ?? 0]?.effectiveFrequencyPercent ??
      0;
    const currentPercent = member.candidates[member.currentIndex]?.effectiveFrequencyPercent ?? 0;
    return {
      holomenId: member.holomenId,
      fixed: fixedValue !== undefined,
      name: holomenName(member.holomenId),
      currentPercent,
      planPercent,
    };
  });
}

const percent = (value: number): string => `${value.toFixed(2)}%`;
const ratio = (value: number): string => `${(value * 100).toFixed(2)}%`;
const seconds = (value: number): string => `${value.toFixed(1)} 秒`;

const same = (a: { choice: readonly number[] }, b: { choice: readonly number[] }): boolean =>
  a.choice.join(",") === b.choice.join(",");

/**
 * 見せるおすすめ。モードはセグメンテッドコントロールで切り替える（既定は**理論値重視** — 2026-09-16 ユーザー指示。
 * 2026-09-10 の「既定は期待値重視」を置き換えた）。
 * 3 つ目の「ユニットスコア重視」は**表示側のモデル**（src/engine/frequencyUnitScore.ts）で選ぶ別の目的関数
 * （2026-09-16 ユーザー指示）。ライブ側の 2 つとは土台が違うので、脚注でそう書く
 */
const MODES = [
  { key: "expected", label: "期待値重視" },
  // エンジン側の名前は perfect-score（理論最大）だが、画面では「理論値」と呼ぶ（2026-09-15 ユーザー指示）
  { key: "perfect", label: "理論値重視" },
  { key: "unit", label: "ユニットスコア重視" },
] as const;
type ModeKey = (typeof MODES)[number]["key"];
const mode = ref<ModeKey>("perfect");

/** ユニットスコア重視の全探索（そのモードを選んだときだけ計算する — computed は遅延評価） */
const unitScoreResult = computed(() => {
  const leader = cardById.get(props.candidate.leaderId);
  const memberCards = props.candidate.memberIds
    .map((id) => cardById.get(id))
    .filter((c): c is Card => c !== undefined);
  if (!leader || memberCards.length !== searchMembers.value.length) return null;
  return optimizeFrequencyUnitScore({
    leader,
    memberCards,
    members: searchMembers.value,
    holomenMap: holomenById,
    blooms: props.blooms,
    boards: props.boards,
    green: props.green,
    connect: props.connect,
    yellowBoards: props.yellowBoards,
    redBoards: props.redBoards,
    account: props.account ?? { memoryPercent: 0, enhancementPercent: 0 },
    song: song.value,
  });
});

/**
 * 選んでいるモードのおすすめ。主数値は 3 モードとも「スコアUP」（ライブ側の時間平均 %）で、
 * ユニットスコア重視も案の選び方だけが違う（2026-09-30 ユーザー指示「ユニットスコア重視のユニットスコアは
 * 実際のユニットスコアとは違うっぽいので、値として出さない。他のカラム同様スコアUPのパーセントを出す」）。
 * ユニットスコア重視の %は、選ばれた案を期待値の指標で評価した値（表示側は発動確率を通すモデルなので期待値に合わせる）
 */
const shown = computed(() => {
  const r = result.value;
  const unit = mode.value === "unit" ? unitScoreResult.value : null;
  if (unit) {
    const metrics = evaluateFrequencyPlan(
      searchMembers.value,
      unit.best.choice,
      horizonSeconds.value,
    );
    return {
      plan: unit.best,
      metrics,
      label: "スコアUP",
      score: percent(metrics.averageExpectedActiveScorePercent),
    };
  }
  const plan = mode.value === "perfect" ? r.perfect.best : r.expected.best;
  return {
    plan,
    metrics: plan.metrics as FrequencyPlanMetrics,
    label: "スコアUP",
    score: percent(
      mode.value === "perfect"
        ? plan.metrics.averagePerfectActivationScorePercent
        : plan.metrics.averageExpectedActiveScorePercent,
    ),
  };
});

/**
 * いまのボード状況がどのモードでも最良か（＝これ以上開け閉めする必要がない）。
 * 頻度を固定しているときは探索の範囲が違うので言わない
 */
const currentIsBest = computed(() => {
  if (hasFixed.value) return false;
  const r = result.value;
  const unit = unitScoreResult.value;
  return (
    same(r.current, r.expected.best) &&
    same(r.current, r.perfect.best) &&
    (unit === null || same(unit.current, unit.best))
  );
});
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="発動頻度の最適化">
      <header class="sheet-head">
        <h3>発動頻度の最適化</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <!--
          脚注より上の本文。脚注の区切り線が画面の下端にちょうど来る高さを最低限確保し、
          初期表示では長い脚注を出さない（スクロールして初めて見える — 2026-09-10 ユーザー指示）
        -->
        <div class="sheet-main">
          <section class="block">
            <h4>曲<span class="fn">※1</span></h4>
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
            <!-- 3 つのおすすめは排他なのでセグメンテッドコントロール（既定は理論値重視） -->
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
          </section>

          <section class="block">
            <!--
              メンバーごとの発動頻度は **現在 / 推奨の 2 列**（2026-09-16 ユーザー指示）。
              現在は比較対象として淡色で置く（色分けは 2026-09-16 に入れて同日ユーザー指示で戻した）。案の見込み（右半分だった
              「項目名の下に数値」）は表の下へ移し、3 つを等幅で横に並べる（同日ユーザー指示）。
              列見出しは「現在 / 推奨」だけにする — 何の値かはシートの題（発動頻度の最適化）が示すので
              「発動頻度」の語は置かない（同日ユーザー指示。列ごとに 2 行で書くと括弧の位置が食い違い、
              2 列にまたがる見出しにすると 2 段のバランスが悪い、の 2 案を経てここへ）
            -->
            <table class="param-table plan-table">
              <thead>
                <tr>
                  <th scope="col">メンバー</th>
                  <th scope="col" class="num">現在</th>
                  <th scope="col" class="num">推奨<span class="fn">※2</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rowsOf(shown.plan)" :key="row.holomenId">
                  <th scope="row">{{ row.name }}</th>
                  <td class="num dim">{{ formatBoardPercent(row.currentPercent) }}</td>
                  <td class="num">
                    <!-- 押すとそのメンバーの発動頻度を固定する選択が開く。未固定は枠だけ、固定中は選択スタイル -->
                    <button
                      type="button"
                      class="fix-btn"
                      :class="{ 'fix-active': row.fixed, dim: !row.fixed && row.planPercent === 0 }"
                      :aria-label="`${row.name}の発動頻度を固定`"
                      @click="fixingHolomenId = row.holomenId"
                    >
                      {{ formatBoardPercent(row.planPercent) }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <dl class="param-grid">
              <div class="param-cell">
                <dt>{{ shown.label }}<span class="fn">※3</span></dt>
                <dd class="num">{{ shown.score }}</dd>
              </div>
              <div class="param-cell">
                <dt>期待カバレッジ<span class="fn">※4</span></dt>
                <dd class="num">{{ ratio(shown.metrics.expectedCoverage) }}</dd>
              </div>
              <div class="param-cell">
                <dt>最大空白<span class="fn">※5</span></dt>
                <dd class="num">{{ seconds(shown.metrics.maximumGapSeconds) }}</dd>
              </div>
            </dl>
            <!-- 左 = 推奨頻度をリセット（固定を全部外す）、右 = 表で固定した頻度で探索し直す（2026-09-30 ユーザー指示。値の直下） -->
            <div class="fix-actions">
              <button
                type="button"
                class="foot-secondary"
                :disabled="!canReset"
                @click="resetFixed"
              >
                推奨頻度をリセット
              </button>
              <button
                type="button"
                class="foot-primary"
                :disabled="!canOptimize"
                @click="optimizeWithFixed"
              >
                一部固定で最適化
              </button>
            </div>
          </section>

          <p v-if="currentIsBest" class="hint">
            いまのボード状況がすでに最良です（追加で開けるマスはありません）。
          </p>
        </div>

        <div class="footnotes">
          <p>
            <span class="fn-num">※1</span>
            <span
              >指定した曲の演奏時間を評価区間（試算する時間の長さ）として使います（曲を指定しないときは全曲の演奏時間の中央値
              {{ medianSongDurationSeconds }}
              秒）。アクティブスキルは周期ごとに発動するので、区間の長さで結果が変わります。</span
            >
          </p>
          <p>
            <span class="fn-num">※2</span>
            <span
              >「現在」はいま登録しているボードでの発動頻度、「推奨」はその案が勧める値です。推奨が現在より多ければその差のマスを開け、少なければ外します。表に並ぶのは、いま登録しているボードから実際に到達できる状態（頻度のマスまでの経路も解放する前提）だけです。経路は追加するマスが最少のものだけを見ているので、遠回りして
              P/T/S のマスを多めに拾う開け方は探していません。</span
            >
          </p>
          <p>
            <span class="fn-num">※3</span>
            <span
              >数字は、評価区間のあいだに得られる「アクティブスキルのスコア UP
              の時間平均（%）」の試算値です。「期待値重視」は各スキルの発動確率を考慮した期待値、「理論値重視」は発動抽選がすべて成功した前提での値で、それぞれを最大にする発動頻度の組み合わせを全通りから選んでいます。「ユニットスコア重視」は、ユニット編成画面のユニットスコアが最大になる組み合わせを選び、数字は期待値で出します（土台はいま登録しているボードとこの画面で選んでいる曲です）。実際のライブスコアではありません
              —
              譜面のノーツ・コンボ・判定・スペシャルスキルの発動位置・スコアサポートは含みません。発動頻度
              +f% は 周期 ÷（1 + f/100）、発動率 +r% は 発動確率 ×（1 + r/100、上限
              1）として反映する仮説モデルで、ユニット編成画面のスコアボーナスの試算とは別の計算です。ホロメンボードはマスの表記値の合計に、コネクトマスに入れた範囲と倍率の増幅を加えた実効値で試算します（いまの状態も、表に並ぶ候補もすべて同じ倍率で計算します）。リーダー枠のアクティブは発動しないものとして扱います。</span
            >
          </p>
          <p>
            <span class="fn-num">※4</span>
            <span
              >期待カバレッジは、評価区間のうち「少なくとも 1
              つのアクティブスキルが発動している時間」の割合（期待値）です。スコア UP
              の大きさは見ないので、スキルが途切れにくいかの目安です。</span
            >
          </p>
          <p>
            <span class="fn-num">※5</span>
            <span
              >最大空白は、どのアクティブスキルも発動候補になっていない時間のうち最も長いものです（発動確率は見ません）。</span
            >
          </p>
        </div>
      </div>
    </div>

    <FrequencyFixDialog
      v-if="fixingMember"
      :name="holomenName(fixingMember.holomenId)"
      :choices="frequencyChoicesOf(fixingMember)"
      :value="draftFixed[fixingMember.holomenId] ?? null"
      @pick="pickFixed"
      @close="fixingHolomenId = null"
    />

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

/*
 * 本文と脚注は縮めない。`.body` は高さの決まった縦のフレックスなので、既定（flex-shrink: 1）のままだと
 * 中身の高さの合計が収まらないときに両方が縮み、はみ出した文字どうしが重なって描かれる
 * （広い画面 = `.sheet-main` の min-height が 0 になる側で起きていた）。縮めずに `.body` 側でスクロールさせる
 */
.sheet-main,
.footnotes {
  flex-shrink: 0;
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
/* 3 つのモードを等幅で 1 行に並べる（2026-09-16。2 つのときは 1fr 1fr だった） */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin-bottom: 8px;
  overflow: hidden;
}

/* 390px で「ユニットスコア重視」が 1 行に収まる字送り（3 等分の 1 枠 ≒ 119px） */
.seg {
  background: var(--surface);
  border: none;
  border-left: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  height: 40px;
  padding: 0 2px;
  white-space: nowrap;
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

/*
 * 見込みの指標は**表の下に 3 つ横並び**（2026-09-16 ユーザー指示。それまでの左右 2 列
 * = 表 + 1 列の内訳は、発動頻度が 現在 / 推奨 の 2 列になって幅が足りなくなった）。
 * 等幅 3 列で、真ん中を中央・右端を右に寄せて表の左右端と揃える（余白を対称にする）。
 * 「項目名の下に数値」の形そのものは結果詳細の内訳（UnitBreakdown の .param-grid）のまま
 */
.param-grid {
  display: grid;
  font-size: 12px;
  gap: 0 8px;
  grid-template-columns: repeat(3, 1fr);
  margin: 8px 0 0;
}

/* 3 つとも同じ揃え（左）にする。行の中で揃え方を混ぜない（2026-09-16 ユーザー指摘） */
.param-cell {
  border-bottom: 1px solid var(--line);
  padding: 6px 4px;
  text-align: left;
}

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

/* 3 列でもホロメン名が 1 行に入りきらないことがあるので、この表だけ行見出しの折り返しを許す */
.plan-table tbody th {
  white-space: normal;
  word-break: break-all;
}

/*
 * 脚注のマーク（`.fn` は上付き）は行の高さを押し上げるので、この表の見出しでは高さに数えない —
 * 「推奨※2」だけ行が高くなって「現在」と揃わない（2026-09-16 ユーザー指摘）
 */
.plan-table thead .fn {
  line-height: 0;
}

/* 数値の 2 列は同じ幅にして、メンバー名に残りを渡す */
.plan-table td.num,
.plan-table thead th.num {
  width: 27%;
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

/*
 * 推奨の値は押せる枠（固定の選択を開く）。未固定は枠線だけ、固定中は選択スタイル。
 * 行の高さは固定（24px）で、状態が変わっても表は動かない
 */
.fix-btn {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-variant-numeric: tabular-nums;
  height: 24px;
  padding: 0 8px;
  /* 値の桁数によらず枠の幅は同じにし、数字は右に揃える（2026-09-30 ユーザー指示） */
  text-align: right;
  width: 68px;
}

.fix-active {
  background: var(--selected);
  border-color: var(--selected);
  color: var(--selected-ink);
  font-weight: 700;
}

/* 値（スコアUP など）の直下の左右半分ずつの 2 ボタン */
.fix-actions {
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
  margin-top: 16px;
}

.fix-actions button {
  border-radius: var(--r-m);
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  height: 48px;
  padding: 0 8px;
  white-space: nowrap;
}

.fix-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.foot-secondary {
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink);
}

.foot-primary {
  background: var(--action);
  border: none;
  color: #fff;
}

.param-table .dim {
  color: var(--ink-2);
}
</style>
