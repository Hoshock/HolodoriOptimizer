<script setup lang="ts">
import { computed, ref, watch } from "vue";

import ConnectFigure from "./ConnectFigure.vue";
import ConnectTakePane from "./ConnectTakePane.vue";
import { CONNECT_EXTENTS, connectPermilCandidates } from "../data/connect";
import type { ConnectExtentId, ConnectPlacement } from "../data/connect";
import type { ConnectSlot } from "../storage/connectInventory";

/**
 * コネクトの倍率を選ぶ中身（2026-10-02 ユーザー指示「テンキーの自由入力をやめて、ありえる候補からの選択制に」）。
 * コネクト効果のモーダル（`ConnectSheet`）の中で、形を押すとその図形が拡大して上へ移り、その下にこれが出る（2026-10-10 ユーザー指示
 * 「モーダルの上にモーダルってキモい」「図形選択したらそれが拡大されて％選べるようになる」。それまでは上に重ねる小さなダイアログ）。
 * 範囲の形ごとに取りうる倍率（`connectPermilCandidates`。ゲーム内の「範囲内のホロメンボード効果を X% UP」の X）を
 * アカウントの「コネクト」の ％ ごとのダイアログと同じ、横幅いっぱいの行で縦に並べる(左に ％、右に残り。2026-10-10 ユーザー指示
 * 「アカウントのコネクトのように横幅いっぱいのチップにしよう」。それまでは横 1 列のセグメント)。
 * **保存済みの値が候補にないとき**（自由入力だった過去の値）は、候補の末尾へその値も出して選択中にする —
 * 開いただけで値を失わせず、別の候補を選んで初めて置き換わる。
 * 各候補の下に「残り n」（持っている枚数 − 置いている数。超えて置いていれば「残り -2」のように負のまま）を出す（2026-10-10 ユーザー指示）。
 * 残り 0 を選ぶと（呼び出し側が `taking` を渡す）、**その行の矩形がその場で広がって中に持ってくる場所が出て、下の候補は押し下げられる**
 * （2026-10-10 ユーザー指示「％選んだらそこの矩形が広がって他の%の候補は下に行ってってかんじ。かっこよく」）。高さは
 * grid-template-rows の 0fr ⇄ 1fr で動かし、閉じるあいだも中身を残して縮める
 */
const props = defineProps<{
  extent: ConnectExtentId;
  /** いまの倍率（‰）。同じ形を入れてあるときだけ渡す */
  value: number | null;
  /** ‰ → 残りの枚数 */
  remaining: Readonly<Record<number, number>>;
  /** 枠の中に図形を描く(拡大して移る図形が収まったあと) */
  showFigure?: boolean;
  /** 持っている枚数を超える倍率を選んだとき: その行を広げて持ってくる場所を出す */
  taking?: { placement: ConnectPlacement; owned: number; sources: ConnectSlot[] } | null;
  /** 所持カードを 1 枚も登録していない */
  cardsUnregistered?: boolean;
}>();

const emit = defineEmits<{ pick: [permil: number]; take: [from: ConnectSlot]; place: [] }>();

/** 縮むあいだも中身を残すため、最後に広げた内容を持っておく */
const shown = ref(props.taking ?? null);
watch(
  () => props.taking,
  (t) => {
    if (t) shown.value = t;
  },
);
const isOpen = (p: number): boolean => props.taking?.placement.permil === p;

const choices = computed<number[]>(() => {
  const list = [...connectPermilCandidates(props.extent)];
  if (props.value !== null && !list.includes(props.value)) list.push(props.value);
  return list;
});
</script>

<template>
  <div class="permil-pane">
    <!-- 押したタイルの図形がここへ拡大して移る(動いているあいだはモーダルの側が重ねて描き、収まったらここに描く) -->
    <div class="figure" data-hero-slot>
      <ConnectFigure v-if="props.showFigure" :cells="CONNECT_EXTENTS[props.extent]" />
    </div>
    <div class="rows" role="radiogroup" aria-label="範囲内のホロメンボード効果を UP">
      <div
        v-for="p in choices"
        :key="p"
        class="row-box"
        :class="{ open: isOpen(p) }"
        :data-permil="p"
      >
        <button
          type="button"
          class="row"
          role="radio"
          :aria-checked="props.value === p"
          :aria-expanded="isOpen(p)"
          :class="{ active: props.value === p }"
          @click="emit('pick', p)"
        >
          <span class="seg-percent">+{{ p / 10 }}%</span>
          <span class="seg-rest" :class="{ none: (props.remaining[p] ?? 0) <= 0 }">
            残り {{ props.remaining[p] ?? 0 }}
          </span>
        </button>
        <div class="expand" :inert="!isOpen(p)">
          <div class="expand-inner">
            <ConnectTakePane
              v-if="shown !== null && shown.placement.permil === p"
              :placement="shown.placement"
              :owned="shown.owned"
              :sources="shown.sources"
              :cards-unregistered="props.cardsUnregistered"
              @take="(from) => emit('take', from)"
              @place="emit('place')"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * 本文の上に固定: 拡大した図形 → 倍率の候補(見出しの「範囲内のホロメンボード効果を UP」は自明なので置かない — 2026-10-10)。
 * 足りないときはこの下に持ってくる場所が出るが、図形と候補の位置は変えない
 */
.permil-pane {
  flex-shrink: 0;
}

/* 拡大した図形の枠(下に持ってくる場所が出ても行が見えるよう、大きくしすぎない) */
.figure {
  aspect-ratio: 1 / 1;
  margin: 0 auto 16px;
  width: 104px;
}

/* 候補は等幅で 1 行（多くても 3 つ + 候補にない保存値 1 つ）。選択スタイルはほかのセグメントと同じ */
/* 横幅いっぱいの行(アカウントの「コネクト」の ％ ごとの行と同じ地・寸法)。選んだ行は選択の色 */
.rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 行の矩形: 選んだ倍率で足りないときはこの矩形ごと広がり、中に持ってくる場所が出る */
.row-box {
  background: var(--bg);
  border-radius: var(--r-s);
  overflow: hidden;
}

.expand {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.row-box.open .expand {
  grid-template-rows: 1fr;
}

.expand-inner {
  min-height: 0;
  opacity: 0;
  transition: opacity 0.18s ease;
}

.row-box.open .expand-inner {
  opacity: 1;
  transition: opacity 0.24s ease 0.1s;
}

@media (prefers-reduced-motion: reduce) {
  .expand,
  .expand-inner,
  .row-box.open .expand-inner {
    transition: none;
  }
}

.row {
  align-items: center;
  background: transparent;
  border: none;
  border-radius: var(--r-s);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-variant-numeric: tabular-nums;
  justify-content: space-between;
  min-height: 44px;
  padding: 6px 14px;
  white-space: nowrap;
  width: 100%;
}

.seg-percent {
  font-size: 15px;
  font-weight: 700;
}

.seg-rest {
  font-size: 13px;
  font-weight: 600;
}

.seg-rest.none {
  color: var(--ink-2);
}

.row-box.open .row.active {
  border-radius: var(--r-s) var(--r-s) 0 0;
}

.row.active {
  background: var(--selected);
  color: var(--selected-ink);
}

.row.active .seg-rest.none {
  color: var(--selected-ink);
}
</style>
