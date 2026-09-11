<script setup lang="ts">
import { computed } from "vue";

import CloseButton from "./CloseButton.vue";
import ConnectFigure from "./ConnectFigure.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { holomen } from "../data";
import { CONNECT_EXTENTS, connectUsageRows } from "../data/connect";
import type { ConnectPlacements } from "../data/connect";
import { holomenName, sortHolomen } from "../ui/labels";

/**
 * コネクト効果の一覧(2026-09-11 ユーザー指示「どのコネクトマスを誰のホロメンボードに使っていてその倍率がいくつか、
 * みたいなのの一覧が見たい。アクセスはコネクト効果のサイドバーの右上に分かりやすいボタンで。ダイアログが出るのがいい」)。
 * 中央のダイアログに、範囲の形・倍率 が同じ入力を 1 行にまとめた表を出す: 形(図形)/ 倍率 / 使っているホロメン。
 * どのコネクトマスに置いたかは区別せず、色も分けない(2026-09-11「色の違いは区別必要ない。中心とか青とかの文も。純粋に形。
 * 並びはマスの少ない順かつ似ているものは近くに」→ 図形一覧の固定順 `CONNECT_EXTENT_DISPLAY_ORDER`)。形は基準の向き(青が左のホロメン)で描く
 */
const props = defineProps<{
  /** 全ホロメンのコネクトの入力(ホロメン ID → アンカー → 形と ‰) */
  placements: Readonly<Record<string, ConnectPlacements>>;
}>();
const emit = defineEmits<{ close: [] }>();

// 背景が見えるダイアログなのでスクロールロックはかけない(ConfirmDialog と同じ)
useModalChrome(() => emit("close"), { lockScroll: false });

/** ホロメンの表示順(読みの五十音順) */
const holomenOrder = new Map(sortHolomen(holomen).map((h, i) => [h.id, i]));
const rows = computed(() =>
  connectUsageRows(props.placements).map((r) => ({
    ...r,
    key: `${r.extent}/${String(r.permil)}`,
    names: [...r.holomenIds]
      .sort((a, b) => (holomenOrder.get(a) ?? 999) - (holomenOrder.get(b) ?? 999))
      .map(holomenName),
  })),
);
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="コネクト効果の一覧">
      <header class="head">
        <p class="title">コネクト効果の一覧</p>
        <CloseButton @close="emit('close')" />
      </header>
      <div class="body">
        <table v-if="rows.length > 0" class="table">
          <thead>
            <tr>
              <th scope="col">形</th>
              <th scope="col" class="num">倍率</th>
              <th scope="col">ホロメン</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.key">
              <td class="shape">
                <ConnectFigure :cells="CONNECT_EXTENTS[r.extent]" />
              </td>
              <td class="num">+{{ r.permil / 10 }}%</td>
              <td class="names">{{ r.names.join("、") }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">コネクト効果はまだ入れていません</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  align-items: center;
  background: rgba(35, 48, 61, 0.4);
  display: flex;
  inset: 0;
  justify-content: center;
  overscroll-behavior: contain;
  padding: 24px 16px;
  position: fixed;
  touch-action: none;
  /* コネクト効果のサイドバー(12)の上に重ねる */
  z-index: 13;
}

.dialog {
  background: var(--surface);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-sheet);
  display: flex;
  flex-direction: column;
  max-height: min(80dvh, 40rem);
  max-width: 26rem;
  overflow: hidden;
  width: 100%;
}

.head {
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-shrink: 0;
  justify-content: space-between;
  padding: 8px 8px 8px 16px;
}

.title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

.body {
  overflow-y: auto;
  padding: 4px 16px 16px;
  touch-action: pan-y;
}

.table {
  border-collapse: collapse;
  width: 100%;
}

.table th,
.table td {
  border-top: 1px solid var(--line);
  font-size: 14px;
  padding: 8px 6px;
  vertical-align: middle;
}

.table th {
  border-top: none;
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
  text-align: left;
}

.table td:first-child,
.table th:first-child {
  padding-left: 0;
}

.table td:last-child,
.table th:last-child {
  padding-right: 0;
}

/* 形: 色で区別しない(どのコネクトマスに置いたかは出さない)ので塗りは濃色 1 色 */
.shape {
  --board: var(--ink-2);

  text-align: center;
  width: 60px;
}

.shape .figure {
  margin: 0 auto;
  width: 52px;
}

.num {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.names {
  font-weight: 600;
  line-height: 1.4;
}

.empty {
  color: var(--ink-2);
  font-size: 14px;
  margin: 12px 0 0;
  text-align: center;
}
</style>
