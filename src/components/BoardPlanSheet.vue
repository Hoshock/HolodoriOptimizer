<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";

import CloseButton from "./CloseButton.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import SongPicker from "./SongPicker.vue";
import SongRow from "./SongRow.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { useBoardPlan } from "../composables/useBoardPlan";
import { useModalChrome } from "../composables/useModalChrome";
import { songById } from "../data";
import type { BloomMap } from "../data/bloom";
import { boardPointsForRank } from "../data/boardPoints";
import {
  BOARD_STATE_COLORS,
  spentBoardPoints,
  totalUnlockedCells,
  unlockSetOf,
} from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import type { BoardConnectMap } from "../storage/boardConnects";
import type { BoardColor, BoardMap } from "../storage/boards";
import type { ConnectPlacementMap } from "../storage/connect";
import type { HolomenRankMap } from "../storage/holomenRank";
import type { BoardScope } from "../engine/boardOptimize";
import type { BoardPlanResult } from "../engine/boardPlan";
import type { AccountBonus } from "../engine/power";
import type { OptimizeRunRequest } from "../engine/request";
import { holomenName } from "../ui/labels";

/**
 * 「ホロメンボードの最適化」(結果詳細・ユニット詳細の下端。2026-10-04 ユーザー指示)。
 * **この編成のまま**、ホロメンごとのボードPt の予算(ホロメンランク。未登録は制限なし)の範囲で、**表示ユニットスコア**が高くなる
 * 解放マスを選ぶ(`boardOptimize.ts`。ライブスコアの式は未確定なので目的関数にしない)。**コネクトの効果の配置は変えない**(それはコネクトの
 * 最適化の責務)— いま配置のある赤 / 青 / 黄のコネクトマスは、推奨でも必ず解放済み(1 Pt を予算に含む)。
 * 基準は発動頻度・コネクトの最適化と同じ**いま登録している状態**(ボード 4 色・コネクトの解放と配置・開花・アカウント補正)と、シートの曲。
 * 一番上に評価に使う曲(開いた直後はメイン画面の曲か、前に選び直した曲。ここで選び直せる)、その下のトグルで変えてよい範囲:
 * **ユニットのみ変更**(既定。リーダーとメンバーのホロメンのボードだけ。それ以外は登録のまま)/ **全て変更**(全ホロメン。緑ボードはアカウント全体に
 * 効くのでユニット外のボードもスコアに効く)。トグルの下にユニットスコア(現在 / 推奨)、その下に変更のあるホロメンの表(使用ボードPt・解放マス数と
 * 色ごとの増減)。下端の固定エリアに緑の「ホロメンボードに反映」(確認を挟み、解放マスとコネクトマスの解放を置き換える。コネクトの配置は変わらない)。
 * 計算は Web Worker(`boardWorker.ts`)で、選んだ(曲, 範囲)ごとに 1 回(結果は覚えておく)。
 */
const props = defineProps<{
  /** 対象の編成(結果の 1 件、またはお気に入りユニット) */
  candidate: CandidateView;
  /** カード ID → 開花段階 */
  blooms: BloomMap;
  /** 登録している状態: ホロメン ID → 解放マス(4 色) */
  boards: BoardMap;
  greenBoards: BoardMap;
  yellowBoards: BoardMap;
  redBoards: BoardMap;
  /** いまボードに置いているコネクト(変えない) */
  placements: ConnectPlacementMap;
  /** ホロメン ID → 解放済みのコネクトマス(赤 / 青 / 黄) */
  connects: BoardConnectMap;
  /** ホロメン ID → ホロメンランク(登録済みのホロメンだけ。載っていないホロメンはボードPt の制限なし) */
  ranks: HolomenRankMap;
  /** メモリー・メンバー強化ボーナス */
  account: AccountBonus;
  /** このシートを開いた時点の曲(メイン画面の曲か、前に選び直した曲)。指定なしは null */
  songId: string | null;
}>();

const emit = defineEmits<{
  close: [];
  apply: [boards: Record<string, HolomenBoards>];
  songChange: [songId: string | null];
}>();

useModalChrome(() => emit("close"));

const { result, error, run } = useBoardPlan();

/** リアクティブ Proxy は postMessage で複製できないので、プレーンな値に写す */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** 評価に使う曲(開いた時点の曲で始まり、ここで変えられる。ここで変えても元の画面の曲は変わらない) */
const songId = ref<string | null>(props.songId);
const song = computed(() => (songId.value ? (songById.get(songId.value) ?? null) : null));
const pickerOpen = ref(false);
watch(songId, (value) => emit("songChange", value));

/** 変えてよい範囲(既定はユニットのみ)と、(曲, 範囲)ごとの結果(一度計算したら覚えておく) */
const scope = ref<BoardScope>("unit");
const SCOPES: { value: BoardScope; label: string }[] = [
  { value: "unit", label: "ユニットのみ変更" },
  { value: "all", label: "全て変更" },
];
const results = reactive<Record<string, BoardPlanResult>>({});
let requested: string | null = null;
const keyOf = (target: BoardScope): string => `${songId.value ?? ""}/${target}`;

function start(target: BoardScope): void {
  const key = keyOf(target);
  if (results[key]) return;
  requested = key;
  const request: OptimizeRunRequest = {
    leaderId: props.candidate.leaderId,
    fixedMemberIds: [...props.candidate.memberIds],
    excludedCardIds: [],
    excludedLeaderCardIds: [],
    excludedMemberCardIds: [],
    leaderCandidateIds: null,
    requiredMemberHolomenIds: [],
    songId: songId.value,
    blooms: plain(props.blooms),
    boards: plain(props.boards),
    greenBoards: plain(props.greenBoards),
    yellowBoards: plain(props.yellowBoards),
    redBoards: plain(props.redBoards),
    connectPlacements: plain(props.placements),
    account: plain(props.account),
    topN: 1,
  };
  run({
    request,
    team: { leaderId: props.candidate.leaderId, memberIds: [...props.candidate.memberIds] },
    connects: plain(props.connects),
    ranks: plain(props.ranks),
    scope: target,
  });
}
watch(result, (value) => {
  if (value !== null && requested !== null) results[requested] = plain(value) as BoardPlanResult;
});
watch([scope, songId], () => {
  start(scope.value);
});
onMounted(() => {
  start(scope.value);
});

/** いま選んでいる範囲の結果(まだなら null) */
const shown = computed(() => results[keyOf(scope.value)] ?? null);

const number = (value: number): string => value.toLocaleString("ja-JP");

/** 変更があるか(スコアが同じでも、予算の超過を直すなど変更があれば反映できる) */
const hasChange = computed(() => shown.value !== null && shown.value.changed.length > 0);

const COLOR_LABELS: Record<BoardColor, string> = {
  red: "赤",
  blue: "青",
  yellow: "黄",
  green: "緑",
};
interface Row {
  holomenId: string;
  rank: number | null;
  before: { points: number; cells: number };
  after: { points: number; cells: number };
  diffs: { color: BoardColor; plus: number; minus: number }[];
}
/** 表の行(shown.changed の順 = リーダー → メンバー → それ以外) */
const rows = computed<Row[]>(() => {
  const r = shown.value;
  if (r === null) return [];
  return r.changed.map((id) => {
    const before = r.before[id];
    const after = r.boards[id];
    const empty: HolomenBoards = { red: [], blue: [], yellow: [], green: [], connects: [] };
    const b = before ?? empty;
    const a = after ?? empty;
    const diffs = BOARD_STATE_COLORS.map((color) => {
      const was = unlockSetOf(color, b[color], b.connects);
      const now = unlockSetOf(color, a[color], a.connects);
      let plus = 0;
      let minus = 0;
      for (const x of now) if (!was.has(x)) plus += 1;
      for (const x of was) if (!now.has(x)) minus += 1;
      return { color, plus, minus };
    }).filter((d) => d.plus > 0 || d.minus > 0);
    return {
      holomenId: id,
      rank: props.ranks[id] ?? null,
      before: { points: spentBoardPoints(b), cells: totalUnlockedCells(b) },
      after: { points: spentBoardPoints(a), cells: totalUnlockedCells(a) },
      diffs,
    };
  });
});
const budgetText = (rank: number | null): string =>
  rank === null
    ? "Rank 未登録"
    : `Rank ${String(rank)}・予算 ${String(boardPointsForRank(rank))} Pt`;

/** 必須のコネクトが予算に収まらず変更できなかったホロメンの名前 */
const infeasibleNames = computed(() =>
  (shown.value?.infeasible ?? []).map((id) => holomenName(id)).join("・"),
);

/** 反映の確認(開いている間は null 以外)。確認した時点の推奨を渡す — 開いたあとに範囲を切り替えても別の結果を登録しない */
const applying = ref<Record<string, HolomenBoards> | null>(null);
function askApply(): void {
  if (!hasChange.value || shown.value === null) return;
  applying.value = plain(shown.value.boards);
}
function onApply(): void {
  const boards = applying.value;
  applying.value = null;
  if (boards !== null) emit("apply", boards);
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="ホロメンボードの最適化">
      <header class="sheet-head">
        <h3>ホロメンボードの最適化</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <!-- スクロールしない上部(ユニットスコアの欄まで): 評価に使う曲と、変えてよい範囲(左右半分ずつ。既定はユニットのみ — 選択スタイルはほかの
           セグメントと同じ)と、現在 / 推奨のユニットスコア。計算中も同じ高さの枠を残す(2026-10-02 ユーザー指示「ユニットスコアのところまでは固定。表からスクロール」) -->
      <div class="fixed-top">
        <!-- 評価に使う曲(いちばん上。部品はメイン画面の Step 3・発動頻度の最適化と同じ。選択中は右上に解除ボタン — 2026-10-03 ユーザー指示) -->
        <section class="block">
          <h4>曲</h4>
          <div class="song-slot">
            <SongRow
              :song="song"
              :clearable="song !== null"
              aria-label="評価に使う曲"
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
        <div class="segment" role="radiogroup" aria-label="変更する範囲">
          <button
            v-for="s in SCOPES"
            :key="s.value"
            type="button"
            class="seg"
            role="radio"
            :aria-checked="scope === s.value"
            :class="{ 'seg-active': scope === s.value }"
            @click="scope = s.value"
          >
            {{ s.label }}
          </button>
        </div>
        <div class="summary" :class="{ 'summary-pending': shown === null }">
          <div class="score">
            <span class="score-label">現在</span>
            <span class="score-value">{{ shown === null ? "" : number(shown.current) }}</span>
          </div>
          <div class="score">
            <span class="score-label">推奨<sup class="fn">※1</sup></span>
            <span class="score-value">{{ shown === null ? "" : number(shown.recommended) }}</span>
          </div>
        </div>
      </div>

      <div class="body">
        <!-- 脚注より上の本文(表)。脚注の区切り線が下端の固定エリアにちょうど来る高さを最低限確保する(初期表示では脚注を出さない) -->
        <div class="sheet-main">
          <div
            v-if="shown === null && error === null"
            class="working"
            role="status"
            aria-label="計算中"
          >
            <span class="spinner" aria-hidden="true"></span>
          </div>
          <p v-else-if="shown === null" class="message">{{ error }}</p>
          <template v-else>
            <table v-if="hasChange" class="plan-table">
              <thead>
                <tr>
                  <th class="col-name">ホロメン</th>
                  <th class="col-cell">現在</th>
                  <th class="col-cell">推奨<sup class="fn">※2</sup></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.holomenId">
                  <td class="col-name">
                    <span class="name">{{ holomenName(row.holomenId) }}</span>
                    <span class="sub">{{ budgetText(row.rank) }}</span>
                    <span class="sub diffs">
                      <span v-for="d in row.diffs" :key="d.color" class="diff">
                        {{ COLOR_LABELS[d.color] }}
                        <span v-if="d.plus > 0" class="plus">+{{ d.plus }}</span>
                        <span v-if="d.minus > 0" class="minus">−{{ d.minus }}</span>
                      </span>
                    </span>
                  </td>
                  <td v-for="which in ['before', 'after'] as const" :key="which" class="col-cell">
                    <span class="use">{{ row[which].points }} Pt</span>
                    <span class="use-sub">{{ row[which].cells }} マス</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="shown.infeasible.length > 0" class="warning">
              {{
                infeasibleNames
              }}は、このランクでは現在のコネクト配置を維持できないため、変更していません。
            </p>
          </template>
        </div>

        <div class="footnotes">
          <p>
            <span class="fn-num">※1</span>
            <span
              >この編成のまま、ホロメンごとのボードPt（ホロメンランクまでに獲得した累積Pt。未登録は制限なし）の範囲で、ユニットスコアが高くなる解放マスを選んだ値です。いま登録しているボード・コネクト・開花・メモリー・メンバー強化ボーナスと、一番上で選んだ曲（開いた直後はさがしたときの曲）で計算します。コネクトの効果の配置は変えず、配置のあるコネクトマスは必ず解放済みにします（1
              Pt を予算に含みます）。ボードPt は外部マスタ由来の値で、実機未確認です。</span
            >
          </p>
          <p>
            <span class="fn-num">※2</span>
            <span
              >「ユニットのみ変更」は、リーダーとメンバーのホロメンのボードだけを変えます（それ以外は登録のまま）。選び方は近似で、最大になることを保証するものではありません。反映すると、解放マスとコネクトマスの解放が置き換わります（コネクトの配置は変わりません）。</span
            >
          </p>
        </div>
      </div>

      <!-- 下端の固定エリア(結果詳細・発動頻度の最適化と同じ地・罫線)。緑の主ボタン 1 つ -->
      <div class="sheet-foot">
        <button type="button" class="foot-primary" :disabled="!hasChange" @click="askApply">
          ホロメンボードに反映
        </button>
      </div>
    </div>

    <!-- 評価に使う曲を選ぶピッカー(このシートの上に重ねる。z-index はこのオーバーレイの中で解決される) -->
    <SongPicker
      v-if="pickerOpen"
      :selected-id="songId"
      @pick="
        songId = $event;
        pickerOpen = false;
      "
      @close="pickerOpen = false"
    />

    <!-- シートの上に重ねる。このオーバーレイ(z-index: 12)の子として出すので、ダイアログ自身の z-index が上に載る -->
    <ConfirmDialog
      v-if="applying !== null"
      message="推奨のホロメンボードを反映しますか？（コネクトの配置は変わりません）"
      confirm-label="反映する"
      @confirm="onApply"
      @cancel="applying = null"
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
  --song-h: 88px; /* 曲のブロックの高さ(見出し 20 + 間隔 8 + 行 60。脚注の min-height の計算に使う) */
  --summary-h: 78px; /* 現在 / 推奨のスコア欄の高さ(計算中も同じ。脚注の min-height の計算にも使う) */
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

/* ページヘッダ・ピッカーと同寸法(77px)・同文字サイズ(24px/900) */
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
  padding: 0 16px 16px;
}

/* スクロールしない上部: 曲・範囲の 2 択と現在 / 推奨のユニットスコア(表から下がスクロールする) */
.fixed-top {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 16px;
  padding: 16px 16px 0;
}

/* 本文(表。脚注より上)の最低の高さ: ヘッダ 77 + 上部の固定(余白 16 + 曲のブロック --song-h + 間隔 16 + 範囲の 2 択 42 + 間隔 16 + スコア欄 --summary-h)
   + 本文の間隔 16 + 下端の固定エリア 65 を viewport から引くと、脚注の区切り線が固定エリアの上端に来る */
.sheet-main {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: calc(100dvh - 248px - var(--song-h) - var(--summary-h) - env(safe-area-inset-bottom));
}

@media (min-width: 48rem) {
  .sheet-main {
    min-height: 0;
  }
}

.footnotes {
  flex-shrink: 0;
}

/* 下端の固定エリア(結果詳細の固定エリアと同じ地・罫線・寸法)。主ボタンは実行専用の緑で高さ 48px・15px/700 */
.sheet-foot {
  background: var(--chrome-foot);
  border-top: 1px solid var(--line);
  display: grid;
  flex-shrink: 0;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
}

.foot-primary {
  background: var(--action);
  border: none;
  border-radius: var(--r-m);
  color: #fff;
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  height: 48px;
  padding: 0 8px;
}

.foot-primary:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.fn {
  font-size: 10px;
  font-weight: 600;
  line-height: 0;
  margin-left: 1px;
}

/* 計算中: 本文の中央に細線のリング(押したボタンの中のリングと同形。色だけ文字色) */
.working {
  align-items: center;
  display: flex;
  flex: 1;
  justify-content: center;
}

.spinner {
  animation: spin 0.8s linear infinite;
  border: 2.5px solid var(--line);
  border-radius: 50%;
  border-top-color: var(--ink);
  height: 28px;
  width: 28px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 2.4s;
  }
}

/* 曲の行(メイン画面の Step 3・発動頻度の最適化と同形。選択中は右上に解除ボタンを重ねる) */
.block {
  flex-shrink: 0;
  height: var(--song-h);
}

/* 見出し「曲」(発動頻度の最適化と同じ 15px。高さを固定して脚注の min-height の計算を正確にする) */
.block h4 {
  font-size: 15px;
  line-height: 20px;
  margin: 0 0 8px;
}

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

/* 変更する範囲の 2 択: ピッカーのセグメントと同形で左右半分ずつ(選択スタイルは全画面共通の --selected) */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  flex-shrink: 0;
  grid-template-columns: 1fr 1fr;
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
  padding: 0 4px;
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

.message {
  background: var(--bg);
  border-radius: var(--r-s);
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  padding: 14px;
}

/* 現在 / 推奨のユニットスコア: 淡色の地に 2 列(伸びの % は出さない — 2026-10-02 ユーザー指示)。計算中も同じ高さの枠を残す */
.summary {
  background: var(--bg);
  border-radius: var(--r-m);
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
  height: var(--summary-h);
  padding: 14px 16px;
}

.summary-pending .score-label {
  visibility: hidden;
}

.score {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.score-label {
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
}

.score-value {
  min-height: 29px;
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

/* 表: ホロメン / 現在 / 推奨 の 3 列(列見出しはこの 3 語)。値の枠は同じ幅にそろえて左揃え */
.plan-table {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
}

/* 列見出しは脚注が出てくる(表を過ぎる)までスクロールの上端に固定する。行が下を通るので地を持たせる */
.plan-table th {
  background: var(--surface);
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
  padding: 16px 0 8px; /* 上の 16px はトグルとスコア欄の間隔と同じ(固定したときもスコア欄との距離を保つ) */
  position: sticky;
  text-align: left;
  top: 0;
  z-index: 1;
}

.plan-table td {
  border-top: 1px solid var(--line);
  padding: 8px 0;
  vertical-align: middle;
}

.col-name {
  padding-right: 8px;
}

.col-cell {
  width: 108px;
}

.col-name .name {
  display: block;
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 名前の下の小さな補足(Rank と 色ごとの増減) */
.sub {
  color: var(--ink-2);
  display: block;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

/* 色ごとの増減(赤 +5 青 −2 …)。1 つずつ折り返さない */
.diffs {
  display: flex;
  flex-wrap: wrap;
  gap: 0 8px;
}

.diff {
  white-space: nowrap;
}

.sub .plus {
  color: var(--action);
}

.sub .minus {
  color: var(--error);
}

.use {
  display: block;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  white-space: nowrap;
}

.use-sub {
  color: var(--ink-2);
  display: block;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

/* 変更できなかったホロメンの注意(必須のコネクトがランクの予算に収まらない) */
.warning {
  color: var(--error);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  margin: 12px 0 0;
}
</style>
