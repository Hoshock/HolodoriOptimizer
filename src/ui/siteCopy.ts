/**
 * 画面に出すサイトの文言（説明セクション `AboutSection.vue` と共有文 `share.ts`）。
 * 実機で文言・位置を試す開発用の「文言・配置」は 2026-10-04 に廃止し（ユーザー指示）、決まった文言だけをここに置く。
 * このファイルは localStorage も DOM も触らない。
 */

export interface SiteCopy {
  /** 説明セクションの見出し。**改行が折り返しの位置**（行ごとにまとまりとして出す） */
  heading: string;
  /** 見出しの下の説明文 */
  lead: string;
  /** できることの小見出し */
  featuresTitle: string;
  /** できること。1 行 1 項目 */
  features: string;
  /** 解説ページへのリンクのラベル。1 行 1 つで、並びは GUIDE_LINK_PATHS と同じ */
  linkLabels: string;
  /** 共有文の 1 行目 */
  shareLead: string;
  /** 共有文の最後に付けるタグ */
  shareTag: string;
}

/** 解説ページの位置。ラベルだけ調整できるように、行き先はここで固定する */
export const GUIDE_LINK_PATHS: readonly string[] = ["guides/simulator/", "guides/unit-score/"];

export const SITE_COPY: SiteCopy = {
  heading: "所持カードから最適編成を探す\n編成シミュレーター",
  lead: "ホロドリの編成シミュレーターです。所持カード・開花・ホロメンボード・コネクト・イベントメモリー・メンバー強化ボーナス・楽曲条件を反映し、組める編成を全探索。ユニットスコアやスキル効果をシミュレーションして比較できます。",
  featuresTitle: "このツールでできること",
  // 並びは重要度順を優先し、同じくらいのものは画面の操作順(2026-09-14 ユーザー指示)。
  // 試算値であることはフッタの免責に書いてあるので、ここには重ねない
  features: [
    "所持カードから編成候補を全探索する",
    "リーダーとメンバー5人を評価する",
    "ホロメンボードとコネクトを反映する",
    "ボード・コネクト・発動頻度マスの組み直しを提案する",
    "開花、衣装スキル、パッシブスキルを反映する",
    "イベントメモリーとメンバー強化ボーナスを反映する",
    "楽曲条件を指定できる",
  ].join("\n"),
  linkLabels: "編成シミュレーターの使い方\nユニットスコア計算と内訳",
  shareLead: "ホロドリの所持カードから編成を全探索",
  shareTag: "#ホロドリ",
};

/** 複数行の欄を配列にする（前後の空白と空行は落とす） */
export function linesOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
