<script setup lang="ts">
import { computed, ref } from "vue";

import CloseButton from "./CloseButton.vue";
import { useBoards, useConnectPlacements } from "../composables/useBoards";
import { useModalChrome } from "../composables/useModalChrome";
import { useOwnedCards } from "../composables/useOwnedCards";
import { loadAccount } from "../storage/account";
import { serializeAccountExport } from "../storage/accountExport";
import { toConnectPlacementMap } from "../storage/connect";

/**
 * データの出力（サイドメニューの「データの取り込み」の下 — 2026-09-11 ユーザー指示）。登録しているアカウントの内容
 * （ホロメンの 4 色ボードとコネクト・所持メンバーと開花・イベントメモリー・メンバー強化ボーナス）を 1 つの JSON にして
 * コピーする。形は「データの取り込み」の枠（ヘッダ + 右上のボタン）を借りる。保存には触らない
 */
const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const boards = useBoards();
const connect = useConnectPlacements();
const owned = useOwnedCards();

const text = computed(() =>
  serializeAccountExport({
    boards: {
      red: boards.red.value,
      blue: boards.blue.value,
      yellow: boards.yellow.value,
      green: boards.green.value,
    },
    connect: toConnectPlacementMap(connect.value),
    owned: owned.value,
    account: loadAccount(),
  }),
);

/** コピーの結果はボタンのラベルで示す（2 秒で戻す） */
const copied = ref(false);
let copyTimer: number | null = null;
async function onCopy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(text.value);
    copied.value = true;
    if (copyTimer !== null) window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // クリップボードが使えない環境では、JSON を直接選択してコピーしてもらう
  }
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="データの出力">
      <header class="sheet-head">
        <h3>データの出力</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <div class="box">
          <div class="box-head">
            <span>アカウントの構造化データ</span>
            <button type="button" class="box-button copy-button" @click="void onCopy()">
              <span class="copy-label" :class="{ shown: !copied }" aria-hidden="true">コピー</span>
              <span class="copy-label" :class="{ shown: copied }">コピーしました</span>
            </button>
          </div>
          <pre class="json">{{ text }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 器は ImportSheet と同じ（モバイルはフルスクリーン、広い画面では中央のダイアログ） */
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

.box-head > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.box-button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink);
  cursor: pointer;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  height: 32px;
  padding: 0 12px;
}

/* 結果をラベルで示すボタン: 2 つのラベルを同じ枡に重ね、幅を広い方に固定する */
.copy-button {
  display: inline-grid;
  place-items: center;
}

.copy-label {
  grid-area: 1 / 1;
  visibility: hidden;
}

.copy-label.shown {
  visibility: visible;
}

/* JSON は全文を出す（本文がスクロールする） */
.json {
  color: var(--ink);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  margin: 0;
  padding: 8px 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
