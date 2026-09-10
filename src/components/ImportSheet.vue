<script setup lang="ts">
import { computed, ref } from "vue";

import CloseButton from "./CloseButton.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { useOwnedCards } from "../composables/useOwnedCards";
import {
  applyOwnedImport,
  importChangeCount,
  parseImport,
  planOwnedImport,
} from "../storage/import";
import type { OwnedImportPlan } from "../storage/import";
import { OWNED_IMPORT_PLACEHOLDER, OWNED_IMPORT_PROMPT } from "../ui/importPrompt";

/**
 * スクショから作った構造化データ（インポート用 JSON）を貼り付けて所持メンバーを登録する
 * （2026-09-10 ユーザー指示。入口はサイドメニューの一番上）。
 * **貼る → 確認（差分） → 取り込む** の 2 段で、確認を見てからでないと保存せず、
 * 取り込んだらシートを閉じてメイン画面へ戻る（取り込み後の結果画面は「不要」— 2026-09-10）。
 * 取り消せない操作なので確認を挟むが、このプレビュー自体が確認なので `ConfirmDialog` は
 * 重ねない。形式の定義は `.claude/skills/structure-import/`
 */
const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const owned = useOwnedCards();

const text = ref("");
const error = ref<string | null>(null);
const plan = ref<OwnedImportPlan | null>(null);
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

const changeCount = computed(() => (plan.value === null ? 0 : importChangeCount(plan.value)));

/**
 * 取り込みで変わる行を 1 つの表にまとめる（新規 → 更新の順）。
 * 新規は「新規 n凸」、更新は「n凸 → m凸」で、同じ見た目の表を 2 つ続けない
 */
const changeRows = computed(() => {
  const current = plan.value;
  if (current === null) return [];
  return [
    ...current.add.map((row) => ({
      id: row.id,
      holomen: row.holomen,
      card: row.card,
      isNew: true,
      bloom: `${String(row.bloom)}凸`,
    })),
    ...current.update.map((row) => ({
      id: row.id,
      holomen: row.holomen,
      card: row.card,
      isNew: false,
      bloom: `${String(row.from)}凸 → ${String(row.to)}凸`,
    })),
  ];
});

/** 取り込まないもの・注意して見てほしい行（理由つき） */
const reviewRows = computed(() => {
  const current = plan.value;
  if (current === null) return [];
  return [
    ...current.review.map((row) => ({ label: row.label, reason: row.reason })),
    ...current.unreadable.map((row) => ({
      label: "読み取れなかったもの",
      reason: row.hint === undefined ? row.reason : `${row.reason}（${row.hint}）`,
    })),
  ];
});

function onConfirm(): void {
  const result = parseImport(text.value);
  if (!result.ok) {
    error.value = result.message;
    plan.value = null;
    return;
  }
  error.value = null;
  plan.value = planOwnedImport(result.value, owned.value);
}

function onApply(): void {
  const current = plan.value;
  if (current === null) return;
  owned.value = applyOwnedImport(current, owned.value);
  emit("close");
}

function onBack(): void {
  plan.value = null;
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
          <p class="lead">
            スクリーンショットと下のプロンプトを手元の AI に渡し、出てきた JSON
            をここに貼ってください。
          </p>
          <div class="prompt-block">
            <div class="prompt-head">
              <span>AI に渡すプロンプト</span>
              <button type="button" class="copy-button" @click="void onCopy()">
                {{ copied ? "コピーしました" : "コピー" }}
              </button>
            </div>
            <pre class="prompt">{{ OWNED_IMPORT_PROMPT }}</pre>
          </div>
          <textarea
            v-model="text"
            class="paste"
            rows="12"
            spellcheck="false"
            aria-label="取り込み用データ"
            :placeholder="OWNED_IMPORT_PLACEHOLDER"
          ></textarea>
          <p v-if="error !== null" class="warn-text" role="alert">{{ error }}</p>
        </template>

        <!-- 2 段目: 確認（差分）。件数は見出しの右端の値として置く -->
        <template v-else>
          <section v-if="reviewRows.length > 0" class="block">
            <h4 class="block-head">
              要確認<span class="count">{{ reviewRows.length }} 件</span>
            </h4>
            <ul class="review">
              <li v-for="(row, i) in reviewRows" :key="i">
                <span class="review-label">{{ row.label }}</span>
                <span class="review-reason">{{ row.reason }}</span>
              </li>
            </ul>
          </section>

          <section v-if="changeRows.length > 0" class="block">
            <h4 class="block-head">
              取り込む内容<span class="count">{{ changeRows.length }} 件</span>
            </h4>
            <table class="param-table">
              <tbody>
                <tr v-for="row in changeRows" :key="row.id">
                  <th scope="row">
                    {{ row.holomen }}<span class="card-name">{{ row.card }}</span>
                  </th>
                  <td class="num">
                    <span v-if="row.isNew" class="new-mark">新規</span>{{ row.bloom }}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <p v-if="plan.unchanged > 0" class="note">変更なし {{ plan.unchanged }} 件</p>
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

.lead {
  color: var(--ink-2);
  font-size: 13px;
  line-height: 1.6;
  margin: 0;
}

/* コピーして手元の AI に渡すプロンプト。読ませるためではなくコピーさせるものなので低い高さで置く */
.prompt-block {
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  overflow: hidden;
}

.prompt-head {
  align-items: center;
  background: var(--bg);
  display: flex;
  font-size: 13px;
  font-weight: 700;
  gap: 8px;
  justify-content: space-between;
  padding: 6px 8px 6px 12px;
}

.copy-button {
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
  max-height: 132px;
  overflow: auto;
  padding: 8px 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 貼り付け欄。自動フォーカスはしない（モバイルでキーボードが勝手に開く） */
.paste {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  padding: 12px;
  resize: vertical;
  width: 100%;
}

.note {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
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

.param-table tbody th {
  font-weight: 700;
}

.param-table .num {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

/* カード名はホロメン名の隣に淡色で（一覧・詳細と同じ隣接） */
.card-name {
  color: var(--ink-2);
  font-weight: 400;
  margin-left: 6px;
}
</style>
