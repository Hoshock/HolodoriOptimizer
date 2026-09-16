<script setup lang="ts">
import { nextTick, onMounted, ref, useTemplateRef } from "vue";

import { useModalChrome } from "../composables/useModalChrome";
import { UNIT_NAME_MAX_LENGTH } from "../storage/units";

/**
 * お気に入りユニットの名前を付け直す中央ダイアログ（2026-09-15 ユーザー指示。最大 10 文字）。
 * 形は ConfirmDialog と同じ（中央の小さなカード・地・寸法・キャンセル / 決定）。
 *
 * **ここは自動フォーカスする**（2026-09-15 ユーザー指示）。「モーダルで自動フォーカスしない」規則の例外で、
 * 鉛筆を押した時点で打つことが決まっているので、キーボードが出るのが正しい。カーソルは末尾に置く。
 * 上限は `maxlength` で入力の時点で止め、エラーは出さない（テンキーの範囲外と同じ扱い）。
 * 空のまま決定すると名前なし（「ユニット{番号}」表示）へ戻る
 */
const props = defineProps<{
  /** いまの名前（付けていなければ空文字） */
  value: string;
  /** 見出しに出す番号（`slot` は Vue の予約語と紛れるので UnitStar と同じ `slotNumber`） */
  slotNumber: number;
}>();

const emit = defineEmits<{ submit: [name: string]; cancel: [] }>();

useModalChrome(() => emit("cancel"), { lockScroll: false });

const draft = ref(props.value);
const input = useTemplateRef<HTMLInputElement>("input");
onMounted(() => {
  void nextTick(() => {
    const el = input.value;
    if (!el) return;
    el.focus();
    // 既存の名前を消さずに続きから打てるよう、カーソルは末尾へ
    el.setSelectionRange(el.value.length, el.value.length);
  });
});
</script>

<template>
  <div class="overlay" @click.self="emit('cancel')">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="`ユニット${String(props.slotNumber)}の名前`"
    >
      <p class="message">ユニット{{ props.slotNumber }}の名前</p>
      <input
        ref="input"
        v-model="draft"
        type="text"
        class="name-input"
        :maxlength="UNIT_NAME_MAX_LENGTH"
        :placeholder="`ユニット${String(props.slotNumber)}`"
        @keydown.enter.prevent="emit('submit', draft)"
      />
      <div class="actions">
        <button type="button" class="cancel" @click="emit('cancel')">キャンセル</button>
        <button type="button" class="confirm" @click="emit('submit', draft)">決定</button>
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
  padding: 24px;
  position: fixed;
  /* 背景のスクロールは止めるが、ピンチ(拡大の戻し)はブラウザへ譲る — none だと戻せなくなる(2026-09-16) */
  touch-action: pinch-zoom;
  /* シート(10)・その上の詳細(11)より上に重ねる */
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

.message {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 12px;
}

.name-input {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: inherit;
  /* iOS の自動ズーム防止のため 16px 未満にしない(15px にしていたら、名前を打ったあと画面が拡大したままになった
     — 2026-09-16 ユーザー報告)。ピッカーの検索欄と同じ扱い */
  font-size: 16px;
  height: 44px;
  margin-bottom: 16px;
  padding: 0 12px;
  width: 100%;
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
}

.confirm {
  background: var(--action);
  border: none;
  color: #fff;
}
</style>
