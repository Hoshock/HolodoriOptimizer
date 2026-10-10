<script setup lang="ts">
import { computed } from "vue";

import ConnectFigure from "./ConnectFigure.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { CONNECT_EXTENT_LABELS, CONNECT_EXTENTS, connectPermilCandidates } from "../data/connect";
import type { ConnectExtentId } from "../data/connect";
import type { ConnectUsage } from "../storage/connectInventory";

/**
 * 持っているコネクトを ％ ごとの使用 / 所持で見るダイアログ(アカウントの「コネクト」の形のタイルから開く。2026-10-02 ユーザー指示の形のまま、
 * 2026-10-09 に**見るだけ**にした — 枚数は所持カードと開花段階から導く(ADR-023)ので ＋ / － は置かない)。
 * その形で取りうる倍率(`connectPermilCandidates`)ごとに「使用 / 所持」(ボードに置いている数 / 持っている枚数。どちらもなければ 0 / 0)を出す
 * (2026-10-10 ユーザー指示。使っているホロメンの名前と列の見出しは「いらない」)。持っている枚数より多く置いている行は数字を赤にする。出口は「閉じる」・外側タップ・Escape
 */
const props = defineProps<{
  extent: ConnectExtentId;
  /** 置いているか持っている 形 × ‰ の 使用 / 所持(`connectUsage`) */
  usage: readonly ConnectUsage[];
}>();

const emit = defineEmits<{ close: [] }>();

// 背景が見えるダイアログなのでスクロールロックはかけない(ConfirmDialog と同じ)
useModalChrome(() => emit("close"), { lockScroll: false });

const rows = computed(() => {
  const mine = props.usage.filter((u) => u.extent === props.extent);
  const permils = [...connectPermilCandidates(props.extent)];
  for (const u of mine) if (!permils.includes(u.permil)) permils.push(u.permil);
  return permils.map((permil) => {
    const u = mine.find((r) => r.permil === permil);
    const used = u?.used ?? 0;
    const owned = u?.owned ?? 0;
    return { permil, used, owned };
  });
});
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="`${CONNECT_EXTENT_LABELS[props.extent]}のコネクト`"
    >
      <!-- 形の名前（「右へ 3」など）は文字で出さない。図形が形を示す（名前は aria-label へ — 2026-10-02 ユーザー指示） -->
      <div class="head"><ConnectFigure :cells="CONNECT_EXTENTS[props.extent]" /></div>
      <ul class="rows">
        <li v-for="r in rows" :key="r.permil" class="row">
          <span class="percent">+{{ r.permil / 10 }}%</span>
          <!-- 見るだけ(所持は所持カードから、使用はボードの配置から決まる)。どちらも 0 の ％ は淡色、所持を超えて置いていれば赤 -->
          <span
            class="count"
            :class="{ none: r.used === 0 && r.owned === 0, over: r.used > r.owned }"
            :aria-label="`使用 ${r.used} / 所持 ${r.owned}`"
          >
            {{ r.used }} / {{ r.owned }}
          </span>
        </li>
      </ul>
      <button type="button" class="close" @click="emit('close')">閉じる</button>
    </div>
  </div>
</template>

<style scoped>
/* アカウントのコネクトのシート(z-index: 10)の上に重ねる */
.overlay {
  align-items: center;
  background: rgba(35, 48, 61, 0.4);
  display: flex;
  inset: 0;
  justify-content: center;
  overscroll-behavior: contain;
  padding: 24px;
  position: fixed;
  touch-action: pinch-zoom;
  z-index: 12;
}

.dialog {
  background: var(--surface);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-sheet);
  max-width: 20rem;
  padding: 16px;
  width: 100%;
}

/* 図形だけを中央に(色は文字の淡色。形の確認用の見本) */
.head {
  --board: var(--ink-2);
  margin: 0 auto 12px;
  width: 88px;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
}

.row {
  align-items: center;
  background: var(--bg);
  border-radius: var(--r-s);
  display: flex;
  justify-content: space-between;
  min-height: 44px;
  padding: 6px 14px;
}

.percent {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.count {
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  flex-shrink: 0;
  min-width: 36px;
  text-align: right;
  white-space: nowrap;
}

.count.none {
  color: var(--ink-2);
  font-weight: 600;
}

.count.over {
  color: var(--error);
}

.close {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  width: 100%;
}
</style>
