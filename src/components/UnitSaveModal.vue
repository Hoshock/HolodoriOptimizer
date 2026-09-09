<script setup lang="ts">
import { computed, ref } from "vue";

import CloseButton from "./CloseButton.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import UnitStar from "./UnitStar.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { UNIT_SLOT_COUNT } from "../storage/units";
import type { SavedUnit } from "../storage/units";

/**
 * 結果パネルの ⭐ から開く「いくつめに登録するか」の番号選び（2026-09-09 ユーザー指定）。
 * 1〜10 を 2 行 5 列の星で出し、登録済みの番号は星の色を変えて示す。
 * 登録済みの番号を選んだときだけ上書きの確認を挟む
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
    <div class="sheet" role="dialog" aria-modal="true" aria-label="ユニットに登録">
      <header class="sheet-head">
        <h3>ユニットに登録</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <p class="prompt">ユニットのいくつめに登録しますか？</p>
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
            <UnitStar :slot-number="slot" :registered="registered.has(slot)" :size="44" />
          </button>
        </div>
      </div>
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
  background: rgba(35, 48, 61, 0.4);
  inset: 0;
  position: fixed;
  z-index: 10;
}

/* モバイルはフルスクリーンシート、広い画面では中央のダイアログ(CardPicker と同型) */
.sheet {
  background: var(--surface);
  box-shadow: var(--shadow-sheet);
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  width: 100%;
}

@media (min-width: 48rem) {
  .overlay {
    align-items: center;
    display: flex;
    justify-content: center;
    padding: 24px;
  }

  .sheet {
    border-radius: var(--r-m);
    height: min(85dvh, 46rem);
    max-width: 46rem;
  }
}

/* ページヘッダ・ピッカーと同寸法(77px)・同文字サイズ(24px/900) */
.sheet-head {
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  justify-content: space-between;
  padding: 16px;
}

.sheet-head h3 {
  font-size: 24px;
  font-weight: 900;
  line-height: 1.35;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.prompt {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

/* 1〜10 を 2 行 5 列で（2026-09-09 ユーザー指定） */
.slot-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(5, 1fr);
}

.slot {
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  height: 56px;
  justify-content: center;
  padding: 0;
}
</style>
