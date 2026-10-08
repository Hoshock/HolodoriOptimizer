/**
 * さがすのオプション(育成の反映)の保存。既定はすべて ON —
 * 既定のまま実行すれば一番よい結果が出るようにする(`.claude/rules/ui-flow.md`)。
 *
 * ボードは「ボード状況を考慮する」の 1 つ(ON = 登録している 4 色 / OFF = 全解放)。2026-09-16 に入れた 4 色のサブオプション
 * `boardColors` は 2026-10-08 に撤去した(ユーザー指示。ボードPt は 4 色で共有なので 1 色だけ全解放はありえない盤面になり、
 * 今の Pt と資材で届く最良は結果の「組み直すと」で見る)。保存済みの `boardColors` は読み飛ばす(未知の項目と同じ扱い)。
 * **コネクトのオプションは 2026-10-02 に撤去した**(ユーザー指示「探すオプションからコネクトを削除しよう」)— コネクトは
 * ボード状況を考慮するかどうかに関わらず、登録している(ボードで置いた)コネクトマスで常に計算する。保存済みの旧項目
 * `connect` は読み飛ばす(未知の項目と同じ扱い。キー・封筒の版は変えない)。
 * OFF は**全解放**として試算する(0 として扱うのではない — 育てきった前提で比べる `ui-flow.md`)。
 *
 * 旧キー `skill-filters`(2026-09-05〜06)と旧項目 `costume` / `passives`(衣装スキル発動・パッシブ全員発動の
 * しぼりこみ)は 2026-09-16 に撤去したので読み飛ばす — 未知の項目と同じ扱い。
 *
 * 保存するかどうかは「オプションの保持」(`src/composables/useKeepOptions.ts`)が決める —
 * OFF のあいだは書かず、切り替えた時点でこのキーも消える(2026-09-16 ユーザー指示)。
 */

export const SEARCH_OPTIONS_STORAGE_KEY = "holodori-optimizer:search-options";

export interface SearchOptions {
  /** 登録したホロメンボード(4 色)を反映する(持っているカードのときのみ効く。OFF は全解放) */
  board: boolean;
  /** 登録した開花段階を反映する(持っているカードのときのみ効く) */
  bloom: boolean;
}

export function defaultSearchOptions(): SearchOptions {
  return {
    board: true,
    bloom: true,
  };
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
  const options = defaultSearchOptions();
  options.board = stored.board !== false;
  options.bloom = stored.bloom !== false;
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
