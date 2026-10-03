<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";

import CloseButton from "./CloseButton.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import ConnectFigure from "./ConnectFigure.vue";
import SongPicker from "./SongPicker.vue";
import SongRow from "./SongRow.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { useConnectPlan } from "../composables/useConnectPlan";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById, songById } from "../data";
import { CONNECT_ANCHOR_LABELS, CONNECT_EXTENT_LABELS, CONNECT_EXTENTS } from "../data/connect";
import type { ConnectAnchor, ConnectPlacement } from "../data/connect";
import type { BloomMap } from "../data/bloom";
import type { BoardMap } from "../storage/boards";
import type { ConnectPlacementMap } from "../storage/connect";
import type { ConnectItem, ConnectScope } from "../engine/connectOptimize";
import type { ConnectPlanResult } from "../engine/connectPlan";
import type { AccountBonus } from "../engine/power";
import type { OptimizeRunRequest } from "../engine/request";
import { connectPlanRows } from "../ui/connectPlan";
import { holomenName } from "../ui/labels";

/**
 * 「コネクトの最適化」(結果詳細・ユニット詳細の下端の左。2026-10-02 ユーザー指示)。
 * 持っているコネクト(アカウントの「コネクト」で登録した 形 × ％ × 枚数)の範囲で、**いま置いている配置から、この編成の
 * ユニットスコアが上がる変更だけ**を出す(変更量が最小になる方針 — `connectOptimize.ts`)。基準は発動頻度の最適化と同じ
 * **いま登録している状態**(ボード 4 色・開花・アカウント補正)と、さがしたときの曲。
 * 一番上に評価に使う曲(開いた直後はさがしたときの曲。ここで選び直せる。発動頻度の最適化と同じ部品 — 2026-10-03 ユーザー指示)、
 * その下のトグルで変えてよい範囲を選ぶ(2026-10-02 ユーザー指示): **ユニットのみ変更**(既定。リーダーとメンバー。ユニット外が
 * 使っているコネクトが必要なら、その外す変更は含む)/ **全て変更**。トグルの下にユニットスコア(現在 / 推奨)、その下に
 * 「現在 / 推奨」の表(違う置き場所だけ。リーダー → メンバー → それ以外のホロメン(五十音順))。
 * 下端の固定エリアに緑の「ホロメンボードに反映」を置く(2026-10-02 ユーザー指示)。押すと確認のダイアログを挟み、OK で**いま選んでいる範囲の推奨**を
 * ボードのコネクトとして登録する(`apply`。登録を置き換えるので取り消せない)。反映したらシートを閉じて元の画面へ戻る。
 * 推奨が現在と変わらないとき(いまの置き方が最良)・計算中は押せない
 * 計算は Web Worker(`connectWorker.ts`)で、選んだ(曲, 範囲)ごとに 1 回(結果は覚えておく)。終わるまではシートの中で回転表示を出す
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
  /** いまボードに置いているコネクト(「現在」) */
  placements: ConnectPlacementMap;
  /** 持っているコネクト(形 × ％ × 枚数) */
  items: ConnectItem[];
  /** メモリー・メンバー強化ボーナス */
  account: AccountBonus;
  /** さがしたときの曲(このシートで開いた直後の曲。黄の楽曲スコアボーナス・赤の歌唱者条件に使う)。指定なしは null */
  songId: string | null;
}>();

const emit = defineEmits<{ close: []; apply: [placements: ConnectPlacementMap] }>();

useModalChrome(() => emit("close"));

const { result, error, run } = useConnectPlan();

/** リアクティブ Proxy は postMessage で複製できないので、プレーンな値に写す */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * 評価に使う曲。既定は編成をさがしたときに指定していた曲で、ここで変えられる(発動頻度の最適化と同じ。
 * 黄の楽曲スコアボーナスと赤の歌唱者条件に効く — 2026-10-03 ユーザー指示)。ここで変えても元の画面の曲は変わらない
 */
const songId = ref<string | null>(props.songId);
const song = computed(() => (songId.value ? (songById.get(songId.value) ?? null) : null));
const pickerOpen = ref(false);

/** 変えてよい範囲(既定はユニットのみ)と、(曲, 範囲)ごとの結果(一度計算したら覚えておく) */
const scope = ref<ConnectScope>("unit");
const SCOPES: { value: ConnectScope; label: string }[] = [
  { value: "unit", label: "ユニットのみ変更" },
  { value: "all", label: "全て変更" },
];
const results = reactive<Record<string, ConnectPlanResult>>({});
let requested: string | null = null;
const keyOf = (target: ConnectScope): string => `${songId.value ?? ""}/${target}`;

function start(target: ConnectScope): void {
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
    items: plain(props.items),
    scope: target,
  });
}
watch(result, (value) => {
  if (value !== null && requested !== null) results[requested] = plain(value);
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

/** 推奨が現在を上回るか(上回らなければ「いまの置き方が最良」。表は出さず、反映ボタンは押せない) */
const improved = computed(() => {
  const r = shown.value;
  return r !== null && r.recommended > r.current;
});

/** 表の並びの基準(リーダー → メンバー(結果のメンバーの順)→ それ以外は五十音順) */
const unit = computed(() => ({
  leaderHolomenId: cardById.get(props.candidate.leaderId)?.holomenId ?? "",
  memberHolomenIds: props.candidate.memberIds.map((id) => cardById.get(id)?.holomenId ?? ""),
}));
const rows = computed(() =>
  shown.value === null ? [] : connectPlanRows(props.placements, shown.value.placements, unit.value),
);

/** コネクトマスの色(図形の塗り。中心は濃色) */
const ANCHOR_COLOR: Record<ConnectAnchor, string> = {
  center: "var(--ink)",
  leader: "var(--board-red)",
  card: "var(--board-blue)",
  content: "var(--board-yellow)",
};
/** 表の「どのコネクトマスか」の短い名前(「赤」など。ボードの色の呼び方と同じ) */
const ANCHOR_SHORT: Record<ConnectAnchor, string> = {
  center: "中心",
  leader: "赤",
  card: "青",
  content: "黄",
};
const labelOf = (p: ConnectPlacement): string =>
  `${CONNECT_EXTENT_LABELS[p.extent]} +${String(p.permil / 10)}%`;

/** 反映の確認(開いている間は null 以外)。確認した時点の推奨を渡す — 開いたあとに範囲を切り替えても別の結果を登録しない */
const applying = ref<ConnectPlacementMap | null>(null);
function askApply(): void {
  if (!improved.value || shown.value === null) return;
  applying.value = plain(shown.value.placements);
}
function onApply(): void {
  const placements = applying.value;
  applying.value = null;
  if (placements !== null) emit("apply", placements);
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="コネクトの最適化">
      <header class="sheet-head">
        <h3>コネクトの最適化</h3>
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
            <!-- 推奨が現在と同じとき(いまの置き方が最良)は表を出さず、文言も置かない: 現在と推奨のユニットスコアが同じなら分かる(2026-10-03 ユーザー指示) -->
            <table v-if="improved" class="plan-table">
              <thead>
                <tr>
                  <th class="col-name">ホロメン</th>
                  <th class="col-cell">現在</th>
                  <th class="col-cell">推奨<sup class="fn">※2</sup></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="`${row.holomenId}/${row.anchor}`">
                  <td class="col-name">
                    <span class="name">{{ holomenName(row.holomenId) }}</span>
                    <span class="anchor" :aria-label="CONNECT_ANCHOR_LABELS[row.anchor]">
                      {{ ANCHOR_SHORT[row.anchor] }}
                    </span>
                  </td>
                  <td
                    v-for="which in ['current', 'recommended'] as const"
                    :key="which"
                    class="col-cell"
                  >
                    <span
                      v-if="row[which]"
                      class="placed"
                      :style="{ '--board': ANCHOR_COLOR[row.anchor] }"
                      :aria-label="labelOf(row[which])"
                    >
                      <span class="figure">
                        <ConnectFigure :cells="CONNECT_EXTENTS[row[which].extent]" />
                      </span>
                      <span class="percent">+{{ row[which].permil / 10 }}%</span>
                    </span>
                    <span v-else class="none">なし</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </template>
        </div>

        <div class="footnotes">
          <p>
            <span class="fn-num">※1</span>
            <span
              >持っているコネクトの範囲で、ボードに置いている配置から、この編成のユニットスコアが上がる変更だけを行った値です（効果が変わらない場所は変えません）。いま登録しているボード・開花・メモリー・メンバー強化ボーナスと、一番上で選んだ曲（開いた直後はさがしたときの曲）で計算します（曲を指定していないときは、曲で決まる黄ボードの効果は入りません）。</span
            >
          </p>
          <p>
            <span class="fn-num">※2</span>
            <span
              >「ユニットのみ変更」は、リーダーとメンバーの置き方だけを変えます（ユニット外が使っているコネクトが必要なときは、その外す変更を含みます）。置き方は近似で、最大になることを保証するものではありません。</span
            >
          </p>
        </div>
      </div>

      <!-- 下端の固定エリア(結果詳細・発動頻度の最適化と同じ地・罫線)。緑の主ボタン 1 つ -->
      <div class="sheet-foot">
        <button type="button" class="foot-primary" :disabled="!improved" @click="askApply">
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
      message="推奨の配置をホロメンボードに反映しますか？"
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

/* どのコネクトマスか(中心 / 赤 / 青 / 黄): 名前の下に小さく淡色 */
.anchor {
  color: var(--ink-2);
  display: block;
  font-size: 12px;
  font-weight: 600;
}

.placed {
  align-items: center;
  display: flex;
  gap: 6px;
}

.placed .figure {
  flex-shrink: 0;
  width: 34px;
}

.percent {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  white-space: nowrap;
}

.none {
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 600;
}
</style>
