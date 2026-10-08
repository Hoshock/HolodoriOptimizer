import type { SearchOptions } from "../storage/searchOptions";

/**
 * さがすの前提の 3 択(2026-10-08 ユーザー指示で、「所持カードから探す」「ボード状況を考慮する」「開花状況を考慮する」の 3 つをまとめた)。
 * いまの育成で = 所持カード・登録しているボードと開花 / 育てきったら = 所持カード・全解放と最大の開花 / 全カード。
 * ボードと開花の片方だけを考慮する組み合わせは「いらない」(同日ユーザー判断)ので、開花はボードに従う。
 * 保存の形(`search-all` と `search-options`)は変えず、ここで読み替える
 */
export type SearchPremise = "current" | "maxed" | "all";

export const SEARCH_PREMISES: readonly { key: SearchPremise; label: string }[] = [
  { key: "current", label: "いまの育成で" },
  { key: "maxed", label: "育てきったら" },
  { key: "all", label: "全カード" },
];

/** 保存している値から前提を読む。片方だけ OFF の旧保存はボードの値で読む(開花の値は見ない) */
export function searchPremiseOf(searchAll: boolean, options: SearchOptions): SearchPremise {
  if (searchAll) return "all";
  return options.board ? "current" : "maxed";
}

/** 所持カードから探す前提を選んだときに書くオプション(ボードと開花は同じ値) */
export function searchOptionsOf(premise: Exclude<SearchPremise, "all">): SearchOptions {
  const on = premise === "current";
  return { board: on, bloom: on };
}
