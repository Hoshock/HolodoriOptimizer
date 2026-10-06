<script setup lang="ts">
import { computed, ref } from "vue";

import { useModalChrome } from "../composables/useModalChrome";

/**
 * 数値を +/- ボタンで入れる中央のダイアログ(2026-10-06 ユーザー指示。ホロメンランク・イベントメモリー・メンバー強化ボーナスの入力を
 * テンキー `NumberPad` から置き換えた)。細かい刻み(fine)と粗い刻み(coarse)の 2 種類のボタンで、減らす側が左・増やす側が右。
 * 現在値(未登録は `initial`)から始め、「決定」まで呼び出し側の値は変えない(キャンセルで捨てられる)。範囲 `min`〜`max` の外へは動かない
 * (端まで来たら押せない)。見た目・寸法は `NumberPad` / `ConfirmDialog` と同じ中央のダイアログ。
 * 計算は整数(`decimals` 桁ぶんを掛けた値)で行い、0.1 の足し引きで誤差を出さない
 */
const props = defineProps<{
  /** 何の値か(ダイアログの見出し。ボタンのラベルと同じ文字にする) */
  label: string;
  /** 現在値。null = 未登録(`initial` から始める) */
  value: number | null;
  /** 未登録のときの開始値(既定値) */
  initial: number;
  /** 値の後ろに出す単位(%)。なければ空文字 */
  unit: string;
  /** 小数の桁数(表示と刻みの桁) */
  decimals: number;
  min: number;
  max: number;
  /** 細かい刻み */
  fine: number;
  /** 粗い刻み */
  coarse: number;
  /** 「値を決めずに外す」操作の文言(省略で出さない)。押すと `clear` を出す — ホロメンランクの「未登録に戻す」 */
  clearLabel?: string;
}>();

const emit = defineEmits<{ submit: [value: number]; cancel: []; clear: [] }>();

useModalChrome(() => emit("cancel"), { lockScroll: false });

const scale = 10 ** props.decimals;
const toInt = (value: number): number => Math.round(value * scale);
const lo = toInt(props.min);
const hi = toInt(props.max);
const clamp = (n: number): number => Math.min(hi, Math.max(lo, n));

/** 編集中の値(整数。decimals 桁ぶんを掛けてある) */
const draft = ref(clamp(toInt(props.value ?? props.initial)));
const shown = computed(() => (draft.value / scale).toFixed(props.decimals));

/** ボタンの並び: 粗く減らす / 細かく減らす / 細かく増やす / 粗く増やす */
const buttons = computed(() =>
  [
    { delta: -props.coarse, sign: "−" },
    { delta: -props.fine, sign: "−" },
    { delta: props.fine, sign: "+" },
    { delta: props.coarse, sign: "+" },
  ].map(({ delta, sign }) => ({
    delta: toInt(delta),
    text: `${sign}${Math.abs(delta).toFixed(props.decimals)}`,
  })),
);

function step(delta: number): void {
  draft.value = clamp(draft.value + delta);
}
const disabled = (delta: number): boolean => (delta < 0 ? draft.value <= lo : draft.value >= hi);
</script>

<template>
  <div class="overlay" @click.self="emit('cancel')">
    <div class="dialog" role="dialog" aria-modal="true" :aria-label="props.label">
      <p class="target">{{ props.label }}</p>
      <p class="display">
        <span class="num">{{ shown }}</span>
        <span v-if="props.unit !== ''" class="unit">{{ props.unit }}</span>
      </p>
      <div class="keys">
        <button
          v-for="b in buttons"
          :key="b.text"
          type="button"
          class="key"
          :disabled="disabled(b.delta)"
          @click="step(b.delta)"
        >
          {{ b.text }}
        </button>
      </div>
      <div class="actions">
        <button type="button" class="cancel" @click="emit('cancel')">キャンセル</button>
        <button type="button" class="confirm" @click="emit('submit', draft / scale)">決定</button>
      </div>
      <button
        v-if="props.clearLabel !== undefined"
        type="button"
        class="clear"
        @click="emit('clear')"
      >
        {{ props.clearLabel }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 中央の小さなダイアログ(NumberPad / ConfirmDialog と同じ地・同じ重ね順) */
.overlay {
  align-items: center;
  background: rgba(35, 48, 61, 0.4);
  display: flex;
  inset: 0;
  justify-content: center;
  overscroll-behavior: contain;
  padding: 24px;
  position: fixed;
  /* 背景のスクロールは止めるが、ピンチ(拡大の戻し)はブラウザへ譲る */
  touch-action: pinch-zoom;
  z-index: 11;
}

.dialog {
  background: var(--surface);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-sheet);
  max-width: 20rem;
  padding: 16px;
  width: 100%;
}

/* 見出しはボタンのラベルと同じ文字(14px / 600) */
.target {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
}

/* 入力中の値。ボタン内と同じ「右寄せの値 + %」の並び */
.display {
  align-items: baseline;
  background: var(--bg);
  border-radius: var(--r-m);
  display: flex;
  gap: 2px;
  justify-content: flex-end;
  margin: 0 0 12px;
  padding: 8px 12px;
}

.num {
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.unit {
  color: var(--ink-2);
  font-size: 12px;
}

/* 4 つ横並び(粗く減らす・細かく減らす・細かく増やす・粗く増やす) */
.keys {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, 1fr);
  margin-bottom: 12px;
}

.key {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  height: 48px;
  padding: 0;
}

.key:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.actions {
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
}

.actions button {
  border-radius: var(--r-m);
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  height: 44px;
  padding: 0 8px;
}

/* 値を決めずに外す操作(未登録に戻す)。主操作ではないので文字だけのボタン */
.clear {
  background: none;
  border: none;
  color: var(--link);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 40px;
  margin-top: 4px;
  width: 100%;
}

.cancel {
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink);
}

.confirm {
  background: var(--action);
  border: none;
  color: #fff;
}
</style>
