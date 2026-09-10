<script setup lang="ts">
import { useModalChrome } from "../composables/useModalChrome";

/**
 * 「はい / いいえ」で答える質問を 1 問ずつ出す中央のダイアログ（2026-09-10 ユーザー指示。
 * 取り込みの要確認をスワイプでなくダイアログで答える形に変えた）。
 * 先頭に「n 件中 m 個め」を出し、答えるとダイアログはそのままで次の問いに差し替わる
 * （呼び出し側が index を進める）。全部答えるまで画面は遷移しない。
 * 外側タップと Escape は質問そのものの取り消し（呼び出し側は前の画面へ戻す）
 */
const props = defineProps<{
  /** 1 始まりの問番 */
  step: number;
  total: number;
  /** 何についての問いか（カード名など） */
  subject: string;
  question: string;
}>();

const emit = defineEmits<{ yes: []; no: []; cancel: [] }>();

useModalChrome(() => emit("cancel"), { lockScroll: false });
</script>

<template>
  <div class="overlay" @click.self="emit('cancel')">
    <div class="dialog" role="dialog" aria-modal="true" :aria-label="props.question">
      <p class="progress">確認 {{ props.step }} / {{ props.total }}</p>
      <p class="subject">{{ props.subject }}</p>
      <p class="question">{{ props.question }}</p>
      <div class="actions">
        <button type="button" class="no" @click="emit('no')">いいえ</button>
        <button type="button" class="yes" @click="emit('yes')">はい</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 中央の小さなダイアログ（ConfirmDialog と同じ寸法・同じ地）。シートの上に重ねる */
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
  max-width: 22rem;
  padding: 20px;
  width: 100%;
}

/* 何個中の何個めか（先頭に出す — 2026-09-10 ユーザー指示） */
.progress {
  color: var(--ink-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  margin: 0 0 8px;
}

.subject {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
  margin: 0 0 4px;
}

.question {
  font-size: 14px;
  line-height: 1.6;
  margin: 0 0 16px;
}

.actions {
  display: flex;
  gap: 8px;
}

.actions button {
  border-radius: var(--r-m);
  cursor: pointer;
  flex: 1;
  font-size: 15px;
  font-weight: 700;
  height: 44px;
}

.no {
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink);
}

.yes {
  background: var(--action);
  border: none;
  color: #fff;
}
</style>
