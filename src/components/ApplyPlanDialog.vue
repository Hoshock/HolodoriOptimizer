<script setup lang="ts">
import { computed } from "vue";

import { useModalChrome } from "../composables/useModalChrome";
import { PLAN_SECTIONS } from "../ui/planSections";
import type { PlanSection } from "../ui/planSections";

/**
 * 組み直しプランの「ボードに反映」の確認(2026-10-09 ユーザー指示「ボードの反映は一部除いて反映したいことがあるので、モーダルでオプトアウトできる UI」)。
 * それまでの 2 択の確認(`ConfirmDialog`)に、変更のあるホロメンの行を足したもの。行はどれも最初は ON(反映する)で、押すと外す。
 * 並びと区分は結果のタブと同じ(リーダー・メンバー / 所属グループ / その他 — `planSections.ts`)。コネクトを回し合うホロメンは 1 行にまとめる
 * (片方だけ外すと持っている枚数を超える — `planApply.ts`)。行の下の小さな文字は変わるもの(ボード / コネクト)。
 * 全部外すと「反映する」は押せない。出口は「キャンセル」・外側タップ・Escape
 */
const props = defineProps<{
  message: string;
  rows: readonly {
    key: string;
    section: PlanSection;
    name: string;
    detail: string;
    on: boolean;
  }[];
  /** 本文の下に添える一言(資材を外して回す・足りない) */
  note?: string;
}>();

const emit = defineEmits<{ toggle: [key: string]; confirm: []; cancel: [] }>();

const sections = computed(() =>
  PLAN_SECTIONS.map((s) => ({ ...s, rows: props.rows.filter((r) => r.section === s.key) })).filter(
    (s) => s.rows.length > 0,
  ),
);
const anyOn = computed(() => props.rows.some((r) => r.on));

// 背景が見えるダイアログなのでスクロールロックはかけない(ConfirmDialog と同じ)
useModalChrome(() => emit("cancel"), { lockScroll: false });
</script>

<template>
  <div class="apply-overlay" @click.self="emit('cancel')">
    <div class="dialog" role="dialog" aria-modal="true" :aria-label="props.message">
      <p class="message">{{ props.message }}</p>
      <div class="list">
        <section v-for="s in sections" :key="s.key" class="block" :aria-label="s.label">
          <h4>{{ s.label }}</h4>
          <button
            v-for="r in s.rows"
            :key="r.key"
            type="button"
            class="row"
            role="switch"
            :aria-checked="r.on"
            @click="emit('toggle', r.key)"
          >
            <span class="text">
              <span class="name">{{ r.name }}</span>
              <span class="detail">{{ r.detail }}</span>
            </span>
            <span class="switch" :class="{ on: r.on }" aria-hidden="true">
              <span class="knob"></span>
            </span>
          </button>
        </section>
      </div>
      <p v-if="props.note" class="note">{{ props.note }}</p>
      <div class="actions">
        <button type="button" class="cancel" @click="emit('cancel')">キャンセル</button>
        <button type="button" class="confirm" :disabled="!anyOn" @click="emit('confirm')">
          反映する
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 組み直しプランのシート(z-index: 12)の上に重ねる */
.apply-overlay {
  align-items: center;
  background: rgba(35, 48, 61, 0.4);
  display: flex;
  inset: 0;
  justify-content: center;
  overscroll-behavior: contain;
  padding: 24px;
  position: fixed;
  /* 背景のスクロールは止めるが、ピンチ(拡大の戻し)はブラウザへ譲る(ConfirmDialog と同じ) */
  touch-action: pinch-zoom;
  z-index: 13;
}

.dialog {
  background: var(--surface);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-sheet);
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 48px);
  max-width: 22rem;
  padding: 16px;
  width: 100%;
}

.message {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 8px;
}

/* 行が多いときは一覧の中だけをスクロールする */
.list {
  margin: 0 -16px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 16px;
  touch-action: pan-y pinch-zoom;
}

.block {
  margin-top: 8px;
}

h4 {
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 700;
  margin: 0 0 2px;
}

.row {
  align-items: center;
  background: none;
  border: none;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  display: flex;
  gap: 12px;
  min-height: 48px;
  padding: 6px 0;
  text-align: left;
  width: 100%;
}

.text {
  display: grid;
  min-width: 0;
}

.name {
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail {
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
}

/* 行ごと 1 つのボタン(role="switch")で、ここは見た目だけ(サイドメニューの設定の行と同じトグル) */
.switch {
  background: var(--line);
  border-radius: var(--r-pill);
  display: flex;
  flex-shrink: 0;
  height: 26px;
  margin-left: auto;
  padding: 3px;
  transition: background-color 0.2s ease;
  width: 44px;
}

.switch.on {
  background: var(--selected);
}

.knob {
  background: var(--ink-2);
  border-radius: 50%;
  height: 20px;
  transition:
    transform 0.2s ease,
    background-color 0.2s ease;
  width: 20px;
}

.switch.on .knob {
  background: var(--selected-ink);
  transform: translateX(18px);
}

.note {
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 600;
  margin: 12px 0 0;
}

.actions {
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
  margin-top: 16px;
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

.confirm:disabled {
  cursor: default;
  opacity: 0.4;
}

@media (prefers-reduced-motion: reduce) {
  .switch,
  .knob {
    transition: none;
  }
}
</style>
