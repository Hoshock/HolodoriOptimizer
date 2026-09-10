<script setup lang="ts">
import { computed, ref } from "vue";

import CloseButton from "./CloseButton.vue";
import QuestionDialog from "./QuestionDialog.vue";
import SkillIcon from "./SkillIcon.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { useOwnedCards } from "../composables/useOwnedCards";
import { applyOwnedEntries, parseImport, planOwnedImport } from "../storage/import";
import type { OwnedImportEntry, OwnedImportPlan } from "../storage/import";
import { OWNED_IMPORT_PLACEHOLDER, OWNED_IMPORT_PROMPT } from "../ui/importPrompt";

/**
 * スクショから作った構造化データ（インポート用 JSON）を貼り付けて所持メンバーを登録する
 * （2026-09-10 ユーザー指示。入口はサイドメニューの一番上）。
 *
 * 流れは **貼る → （はい / いいえの質問）→ 取り込むカードの確認 → 取り込む**。
 * 読み替えや未読取のように人が決めるべきものは「内容を確認」を押した時点で
 * 貼り付け画面の上に中央ダイアログを出し、1 問ずつ答えさせる（全部答えるまで
 * 画面は遷移しない）。答え終わってから取り込むカードの一覧へ進む。
 * 人が決められないもの（カード名が見つからない等）は件数だけ「取り込みエラー」として
 * 出し、内容は明かさない。スワイプ操作は「初見でわからない」ため 2026-09-10 に撤去した。
 * 形式の定義は `.claude/skills/structure-import/`
 */
const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const owned = useOwnedCards();

/** 画面の段: 貼る → 質問 → 取り込むカードの確認 */
type Phase = "paste" | "asking" | "review";

const phase = ref<Phase>("paste");
const text = ref("");
const error = ref<string | null>(null);
const plan = ref<OwnedImportPlan | null>(null);
/** はい / いいえで答える行（JSON 順）と、いま何個めか・答え */
const questions = ref<OwnedImportEntry[]>([]);
const step = ref(0);
const answers = ref(new Map<string, boolean>());
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

const currentQuestion = computed(() => questions.value[step.value] ?? null);

/** 取り込むカード（JSON 順。質問に「はい」と答えたものを含む） */
const importRows = computed(() => {
  const current = plan.value;
  if (current === null) return [];
  return current.entries
    .filter((row) => row.caution === null || answers.value.get(row.id) === true)
    .map((row) => ({
      id: row.id,
      holomen: row.holomen,
      card: row.card,
      /** 取り込んだ後の開花段階（前の段階は出さない — 2026-09-10 ユーザー指示） */
      bloom: row.bloom,
    }));
});

/** 人が決められない行の件数（内容は出さない） */
const errorCount = computed(() => plan.value?.notices.length ?? 0);
/** すでに同じ内容で登録済みだった件数（取り込んでも変わらない） */
const registeredCount = computed(() => plan.value?.unchanged ?? 0);

function onConfirm(): void {
  const result = parseImport(text.value);
  if (!result.ok) {
    error.value = result.message;
    plan.value = null;
    return;
  }
  error.value = null;
  const next = planOwnedImport(result.value, owned.value);
  plan.value = next;
  questions.value = next.entries.filter((row) => row.caution !== null);
  answers.value = new Map();
  step.value = 0;
  phase.value = questions.value.length > 0 ? "asking" : "review";
}

/** 1 問答えたらダイアログのまま次の問いへ。最後まで答えたら一覧へ進む */
function onAnswer(yes: boolean): void {
  const question = currentQuestion.value;
  if (question === null) return;
  answers.value = new Map(answers.value).set(question.id, yes);
  if (step.value + 1 < questions.value.length) {
    step.value += 1;
    return;
  }
  phase.value = "review";
}

/** 質問をやめる（貼り付け画面に戻る。JSON はそのまま残す） */
function onCancelAsk(): void {
  phase.value = "paste";
  plan.value = null;
  questions.value = [];
  answers.value = new Map();
  step.value = 0;
}

function onApply(): void {
  const current = plan.value;
  if (current === null) return;
  const ids = new Set(importRows.value.map((row) => row.id));
  owned.value = applyOwnedEntries(
    current.entries.filter((row) => ids.has(row.id)),
    owned.value,
  );
  emit("close");
}

function onBack(): void {
  onCancelAsk();
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
        <!-- 1 段目: 貼り付け（質問中もこの画面のまま。上にダイアログが乗る） -->
        <template v-if="phase !== 'review'">
          <div class="box">
            <div class="box-head">
              <span>AI に渡すプロンプト</span>
              <button type="button" class="box-button" @click="void onCopy()">
                {{ copied ? "コピーしました" : "コピー" }}
              </button>
            </div>
            <pre class="prompt">{{ OWNED_IMPORT_PROMPT }}</pre>
          </div>
          <!-- 出力の受け口も同じ枠で、右上のボタンでクリップボードから流し込む -->
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

        <!-- 2 段目: 取り込むカードの一覧（質問に全部答えてから来る） -->
        <template v-else>
          <!-- 取り込めなかった件数だけ（内容は明かさない）。「取り込むカード」の見出しと同じ両端揃え -->
          <p v-if="errorCount > 0" class="block-head error-line">
            取り込みエラー<span class="count">{{ errorCount }} 件</span>
          </p>
          <!-- すでに同じ内容で登録済みの件数。0 件なら行そのものを出さない（2026-09-10 ユーザー指示） -->
          <p v-if="registeredCount > 0" class="block-head registered-line">
            登録済み<span class="count">{{ registeredCount }} 件</span>
          </p>

          <section v-if="importRows.length > 0" class="block">
            <h4 class="block-head">
              取り込むカード<span class="count">{{ importRows.length }} 件</span>
            </h4>
            <ul class="rows">
              <li v-for="row in importRows" :key="row.id" class="row">
                <div class="row-body">
                  <span class="row-name"
                    >{{ row.holomen }}<span class="card-name">{{ row.card }}</span></span
                  >
                  <!-- 開花段階は文字の「n凸」ではなく開花アイコン 1 つ（取り込んだ後の段階） -->
                  <span class="row-value">
                    <SkillIcon kind="bloom" :count="row.bloom" :label="`開花${row.bloom}`" />
                  </span>
                </div>
              </li>
            </ul>
          </section>
        </template>
      </div>

      <!-- 下端の固定エリア: 段ごとの操作 -->
      <div class="sheet-foot">
        <button
          v-if="phase !== 'review'"
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
            :disabled="importRows.length === 0"
            @click="onApply"
          >
            {{
              importRows.length === 0
                ? "取り込むものがありません"
                : `${String(importRows.length)} 件を取り込む`
            }}
          </button>
        </div>
      </div>
    </div>

    <!-- 質問は貼り付け画面の上に中央ダイアログで 1 問ずつ（全部答えるまで進まない） -->
    <QuestionDialog
      v-if="phase === 'asking' && currentQuestion !== null"
      :step="step + 1"
      :total="questions.length"
      :subject="
        currentQuestion.readCard === ''
          ? currentQuestion.readHolomen
          : `${currentQuestion.readHolomen}「${currentQuestion.readCard}」`
      "
      :question="currentQuestion.caution ?? ''"
      @yes="onAnswer(true)"
      @no="onAnswer(false)"
      @cancel="onCancelAsk"
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

/* 取り込むカードの一覧（1 行 1 枚。操作は持たない — 2026-09-10 にスワイプ操作を撤去） */
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

/*
 * 取り込めなかった件数だけを出す行（内容は明かさない）。「取り込むカード」の見出しと
 * 同じ形（ラベル左・件数右・同じ文字サイズ）で色だけ赤にする — 2026-09-10 ユーザー指示
 */
.error-line {
  color: var(--error);
  font-size: 15px;
  font-weight: 700;
  margin: 0;
}

.error-line .count {
  color: var(--error);
}

/* 登録済みの件数。エラー行と同じ形で色は本文のまま */
.registered-line {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
}

.row-name {
  display: flex;
  font-weight: 700;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.row-value {
  align-items: center;
  display: flex;
  flex-shrink: 0;
  gap: 2px;
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
