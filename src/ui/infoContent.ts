import { SEARCH_PREMISES } from "./searchPremise";
import type { SearchPremise } from "./searchPremise";

/**
 * さがすの 3 択と、結果の「いまのまま / 組み直すと」の見出しの行の ⓘ から開く中身(2026-10-08 ユーザー指示「オプションのタブの近くに
 * information アイコンおいてモーダルで上の表みたいなのを表示したい。結果の今のままとかのタブのところも」)。形は中身に合わせる:
 * 違いがいくつもある 3 択は表(列 = 選択肢、行 = 違い)、言葉の意味が分かればよい結果のタブは名前と短い文。
 * 中身は計算の実装に合わせる: 前提の 3 択は `searchPremise.ts` / `OptimizerPanel` の `current*`、組み直すとは `engine/trueRanking.ts`
 */
export interface InfoTable<K extends string> {
  title: string;
  columns: readonly { key: K; label: string }[];
  rows: readonly { label: string; cells: readonly string[] }[];
}

export interface InfoTerms<K extends string> {
  title: string;
  /** 名前と、その下に 1 文ずつ行を分けて出す文 */
  terms: readonly { key: K; label: string; lines: readonly string[] }[];
}

/**
 * 育成の前提の 3 択。登録の状態は「登録のまま」、最大の状態は「最大」「全解放」で言い方をそろえる(2026-10-08 ユーザー指示「表記揺れも気になる」)。
 * コネクトはどの前提でも登録している配置(全解放のときも、置いた範囲が全解放のマスに掛かる)。「組み直すと / 使える」の行は「意味わからん」で外した
 */
export const PREMISE_INFO: InfoTable<SearchPremise> = {
  title: "育成の前提",
  columns: SEARCH_PREMISES,
  rows: [
    { label: "カード", cells: ["所持のみ", "所持のみ", "未所持も含む"] },
    { label: "開花", cells: ["登録のまま", "最大", "最大"] },
    { label: "ボード", cells: ["登録のまま", "全解放", "全解放"] },
    { label: "頻度マス", cells: ["登録のまま", "全解放", "全解放"] },
    { label: "コネクト", cells: ["登録のまま", "登録のまま", "登録のまま"] },
  ],
};

export type ResultTab = "now" | "grown";

/**
 * 結果のタブ。組み直すとは編成ごとに 組み直しプラン の計算(ボード → コネクト → 頻度。ランクの Pt・所持リソース・所持コネクトの範囲)を
 * かけた値で並べる(ADR-016)。2026-10-08 ユーザー指示で表から文に替えた — 表の形で 3 回直しても「組み直すものと範囲の違いがわからん」
 * 「出てくる編成もいらん」となり、「組み直すとの意味さえわかればいいので表である必要なくない？ただしわかりやすく」。
 * 1 文めで何の順か、2 文めで何を使うか(育てきったら = 制限なしとの違い)だけを言う
 */
export const RESULT_TAB_INFO: InfoTerms<ResultTab> = {
  title: "結果の並び",
  terms: [
    { key: "now", label: "いまのまま", lines: ["さがしたときのスコアの順です。"] },
    {
      key: "grown",
      label: "組み直すと",
      lines: [
        "ボード、コネクト、頻度マスを組み直したときのスコアの順です。",
        "使うのは、いまのランクのPtと、所持しているリソースとコネクトだけです。",
      ],
    },
  ],
};
