/**
 * ホロメンボードPt(ホロメンごとの解放の予算)の正典。**外部マスタ由来(external master-derived)**で、実機の目視確認済みではない。
 *
 * 出所: HolodoriDB の公開 master 差分(コミット e83a4eb03baf974c434eb0ddfa1cd1d2385dad11)の
 * `CharacterLevel.json`(skillTreePointQuantity)・`SkillTreeNode.json`(consumptionSkillTreePointQuantity)・
 * `SkillTreeNodePosition.json`・`SkillTreePoint.json`・`LangSkillTreePoint_Jpn.json`(2026-10-04 ユーザー提供。
 * 同じマス ID が複数の tree-model にあってもボードPtが食い違うものはなかった)。docs/human/evidence-policy.md の
 * 「外部解析」の段であり、`reported / rechecked` に昇格させない。
 *
 * このモデルの前提(2026-10-04 ユーザー指示):
 * - ホロメンごとの制約資源として扱うのは「ホロメンボードPt」だけ。**各色キューブ・コアキューブはアカウント全体で共有する別の資材**で、
 *   マス別の消費量は `src/data/boardMaterials.ts`、使うのは組み直しプランと結果の「組み直すと」(ボードの段)だけ(手動でボードを開ける操作は制限しない)。
 *   ピース・クリスタル・ホロゴールドは無限扱い。Dream Rank は常に 30 以上と仮定し、マスの Dream Rank 条件は無視する
 * - ホロメンランクは 1〜50 の任意登録。**未登録(null / undefined)は「ボードPt の制限なし」**で、0 を未登録の代わりにしない
 * - 予算は 4 色のボード全体で 1 つ(色ごとの別予算ではない)
 * - 解放が必要なコネクトマス(赤 / 青 / 黄のコネクト。S-002 / S-003 / S-004)は各 1 Pt。中心(S-001)は 0 Pt で最初から解放済み
 *
 * この層は純粋な表だけを持つ(ボードの定義へは依存しない — 各色のボードがここからコストを引く)
 */

/** ホロメンランクの範囲(現在のマスタ。2026-10-04) */
export const HOLOMEN_RANK_MIN = 1;
export const HOLOMEN_RANK_MAX = 50;
/** ランクの入力ダイアログで、未登録のときに始める値(2026-10-06 ユーザー指示。登録済みなら現在値から始める) */
export const HOLOMEN_RANK_DEFAULT = 30;

/**
 * そのランクに到達したときに**追加でもらえる**ボードPt(CharacterLevel.json の skillTreePointQuantity)。
 * 区間 [from, to] の各ランクが perRank。ランク 1 は 0
 */
const RANK_POINT_BANDS: readonly { from: number; to: number; perRank: number }[] = [
  { from: 2, to: 4, perRank: 2 },
  { from: 5, to: 9, perRank: 3 },
  { from: 10, to: 14, perRank: 5 },
  { from: 15, to: 19, perRank: 6 },
  { from: 20, to: 24, perRank: 7 },
  { from: 25, to: 29, perRank: 8 },
  { from: 30, to: 50, perRank: 10 },
];

/** ランク 1〜50 に到達した時点の累積ボードPt(添字 = ランク。0 番は使わない) */
const CUMULATIVE_RANK_POINTS: readonly number[] = (() => {
  const table: number[] = [0, 0];
  for (let rank = 2; rank <= HOLOMEN_RANK_MAX; rank += 1) {
    const band = RANK_POINT_BANDS.find((b) => rank >= b.from && rank <= b.to);
    table.push((table[rank - 1] ?? 0) + (band?.perRank ?? 0));
  }
  return table;
})();

/** 有効なホロメンランクか(1〜50 の整数) */
export function isValidHolomenRank(rank: unknown): rank is number {
  return (
    typeof rank === "number" &&
    Number.isInteger(rank) &&
    rank >= HOLOMEN_RANK_MIN &&
    rank <= HOLOMEN_RANK_MAX
  );
}

/**
 * ホロメンランクまでに獲得した累積ボードPt(ランク 1 = 0、ランク 30 = 161、ランク 50 = 361)。
 * ランクの範囲外・非整数は呼び出し側の誤りなので例外にする(未登録は呼び出し側で null として扱い、ここへ渡さない)
 */
export function boardPointsForRank(rank: number): number {
  if (!isValidHolomenRank(rank))
    throw new RangeError(`ホロメンランクは 1〜50 の整数: ${String(rank)}`);
  return CUMULATIVE_RANK_POINTS[rank] ?? 0;
}

/** ボードの色。src/storage/boards.ts の BoardColor と同じ(ここはデータ層なので文字列の型だけ持つ) */
export type BoardPointColor = "red" | "blue" | "yellow" | "green";

/** 各色の通常マスの必要ボードPt(001 から順。SkillTreeNode.json の consumptionSkillTreePointQuantity) */
const NODE_COST_LISTS: Readonly<Record<BoardPointColor, readonly number[]>> = {
  // 赤 R-001〜R-063(63 マス・合計 212 Pt)
  red: [
    1, 2, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 5, 3, 3, 3, 5, 2, 2, 2, 2, 2, 5, 3, 3, 5, 3, 3, 3, 5, 2,
    2, 4, 3, 3, 3, 3, 5, 3, 3, 3, 5, 5, 3, 3, 3, 5, 4, 4, 6, 4, 4, 4, 6, 4, 6, 4, 6, 4, 4, 5, 5,
  ],
  // 青 B-001〜B-031(31 マス・合計 86 Pt)
  blue: [
    1, 1, 1, 1, 1, 2, 4, 2, 2, 2, 3, 3, 5, 3, 5, 2, 2, 3, 3, 5, 3, 5, 2, 2, 2, 2, 3, 3, 5, 3, 5,
  ],
  // 黄 Y-001〜Y-031(31 マス・合計 86 Pt)
  yellow: [
    1, 1, 1, 1, 1, 2, 2, 4, 2, 2, 3, 3, 5, 3, 5, 2, 2, 3, 3, 5, 3, 5, 2, 2, 2, 2, 3, 3, 5, 3, 5,
  ],
  // 緑 G-001〜G-025(25 マス・合計 66 Pt)
  green: [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 5, 3, 3, 5, 3, 3, 5, 3, 3, 3, 3, 3, 3, 3, 3],
};

const NODE_ID_PREFIX: Readonly<Record<BoardPointColor, string>> = {
  red: "R",
  blue: "B",
  yellow: "Y",
  green: "G",
};

const pad3 = (n: number): string => String(n).padStart(3, "0");

/** マス ID(R-001 など)→ 必要ボードPt。全色を 1 つの表にまとめる(ID の頭文字が色を分ける) */
export const BOARD_NODE_COSTS: ReadonlyMap<string, number> = new Map(
  (Object.keys(NODE_COST_LISTS) as BoardPointColor[]).flatMap((color) =>
    NODE_COST_LISTS[color].map((cost, i): [string, number] => [
      `${NODE_ID_PREFIX[color]}-${pad3(i + 1)}`,
      cost,
    ]),
  ),
);

/** 色ごとの通常マス数・合計Pt(テスト・表示用) */
export function boardColorTotals(color: BoardPointColor): { nodes: number; points: number } {
  const list = NODE_COST_LISTS[color];
  return { nodes: list.length, points: list.reduce((a, b) => a + b, 0) };
}

/** 通常マスの必要ボードPt。表にない ID は null(未知のマスは数えない) */
export function nodeBoardPoints(nodeId: string): number | null {
  return BOARD_NODE_COSTS.get(nodeId) ?? null;
}

/** 解放が必要なコネクトマス(赤 / 青 / 黄)1 つの必要ボードPt。中心は 0 */
export const CONNECT_UNLOCK_POINTS = 1;
