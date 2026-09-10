<script setup lang="ts">
import { computed, ref } from "vue";

import { useModalChrome } from "../composables/useModalChrome";

/**
 * 数値を入れる自前のテンキー（2026-09-10 ユーザー指示「入力キーボード出したくないので
 * 自前ダイアログのようなもので 1234567890. が入力できるだけのものを用意する」）。
 * `<input>` を置くとモバイルで OS のキーボードが出てしまうので、押せるのは 0〜9 と小数点
 * （+ 1 文字消す）だけにする。見た目・寸法は ConfirmDialog / QuestionDialog と同じ中央のダイアログ。
 * 現在値を入れた状態で開き、「決定」まで呼び出し側の値は変えない（キャンセルで捨てられる）
 */
const props = defineProps<{
  /** 何の値か（ダイアログの見出し。ボタンのラベルと同じ文字にする） */
  label: string;
  value: number;
  /** 値の後ろに出す単位（％） */
  unit: string;
}>();

const emit = defineEmits<{ submit: [value: number]; cancel: [] }>();

useModalChrome(() => emit("cancel"), { lockScroll: false });

/** 入力中の文字列。0 は空欄と同じに見せる（そのまま数字を打てる） */
const draft = ref(props.value === 0 ? "" : String(props.value));

/** 打ち間違いを直せる範囲で十分な長さ（例: 123.45） */
const MAX_LENGTH = 6;

const shown = computed(() => (draft.value === "" ? "0" : draft.value));
const parsed = computed(() => {
  const value = Number.parseFloat(draft.value);
  return Number.isFinite(value) && value >= 0 ? value : 0;
});

function press(key: string): void {
  if (key === ".") {
    if (draft.value.includes(".")) return;
    draft.value = draft.value === "" ? "0." : `${draft.value}.`;
    return;
  }
  if (draft.value.length >= MAX_LENGTH) return;
  // 先頭の 0 は打ち消す（"0" のあとに 5 を押したら 5）
  draft.value = draft.value === "0" ? key : `${draft.value}${key}`;
}

function erase(): void {
  draft.value = draft.value.slice(0, -1);
}
</script>

<template>
  <div class="overlay" @click.self="emit('cancel')">
    <div class="dialog" role="dialog" aria-modal="true" :aria-label="props.label">
      <p class="target">{{ props.label }}</p>
      <p class="display">
        <span class="num">{{ shown }}</span>
        <span class="unit">{{ props.unit }}</span>
      </p>
      <div class="keys">
        <button
          v-for="key in ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0']"
          :key="key"
          type="button"
          class="key"
          @click="press(key)"
        >
          {{ key }}
        </button>
        <button type="button" class="key erase" aria-label="1 文字消す" @click="erase">⌫</button>
      </div>
      <div class="actions">
        <button type="button" class="cancel" @click="emit('cancel')">キャンセル</button>
        <button type="button" class="confirm" @click="emit('submit', parsed)">決定</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 中央の小さなダイアログ（ConfirmDialog と同じ地・同じ重ね順） */
.overlay {
  align-items: center;
  background: rgba(35, 48, 61, 0.4);
  display: flex;
  inset: 0;
  justify-content: center;
  overscroll-behavior: contain;
  padding: 24px;
  position: fixed;
  touch-action: none;
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

/* 見出しはボタンのラベルと同じ文字（14px / 600） */
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

.keys {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, 1fr);
  margin-bottom: 12px;
}

.key {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  height: 48px;
}

.erase {
  font-size: 18px;
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
