import { ref, watch } from "vue";
import type { Ref } from "vue";

import type { ConnectAnchor, ConnectPlacement } from "../data/connect";
import { loadBoards, saveBoards } from "../storage/boards";
import type { BoardColor, BoardEntry } from "../storage/boards";
import { loadConnect, saveConnect, setConnectPlacement } from "../storage/connect";
import type { ConnectEntry } from "../storage/connect";

/**
 * ホロメンボードの登録（4 色 × ホロメンごとの解放マス。アプリ全体で 1 つの状態）。保存形式と後方互換は
 * `src/storage/boards.ts`。
 *
 * 触る場所が 2 つある（Step 0 のホロメン → ボードのシートと、サイドメニューの管理用「ホロメンボード」の
 * 構造化データの取り込み — 2026-09-11）ので、useOwnedCards と同じくモジュールレベルで 1 つ持つ —
 * コンポーネントごとに `loadBoards()` すると、片方が保存したあとにもう片方が古い配列で上書きしてしまう。
 * 現在のデータにないホロメン ID・マス ID も配列に残して書き戻す（登録を消さない）
 */
export const BOARD_COLORS: readonly BoardColor[] = ["red", "blue", "yellow", "green"];

function persistent(color: BoardColor): Ref<BoardEntry[]> {
  const entries = ref<BoardEntry[]>(loadBoards(color));
  watch(entries, (value) => saveBoards(color, value), { deep: true });
  return entries;
}

const boards: Record<BoardColor, Ref<BoardEntry[]>> = {
  red: persistent("red"),
  blue: persistent("blue"),
  yellow: persistent("yellow"),
  green: persistent("green"),
};

export function useBoards(): Record<BoardColor, Ref<BoardEntry[]>> {
  return boards;
}

/**
 * コネクトマスの入力（ホロメンごと・アンカーごとの範囲の形と増幅 ‰。保存形式は `src/storage/connect.ts`）。
 * 解放マスと同じくアプリで 1 つの状態。ボード 4 色のキーとは別のキーに保存する（旧データはどこにも置いていない扱い）
 */
const connectEntries = ref<ConnectEntry[]>(loadConnect());
watch(connectEntries, (value) => saveConnect(value), { deep: true });

export function useConnectPlacements(): Ref<ConnectEntry[]> {
  return connectEntries;
}

/** 1 ホロメン・1 アンカーの入力を置き換える（null で外す） */
export function placeConnect(
  holomenId: string,
  anchor: ConnectAnchor,
  placement: ConnectPlacement | null,
): void {
  connectEntries.value = setConnectPlacement(connectEntries.value, holomenId, anchor, placement);
}

/** 1 ホロメン・1 色の解放マスを置き換える（未登録なら追加。空配列も「全部解除」として登録に残す） */
export function setBoardNodes(color: BoardColor, holomenId: string, nodes: string[]): void {
  const entries = boards[color].value;
  const entry = entries.find((e) => e.holomenId === holomenId);
  if (entry) entry.nodes = nodes;
  else entries.push({ holomenId, nodes });
}
