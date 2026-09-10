<script setup lang="ts">
import { computed, ref } from "vue";

import CloseButton from "./CloseButton.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { useOwnedCards } from "../composables/useOwnedCards";
import { applyOwnedEntries, parseImport, planOwnedImport } from "../storage/import";
import type { OwnedImportPlan } from "../storage/import";
import { OWNED_IMPORT_PLACEHOLDER, OWNED_IMPORT_PROMPT } from "../ui/importPrompt";

/**
 * スクショから作った構造化データ（インポート用 JSON）を貼り付けて所持メンバーを登録する
 * （2026-09-10 ユーザー指示。入口はサイドメニューの一番上）。
 * **貼る → 確認（差分） → 取り込む** の 2 段で、確認を見てからでないと保存せず、
 * 取り込んだらシートを閉じてメイン画面へ戻る（取り込み後の結果画面は「不要」— 2026-09-10）。
 *
 * 確認は行単位で操作する: 「要確認」の行は左スワイプ →「確認」で下の「取り込む内容」へ
 * 入り（並びは JSON の順）、取り込む行は左スワイプ →「削除」で外せる。要確認が残った
 * まま実行しようとしたときだけ `ConfirmDialog` を挟む（2026-09-10 ユーザー指示）。
 * 形式の定義は `.claude/skills/structure-import/`
 */
const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const owned = useOwnedCards();

const text = ref("");
const error = ref<string | null>(null);
const plan = ref<OwnedImportPlan | null>(null);
/** 要確認のうち確認済みのもの（entries は カード ID、notices は行番号） */
const confirmedIds = ref(new Set<string>());
const dismissedNotices = ref(new Set<number>());
/** 取り込む行から外したもの（カード ID） */
const excluded = ref(new Set<string>());
/** 要確認が残ったまま実行しようとしたときの確認ダイアログ */
const askOpen = ref(false);
/** コピーの結果はボタンのラベルで示す（2 秒で戻す） */
const copied = ref(false);
let copyTimer: number | null = null;

async function onCopy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(OWNED_IMPORT_PROMPT);
    copied.value = true;
    if (copyTimer !== null) window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // クリップボードが使えない環境では、プロンプトを直接選択してコピーしてもらう
  }
}

/**
 * スワイプで隠れているボタンを出す（よくあるリストの操作）。開くのは 1 行だけ。
 * 行の鍵は `entry:<カード ID>` / `notice:<行番号>`
 */
const REVEAL_WIDTH = 76;
const openKey = ref<string | null>(null);
const dragKey = ref<string | null>(null);
const dragStartX = ref(0);
const dragDx = ref(0);

function offsetOf(key: string): number {
  if (dragKey.value === key) return dragDx.value;
  return openKey.value === key ? -REVEAL_WIDTH : 0;
}

function onRowDown(key: string, event: PointerEvent): void {
  dragKey.value = key;
  dragStartX.value = event.clientX;
  dragDx.value = openKey.value === key ? -REVEAL_WIDTH : 0;
}

function onRowMove(event: PointerEvent): void {
  if (dragKey.value === null) return;
  const base = openKey.value === dragKey.value ? -REVEAL_WIDTH : 0;
  dragDx.value = Math.min(0, Math.max(-REVEAL_WIDTH, base + (event.clientX - dragStartX.value)));
}

function onRowUp(): void {
  const key = dragKey.value;
  if (key === null) return;
  openKey.value = dragDx.value < -REVEAL_WIDTH / 2 ? key : null;
  dragKey.value = null;
  dragDx.value = 0;
}

/** 要確認の行を確認した: entries は取り込む対象へ、notices は見たものとして消す */
function onConfirmEntry(id: string): void {
  confirmedIds.value = new Set([...confirmedIds.value, id]);
  openKey.value = null;
}

function onDismissNotice(index: number): void {
  dismissedNotices.value = new Set([...dismissedNotices.value, index]);
  openKey.value = null;
}

/** その行を取り込まない（「貼り直す」で戻る） */
function onExclude(id: string): void {
  excluded.value = new Set([...excluded.value, id]);
  openKey.value = null;
}

/** 要確認: 確認したら取り込む行（caution つき）+ 取り込まない・読めなかった行 */
const cautionRows = computed(() => {
  const current = plan.value;
  if (current === null) return [];
  return current.entries
    .filter((row) => row.caution !== null && !confirmedIds.value.has(row.id))
    .map((row) => ({
      key: `entry:${row.id}`,
      id: row.id,
      // 読み取った表記を見出しに、読み替え後（データ側の正式名）を問いに置く
      label: `${row.readHolomen}「${row.readCard}」`,
      reason: row.caution ?? "",
    }));
});

const noticeRows = computed(() => {
  const current = plan.value;
  if (current === null) return [];
  return current.notices
    .map((row, index) => ({ key: `notice:${String(index)}`, index, ...row }))
    .filter((row) => !dismissedNotices.value.has(row.index));
});

const reviewCount = computed(() => cautionRows.value.length + noticeRows.value.length);

/** 取り込む内容（並びは JSON の順のまま。確認前の caution 行と外した行は入らない） */
const importRows = computed(() => {
  const current = plan.value;
  if (current === null) return [];
  return current.entries
    .filter(
      (row) =>
        (row.caution === null || confirmedIds.value.has(row.id)) && !excluded.value.has(row.id),
    )
    .map((row) => ({
      key: `entry:${row.id}`,
      id: row.id,
      holomen: row.holomen,
      card: row.card,
      isNew: row.kind === "add",
      bloom:
        row.kind === "add"
          ? `${String(row.bloom)}凸`
          : `${String(row.from ?? 0)}凸 → ${String(row.bloom)}凸`,
    }));
});

const changeCount = computed(() => importRows.value.length);

function resetChoices(): void {
  confirmedIds.value = new Set();
  dismissedNotices.value = new Set();
  excluded.value = new Set();
  openKey.value = null;
  askOpen.value = false;
}

function onConfirm(): void {
  const result = parseImport(text.value);
  if (!result.ok) {
    error.value = result.message;
    plan.value = null;
    return;
  }
  error.value = null;
  resetChoices();
  plan.value = planOwnedImport(result.value, owned.value);
}

function apply(): void {
  const current = plan.value;
  if (current === null) return;
  const ids = new Set(importRows.value.map((row) => row.id));
  owned.value = applyOwnedEntries(
    current.entries.filter((row) => ids.has(row.id)),
    owned.value,
  );
  emit("close");
}

/** 要確認が残っているときは一応ダイアログで確かめる */
function onApply(): void {
  if (reviewCount.value > 0) {
    askOpen.value = true;
    return;
  }
  apply();
}

function onBack(): void {
  plan.value = null;
  resetChoices();
}

/**
 * 「ペースト」でクリップボードから流し込む（キーボードを出さずに済ませたい —
 * 2026-09-10 ユーザー指示）。iOS Safari は読み取りに確認ダイアログを出すので待つが、
 * **環境によっては `readText()` が解決も失敗もしない**（headless の Chromium で確認）。
 * 押しても何も起きない状態を避けるため、数秒で手貼りの案内を出しておく
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
    error.value = "クリップボードが空です。取り込み用データをコピーしてください。";
    return;
  }
  error.value = null;
  text.value = clip;
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="データの取り込み">
      <header class="sheet-head">
        <h3>データの取り込み</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <!-- 1 段目: 貼り付け -->
        <template v-if="plan === null">
          <div class="box">
            <div class="box-head">
              <span>AI に渡すプロンプト</span>
              <button type="button" class="box-button" @click="void onCopy()">
                {{ copied ? "コピーしました" : "コピー" }}
              </button>
            </div>
            <pre class="prompt">{{ OWNED_IMPORT_PROMPT }}</pre>
          </div>
          <!-- 出力の受け口も同じ枠で、右上のボタンでクリップボードから流し込む（2026-09-10 ユーザー指示） -->
          <div class="box">
            <div class="box-head">
              <span>AI が出力した JSON</span>
              <button type="button" class="box-button" @click="void onPaste()">ペースト</button>
            </div>
            <textarea
              v-model="text"
              class="paste"
              rows="12"
              spellcheck="false"
              aria-label="AI が出力した JSON"
              :placeholder="OWNED_IMPORT_PLACEHOLDER"
            ></textarea>
          </div>
          <p v-if="error !== null" class="warn-text" role="alert">{{ error }}</p>
        </template>

        <!-- 2 段目: 確認（差分）。件数は見出しの右端の値として置く -->
        <template v-else>
          <section v-if="reviewCount > 0" class="block">
            <h4 class="block-head">
              要確認<span class="count">{{ reviewCount }} 件</span>
            </h4>
            <!-- 左スワイプで「確認」。確認したものは下の「取り込む内容」へ入る -->
            <ul class="rows">
              <li v-for="row in cautionRows" :key="row.key" class="row">
                <button
                  type="button"
                  class="row-action confirm"
                  :aria-label="`${row.label} を取り込む`"
                  @click="onConfirmEntry(row.id)"
                >
                  取り込む
                </button>
                <div
                  class="row-body review"
                  :class="{ dragging: dragKey === row.key }"
                  :style="{ transform: `translateX(${String(offsetOf(row.key))}px)` }"
                  @pointerdown="onRowDown(row.key, $event)"
                  @pointermove="onRowMove"
                  @pointerup="onRowUp"
                  @pointercancel="onRowUp"
                >
                  <span class="review-label">{{ row.label }}</span>
                  <span class="review-reason">{{ row.reason }}</span>
                </div>
              </li>
              <li v-for="row in noticeRows" :key="row.key" class="row">
                <button
                  type="button"
                  class="row-action confirm"
                  :aria-label="`${row.label} を確認した`"
                  @click="onDismissNotice(row.index)"
                >
                  確認
                </button>
                <div
                  class="row-body review"
                  :class="{ dragging: dragKey === row.key }"
                  :style="{ transform: `translateX(${String(offsetOf(row.key))}px)` }"
                  @pointerdown="onRowDown(row.key, $event)"
                  @pointermove="onRowMove"
                  @pointerup="onRowUp"
                  @pointercancel="onRowUp"
                >
                  <span class="review-label">{{ row.label }}</span>
                  <span class="review-reason">{{ row.reason }}</span>
                </div>
              </li>
            </ul>
          </section>

          <section v-if="importRows.length > 0" class="block">
            <h4 class="block-head">
              取り込む内容<span class="count">{{ importRows.length }} 件</span>
            </h4>
            <!-- 行は左スワイプで「削除」（取り込まない）。貼り直せば戻る -->
            <ul class="rows">
              <li v-for="row in importRows" :key="row.key" class="row">
                <button
                  type="button"
                  class="row-action delete"
                  :aria-label="`${row.holomen} ${row.card} を取り込まない`"
                  @click="onExclude(row.id)"
                >
                  削除
                </button>
                <div
                  class="row-body"
                  :class="{ dragging: dragKey === row.key }"
                  :style="{ transform: `translateX(${String(offsetOf(row.key))}px)` }"
                  @pointerdown="onRowDown(row.key, $event)"
                  @pointermove="onRowMove"
                  @pointerup="onRowUp"
                  @pointercancel="onRowUp"
                >
                  <span class="row-name"
                    >{{ row.holomen }}<span class="card-name">{{ row.card }}</span></span
                  >
                  <span class="row-value">
                    <span v-if="row.isNew" class="new-mark">新規</span>{{ row.bloom }}
                  </span>
                </div>
              </li>
            </ul>
          </section>
        </template>
      </div>

      <!-- 下端の固定エリア: 段ごとの操作（1 段目は確認へ、2 段目は貼り直す / 取り込む） -->
      <div class="sheet-foot">
        <button
          v-if="plan === null"
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
            :disabled="changeCount === 0"
            @click="onApply"
          >
            {{
              changeCount === 0 ? "取り込むものがありません" : `${String(changeCount)} 件を取り込む`
            }}
          </button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-if="askOpen"
      :message="`要確認が ${String(reviewCount)} 件残っています。このまま ${String(changeCount)} 件を取り込みますか？`"
      confirm-label="取り込む"
      @confirm="apply"
      @cancel="askOpen = false"
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

/* モバイルはフルスクリーンシート、広い画面では中央のダイアログ（結果詳細と同型） */
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
  padding: 16px;
}

.sheet-foot {
  background: var(--chrome-foot);
  border-top: 1px solid var(--line);
  flex-shrink: 0;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
}

/* 操作ボタンはメイン画面と同じ寸法・同じ色（primary = 実行の緑、secondary = 白地） */
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

/* 貼り直す（内容幅）と取り込む（残り全部）を 1 行に置く */
.foot-row {
  display: flex;
  gap: 8px;
}

.foot-row .secondary-button {
  flex-shrink: 0;
  height: 48px;
}

/* プロンプトと JSON を同じ枠（ヘッダ + 中身）で並べる */
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

/* 貼り付け欄。枠は .box が持つので自前の枠線は持たない。自動フォーカスはしない
   （モバイルでキーボードが勝手に開く） */
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

/* 見出しの右端に件数（メイン画面の行ボタンと同じ「ラベル左・値右」） */
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

/* 新規の行だけ値の前に置く印（更新は n凸 → m凸 の矢印で見分けがつく） */
.new-mark {
  color: var(--ink-2);
  font-size: 11px;
  font-weight: 600;
  margin-right: 6px;
}

/* 要確認: 対象と理由を 1 件ずつ縦に。取り込まないものなので上に置く */
.review {
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.review li {
  border-left: 3px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 8px;
}

.review-label {
  font-size: 13px;
  font-weight: 700;
}

.review-reason {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.5;
}

/* 取り込む行。左へスワイプすると下から「削除」が出る（よくあるリストの操作） */
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  border-bottom: 1px solid var(--line);
  overflow: hidden;
  position: relative;
}

/* 隠れている操作（スワイプで出る）。取り込む = 実行の緑、削除 = エラーの赤 */
.row-action {
  border: none;
  bottom: 0;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  padding: 0;
  position: absolute;
  right: 0;
  top: 0;
  width: 76px;
}

.row-action.confirm {
  background: var(--action);
}

.row-action.delete {
  background: var(--error);
}

.row-body {
  align-items: baseline;
  background: var(--surface);
  display: flex;
  font-size: 12px;
  gap: 6px;
  justify-content: space-between;
  padding: 8px 4px;
  position: relative;
  touch-action: pan-y;
  transition: transform 0.2s ease;
  white-space: nowrap;
}

/* 要確認の行は 2 行組（読み取った表記 → 問い）。理由は折り返す */
.row-body.review {
  align-items: flex-start;
  flex-direction: column;
  gap: 2px;
  padding: 8px 4px;
  white-space: normal;
}

/* 指に追従している間はアニメーションを切る（PageCarousel と同じ扱い） */
.row-body.dragging {
  transition: none;
}

.row-name {
  display: flex;
  font-weight: 700;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.row-value {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

/* 結果詳細と同じ表（行見出し左・値右） */
.param-table {
  border-collapse: collapse;
  font-size: 12px;
  width: 100%;
}

.param-table th,
.param-table td {
  border-bottom: 1px solid var(--line);
  padding: 6px 4px;
  text-align: left;
}

/* 行見出しはホロメン名 + カード名（サブタイトル）。**必ず 1 行**に収め、長いカード名は
   省略記号にする（2 行になるのを嫌う — 2026-09-10 ユーザー指示。表のセルは 1 行の既存規則） */
.param-table tbody th {
  align-items: baseline;
  display: flex;
  font-weight: 700;
  gap: 6px;
  min-width: 0;
  white-space: nowrap;
}

.param-table .num {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

/* カード名はホロメン名の隣に淡色で（一覧・詳細と同じ隣接）。余りを使って 1 行で省略する */
.card-name {
  color: var(--ink-2);
  flex: 1;
  font-weight: 400;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
