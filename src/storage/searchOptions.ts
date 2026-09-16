/**
 * さがすのオプション(育成の反映 2 件・スキル発動条件 2 件)の保存。既定はすべて ON —
 * 既定のまま実行すれば一番よい結果が出るようにする(`.claude/rules/ui-flow.md`)。
 *
 * 新キーがなければ旧キー(衣装・パッシブの 2 件だけを持っていた 2026-09-05〜06 の形式)の値を引き継ぐ。
 * 真偽値だけの設定なので、壊れた値・真偽値でない値は既定へ倒す読み込みで足りる。
 *
 * 保存するかどうかは「オプションの保持」(`src/composables/useKeepOptions.ts`)が決める —
 * OFF のあいだは書かず、切り替えた時点でこのキーも消える(2026-09-16 ユーザー指示)。
 */

export const SEARCH_OPTIONS_STORAGE_KEY = "holodori-optimizer:search-options";
/** 旧キー(2026-09-05〜06)。読み込みのみ */
export const LEGACY_SKILL_FILTER_STORAGE_KEY = "holodori-optimizer:skill-filters";

export interface SearchOptions {
  /** 登録したホロメンボードを反映する(持っているカードのときのみ効く) */
  board: boolean;
  /** 登録した開花段階を反映する(持っているカードのときのみ効く) */
  bloom: boolean;
  /** 衣装スキルが発動する編成だけ */
  costume: boolean;
  /** パッシブが全員発動する編成だけ */
  passives: boolean;
}

export function defaultSearchOptions(): SearchOptions {
  return { board: true, bloom: true, costume: true, passives: true };
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
  return {
    board: stored.board !== false,
    bloom: stored.bloom !== false,
    costume: stored.costume !== false,
    passives: stored.passives !== false,
  };
}

export function loadSearchOptions(): SearchOptions {
  try {
    const raw = localStorage.getItem(SEARCH_OPTIONS_STORAGE_KEY);
    return parseSearchOptions(raw ?? localStorage.getItem(LEGACY_SKILL_FILTER_STORAGE_KEY));
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
