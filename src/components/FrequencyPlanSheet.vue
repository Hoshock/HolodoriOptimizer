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
import type { ConnectFactorMap } from "../data/connect";
import type { GreenBoardEffects } from "../data/greenBoard";
import { resolveCard } from "../data/resolve";
import type { Card } from "../data/types";
import type { BoardMap } from "../storage/boards";
import {
  buildFrequencyMembers,
  evaluateFrequencyPlan,
  optimizeFrequency,
} from "../engine/liveFrequencyOptimizer";
import type { FrequencyPlanMetrics } from "../engine/liveFrequencyOptimizer";
import { optimizeFrequencyUnitScore } from "../engine/frequencyUnitScore";
import type { AccountBonus } from "../engine/power";
import { frequencyTone } from "../ui/frequencyTone";
import type { FrequencyTone } from "../ui/frequencyTone";
import { holomenName } from "../ui/labels";

/**
 * 「発動頻度の青マスを誰に何個開けるか」のおすすめ（src/engine/liveFrequencyOptimizer.ts。ADR-007）。
 *
 * 結果詳細・ユニット詳細と同じ編成をそのまま使い、リーダー・メンバー・開花・ボードを再入力させない。
 * 見せるのは 3 つのおすすめ（期待値重視 / 理論値重視 / ユニットスコア重視）で、それぞれ「誰の発動頻度を
 * 何%にするか」を出す。表は メンバー / 発動頻度(現在) / 発動頻度(推奨) の 3 列で、案の見込み 3 つは
 * その下に横並び（2026-09-16 ユーザー指示。2026-09-15 の左右 2 列を置き換え）。
 * **「ユニットスコア重視」のときだけユニットスコアを出す** — 2026-09-15 に「複雑なので」いったん撤去した
 * 表示を、2026-09-16 のユーザー指示「ユニットスコア重視の 3 つ目も追加」で目的関数ごと入れ直した。
 * 撤去したときの教訓（土台の説明が要る）は脚注で果たす: 土台は**いま登録しているボード + この画面で選んだ曲**で、
 * 結果一覧のユニットスコア（さがしたときの条件の値）と一致しないことがある、と書く。
 * 用語の説明・試算の前提はすべて末尾の脚注に置く（2026-09-10 ユーザー指示で説明文・現在の設定・ほかの案・
 * マス数と追加解放数の列は削除した）。
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
  /**
   * 対象の編成が所持カードだけで組まれているか（「所持カードから探す」の結果・お気に入り）。
   * true のときだけ、案の発動頻度といまのボード状況の差を色で示す（src/ui/frequencyTone.ts）。
   * 全カードから探した結果は持っていないカードを含みうるので、登録しているボードが現状を表さない
   */
  owned?: boolean;
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

const result = computed(() => optimizeFrequency(frequencyMembers.value, horizonSeconds.value));

interface PlanRow {
  holomenId: string;
  name: string;
  /** いま登録しているボードでの発動頻度 */
  currentPercent: number;
  /** その案が勧める発動頻度 */
  planPercent: number;
  /**
   * 推奨につける状態（所持カードから探したときだけ。null = 色をつけない）。
   * 現在と推奨を比べる（2026-09-16 ユーザー指示。列が 2 つになっても色は残す）
   */
  tone: FrequencyTone | null;
}

function rowsOf(plan: { choice: readonly number[] }): PlanRow[] {
  return frequencyMembers.value.map((member, i) => {
    const planPercent = member.candidates[plan.choice[i] ?? 0]?.effectiveFrequencyPercent ?? 0;
    const currentPercent = member.candidates[member.currentIndex]?.effectiveFrequencyPercent ?? 0;
    return {
      holomenId: member.holomenId,
      name: holomenName(member.holomenId),
      currentPercent,
      planPercent,
      tone: props.owned === true ? frequencyTone(planPercent, currentPercent) : null,
    };
  });
}

const percent = (value: number): string => `${value.toFixed(2)}%`;
const ratio = (value: number): string => `${(value * 100).toFixed(2)}%`;
const seconds = (value: number): string => `${value.toFixed(1)} 秒`;

const same = (a: { choice: readonly number[] }, b: { choice: readonly number[] }): boolean =>
  a.choice.join(",") === b.choice.join(",");

/**
 * 見せるおすすめ。モードはセグメンテッドコントロールで切り替える（既定は期待値重視 — 2026-09-10 ユーザー指示）。
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
const mode = ref<ModeKey>("expected");

/** ユニットスコア重視の全探索（そのモードを選んだときだけ計算する — computed は遅延評価） */
const unitScoreResult = computed(() => {
  const leader = cardById.get(props.candidate.leaderId);
  const memberCards = props.candidate.memberIds
    .map((id) => cardById.get(id))
    .filter((c): c is Card => c !== undefined);
  if (!leader || memberCards.length !== frequencyMembers.value.length) return null;
  return optimizeFrequencyUnitScore({
    leader,
    memberCards,
    members: frequencyMembers.value,
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
 * 選んでいるモードのおすすめ。主数値は指標の 1 つ目に置き、見出しだけモードで変える
 * （ライブ側の 2 つは「スコアUP」に統一 — 2026-09-15 ユーザー指示。ユニットスコア重視だけ「ユニットスコア」）
 */
const shown = computed(() => {
  const r = result.value;
  const unit = mode.value === "unit" ? unitScoreResult.value : null;
  if (unit) {
    return {
      plan: unit.best,
      metrics: evaluateFrequencyPlan(
        frequencyMembers.value,
        unit.best.choice,
        horizonSeconds.value,
      ),
      label: "ユニットスコア",
      score: unit.best.unitScore.toLocaleString("ja-JP"),
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

/** いまのボード状況がどのモードでも最良か（＝これ以上開け閉めする必要がない） */
const currentIsBest = computed(() => {
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
          </section>

          <section class="block">
            <!--
              メンバーごとの発動頻度は **現在 / 推奨の 2 列**（2026-09-16 ユーザー指示）。
              推奨だけに色をつけ（※2）、現在は比較対象として淡色で置く。案の見込み（右半分だった
              「項目名の下に数値」）は表の下へ移し、3 つを等幅で横に並べる（同日ユーザー指示）
            -->
            <table class="param-table plan-table">
              <thead>
                <tr>
                  <th scope="col">メンバー</th>
                  <th scope="col" class="num">
                    発動頻度<br /><span class="sub-head">(現在)</span>
                  </th>
                  <th scope="col" class="num">
                    発動頻度<br /><span class="sub-head">(推奨)</span><span class="fn">※2</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rowsOf(shown.plan)" :key="row.holomenId">
                  <th scope="row">{{ row.name }}</th>
                  <td class="num dim">{{ formatBoardPercent(row.currentPercent) }}</td>
                  <!-- 色は所持カードから探したときだけ（※2）。それ以外は 0% を淡色にするだけ -->
                  <td class="num" :class="row.tone ?? { dim: row.planPercent === 0 }">
                    {{ formatBoardPercent(row.planPercent) }}
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
              >左の「(現在)」はいま登録しているボードでの発動頻度、右の「(推奨)」はその案が勧める値です。「所持カードから探す」で出した編成では、2
              つの差を推奨の色で示します:
              <b class="tone-met">緑</b
              >＝いまのボードでその発動頻度に達している（開けるマスなし）、<b class="tone-short"
                >青</b
              >＝いまが案より少ない（あと何マスか開ける）、<b class="tone-over">赤</b
              >＝いまが案より多い（案としては開けすぎ。マスは外せて素材も返ってきます）。全カードから探した編成では、持っていないカードが混ざりうる＝登録しているボードがその編成の現状を表さないので、色をつけません。</span
            >
          </p>
          <p>
            <span class="fn-num">※3</span>
            <span
              >「期待値重視」「理論値重視」の数字は、評価区間のあいだに得られる「アクティブスキルのスコア
              UP
              の時間平均（%）」の試算値です。「期待値重視」は各スキルの発動確率を考慮した期待値、「理論値重視」は発動抽選がすべて成功した前提での値で、それぞれを最大にする発動頻度の組み合わせを全通りから選んでいます（同時に発動したときは最も高いスコア
              UP
              だけが有効という前提）。「ユニットスコア重視」だけは別の計算で、ユニット編成画面のユニットスコア（試算）が最大になる組み合わせを選び、その試算値を出します
              —
              土台はいま登録しているボードとこの画面で選んでいる曲（黄の楽曲スコアボーナスと赤の歌唱者条件が入ります）なので、結果一覧のユニットスコア（さがしたときの条件で出した値）とは一致しないことがあります。この画面の中の案どうしの比較にだけ使ってください。
              表示ユニットスコアの発動頻度の効き方は未解明の配分を通る近似で、開けるほど上がるとも限りません（下がる開け方があります）
              — 数千点の差だけを理由にボードを振り直すのは勧めません。以下はライブ側 2
              つの前提です。実際のライブスコアではありません —
              譜面のノーツ・コンボ・判定・スペシャルスキルの発動位置・スコアサポートは含みません。発動頻度
              +f% は 周期 ÷（1 + f/100）、発動率 +r% は 発動確率 ×（1 + r/100、上限
              1）として反映する仮説モデルで、ユニット編成画面のスコアボーナスの試算とは別の計算です。ホロメンボードはマスの表記値の合計に、コネクトマスに入れた範囲と倍率の増幅を加えた実効値で試算します（いまの状態も、表に並ぶ候補もすべて同じ倍率で計算します）。リーダー枠のアクティブは発動しないものとして扱います。表の発動頻度は、いま登録しているボードから実際に到達できる状態（頻度のマスまでの経路も解放する前提）だけを候補にしています。</span
            >
          </p>
          <p>
            <span class="fn-num">※4</span>
            <span
              >期待カバレッジは、評価区間のうち「少なくとも 1
              つのアクティブスキルが発動している時間」の割合（期待値）です。スコア UP
              の大きさは見ないので、スキルが途切れにくいかの目安として添えています（おすすめの決定には使いません）。</span
            >
          </p>
          <p>
            <span class="fn-num">※5</span>
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

.param-cell {
  padding: 6px 4px;
}

.param-cell:nth-child(2) {
  text-align: center;
}

.param-cell:nth-child(3) {
  text-align: right;
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

/* 発動頻度の列見出しは「発動頻度」の下に (現在) / (推奨) を小さく置く */
.plan-table thead .sub-head {
  font-size: 10px;
  font-weight: 400;
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

.param-table .dim {
  color: var(--ink-2);
}

/* 案の発動頻度といまのボード状況の差（※2）。所持カードから探したときだけ付く */
.param-table .met,
.tone-met {
  color: var(--state-met);
}

.param-table .short,
.tone-short {
  color: var(--state-short);
}

.param-table .over,
.tone-over {
  color: var(--state-over);
}
</style>
