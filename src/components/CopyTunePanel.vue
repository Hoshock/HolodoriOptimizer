<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import CopyButton from "./CopyButton.vue";
import { useCopyTuning } from "../composables/useCopyTuning";
import { useDarkMode } from "../composables/useDarkMode";
import { useModalChrome } from "../composables/useModalChrome";
import { useOkayuMode } from "../composables/useOkayuMode";
import { ABOUT_PLACEMENTS, buildTuningReport, changedKeysOf } from "../ui/copyTuning";
import type { AboutPlacement, CopyTuning } from "../ui/copyTuning";

/**
 * 開発用の「文言・配置」（サイドメニューの折り畳み「開発用」、カラー確認の下から開く — 2026-09-14 ユーザー指示
 * 「実機で確認したいのと調整したいので、文言や配置をいじれる開発用サブメニューを追加して。さらにその結果を
 * あなたに共有するための構造化データを共有するコピーフォームも」）。
 *
 * カラー確認（`AdminPanel.vue`）と同じく**実画面の上に固定して出す** — 直した文言をその場で見るための
 * 画面なので、地を敷かず（scrim なし・スクロールロックなし）背後をそのまま触れる。狭い画面では
 * 「たたむ」で見出しの帯だけにして、直した結果を全部見られるようにする。
 *
 * 変更はこのブラウザの localStorage にだけ残り、既定の文言（`src/ui/copyTuning.ts`）は書き換えない。
 * 決まった文言は下の「共有用データ」をコピーして渡す
 */
const emit = defineEmits<{ close: [] }>();

// 背景のスクロールはロックしない（実画面をスクロールしながら文言を見るため）。Escape で閉じる
useModalChrome(() => emit("close"), { lockScroll: false });

const { tuning, set, reset } = useCopyTuning();
const dark = useDarkMode();
const okayu = useOkayuMode();

/** 見出しの帯だけにたたむ（直した文言を実画面で見るため） */
const folded = ref(false);

type TextKey = Exclude<keyof CopyTuning, "placement">;
interface Field {
  key: TextKey;
  label: string;
  rows: number;
}
const FIELDS: readonly Field[] = [
  { key: "heading", label: "見出し（改行が折り返しの位置）", rows: 2 },
  { key: "lead", label: "説明文", rows: 6 },
  { key: "featuresTitle", label: "できることの見出し", rows: 1 },
  { key: "features", label: "できること（1 行 1 項目）", rows: 7 },
  { key: "linkLabels", label: "解説ページのリンク名（1 行 1 つ）", rows: 2 },
  { key: "shareLead", label: "共有文の 1 行目", rows: 2 },
  { key: "shareTag", label: "共有文のタグ", rows: 1 },
  { key: "notes", label: "メモ（画面には出ません。共有用データにだけ入ります）", rows: 3 },
];

function onInput(key: TextKey, event: Event): void {
  set(key, (event.target as HTMLTextAreaElement).value);
}

const changed = computed(() => changedKeysOf(tuning.value));

/** 共有用データに添える表示領域。画面を回したり幅を変えたりしたら取り直す */
const viewport = ref({ width: 0, height: 0 });
function readViewport(): void {
  viewport.value = { width: window.innerWidth, height: window.innerHeight };
}
onMounted(() => {
  readViewport();
  window.addEventListener("resize", readViewport);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", readViewport);
});

const report = computed(() =>
  buildTuningReport(tuning.value, {
    viewport: viewport.value,
    dark: dark.active.value,
    okayu: okayu.active.value,
  }),
);
</script>

<template>
  <div class="dock" role="dialog" aria-label="開発用画面（文言・配置）">
    <div class="dock-head">
      <span class="dock-title">
        文言・配置
        <span v-if="changed.length > 0" class="changed">{{ changed.length }}件変更</span>
      </span>
      <div class="dock-head-end">
        <button
          type="button"
          class="fold-toggle"
          :aria-expanded="!folded"
          aria-controls="tune-body"
          @click="folded = !folded"
        >
          {{ folded ? "ひらく" : "たたむ" }}
        </button>
        <button
          type="button"
          class="dock-close"
          aria-label="開発用画面を閉じる"
          @click="emit('close')"
        >
          <span class="bar" aria-hidden="true"></span>
          <span class="bar" aria-hidden="true"></span>
        </button>
      </div>
    </div>

    <div v-show="!folded" id="tune-body" class="body">
      <div class="field">
        <span class="field-label">説明セクションの位置</span>
        <div class="chips" role="group" aria-label="説明セクションの位置">
          <button
            v-for="item in ABOUT_PLACEMENTS"
            :key="item.value"
            type="button"
            class="chip"
            role="radio"
            :aria-checked="tuning.placement === item.value"
            :class="{ active: tuning.placement === item.value }"
            @click="set('placement', item.value as AboutPlacement)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <label v-for="field in FIELDS" :key="field.key" class="field">
        <span class="field-label">{{ field.label }}</span>
        <textarea
          class="field-input"
          :rows="field.rows"
          :value="tuning[field.key]"
          @input="onInput(field.key, $event)"
        ></textarea>
      </label>

      <button type="button" class="reset" :disabled="changed.length === 0" @click="reset()">
        既定に戻す
      </button>

      <div class="field">
        <div class="field-head">
          <span class="field-label">共有用データ（この内容をコピーして渡す）</span>
          <CopyButton :text="report" label="共有用データをコピー" />
        </div>
        <!-- 読み取り専用の欄で、枠の中だけをスクロールする（ExportSheet と同じ形） -->
        <textarea class="field-input report" readonly rows="6" :value="report"></textarea>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 実画面の上に固定する操作パネル。地は敷かない（背後をそのまま触れる。AdminPanel と同形） */
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
  z-index: 21; /* サイドメニュー(20)より上。開いたまま各シートの文言も見られる */
}

/* 中身は本文と同じ幅に収める（広い画面で欄が間延びしないように。--content と同じ 44rem） */
.dock-head,
.body {
  margin: 0 auto;
  max-width: 44rem;
  width: 100%;
}

.dock-head {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.dock-title {
  align-items: center;
  display: flex;
  font-size: 14px;
  font-weight: 700;
  gap: 8px;
}

/* 既定から動かした項目の数。触ったことが畳んだ状態でも分かるように */
.changed {
  background: var(--selected);
  border-radius: var(--r-pill);
  color: var(--selected-ink);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
}

.dock-head-end {
  align-items: center;
  display: flex;
  gap: 8px;
}

.fold-toggle {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  color: var(--ink);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  height: 32px;
  padding: 0 12px;
}

/* 閉じるボタンは共通の ✕ の形を 32px に縮めたもの(バーの高さを抑える。AdminPanel と同じ) */
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

/* 欄が増えても実画面が見えるように、パネル自体の高さを抑えて中だけスクロールする */
.body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 52dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-head {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.field-label {
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 700;
}

.field-input {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  padding: 8px;
  resize: vertical;
  width: 100%;
}

.report {
  background: var(--bg);
  font-size: 12px;
}

.chips {
  display: flex;
  gap: 8px;
}

/* 選択スタイルは全画面で 1 種類(--selected の地 + --selected-ink の文字 — ui-design.md) */
.chip {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  color: var(--ink);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  height: 32px;
  padding: 0 14px;
}

.chip.active {
  background: var(--selected);
  border-color: var(--selected);
  color: var(--selected-ink);
}

.reset {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  min-height: 40px;
  width: 100%;
}

.reset:disabled {
  color: var(--ink-2);
  cursor: default;
  opacity: 0.5;
}
</style>
