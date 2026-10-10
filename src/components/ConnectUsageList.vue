<script setup lang="ts">
import { computed } from "vue";

import ConnectFigure from "./ConnectFigure.vue";
import { holomen } from "../data";
import { CONNECT_EXTENTS } from "../data/connect";
import type { ConnectPlacements } from "../data/connect";
import { connectUsage } from "../storage/connectInventory";
import type { ConnectInventoryEntry } from "../storage/connectInventory";
import { holomenName, sortHolomen } from "../ui/labels";

/**
 * コネクト効果の一覧(2026-09-11 ユーザー指示「どのコネクトマスを誰のホロメンボードに使っていてその倍率がいくつか、
 * みたいなのの一覧が見たい」)。コネクト効果のモーダル(`ConnectSheet`)の見出しの「一覧」で、モーダルの中身がこれに横へ切り替わる
 * (2026-10-10 ユーザー指示「モーダルの上にモーダルってキモい」。それまでは上に重ねるダイアログ)。範囲の形・倍率 が同じ入力を 1 行にまとめた表を出す: 形(図形)/ 倍率 / 使っているホロメン。
 * どのコネクトマスに置いたかは区別せず、色も分けない(2026-09-11「色の違いは区別必要ない。中心とか青とかの文も。純粋に形。
 * 並びはマスの少ない順かつ似ているものは近くに」→ 図形一覧の固定順 `CONNECT_EXTENT_DISPLAY_ORDER`)。形は基準の向き(青が左のホロメン)で描く。
 * 倍率の右に「使用/所持」(置いている数 / 持っている枚数。2026-10-10 ユーザー指示)の列を置き、持っている枚数より多く置いている行は赤にする。
 * 行は置いているものだけ(持っているだけのものはアカウントの「コネクト」で見る)
 */
const props = defineProps<{
  /** 全ホロメンのコネクトの入力(ホロメン ID → アンカー → 形と ‰) */
  placements: Readonly<Record<string, ConnectPlacements>>;
  /** 持っているコネクト(所持カードから導く) */
  inventory: readonly ConnectInventoryEntry[];
}>();

/** ホロメンの表示順(読みの五十音順) */
const holomenOrder = new Map(sortHolomen(holomen).map((h, i) => [h.id, i]));
const rows = computed(() =>
  connectUsage(props.placements, props.inventory)
    .filter((r) => r.used > 0)
    .map((r) => ({
      ...r,
      key: `${r.extent}/${String(r.permil)}`,
      names: [...r.holomenIds]
        .sort((a, b) => (holomenOrder.get(a) ?? 999) - (holomenOrder.get(b) ?? 999))
        .map(holomenName),
    })),
);
</script>

<template>
  <div class="usage-list" role="group" aria-label="コネクト効果の一覧">
    <div class="body">
      <!-- 1 つも置いていないときは入口(コネクト効果の「一覧」)を押せないので、空の文は置かない -->
      <table class="table">
        <thead>
          <tr>
            <th scope="col">形</th>
            <th scope="col" class="num">倍率</th>
            <th scope="col" class="num">使用/所持</th>
            <th scope="col">ホロメン</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.key">
            <td class="shape">
              <ConnectFigure :cells="CONNECT_EXTENTS[r.extent]" />
            </td>
            <td class="num">+{{ r.permil / 10 }}%</td>
            <td
              class="num usage"
              :class="{ over: r.used > r.owned }"
              :aria-label="`使用 ${r.used} / 所持 ${r.owned}`"
            >
              {{ r.used }}/{{ r.owned }}
            </td>
            <td class="names">{{ r.names.join("、") }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/* モーダルの本文いっぱい。はみ出したらここだけスクロール */
.usage-list {
  height: 100%;
}

.body {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 16px 16px;
  touch-action: pan-y pinch-zoom;
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

.usage {
  font-weight: 600;
}

.usage.over {
  color: var(--error);
  font-weight: 700;
}

.names {
  font-weight: 600;
  line-height: 1.4;
}
</style>
