<script setup lang="ts">
import { computed } from "vue";

import { useDarkMode } from "../composables/useDarkMode";
import { useModalChrome } from "../composables/useModalChrome";
import { useOkayuMode } from "../composables/useOkayuMode";
import {
  colorsOf,
  modeOf,
  PALETTE_KEYS,
  PALETTE_MODE_LABELS,
  PALETTE_MODES,
  usePalette,
} from "../composables/usePalette";
import type { PaletteColors, PaletteMode } from "../composables/usePalette";

/**
 * 管理用画面（サイドメニュー最下部、「GitHub」の下の折り畳みから開く — 2026-09-09 ユーザー指示）。
 * ヘッダ・フッタ・背景の色を手元で試すための操作バーで、**実画面の上に固定して出す** —
 * 全画面のシートに入れてプレビューで見せる形は「実画面にしないと意味ないが…」で差し戻した。
 * 地を敷かず（scrim なし・スクロールロックなし）背後の画面をそのまま触れる。
 *
 * モードのチップは編集対象を選ぶだけでなく**アプリのモード自体を切り替える**（実画面で見るため）。
 * おかゆんモードは編成の制約にも効くので、確認が終わったらライト / ダークへ戻す。
 * 変更はこのブラウザの localStorage にだけ残り、既定色（src/style.css）は書き換えない。
 * 認証は置いていない — サーバなしの静的サイト（パブリックリポジトリ）では ID / PW を隠せず、
 * この画面が触るのも自分のブラウザの表示だけなので守るものがない
 */
const emit = defineEmits<{ close: [] }>();

// 背景のスクロールはロックしない（実画面をスクロールしながら色を見るため）。Escape で閉じる
useModalChrome(() => emit("close"), { lockScroll: false });

const palette = usePalette();
const dark = useDarkMode();
const okayu = useOkayuMode();

/** 編集対象 = いまアプリが表示しているモード */
const mode = computed<PaletteMode>(() => modeOf(dark.active.value, okayu.active.value));
const colors = computed<PaletteColors>(() => {
  void palette.overrides.value;
  return colorsOf(mode.value);
});
const changed = computed(() => palette.overrides.value[mode.value] !== undefined);

/** そのモードになるようにアプリの 2 つのモードを合わせる */
function selectMode(next: PaletteMode): void {
  const wantDark = next === "dark" || next === "okayu-dark";
  const wantOkayu = next === "okayu" || next === "okayu-dark";
  if (dark.active.value !== wantDark) dark.toggle();
  if (okayu.active.value !== wantOkayu) okayu.toggle();
}

function onInput(key: keyof PaletteColors, event: Event): void {
  palette.setColor(mode.value, key, (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="dock" role="dialog" aria-label="管理用画面（配色）">
    <div class="dock-head">
      <span class="dock-title">配色</span>
      <button
        type="button"
        class="dock-close"
        aria-label="管理用画面を閉じる"
        @click="emit('close')"
      >
        <span class="bar" aria-hidden="true"></span>
        <span class="bar" aria-hidden="true"></span>
      </button>
    </div>

    <div class="modes" role="group" aria-label="モード">
      <button
        v-for="m in PALETTE_MODES"
        :key="m"
        type="button"
        class="chip"
        role="radio"
        :aria-checked="mode === m"
        :class="{ active: mode === m }"
        @click="selectMode(m)"
      >
        {{ PALETTE_MODE_LABELS[m] }}
      </button>
    </div>

    <div class="colors">
      <label v-for="item in PALETTE_KEYS" :key="item.key" class="color">
        <span class="color-label">{{ item.label }}</span>
        <input
          type="color"
          :value="colors[item.key]"
          :aria-label="`${PALETTE_MODE_LABELS[mode]}の${item.label}の色`"
          @input="onInput(item.key, $event)"
        />
        <span class="hex">{{ colors[item.key] }}</span>
      </label>
      <button type="button" class="reset" :disabled="!changed" @click="palette.reset(mode)">
        既定に戻す
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 実画面の上に固定する操作バー。地は敷かない（背後をそのまま触れる） */
.dock {
  background: var(--surface);
  border-top: 1px solid var(--line);
  bottom: 0;
  box-shadow: var(--shadow-sheet);
  display: flex;
  flex-direction: column;
  gap: 8px;
  left: 0;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
  position: fixed;
  right: 0;
  z-index: 21; /* サイドメニュー(20)より上。開いたまま各シートの色も見られる */
}

.dock-head {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.dock-title {
  font-size: 14px;
  font-weight: 700;
}

/* 閉じるボタンは共通の ✕ の形を 32px に縮めたもの(バーの高さを抑える) */
.dock-close {
  align-items: center;
  background: var(--bg);
  border: none;
  border-radius: 50%;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  height: 32px;
  justify-content: center;
  padding: 0;
  position: relative;
  width: 32px;
}

.dock-close .bar {
  background: currentColor;
  border-radius: 1px;
  display: block;
  height: 2px;
  position: absolute;
  width: 14px;
}

.dock-close .bar:nth-child(1) {
  transform: rotate(45deg);
}

.dock-close .bar:nth-child(2) {
  transform: rotate(-45deg);
}

/* モードは 1 行に 4 つ(ピッカーの所属チップと同形) */
.modes {
  display: grid;
  gap: 4px;
  grid-template-columns: repeat(4, 1fr);
}

.chip {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  color: var(--ink);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  height: 32px;
  padding: 0 4px;
}

.chip.active {
  background: var(--selected);
  border-color: var(--selected);
  color: var(--selected-ink);
}

/* 色見本 3 つ + 既定に戻すを 1 行に */
.colors {
  align-items: end;
  display: flex;
  gap: 8px;
}

.color {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.color-label {
  color: var(--ink-2);
  font-size: 11px;
  font-weight: 600;
}

.color input {
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  height: 32px;
  padding: 2px;
  width: 100%;
}

.hex {
  color: var(--ink-2);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.reset {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  height: 32px;
  margin-bottom: 14px; /* hex の行のぶん、色見本の高さに合わせる */
  padding: 0 8px;
}

.reset:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
