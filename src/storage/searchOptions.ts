import { BOARD_COLOR_ORDER } from "./boards";
import type { BoardColor } from "./boards";

/**
 * さがすのオプション(育成の反映)の保存。既定はすべて ON —
 * 既定のまま実行すれば一番よい結果が出るようにする(`.claude/rules/ui-flow.md`)。
 *
 * ボードは親の「ボード状況を考慮する」の下に、コネクトと 4 色(赤・青・黄・緑)のサブオプションを持つ
 * (2026-09-16 ユーザー指示「緑全開放ってめっちゃ大変なので…赤、青、黄、緑を個別につけ外ししたい」)。
 * 外した色は**全解放**として試算する(0 として扱うのではない — 育てきった前提で比べる `ui-flow.md`)。
 * 親が OFF のあいだはサブも効かず、4 色を**全部 OFF にはできない**(それは親を OFF にするのと同じなので、
 * 同じ状態への道を 2 つ作らない)。
 *
 * 旧キー `skill-filters`(2026-09-05〜06)と旧項目 `costume` / `passives`(衣装スキル発動・パッシブ全員発動の
 * しぼりこみ)は 2026-09-16 に撤去したので読み飛ばす — 未知の項目と同じ扱い。
 *
 * 保存するかどうかは「オプションの保持」(`src/composables/useKeepOptions.ts`)が決める —
 * OFF のあいだは書かず、切り替えた時点でこのキーも消える(2026-09-16 ユーザー指示)。
 */

export const SEARCH_OPTIONS_STORAGE_KEY = "holodori-optimizer:search-options";

export interface SearchOptions {
  /** 登録したホロメンボードを反映する(持っているカードのときのみ効く。4 色とコネクトの親) */
  board: boolean;
  /** 色ごとの反映。false の色は全解放として試算する。**4 色すべてを false にはしない** */
  boardColors: Record<BoardColor, boolean>;
  /** 登録したコネクトマスの増幅を反映する(OFF なら増幅なし) */
  connect: boolean;
  /** 登録した開花段階を反映する(持っているカードのときのみ効く) */
  bloom: boolean;
}

export function defaultSearchOptions(): SearchOptions {
  return {
    board: true,
    boardColors: { red: true, blue: true, yellow: true, green: true },
    connect: true,
    bloom: true,
  };
}

/** 4 色のうち ON が 2 つ以上あるか(= その色を外せるか)。最後の 1 色は外せない */
export function canTurnOffColor(options: SearchOptions, color: BoardColor): boolean {
  return BOARD_COLOR_ORDER.some((c) => c !== color && options.boardColors[c]);
}

/** 明示的に false のときだけ OFF。知らない項目・真偽値でない値は既定(ON)へ倒す */
export function parseSearchOptions(raw: string | null): SearchOptions {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "{}");
  } catch {
    return defaultSearchOptions();
  }
  if (typeof parsed !== "object" || parsed === null) return defaultSearchOptions();
  const stored = parsed as Record<string, unknown>;
  const colors = stored.boardColors;
  const storedColors =
    typeof colors === "object" && colors !== null ? (colors as Record<string, unknown>) : {};
  const options = defaultSearchOptions();
  options.board = stored.board !== false;
  options.connect = stored.connect !== false;
  options.bloom = stored.bloom !== false;
  for (const color of BOARD_COLOR_ORDER) options.boardColors[color] = storedColors[color] !== false;
  // 4 色すべて OFF は作れない状態なので、そう保存されていても既定(すべて ON)へ戻す
  if (!BOARD_COLOR_ORDER.some((c) => options.boardColors[c])) {
    for (const color of BOARD_COLOR_ORDER) options.boardColors[color] = true;
  }
  return options;
}

export function loadSearchOptions(): SearchOptions {
  try {
    return parseSearchOptions(localStorage.getItem(SEARCH_OPTIONS_STORAGE_KEY));
  } catch {
    return defaultSearchOptions();
  }
}

export function saveSearchOptions(options: SearchOptions): void {
  try {
    localStorage.setItem(SEARCH_OPTIONS_STORAGE_KEY, JSON.stringify(options));
  } catch {
    // 保存できない環境でも動作は継続する
  }
}
