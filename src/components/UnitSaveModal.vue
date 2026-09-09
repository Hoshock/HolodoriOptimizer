<script setup lang="ts">
import { computed, ref } from "vue";

import ConfirmDialog from "./ConfirmDialog.vue";
import UnitStar from "./UnitStar.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { UNIT_SLOT_COUNT } from "../storage/units";
import type { SavedUnit } from "../storage/units";

/**
 * 結果パネルの星から開く「いくつめに登録するか」の番号選び（2026-09-09 ユーザー指定）。
 * 1〜10 を 2 行 5 列の星で出し、登録済みの番号は星の色を変えて示す。
 * 登録済みの番号を選んだときだけ上書きの確認を挟む。
 * 全画面シートではなく中央のダイアログ（`ConfirmDialog` と同形）— 選ぶものが 10 個だけで
 * 画面遷移は重い（フルスクリーンで出した版は「そうじゃなくてダイアログ的な感じ」で差し戻し）
 */
const props = defineProps<{
  /** 登録済みのユニット（星の色を変える番号を引く） */
  units: SavedUnit[];
}>();

const emit = defineEmits<{ save: [slot: number]; close: [] }>();

useModalChrome(() => emit("close"));

const slots = Array.from({ length: UNIT_SLOT_COUNT }, (_, i) => i + 1);
const registered = computed(() => new Set(props.units.map((u) => u.slot)));
/** 上書きの確認中の番号（null = 確認していない） */
const overwriting = ref<number | null>(null);

function onPick(slot: number): void {
  if (registered.value.has(slot)) {
    overwriting.value = slot;
    return;
  }
  emit("save", slot);
}

function onOverwrite(): void {
  const slot = overwriting.value;
  overwriting.value = null;
  if (slot !== null) emit("save", slot);
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="ユニットに登録">
      <p class="message">ユニットのいくつめに登録しますか？</p>
      <div class="slot-grid">
        <button
          v-for="slot in slots"
          :key="slot"
          type="button"
          class="slot"
          :aria-label="
            registered.has(slot) ? `ユニット${slot}（登録済み）へ上書き` : `ユニット${slot}へ登録`
          "
          @click="onPick(slot)"
        >
          <UnitStar :slot-number="slot" :registered="registered.has(slot)" :size="40" />
        </button>
      </div>
      <button type="button" class="cancel" @click="emit('close')">キャンセル</button>
    </div>

    <ConfirmDialog
      v-if="overwriting !== null"
      :message="`ユニット${overwriting}を上書きしますか？`"
      confirm-label="上書きする"
      @confirm="onOverwrite"
      @cancel="overwriting = null"
    />
  </div>
</template>

<style scoped>
.overlay {
  align-items: center;
  background: rgba(35, 48, 61, 0.4);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 16px;
  position: fixed;
  z-index: 10;
}

.dialog {
  background: var(--surface);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-sheet);
  max-width: 22rem;
  padding: 16px;
  width: 100%;
}

.message {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 8px;
}

/* 1〜10 を 2 行 5 列で（2026-09-09 ユーザー指定） */
.slot-grid {
  display: grid;
  gap: 4px;
  grid-template-columns: repeat(5, 1fr);
  margin-bottom: 16px;
}

.slot {
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  height: 52px;
  justify-content: center;
  padding: 0;
}

.cancel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  height: 44px;
  width: 100%;
}
</style>
