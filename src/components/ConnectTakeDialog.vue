<script setup lang="ts">
import { computed } from "vue";

import ConnectFigure from "./ConnectFigure.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { CONNECT_ANCHOR_LABELS, CONNECT_EXTENT_LABELS, CONNECT_EXTENTS } from "../data/connect";
import type { ConnectPlacement } from "../data/connect";
import type { BoardColor } from "../storage/boards";
import type { ConnectSlot } from "../storage/connectInventory";
import { holomenName } from "../ui/labels";

/**
 * 持っている枚数を超えてコネクトを置こうとしたときの警告(2026-10-10 ユーザー指示「ボード上でコネクトおくとき、他で使われている
 * コネクトを外さないと置けない場合、どこから取ってくるかというのを指定しておけるようにしたい」「禁止まではしないがモーダルで警告を出す」)。
 * 中央のダイアログに、その形の図形と文(全部使っている / 持っていない)、同じ 形 × ％ を置いている場所の一覧
 * (ホロメン名 + コネクトマス。押すとそこから外してここへ置く)、下に「キャンセル」と「外さずに置く」(持っている枚数を超えたまま置く)。
 * 形の名前は文字で出さず図形で示す(名前は aria-label へ — 2026-10-02 ユーザー指示)。
 * 所持カードが未登録のときも照合する(持っているコネクトは 0 枚 — 2026-10-10 ユーザー指示「いや照合する」)ので、そのときは一言添える
 */
const props = defineProps<{
  placement: ConnectPlacement;
  /** 持っている枚数(0 なら持っていない) */
  owned: number;
  /** 同じ 形 × ％ を置いている場所(いまのコネクトマスを除く。並べる順) */
  sources: readonly ConnectSlot[];
  /** 所持カードを 1 枚も登録していない */
  cardsUnregistered: boolean;
  /** 図形の塗りに使うボードの色 */
  color: BoardColor;
}>();

const emit = defineEmits<{ take: [from: ConnectSlot]; place: []; cancel: [] }>();

useModalChrome(() => emit("cancel"), { lockScroll: false });

const percent = computed(() => `+${String(props.placement.permil / 10)}%`);
const message = computed(() => {
  if (props.owned > 0) {
    const all = props.owned === 1 ? "持っている 1 枚を" : ` ${String(props.owned)} 枚とも`;
    return `${percent.value} は${all}使っています。どこから外して持ってきますか？`;
  }
  return props.sources.length > 0
    ? `${percent.value} は持っていません。ほかに置いているところから外して持ってきますか？`
    : `${percent.value} は持っていません。`;
});
</script>

<template>
  <div class="take-overlay" @click.self="emit('cancel')">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="`${CONNECT_EXTENT_LABELS[props.placement.extent]} ${message}`"
      :style="{ '--board': `var(--board-${props.color})` }"
    >
      <div class="head">
        <div class="figure"><ConnectFigure :cells="CONNECT_EXTENTS[props.placement.extent]" /></div>
        <div class="text">
          <p class="message">{{ message }}</p>
          <p v-if="props.cardsUnregistered" class="note">所持カードが未登録です。</p>
        </div>
      </div>
      <ul v-if="props.sources.length > 0" class="sources">
        <li v-for="s in props.sources" :key="`${s.holomenId}/${s.anchor}`">
          <button type="button" class="source" @click="emit('take', s)">
            <span class="name">{{ holomenName(s.holomenId) }}</span>
            <span class="anchor">{{ CONNECT_ANCHOR_LABELS[s.anchor] }}</span>
          </button>
        </li>
      </ul>
      <div class="actions">
        <button type="button" @click="emit('cancel')">キャンセル</button>
        <button type="button" @click="emit('place')">外さずに置く</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* コネクトのサイドバー(z-index: 12)の上に重ねる。ルートのクラスは親(ConnectSheet の .overlay)と別の名前にする */
.take-overlay {
  align-items: center;
  background: rgba(35, 48, 61, 0.4);
  display: flex;
  inset: 0;
  justify-content: center;
  overscroll-behavior: contain;
  padding: 24px;
  position: fixed;
  touch-action: pinch-zoom;
  z-index: 13;
}

.dialog {
  background: var(--surface);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-sheet);
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 20rem;
  padding: 16px;
  width: 100%;
}

.head {
  align-items: center;
  display: flex;
  gap: 12px;
}

.figure {
  flex-shrink: 0;
  width: 44px;
}

.text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.message {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.6;
  margin: 0;
}

.note {
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;
  margin: 0;
}

.sources {
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

/* 持ってくる場所: 押せる行(枠線つきの角丸)。名前は左、コネクトマスは右の淡色 */
.source {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  cursor: pointer;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-height: 52px;
  padding: 6px 14px;
  text-align: left;
  width: 100%;
}

.name {
  font-size: 15px;
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.anchor {
  color: var(--ink-2);
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

/* 2 つは等価な選択肢なので同じ配色(主の操作は上の場所を選ぶこと) */
.actions {
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
}

.actions button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  height: 44px;
  padding: 0 8px;
}
</style>
