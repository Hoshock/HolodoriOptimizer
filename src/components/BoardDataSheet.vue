<script setup lang="ts">
import { computed, ref } from "vue";

import CloseButton from "./CloseButton.vue";
import { useBoards } from "../composables/useBoards";
import { useModalChrome } from "../composables/useModalChrome";
import {
  applyBoardsImport,
  BOARD_COLOR_LABELS,
  BOARD_COLOR_ORDER,
  parseBoardsExchange,
  planBoardsImport,
  serializeBoardsExchange,
} from "../storage/boardsExchange";
import type { BoardsByColor, BoardsImportPlan } from "../storage/boardsExchange";

/**
 * 管理用 → ホロメンボード（2026-09-11 ユーザー指示）。登録している 4 色のホロメンボードを構造化データ（JSON）として
 * コピーでき、逆に貼り付けるとボード側の状態が変わる。形は「データの取り込み」（ImportSheet）と同じ —
 * 上の枠が出力（コピー）、下の枠が入力（ペースト）、流れは **貼る → 確認 → 取り込む**。
 * 取り込みは書いてあるホロメンの 4 色を置き換える（`src/storage/boardsExchange.ts`）ので、実行前に
 * ホロメンごとの色別の解放数（いま → 後）を必ず見せ、実行したらシートを閉じる
 */
const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const boards = useBoards();
const current = computed<BoardsByColor>(() => ({
  red: boards.red.value,
  blue: boards.blue.value,
  yellow: boards.yellow.value,
  green: boards.green.value,
}));
/** 登録している状態の JSON（コピー用。開いている間に取り込めば更新される） */
const exported = computed(() => serializeBoardsExchange(current.value));

type Phase = "paste" | "review";
const phase = ref<Phase>("paste");
const text = ref("");
const error = ref<string | null>(null);
const plan = ref<BoardsImportPlan | null>(null);

/** コピーの結果はボタンのラベルで示す（2 秒で戻す） */
const copied = ref(false);
let copyTimer: number | null = null;
async function onCopy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(exported.value);
    copied.value = true;
    if (copyTimer !== null) window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // クリップボードが使えない環境では、JSON を直接選択してコピーしてもらう
  }
}

/**
 * 「ペースト」でクリップボードから流し込む。**環境によっては `readText()` が解決も失敗もしない**ので
 * 数秒で手貼りの案内を出す（ImportSheet と同じ）
 */
const PASTE_HINT_MS = 4000;
async function onPaste(): Promise<void> {
  const hint = window.setTimeout(() => {
    error.value = "クリップボードを読み取れませんでした。下の欄を長押しして貼り付けてください。";
  }, PASTE_HINT_MS);
  let clip = "";
  try {
    clip = await navigator.clipboard.readText();
  } catch {
    window.clearTimeout(hint);
    error.value = "クリップボードを読み取れませんでした。下の欄を長押しして貼り付けてください。";
    return;
  }
  window.clearTimeout(hint);
  if (clip.trim() === "") {
    error.value = "クリップボードが空です。ホロメンボードの JSON をコピーしてください。";
    return;
  }
  error.value = null;
  text.value = clip;
}

function onConfirm(): void {
  const result = parseBoardsExchange(text.value);
  if (!result.ok) {
    error.value = result.message;
    plan.value = null;
    return;
  }
  error.value = null;
  plan.value = planBoardsImport(result.rows, current.value);
  phase.value = "review";
}

function onBack(): void {
  phase.value = "paste";
  plan.value = null;
}

/** 取り込むホロメン（解放マスが変わる行だけ。変わらない行は件数だけ出す） */
const changedRows = computed(() => plan.value?.rows.filter((r) => r.changed) ?? []);
const unchangedCount = computed(() => plan.value?.rows.filter((r) => !r.changed).length ?? 0);
const unknownHolomen = computed(() => plan.value?.unknownHolomen ?? 0);
const unknownNodes = computed(() => plan.value?.unknownNodes ?? 0);

function onApply(): void {
  if (changedRows.value.length === 0) return;
  const next = applyBoardsImport(changedRows.value, current.value);
  for (const color of BOARD_COLOR_ORDER) boards[color].value = next[color];
  emit("close");
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="ホロメンボード">
      <header class="sheet-head">
        <h3>ホロメンボード</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <template v-if="phase === 'paste'">
          <!-- 上の枠: 登録している状態（コピーして持ち出す） -->
          <div class="box">
            <div class="box-head">
              <span>登録しているボード（JSON）</span>
              <button type="button" class="box-button" @click="void onCopy()">
                {{ copied ? "コピーしました" : "コピー" }}
              </button>
            </div>
            <pre class="prompt">{{ exported }}</pre>
          </div>
          <!-- 下の枠: 貼り付ける JSON（同じ形で流し込む） -->
          <div class="box">
            <div class="box-head">
              <span>貼り付けるボード（JSON）</span>
              <button type="button" class="box-button" @click="void onPaste()">ペースト</button>
            </div>
            <textarea
              v-model="text"
              class="paste"
              rows="10"
              spellcheck="false"
              aria-label="貼り付けるボード（JSON）"
              placeholder='{ "format": "holodori-optimizer/boards", "version": 1, "boards": [ … ] }'
            ></textarea>
          </div>
          <p v-if="error !== null" class="warn-text" role="alert">{{ error }}</p>
        </template>

        <template v-else>
          <!-- 取り込めない件数だけ（内容は明かさない）。区分は エラー → 変わらない → 取り込む で、0 件の行は出さない -->
          <p v-if="unknownHolomen > 0" class="block-head error-line">
            特定できないホロメン<span class="count">{{ unknownHolomen }} 件</span>
          </p>
          <p v-if="unknownNodes > 0" class="block-head error-line">
            知らないマス<span class="count">{{ unknownNodes }} 個</span>
          </p>
          <p v-if="unchangedCount > 0" class="block-head registered-line">
            変わらない<span class="count">{{ unchangedCount }} 人</span>
          </p>

          <section v-if="changedRows.length > 0" class="block">
            <h4 class="block-head">
              取り込むホロメン<span class="count">{{ changedRows.length }} 人</span>
            </h4>
            <ul class="rows">
              <li v-for="row in changedRows" :key="row.holomenId" class="row">
                <div class="row-body">
                  <span class="row-name">{{ row.holomen }}</span>
                  <!-- 色ごとの解放数: いま → 取り込み後（変わる色だけ濃く） -->
                  <span class="row-value">
                    <span
                      v-for="color in BOARD_COLOR_ORDER"
                      :key="color"
                      class="cell"
                      :class="{ changed: row.counts[color].before !== row.counts[color].after }"
                    >
                      <span class="cell-label">{{ BOARD_COLOR_LABELS[color] }}</span>
                      <span class="num">{{ row.counts[color].before }}</span>
                      <span class="arrow" aria-hidden="true">→</span>
                      <span class="num">{{ row.counts[color].after }}</span>
                    </span>
                  </span>
                </div>
              </li>
            </ul>
          </section>
        </template>
      </div>

      <div class="sheet-foot">
        <button
          v-if="phase === 'paste'"
          type="button"
          class="primary-button"
          :disabled="text.trim() === ''"
          @click="onConfirm"
        >
          内容を確認
        </button>
        <div v-else class="foot-row">
          <button type="button" class="secondary-button" @click="onBack">貼り直す</button>
          <button
            type="button"
            class="primary-button"
            :disabled="changedRows.length === 0"
            @click="onApply"
          >
            {{
              changedRows.length === 0
                ? "取り込むものがありません"
                : `${String(changedRows.length)} 人分を取り込む`
            }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 器・枠・下端の固定エリアは ImportSheet と同じ寸法 */
.overlay {
  background: rgba(35, 48, 61, 0.4);
  inset: 0;
  position: fixed;
  z-index: 10;
}

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

.sheet-head {
  align-items: center;
  background: var(--chrome-head);
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
}

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px;
}

.sheet-foot {
  background: var(--chrome-foot);
  border-top: 1px solid var(--line);
  flex-shrink: 0;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
}

.primary-button {
  background: var(--action);
  border: none;
  border-radius: var(--r-m);
  color: #fff;
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  height: 48px;
  padding: 0 24px;
  width: 100%;
}

.primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.secondary-button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  padding: 0 16px;
}

.foot-row {
  display: flex;
  gap: 8px;
}

.foot-row .secondary-button {
  flex-shrink: 0;
  height: 48px;
}

.box {
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  overflow: hidden;
}

.box-head {
  align-items: center;
  background: var(--bg);
  display: flex;
  font-size: 13px;
  font-weight: 700;
  gap: 8px;
  justify-content: space-between;
  padding: 6px 8px 6px 12px;
}

.box-button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  height: 32px;
  padding: 0 12px;
}

.prompt {
  color: var(--ink-2);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  margin: 0;
  max-height: 200px;
  overflow: auto;
  padding: 8px 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.paste {
  background: var(--surface);
  border: none;
  color: var(--ink);
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  padding: 8px 12px;
  resize: vertical;
  width: 100%;
}

.warn-text {
  color: var(--error);
  font-size: 13px;
  margin: 0;
}

.block h4 {
  font-size: 15px;
  margin: 0 0 8px;
}

.block-head {
  align-items: baseline;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.count {
  color: var(--ink-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.error-line {
  color: var(--error);
  font-size: 15px;
  font-weight: 700;
  margin: 0;
}

.error-line .count {
  color: var(--error);
}

.registered-line {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  border-bottom: 1px solid var(--line);
}

.row-body {
  align-items: center;
  display: flex;
  font-size: 12px;
  gap: 6px;
  justify-content: space-between;
  padding: 8px 4px;
  white-space: nowrap;
}

.row-name {
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 色 × いま → 後 の 4 組。変わらない色は淡く */
.row-value {
  color: var(--ink-2);
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

.cell {
  display: inline-flex;
  gap: 2px;
}

.cell.changed {
  color: var(--ink);
  font-weight: 700;
}

.cell-label {
  margin-right: 2px;
}

.num {
  font-variant-numeric: tabular-nums;
}

.arrow {
  color: var(--ink-2);
}
</style>
