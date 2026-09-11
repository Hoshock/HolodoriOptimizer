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
import {
  diffDebugBoards,
  emptyColorNodes,
  loadDebugBoards,
  saveDebugBoards,
} from "../storage/debugBoards";
import type { DebugBoards } from "../storage/debugBoards";
import { holomenName } from "../ui/labels";

/**
 * 管理用 → ホロメンボード（2026-09-11 ユーザー指示）。**デバッグ用のホロメンボード**（複数ホロメン × 4 色）を手で触ると、
 * その状態が構造化データ（JSON）として同じ画面に出る。逆に JSON を貼る（打つ）と、デバッグ用のボードがその状態になる。
 * 登録しているボード（Step 0 のホロメン → ボード）は**書き換えない** — ここで動くのはデバッグ用の状態だけで、
 * 初めて開いたときに登録を丸ごとコピーして出発点にする。デバッグ用の状態は画面を閉じても残す
 * （`src/storage/debugBoards.ts`。ホロメンを替えてもリセットしない）。JSON を 2 回目以降に入れたときは
 * 前回との差分（ホロメン × 色ごとの増えたマス・減ったマス）を JSON の下に出す。
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

/** 登録を丸ごとコピーする（初めて開いたときの出発点） */
function copyRegistered(): DebugBoards {
  const boards: DebugBoards = {};
  for (const color of BOARD_COLOR_ORDER) {
    for (const [holomenId, nodes] of Object.entries(registeredMaps.value[color])) {
      boards[holomenId] ??= emptyColorNodes();
      boards[holomenId][color] = [...nodes];
    }
  }
  return boards;
}

const saved = loadDebugBoards();
/** デバッグ用の状態（ホロメン ID → 4 色）。空なら登録のコピーから始める */
const debug = ref<DebugBoards>(
  Object.keys(saved.current).length > 0 ? saved.current : copyRegistered(),
);
/** 直前の状態（差分表示用。JSON を入れるたびに更新。初回は null） */
const previous = ref<DebugBoards | null>(saved.previous);
watch(
  [debug, previous],
  () => saveDebugBoards({ current: debug.value, previous: previous.value }),
  { deep: true },
);

/** 埋め込んだボードに出すホロメン: デバッグ用の状態にある先頭、なければデータの先頭 */
const holomenId = ref(
  allHolomen.find((h) => debug.value[h.id] !== undefined)?.id ?? allHolomen[0]?.id ?? "",
);
const shownNodes = computed(() => debug.value[holomenId.value] ?? emptyColorNodes());

/** JSON の欄。ボードを触ると書き換わり、欄を直すとボードが変わる（読めないときはボードを変えずエラーを出す） */
const text = ref(serializeHolomenBoards(debug.value));
const error = ref<string | null>(null);
/**
 * ボード → JSON で書いた文字列。JSON → ボードの watcher はこれと同じ文字列なら何もしない
 * （watcher は非同期に走るので、フラグではなく文字列そのもので往復を止める。往復すると「直前の状態」が
 * 上書きされて差分が消える）
 */
let pushed = "";

function pushToText(): void {
  pushed = serializeHolomenBoards(debug.value);
  text.value = pushed;
  error.value = null;
}
pushed = text.value;

watch(text, (value) => {
  if (value === pushed) return;
  const result = parseBoardsExchange(value);
  if (!result.ok) {
    error.value = result.message;
    return;
  }
  const next: DebugBoards = {};
  let unknownHolomen = 0;
  let unknownNodes = 0;
  for (const row of result.rows) {
    const id = resolveBoardsHolomen(row);
    if (id === null) {
      unknownHolomen += 1;
      continue;
    }
    const { nodes, unknown } = knownBoardsNodes(id, row);
    unknownNodes += unknown;
    next[id] = nodes;
  }
  // 入れた JSON を新しい状態にし、直前の状態を差分の比較元として残す
  previous.value = debug.value;
  debug.value = next;
  if (next[holomenId.value] === undefined) {
    holomenId.value = allHolomen.find((h) => next[h.id] !== undefined)?.id ?? holomenId.value;
  }
  const notes: string[] = [];
  if (unknownHolomen > 0) notes.push(`特定できないホロメンの行が ${String(unknownHolomen)} 件`);
  if (unknownNodes > 0) notes.push(`知らないマス ID が ${String(unknownNodes)} 個`);
  error.value = notes.length > 0 ? `${notes.join("、")}あり、ボードには反映していません。` : null;
});

/** 埋め込んだボードを触った（そのホロメンの色 1 つを置き換える） */
function onBoardUpdate(id: string, color: BoardColor, nodes: string[]): void {
  const entry = debug.value[id] ?? emptyColorNodes();
  debug.value = { ...debug.value, [id]: { ...entry, [color]: nodes } };
  pushToText();
}

/** 表示するホロメンを替える（デバッグ用の状態はそのまま。無いホロメンは登録をコピーして加える） */
const picking = ref(false);
function onPick(id: string): void {
  picking.value = false;
  holomenId.value = id;
  if (debug.value[id] === undefined) {
    debug.value = { ...debug.value, [id]: copyRegistered()[id] ?? emptyColorNodes() };
    pushToText();
  }
}

/** 前回との差分（JSON を 2 回目以降に入れた後。ホロメン × 色ごとの増減。変化がなければ空） */
const diffs = computed(() =>
  previous.value ? diffDebugBoards(previous.value, debug.value) : null,
);
const COLOR_LABELS: Record<BoardColor, string> = {
  red: "赤",
  blue: "青",
  yellow: "黄",
  green: "緑",
};

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
        <!-- 構造化データ（全ホロメン）: ボードを触ると書き換わり、欄を直すとボードが変わる -->
        <div class="box">
          <div class="box-head">
            <span>構造化データ</span>
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

        <!-- 前回との差分（JSON を 2 回目以降に入れた後だけ。変化がなければその旨） -->
        <section v-if="diffs !== null" class="diff">
          <h4 class="block-head">
            前回との差分<span class="count">{{ diffs.length }} 件</span>
          </h4>
          <p v-if="diffs.length === 0" class="diff-none">変化なし</p>
          <ul v-else class="diff-rows">
            <li v-for="d in diffs" :key="`${d.holomenId}-${d.color}`" class="diff-row">
              <span class="diff-who">{{ holomenName(d.holomenId) }}</span>
              <span class="diff-color">{{ COLOR_LABELS[d.color] }}</span>
              <span class="diff-ids">
                <span v-for="id in d.added" :key="`+${id}`" class="added">+{{ id }}</span>
                <span v-for="id in d.removed" :key="`-${id}`" class="removed">−{{ id }}</span>
              </span>
            </li>
          </ul>
        </section>

        <!-- 埋め込むボードのホロメン: メイン画面の行ボタンと同じ「ラベル左・値右」。押すとホロメン一覧から選ぶ -->
        <button type="button" class="row-button" @click="picking = true">
          <span class="row-label">ホロメン</span>
          <span class="row-value">{{ holomenName(holomenId) }}</span>
        </button>

        <!-- デバッグ用のボード（登録には書き戻さない） -->
        <BoardSheet
          embedded
          :holomen-id="holomenId"
          :red-nodes="shownNodes.red"
          :nodes="shownNodes.blue"
          :yellow-nodes="shownNodes.yellow"
          :green-nodes="shownNodes.green"
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

/* 前回との差分（見出しの右端に件数。行はホロメン・色・増減のマス ID） */
.diff {
  flex-shrink: 0;
}

.block-head {
  align-items: baseline;
  display: flex;
  font-size: 15px;
  gap: 8px;
  justify-content: space-between;
  margin: 0 0 8px;
}

.count {
  color: var(--ink-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.diff-none {
  color: var(--ink-2);
  font-size: 12px;
  margin: 0;
}

.diff-rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.diff-row {
  align-items: baseline;
  border-bottom: 1px solid var(--line);
  display: flex;
  font-size: 12px;
  gap: 8px;
  padding: 6px 4px;
}

.diff-who {
  flex-shrink: 0;
  font-weight: 700;
}

.diff-color {
  color: var(--ink-2);
  flex-shrink: 0;
  font-weight: 600;
}

.diff-ids {
  display: flex;
  flex-wrap: wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  gap: 4px 8px;
  min-width: 0;
}

.added {
  color: var(--action);
}

.removed {
  color: var(--error);
}
</style>
