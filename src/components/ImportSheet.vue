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

/**
 * スクショから作った構造化データ（インポート用 JSON）を貼り付けて所持メンバーを登録する
 * （2026-09-10 ユーザー指示。入口はサイドメニューの一番上）。
 * **貼る → 確認（差分） → 取り込む** の 3 段で、確認を見てからでないと保存しない
 * （取り込みは取り消せないので確認を挟む — このプレビュー自体が確認なので
 * `ConfirmDialog` は重ねない）。形式の定義は `.claude/skills/structure-import/`
 */
const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

/** 作り方（ローカルのエージェントに渡すスキル）。サイトからは説明せずリポジトリを見せる */
const SKILL_URL =
  "https://github.com/Hoshock/HolodoriOptimizer/tree/main/.claude/skills/structure-import";

const owned = useOwnedCards();

const text = ref("");
const error = ref<string | null>(null);
const plan = ref<OwnedImportPlan | null>(null);
const applied = ref(false);

const changeCount = computed(() => (plan.value === null ? 0 : importChangeCount(plan.value)));

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
  applied.value = true;
}

function onBack(): void {
  plan.value = null;
  applied.value = false;
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
            ゲームのスクリーンショットから作った取り込み用データ（JSON）を貼り付けてください。いまは持っているメンバー（★5
            のカードと開花段階）を登録できます。データの作り方は
            <a :href="SKILL_URL" rel="noopener noreferrer" target="_blank">こちらの手順</a>
            のとおり、お使いの端末の AI
            に読ませて出力させてください（スクリーンショットはどこにも送信されません）。
          </p>
          <textarea
            v-model="text"
            class="paste"
            rows="12"
            spellcheck="false"
            aria-label="取り込み用データ"
            placeholder='{ "format": "holodori-optimizer/import", "version": 1, "kind": "owned-members", "cards": [ ... ] }'
          ></textarea>
          <p v-if="error !== null" class="warn-text" role="alert">{{ error }}</p>
        </template>

        <!-- 2 段目: 確認（差分）／ 3 段目: 取り込み後 -->
        <template v-else>
          <p class="summary">
            <template v-if="applied">
              {{ plan.add.length }} 件を登録し、{{ plan.update.length }}
              件の開花段階を更新しました。
            </template>
            <template v-else>
              新しく登録 {{ plan.add.length }} 件 / 開花段階の更新 {{ plan.update.length }} 件
            </template>
          </p>
          <p v-if="plan.unchanged > 0" class="note">
            すでに同じ内容で登録済み {{ plan.unchanged }} 件（変更しません）
          </p>
          <p v-if="!applied" class="note">
            この取り込みで登録が減ることはありません（データに無いカードの登録はそのまま残します）。
          </p>

          <section v-if="plan.review.length > 0 || plan.unreadable.length > 0" class="block">
            <h4>要確認</h4>
            <ul class="review">
              <li v-for="(row, i) in plan.review" :key="`r${String(i)}`">
                <span class="review-label">{{ row.label }}</span>
                <span class="review-reason">{{ row.reason }}</span>
              </li>
              <li v-for="(row, i) in plan.unreadable" :key="`u${String(i)}`">
                <span class="review-label">読み取れなかったもの</span>
                <span class="review-reason"
                  >{{ row.reason
                  }}<template v-if="row.hint !== undefined">（{{ row.hint }}）</template></span
                >
              </li>
            </ul>
          </section>

          <section v-if="plan.add.length > 0" class="block">
            <h4>新しく登録</h4>
            <table class="param-table">
              <tbody>
                <tr v-for="row in plan.add" :key="row.id">
                  <th scope="row">
                    {{ row.holomen }}<span class="card-name">{{ row.card }}</span>
                  </th>
                  <td class="num">{{ row.bloom }}凸</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section v-if="plan.update.length > 0" class="block">
            <h4>開花段階の更新</h4>
            <table class="param-table">
              <tbody>
                <tr v-for="row in plan.update" :key="row.id">
                  <th scope="row">
                    {{ row.holomen }}<span class="card-name">{{ row.card }}</span>
                  </th>
                  <td class="num">{{ row.from }}凸 → {{ row.to }}凸</td>
                </tr>
              </tbody>
            </table>
          </section>
        </template>
      </div>

      <!-- 下端の固定エリア: 段ごとの操作（取り込み後は操作を残さず ✕ で閉じる） -->
      <div v-if="!applied" class="sheet-foot">
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

.lead a {
  color: var(--ink);
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

.summary {
  font-size: 17px;
  font-weight: 700;
  margin: 0;
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
