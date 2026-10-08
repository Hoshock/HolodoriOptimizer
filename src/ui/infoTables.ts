import { SEARCH_PREMISES } from "./searchPremise";
import type { SearchPremise } from "./searchPremise";

/**
 * さがすの 3 択と、結果の「いまのまま / 組み直すと」の横の ⓘ から開く表(2026-10-08 ユーザー指示「オプションのタブの近くに
 * information アイコンおいてモーダルで上の表みたいなのを表示したい。結果の今のままとかのタブのところも」)。
 * 選択肢を列、違いを行にした表だけを出す(説明の文は置かない)。中身は計算の実装に合わせる:
 * 前提の 3 択は `searchPremise.ts` / `OptimizerPanel` の `current*`、組み直すとは `engine/trueRanking.ts`
 */
export interface InfoTable<K extends string> {
  title: string;
  columns: readonly { key: K; label: string }[];
  rows: readonly { label: string; cells: readonly string[] }[];
}

/**
 * 育成の前提の 3 択。登録の状態は「登録のまま」、最大の状態は「最大」「全解放」で言い方をそろえる(2026-10-08 ユーザー指示「表記揺れも気になる」)。
 * コネクトはどの前提でも登録している配置(全解放のときも、置いた範囲が全解放のマスに掛かる)。組み直すとが使えるかは結果の表に置く
 * (「組み直すと / 使える」の行は「意味わからん」で外した)
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
 * 結果のタブ。組み直すとは編成ごとに 組み直しプラン の計算(ボード → コネクト → 頻度。ユニットスコア重視・リーダーとメンバーの
 * ホロメンだけ・所持リソースを考慮)をかけた値で並べ、候補には見込みで拾った「組み直すと伸びる編成」も足す(ADR-016)。
 * 変わるものは「変えない / 組み直す」の対で言う
 */
export const RESULT_TAB_INFO: InfoTable<ResultTab> = {
  title: "結果の並び",
  columns: [
    { key: "now", label: "いまのまま" },
    { key: "grown", label: "組み直すと" },
  ],
  rows: [
    { label: "編成", cells: ["さがした結果", "さがした結果と、組み直すと伸びる編成"] },
    { label: "ボード", cells: ["変えない", "組み直す"] },
    { label: "コネクト", cells: ["変えない", "組み直す"] },
    { label: "頻度マス", cells: ["変えない", "組み直す"] },
    { label: "開花", cells: ["変えない", "変えない"] },
    { label: "上限", cells: ["—", "ランクのPt、所持リソース、所持コネクト"] },
    { label: "対象ホロメン", cells: ["—", "リーダーとメンバー"] },
    {
      label: "使えるとき",
      cells: ["いつも", "「いまの育成で」でさがし、ボードを登録しているとき"],
    },
  ],
};
