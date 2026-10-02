<script setup lang="ts">
import { computed, onMounted } from "vue";

import CloseButton from "./CloseButton.vue";
import ConnectFigure from "./ConnectFigure.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { useConnectPlan } from "../composables/useConnectPlan";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById } from "../data";
import { CONNECT_ANCHOR_LABELS, CONNECT_EXTENT_LABELS, CONNECT_EXTENTS } from "../data/connect";
import type { ConnectAnchor, ConnectPlacement } from "../data/connect";
import type { BloomMap } from "../data/bloom";
import type { BoardMap } from "../storage/boards";
import type { ConnectPlacementMap } from "../storage/connect";
import type { ConnectItem } from "../engine/connectOptimize";
import type { AccountBonus } from "../engine/power";
import type { OptimizeRunRequest } from "../engine/request";
import { connectPlanRows } from "../ui/connectPlan";
import { holomenName } from "../ui/labels";

/**
 * 「コネクトの最適化」(結果詳細・ユニット詳細の下端の左。2026-10-02 ユーザー指示)。
 * 持っているコネクト(アカウントの「コネクト」で登録した 形 × ％ × 枚数)を全部置き直して、**この編成のユニットスコアが
 * 最大になる置き方**を出す。基準は発動頻度の最適化と同じ**いま登録している状態**(ボード 4 色・開花・アカウント補正)と、
 * さがしたときの曲。表は「現在(ボードに置いている配置)/ 推奨」で、**違う置き場所だけ**を並べる。
 * 推奨を登録済みの配置へ反映するボタンは置かない(ユーザー指示 — 置き直しはゲーム側の操作で、手で行う)。
 * 計算は Web Worker(`connectWorker.ts`)で行い、終わるまではシートの中で回転表示を出す
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
  /** さがしたときの曲(黄の楽曲スコアボーナス・赤の歌唱者条件に使う)。指定なしは null */
  songId: string | null;
}>();

const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const { running, result, error, run } = useConnectPlan();

/** リアクティブ Proxy は postMessage で複製できないので、プレーンな値に写す */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

onMounted(() => {
  const request: OptimizeRunRequest = {
    leaderId: props.candidate.leaderId,
    fixedMemberIds: [...props.candidate.memberIds],
    excludedCardIds: [],
    excludedLeaderCardIds: [],
    excludedMemberCardIds: [],
    leaderCandidateIds: null,
    requiredMemberHolomenIds: [],
    songId: props.songId,
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
  });
});

const number = (value: number): string => value.toLocaleString("ja-JP");

/** 推奨が現在を上回るか(上回らなければ「いまの置き方が最良」) */
const improved = computed(() => {
  const r = result.value;
  return r !== null && r.recommended > r.current;
});

/** 編成のホロメン(リーダー → メンバーの順)。表の並びは編成のホロメンが先 */
const teamHolomen = computed(() => {
  const ids = [props.candidate.leaderId, ...props.candidate.memberIds]
    .map((id) => cardById.get(id)?.holomenId ?? "")
    .filter((id) => id !== "");
  return ids.filter((id, i) => ids.indexOf(id) === i);
});
const rows = computed(() =>
  result.value === null
    ? []
    : connectPlanRows(props.placements, result.value.placements, teamHolomen.value),
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
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="コネクトの最適化">
      <header class="sheet-head">
        <h3>コネクトの最適化</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <!-- 脚注より上の本文。脚注の区切り線が画面の下端にちょうど来る高さを最低限確保する(初期表示では脚注を出さない) -->
        <div class="sheet-main">
          <div v-if="running" class="working" role="status" aria-label="計算中">
            <span class="spinner" aria-hidden="true"></span>
          </div>
          <p v-else-if="error" class="message">{{ error }}</p>
          <template v-else-if="result">
            <div class="summary">
              <div class="score">
                <span class="score-label">現在</span>
                <span class="score-value">{{ number(result.current) }}</span>
              </div>
              <div class="score">
                <span class="score-label">推奨<sup class="fn">※1</sup></span>
                <span class="score-value">{{ number(result.recommended) }}</span>
              </div>
            </div>

            <p v-if="!improved" class="message">
              いまの置き方がすでに最良です（持っているコネクトで上回る置き方はありません）。
            </p>
            <table v-else class="plan-table">
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
              >持っているコネクトを全部置き直したときの、この編成のユニットスコアです。いま登録しているボード・開花・メモリー・メンバー強化ボーナスと、さがしたときの曲で計算します（曲を指定していないときは、曲で決まる黄ボードの効果は入りません）。</span
            >
          </p>
          <p>
            <span class="fn-num">※2</span>
            <span
              >1 枚は 1
              か所のコネクトマスにだけ置けます。置き方は近似で、最大になることを保証するものではありません。コネクトの範囲と倍率は暫定仕様で、実機での確認はまだです。</span
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
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

/* 本文(脚注より上)の最低の高さ: ヘッダ 77 + 上下の余白 16 + 16 を viewport から引くと、脚注の区切り線が画面の下端に来る */
.sheet-main {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 16px;
  min-height: calc(100dvh - 109px - env(safe-area-inset-bottom));
}

@media (min-width: 48rem) {
  .sheet-main {
    min-height: 0;
  }
}

.footnotes {
  flex-shrink: 0;
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

.message {
  background: var(--bg);
  border-radius: var(--r-s);
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  padding: 14px;
}

/* 現在 / 推奨のユニットスコア: 淡色の地に 2 列(伸びの % は出さない — 2026-10-02 ユーザー指示) */
.summary {
  background: var(--bg);
  border-radius: var(--r-m);
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
  padding: 14px 16px;
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

.plan-table th {
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
  padding: 0 0 8px;
  text-align: left;
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
