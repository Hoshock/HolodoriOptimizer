import { ref, watch } from "vue";
import type { Ref } from "vue";

import { BOARD_STATE_COLORS } from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import type { ConnectAnchor, ConnectPlacement } from "../data/connect";
import {
  inferBoardConnects,
  loadBoardConnects,
  saveBoardConnects,
  setBoardConnects,
} from "../storage/boardConnects";
import type { BoardConnectEntry } from "../storage/boardConnects";
import { loadBoards, saveBoards } from "../storage/boards";
import type { BoardColor, BoardEntry } from "../storage/boards";
import { loadHolomenRanks, saveHolomenRanks, setHolomenRank } from "../storage/holomenRank";
import type { HolomenRankEntry } from "../storage/holomenRank";
import {
  loadConnect,
  replaceConnectPlacements,
  saveConnect,
  setConnectPlacement,
} from "../storage/connect";
import type { ConnectEntry, ConnectPlacementMap } from "../storage/connect";

/**
 * ホロメンボードの登録（4 色 × ホロメンごとの解放マス。アプリ全体で 1 つの状態）。保存形式と後方互換は
 * `src/storage/boards.ts`。
 *
 * 触る場所が複数ある（Step 0 のホロメン → ボードのシート・組み直しプランの反映・データの出力）ので、useOwnedCards と同じくモジュールレベルで 1 つ持つ —
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

/**
 * コネクトマス（赤 / 青 / 黄）そのものの解放状態（ホロメンごとの解放済みのコネクト。保存形式は `src/storage/boardConnects.ts`）。
 * コネクトの配置（上の `connectEntries`）とは別の状態で、最初の読み込みで旧データ（解放状態のない保存）から推定して明示保存する
 * （2026-10-04 ユーザー指示。推定の規則は boardConnects.ts）。「未解放なのに配置あり」は下の関数が作らない
 */
const boardConnectEntries = ref<BoardConnectEntry[]>(
  loadBoardConnects(() =>
    inferBoardConnects(
      {
        red: boards.red.value,
        blue: boards.blue.value,
        yellow: boards.yellow.value,
        green: boards.green.value,
      },
      connectEntries.value,
    ),
  ),
);
watch(boardConnectEntries, (value) => saveBoardConnects(value), { deep: true });

export function useBoardConnects(): Ref<BoardConnectEntry[]> {
  return boardConnectEntries;
}

/** ホロメンランクの登録（ホロメンごと・任意。未登録 = ボードPt の制限なし。保存形式は `src/storage/holomenRank.ts`） */
const rankEntries = ref<HolomenRankEntry[]>(loadHolomenRanks());
watch(rankEntries, (value) => saveHolomenRanks(value), { deep: true });

export function useHolomenRanks(): Ref<HolomenRankEntry[]> {
  return rankEntries;
}

/** 1 ホロメンのランクを登録する（null で未登録へ戻す。ボードは削除しない） */
export function setRank(holomenId: string, rank: number | null): void {
  rankEntries.value = setHolomenRank(rankEntries.value, holomenId, rank);
}

/** 1 ホロメンのボード全体の状態（4 色の解放マス + 解放済みのコネクト） */
export function holomenBoardsOf(holomenId: string): HolomenBoards {
  const nodes = (color: BoardColor): string[] => [
    ...(boards[color].value.find((e) => e.holomenId === holomenId)?.nodes ?? []),
  ];
  return {
    red: nodes("red"),
    blue: nodes("blue"),
    yellow: nodes("yellow"),
    green: nodes("green"),
    connects: [
      ...(boardConnectEntries.value.find((e) => e.holomenId === holomenId)?.unlocked ?? []),
    ],
  };
}

/**
 * 1 ホロメンのボード全体の状態を置き換える（ボード画面の解放・解除・すべて解放・ボードの最適化の反映がすべてここを通る）。
 * 解放が外れたコネクトの配置はここで外す — 「未解放なのに配置あり」を保存しない（配置の入口ごとに確かめず 1 か所で保つ）
 */
export function setHolomenBoards(holomenId: string, next: HolomenBoards): void {
  for (const color of BOARD_STATE_COLORS) {
    const current = boards[color].value.find((e) => e.holomenId === holomenId)?.nodes ?? [];
    const same =
      current.length === next[color].length && current.every((id, i) => id === next[color][i]);
    if (!same) setBoardNodes(color, holomenId, [...next[color]]);
  }
  boardConnectEntries.value = setBoardConnects(boardConnectEntries.value, holomenId, next.connects);
  const placed = connectEntries.value.find((e) => e.holomenId === holomenId)?.placements ?? {};
  for (const anchor of ["leader", "card", "content"] as const) {
    if (placed[anchor] !== undefined && !next.connects.includes(anchor))
      connectEntries.value = setConnectPlacement(connectEntries.value, holomenId, anchor, null);
  }
}

/** 解放済みのコネクトマスか（中心は常に解放済み） */
export function isConnectUnlocked(holomenId: string, anchor: ConnectAnchor): boolean {
  if (anchor === "center") return true;
  return (
    boardConnectEntries.value.find((e) => e.holomenId === holomenId)?.unlocked.includes(anchor) ===
    true
  );
}

/**
 * 1 ホロメン・1 アンカーの入力を置き換える（null で外す）。**解放していないコネクトには置けない**（置こうとしたら何もせず false）
 */
export function placeConnect(
  holomenId: string,
  anchor: ConnectAnchor,
  placement: ConnectPlacement | null,
): boolean {
  if (placement !== null && !isConnectUnlocked(holomenId, anchor)) return false;
  connectEntries.value = setConnectPlacement(connectEntries.value, holomenId, anchor, placement);
  return true;
}

/**
 * 全ホロメンのコネクトの配置を置き換える（コネクトの最適化の「反映」。`map` にないホロメンの配置は外れる）。
 * 解放していないコネクトへの配置は入れない（最適化は解放済みのコネクトにしか置かないが、念のため保存側でも守る）
 */
export function applyConnectPlacements(map: ConnectPlacementMap): void {
  const safe: ConnectPlacementMap = {};
  for (const [holomenId, placements] of Object.entries(map)) {
    const kept: typeof placements = {};
    for (const anchor of ["center", "leader", "card", "content"] as const) {
      const p = placements[anchor];
      if (p && isConnectUnlocked(holomenId, anchor)) kept[anchor] = p;
    }
    safe[holomenId] = kept;
  }
  connectEntries.value = replaceConnectPlacements(connectEntries.value, safe);
}

/** 1 ホロメン・1 色の解放マスを置き換える（未登録なら追加。空配列も「全部解除」として登録に残す） */
export function setBoardNodes(color: BoardColor, holomenId: string, nodes: string[]): void {
  const entries = boards[color].value;
  const entry = entries.find((e) => e.holomenId === holomenId);
  if (entry) entry.nodes = nodes;
  else entries.push({ holomenId, nodes });
}
