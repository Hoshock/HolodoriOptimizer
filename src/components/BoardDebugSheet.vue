<script setup lang="ts">
import { computed, ref, watch } from "vue";

import BoardSheet from "./BoardSheet.vue";
import CloseButton from "./CloseButton.vue";
import HolomenPicker from "./HolomenPicker.vue";
import { useBoards } from "../composables/useBoards";
import { useModalChrome } from "../composables/useModalChrome";
import { holomen as allHolomen } from "../data";
import { toBoardMap } from "../storage/boards";
import type { BoardColor } from "../storage/boards";
import {
  BOARD_COLOR_ORDER,
  knownBoardsNodes,
  parseBoardsExchange,
  resolveBoardsHolomen,
  serializeHolomenBoards,
} from "../storage/boardsExchange";
import { holomenName } from "../ui/labels";

/**
 * 管理用 → ホロメンボード（2026-09-11 ユーザー指示）。**デバッグ用のホロメンボード**を手で触ると、その状態が
 * 構造化データ（JSON）として同じ画面に出る。逆に JSON を貼る（打つ）と、デバッグ用のボードがその状態になる。
 * 登録しているボード（Step 0 のホロメン → ボード）は**書き換えない** — ここで動くのは画面の中の状態だけで、
 * 開いたときにそのホロメンの登録をコピーして出発点にする（登録の JSON を持ち出すのにも使える）。
 * 形は「データの取り込み」の枠（ヘッダつきの枠 + 右上のボタン）を借り、上に JSON、下に埋め込んだボード（BoardSheet の embedded）
 */
const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const registered = useBoards();
const registeredMaps = computed(() => ({
  red: toBoardMap("red", registered.red.value),
  blue: toBoardMap("blue", registered.blue.value),
  yellow: toBoardMap("yellow", registered.yellow.value),
  green: toBoardMap("green", registered.green.value),
}));

type Nodes = Record<BoardColor, string[]>;
const emptyNodes = (): Nodes => ({ red: [], blue: [], yellow: [], green: [] });
/** そのホロメンの登録をコピーする（出発点。以後はデバッグ用の状態だけが動く） */
function registeredNodesOf(holomenId: string): Nodes {
  const nodes = emptyNodes();
  for (const color of BOARD_COLOR_ORDER)
    nodes[color] = [...(registeredMaps.value[color][holomenId] ?? [])];
  return nodes;
}

/** 最初に出すホロメン: 登録のあるホロメンの先頭、なければデータの先頭 */
const firstHolomen =
  allHolomen.find((h) => BOARD_COLOR_ORDER.some((c) => registeredMaps.value[c][h.id] !== undefined))
    ?.id ??
  allHolomen[0]?.id ??
  "";
const holomenId = ref(firstHolomen);
const debugNodes = ref<Nodes>(registeredNodesOf(firstHolomen));

/** JSON の欄。ボードを触ると書き換わり、欄を直すとボードが変わる（読めないときはボードを変えずエラーを出す） */
const text = ref(serializeHolomenBoards(holomenId.value, debugNodes.value));
const error = ref<string | null>(null);
/** ボード → JSON の反映中は JSON → ボードの反映を止める（往復して打ち途中の文字を壊さない） */
let syncing = false;

function pushToText(): void {
  syncing = true;
  text.value = serializeHolomenBoards(holomenId.value, debugNodes.value);
  error.value = null;
  syncing = false;
}

watch(text, (value) => {
  if (syncing) return;
  const result = parseBoardsExchange(value);
  if (!result.ok) {
    error.value = result.message;
    return;
  }
  const row = result.rows[0];
  if (!row) {
    error.value = "boards が空です。ホロメン 1 人ぶんの行を入れてください。";
    return;
  }
  const id = resolveBoardsHolomen(row);
  if (id === null) {
    error.value = "ホロメンを特定できません（holomenId か holomen を確かめてください）。";
    return;
  }
  const { nodes, unknown } = knownBoardsNodes(id, row);
  holomenId.value = id;
  debugNodes.value = nodes;
  error.value =
    unknown > 0
      ? `知らないマス ID が ${String(unknown)} 個あり、ボードには反映していません。`
      : null;
});

/** 埋め込んだボードを触った */
function onBoardUpdate(_holomenId: string, color: BoardColor, nodes: string[]): void {
  debugNodes.value = { ...debugNodes.value, [color]: nodes };
  pushToText();
}

/** ホロメンを替える（登録をコピーして出発点にする） */
const picking = ref(false);
function onPick(id: string): void {
  picking.value = false;
  holomenId.value = id;
  debugNodes.value = registeredNodesOf(id);
  pushToText();
}

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
    // クリップボードが使えない環境では、欄を直接選択してコピーしてもらう
  }
}

/** 「ペースト」でクリップボードから流し込む（`readText()` が解決も失敗もしない環境があるので数秒で案内を出す） */
const PASTE_HINT_MS = 4000;
async function onPaste(): Promise<void> {
  const hint = window.setTimeout(() => {
    error.value = "クリップボードを読み取れませんでした。欄を長押しして貼り付けてください。";
  }, PASTE_HINT_MS);
  let clip = "";
  try {
    clip = await navigator.clipboard.readText();
  } catch {
    window.clearTimeout(hint);
    error.value = "クリップボードを読み取れませんでした。欄を長押しして貼り付けてください。";
    return;
  }
  window.clearTimeout(hint);
  if (clip.trim() === "") {
    error.value = "クリップボードが空です。";
    return;
  }
  text.value = clip;
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="ホロメンボード（デバッグ）">
      <header class="sheet-head">
        <h3>ホロメンボード</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <div class="body">
        <!-- 対象のホロメン: メイン画面の行ボタンと同じ「ラベル左・値右」。押すとホロメン一覧から選ぶ -->
        <button type="button" class="row-button" @click="picking = true">
          <span class="row-label">ホロメン</span>
          <span class="row-value">{{ holomenName(holomenId) }}</span>
        </button>

        <!-- 構造化データ: ボードを触ると書き換わり、欄を直すとボードが変わる -->
        <div class="box">
          <div class="box-head">
            <span>構造化データ（JSON）</span>
            <span class="box-buttons">
              <button type="button" class="box-button" @click="void onPaste()">ペースト</button>
              <button type="button" class="box-button copy-button" @click="void onCopy()">
                <!-- 2 つのラベルを重ねて置き、幅を広い方で固定する（ラベルが変わってもヘッダが折り返さない） -->
                <span class="copy-label" :class="{ shown: !copied }" aria-hidden="true"
                  >コピー</span
                >
                <span class="copy-label" :class="{ shown: copied }">コピーしました</span>
              </button>
            </span>
          </div>
          <textarea
            v-model="text"
            class="paste"
            rows="10"
            spellcheck="false"
            aria-label="構造化データ（JSON）"
          ></textarea>
        </div>
        <p v-if="error !== null" class="warn-text" role="alert">{{ error }}</p>

        <!-- デバッグ用のボード（登録には書き戻さない） -->
        <BoardSheet
          embedded
          :holomen-id="holomenId"
          :red-nodes="debugNodes.red"
          :nodes="debugNodes.blue"
          :yellow-nodes="debugNodes.yellow"
          :green-nodes="debugNodes.green"
          @update="onBoardUpdate"
        />
      </div>
    </div>

    <HolomenPicker
      v-if="picking"
      :red-boards="registeredMaps.red"
      :boards="registeredMaps.blue"
      :yellow-boards="registeredMaps.yellow"
      :green-boards="registeredMaps.green"
      @pick="onPick"
      @close="picking = false"
    />
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

/* 設定行のボタン（メイン画面の Step 0 と同じ器: ラベル左・値右） */
.row-button {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 600;
  gap: 8px;
  justify-content: space-between;
  min-height: 48px;
  padding: 0 16px;
  text-align: left;
  width: 100%;
}

.row-value {
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.box {
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  flex-shrink: 0;
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

/* ヘッダのラベルは 1 行に収め、足りなければ省略する（ボタンのラベルが変わっても 2 行にしない） */
.box-head > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.box-buttons {
  flex-shrink: 0;
}

/* 結果をラベルで示すボタン: 2 つのラベルを同じ枡に重ね、見せない方は透明にして幅を広い方に固定する */
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

.box-buttons {
  display: flex;
  gap: 6px;
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
  flex-shrink: 0;
  font-size: 13px;
  margin: 0;
}
</style>
