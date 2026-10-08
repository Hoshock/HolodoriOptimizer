/**
 * ホロメンボードのマスごとの**キューブ・コアキューブ消費量**の正典。**外部マスタ由来(external master-derived)**で、実機の目視確認済みではない。
 *
 * 出所: HolodoriDB/holodori-db-jpn-diff の公開 master(コミット e83a4eb03baf974c434eb0ddfa1cd1d2385dad11、master data version
 * 5267906a638d20ddfc5c68dcb7775b0bda3484dfbb65006cd8e7dc59232112bc)の `SkillTreeNode.json` の `consumptions`
 * (資材の意味は `Item.json` / `LangItem_Jpn.json`。2026-10-07 ユーザー提供)。全マスを確認し、同じマス ID が複数のレコードにあっても
 * 資材の消費量が食い違うものはなかった。docs/human/evidence-policy.md の「外部解析」の段で、`reported / rechecked` に昇格させない。
 *
 * master 上の資材 ID(色ごとにキューブとコアキューブ。マスを開けるとその**色の**資材だけを消費し、色をまたいだ変換はない):
 * - 赤 = `item-skill_tree_leader-1`(レッドキューブ)/ `-2`(レッドコアキューブ)
 * - 青 = `item-skill_tree_card-1`(ブルーキューブ)/ `-2`(ブルーコアキューブ)
 * - 黄 = `item-skill_tree_content-1`(イエローキューブ)/ `-2`(イエローコアキューブ)
 * - 緑 = `item-skill_tree_allmember-1`(グリーンキューブ)/ `-2`(グリーンコアキューブ)
 *
 * **ボードPt から資材を推測しない**(R-034 は 4 Pt で cube 50 / core 10、R-050 は 4 Pt で cube 200 / core 0 のように、同じ Pt でも違う)。
 * 非中心のコネクトマス(S-002 / S-003 / S-004)は cube 0 / core 0 でボードPt だけを消費する。中心(S-001)は最初から解放済みで 0。
 *
 * この層は純粋な表だけを持つ。**ユーザーが入力する「余りのリソース」(`src/storage/boardResources.ts`)とは混ぜない**。
 * このツールの手動のボード操作(マスを開ける・コネクトを開ける・すべて解放)は資材で制限しない — 資材は組み直しプランと結果の「組み直すと」(ボードの段)だけの共有制約。
 */

/** 1 マスを開けるのに要るキューブ・コアキューブの個数 */
export interface BoardMaterialCost {
  cube: number;
  core: number;
}

/** ボードの色(`src/storage/boards.ts` の BoardColor と同じ。ここはデータ層なので文字列の型だけ持つ) */
export type BoardMaterialColor = "red" | "blue" | "yellow" | "green";
export const BOARD_MATERIAL_COLORS: readonly BoardMaterialColor[] = [
  "red",
  "blue",
  "yellow",
  "green",
];

/** 色ごとの資材の合計(全ホロメン分など) */
export type BoardMaterials = Record<BoardMaterialColor, BoardMaterialCost>;

export function emptyBoardMaterials(): BoardMaterials {
  return {
    red: { cube: 0, core: 0 },
    blue: { cube: 0, core: 0 },
    yellow: { cube: 0, core: 0 },
    green: { cube: 0, core: 0 },
  };
}

/** (cube, core) ごとにマス ID の番号をまとめた表(master の consumptions を値ごとにまとめ直したもの) */
interface CostGroup {
  cube: number;
  core: number;
  numbers: readonly number[];
}

const RED_GROUPS: readonly CostGroup[] = [
  { cube: 20, core: 0, numbers: [1, 3, 4, 5] },
  { cube: 25, core: 5, numbers: [2] },
  { cube: 40, core: 0, numbers: [6, 7, 8, 9, 10, 19, 20, 21, 22, 23, 32, 33] },
  {
    cube: 80,
    core: 0,
    numbers: [11, 12, 13, 15, 16, 17, 25, 26, 28, 29, 30, 35, 36, 37, 38, 40, 41, 42, 45, 46, 47],
  },
  { cube: 50, core: 10, numbers: [34, 49] },
  { cube: 200, core: 0, numbers: [50, 52, 53, 54, 56, 58, 60, 61] },
  { cube: 100, core: 25, numbers: [14, 18, 24, 27, 31, 39, 43, 44, 48, 62, 63] },
  { cube: 250, core: 75, numbers: [51, 55, 57, 59] },
];

const BLUE_GROUPS: readonly CostGroup[] = [
  { cube: 20, core: 0, numbers: [1, 2, 3, 4, 5] },
  { cube: 40, core: 0, numbers: [6, 8, 9, 10, 16, 17, 23, 24, 25, 26] },
  { cube: 80, core: 0, numbers: [11, 12, 14, 18, 19, 21, 27, 28, 30] },
  { cube: 50, core: 10, numbers: [7] },
  { cube: 100, core: 25, numbers: [13, 15, 20, 22, 29, 31] },
];

const YELLOW_GROUPS: readonly CostGroup[] = [
  { cube: 20, core: 0, numbers: [1, 2, 3, 4, 5] },
  { cube: 40, core: 0, numbers: [6, 7, 9, 10, 16, 17, 23, 24, 25, 26] },
  { cube: 80, core: 0, numbers: [11, 12, 14, 18, 19, 21, 27, 28, 30] },
  { cube: 50, core: 10, numbers: [8] },
  { cube: 100, core: 25, numbers: [13, 15, 20, 22, 29, 31] },
];

const GREEN_GROUPS: readonly CostGroup[] = [
  { cube: 20, core: 0, numbers: [1, 2, 3, 4, 5] },
  { cube: 80, core: 0, numbers: [6, 7, 8, 9, 10] },
  { cube: 160, core: 0, numbers: [12, 13, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25] },
  { cube: 200, core: 50, numbers: [11, 14, 17] },
];

const GROUPS: Readonly<Record<BoardMaterialColor, readonly CostGroup[]>> = {
  red: RED_GROUPS,
  blue: BLUE_GROUPS,
  yellow: YELLOW_GROUPS,
  green: GREEN_GROUPS,
};

const NODE_ID_PREFIX: Readonly<Record<BoardMaterialColor, string>> = {
  red: "R",
  blue: "B",
  yellow: "Y",
  green: "G",
};

const pad3 = (n: number): string => String(n).padStart(3, "0");

/** 解放が必要なコネクトマス(赤 / 青 / 黄)のマス ID。ボードPt だけを消費し、資材は 0 */
const CONNECTOR_NODE_IDS: readonly string[] = ["S-002", "S-003", "S-004"];

/** マス ID(R-001 など)→ 必要な資材。全色を 1 つの表にまとめる(ID の頭文字が色を分ける)。コネクトマス(S-002〜S-004)は 0 / 0 */
export const BOARD_NODE_MATERIALS: ReadonlyMap<string, BoardMaterialCost> = new Map([
  ...BOARD_MATERIAL_COLORS.flatMap((color) =>
    GROUPS[color].flatMap((group) =>
      group.numbers.map((n): [string, BoardMaterialCost] => [
        `${NODE_ID_PREFIX[color]}-${pad3(n)}`,
        { cube: group.cube, core: group.core },
      ]),
    ),
  ),
  ...CONNECTOR_NODE_IDS.map((id): [string, BoardMaterialCost] => [id, { cube: 0, core: 0 }]),
]);

/** マス ID から必要なキューブ・コアキューブを返す。表にない ID は null(未知のマスは数えない) */
export function nodeBoardMaterials(nodeId: string): BoardMaterialCost | null {
  return BOARD_NODE_MATERIALS.get(nodeId) ?? null;
}

/** 色ごとの通常マス数・資材の合計(テスト・表示用。コネクトマスは含めない) */
export function boardColorMaterialTotals(color: BoardMaterialColor): {
  nodes: number;
  cube: number;
  core: number;
} {
  let nodes = 0;
  let cube = 0;
  let core = 0;
  for (const group of GROUPS[color]) {
    nodes += group.numbers.length;
    cube += group.cube * group.numbers.length;
    core += group.core * group.numbers.length;
  }
  return { nodes, cube, core };
}
