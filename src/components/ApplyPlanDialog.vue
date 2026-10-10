<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useModalChrome } from "../composables/useModalChrome";
import type { ApplyKind } from "../ui/planApply";
import { PLAN_SECTIONS } from "../ui/planSections";
import type { PlanSection } from "../ui/planSections";

/**
 * 組み直しプランの「ボードに反映」の確認(2026-10-09 ユーザー指示「ボードの反映は一部除いて反映したいことがあるので、モーダルでオプトアウトできる UI」、
 * 同日「モーダル内でもタブフィルタ入れて。ボードとコネクトの 2 つのタブと、リーダーメンバーとかのフィルタも。それぞれごとに外せるように」)。
 * 上から 問い → タブ「ボード / コネクト」(頻度マスはボードに含む)→ 区分のタブ「リーダー・メンバー / 所属グループ / その他」(結果のタブと同じ —
 * `planSections.ts`)→ 行(ホロメンごとのトグル。最初はどれも ON で、押すと外す)→ 一言 → キャンセル / 反映する。
 * 行のないタブ・区分は disabled。行は基本は独立で、片方だけでは成り立たない行だけトグルが連動する(`planApply.ts`。文字の補足は付けない — 2026-10-09 ユーザー指示)。
 * 全部外すと「反映する」は押せない。高さはタブを切り替えても変えない
 */
interface Row {
  key: string;
  kind: ApplyKind;
  section: PlanSection;
  name: string;
  on: boolean;
}
const props = defineProps<{
  message: string;
  rows: readonly Row[];
  /** 本文の下に添える一言(足りない資材・外れるコネクト)。共通の赤いエラー文で出す(2026-10-10) */
  note?: string;
}>();

const emit = defineEmits<{ toggle: [key: string]; confirm: []; cancel: [] }>();

const KINDS: readonly { key: ApplyKind; label: string }[] = [
  { key: "board", label: "ボード" },
  { key: "connect", label: "コネクト" },
];
const count = (kind: ApplyKind, section?: PlanSection): number =>
  props.rows.filter((r) => r.kind === kind && (section === undefined || r.section === section))
    .length;
const kind = ref<ApplyKind>(count("board") > 0 ? "board" : "connect");
const section = ref<PlanSection>("unit");
/** 選んでいる区分に行がなければ、行のある最初の区分へ移る */
watch(
  kind,
  (k) => {
    if (count(k, section.value) === 0)
      section.value = PLAN_SECTIONS.find((s) => count(k, s.key) > 0)?.key ?? "unit";
  },
  { immediate: true },
);
const shown = computed(() =>
  props.rows.filter((r) => r.kind === kind.value && r.section === section.value),
);
const anyOn = computed(() => props.rows.some((r) => r.on));

// 背景が見えるダイアログなのでスクロールロックはかけない(ConfirmDialog と同じ)
useModalChrome(() => emit("cancel"), { lockScroll: false });
</script>

<template>
  <div class="apply-overlay" @click.self="emit('cancel')">
    <div class="dialog" role="dialog" aria-modal="true" :aria-label="props.message">
      <p class="message">{{ props.message }}</p>
      <div class="segment kinds" role="tablist" aria-label="反映するもの">
        <button
          v-for="k in KINDS"
          :key="k.key"
          type="button"
          class="seg"
          role="tab"
          :aria-selected="kind === k.key"
          :class="{ 'seg-active': kind === k.key }"
          :disabled="count(k.key) === 0"
          @click="kind = k.key"
        >
          {{ k.label }}
        </button>
      </div>
      <div class="segment sections" role="tablist" aria-label="区分">
        <button
          v-for="s in PLAN_SECTIONS"
          :key="s.key"
          type="button"
          class="seg"
          role="tab"
          :aria-selected="section === s.key"
          :class="{ 'seg-active': section === s.key }"
          :disabled="count(kind, s.key) === 0"
          @click="section = s.key"
        >
          {{ s.label }}
        </button>
      </div>
      <div class="list">
        <button
          v-for="r in shown"
          :key="r.key"
          type="button"
          class="row"
          role="switch"
          :aria-checked="r.on"
          @click="emit('toggle', r.key)"
        >
          <span class="name">{{ r.name }}</span>
          <span class="switch" :class="{ on: r.on }" aria-hidden="true">
            <span class="knob"></span>
          </span>
        </button>
      </div>
      <p v-if="props.note" class="error-text note">{{ props.note }}</p>
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

/* 高さはタブ・区分を切り替えても変えない(行の多少で揺らさない) */
.dialog {
  background: var(--surface);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-sheet);
  display: flex;
  flex-direction: column;
  height: min(36rem, calc(100dvh - 48px));
  max-width: 22rem;
  padding: 16px;
  width: 100%;
}

.message {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 12px;
}

/* 排他の選択(反映するもの・区分): 境界線でつながったセグメント(組み直しプランのタブと同形) */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  flex-shrink: 0;
  grid-auto-columns: 1fr;
  grid-auto-flow: column;
  height: 32px;
  overflow: hidden;
}

.segment + .segment {
  margin-top: 8px;
}

.seg {
  background: var(--surface);
  border: none;
  border-left: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  padding: 0 2px;
  white-space: nowrap;
}

.seg:first-child {
  border-left: none;
}

.seg:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.seg-active {
  background: var(--selected);
  color: var(--selected-ink);
  font-weight: 700;
}

/* 行が多いときは一覧の中だけをスクロールする(残りの高さを一覧が取る) */
.list {
  flex: 1;
  margin: 4px -16px 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 16px;
  touch-action: pan-y pinch-zoom;
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

.name {
  font-size: 14px;
  min-width: 0;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  margin-top: 12px;
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
