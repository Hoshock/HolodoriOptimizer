import { describe, expect, it } from "vite-plus/test";

import { badgeAtBottom } from "./connectBadge";
import { CONNECT_EXTENT_IDS, CONNECT_EXTENTS } from "../data/connect";

/**
 * 形のタイルの数字の札が、どの形のどのマスにも被らない(2026-10-10 ユーザー指示「％表示どの図形でも被らないか注意」)。
 * 寸法は CSS の値の写し(変えたらここも変える): 図形は 7 × 7 の格子で、タイルの内側の余白の中いっぱい(`ConnectFigure`。
 * マスは格子 14 のうち 1.5 の内側から 11)。札の幅は最も長い表記(「+270%」「10/10」)より広めに見積もる
 */
interface TileSpec {
  name: string;
  /** タイルの一辺の範囲(画面幅 360px 〜 広い画面) */
  sizes: number[];
  padding: number;
  badge: { inset: number; height: number; width: number };
}
const SPECS: TileSpec[] = [
  // ボードのコネクト効果(ConnectSheet の .shape / .value): モーダル 328〜416px・4 列
  {
    name: "ボード",
    sizes: [70, 77.5, 92],
    padding: 13,
    badge: { inset: 4, height: 14, width: 46 },
  },
  // アカウントの「コネクト」(ConnectInventorySheet の .shape / .count): 全幅のシート・4 列
  {
    name: "アカウント",
    sizes: [76, 83.5, 170],
    padding: 13,
    badge: { inset: 4, height: 16, width: 46 },
  },
];

const overlaps = (
  a: { x0: number; x1: number; y0: number; y1: number },
  b: { x0: number; x1: number; y0: number; y1: number },
): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe("形のタイルの数字の置き場所", () => {
  it("右上の角が図形にかかる形(上十字)だけ右下に置く", () => {
    expect(CONNECT_EXTENT_IDS.filter(badgeAtBottom)).toEqual(["center-1"]);
  });

  for (const spec of SPECS) {
    it(`${spec.name}のタイル: どの大きさでも、札はどの形のマスにも被らない`, () => {
      for (const size of spec.sizes) {
        const cell = (size - spec.padding * 2) / 7;
        const { inset, height, width } = spec.badge;
        for (const id of CONNECT_EXTENT_IDS) {
          const y0 = badgeAtBottom(id) ? size - inset - height : inset;
          const badge = { x0: size - inset - width, x1: size - inset, y0, y1: y0 + height };
          for (const [dx, dy] of CONNECT_EXTENTS[id]) {
            const left = spec.padding + (dx + 3) * cell + (1.5 / 14) * cell;
            const top = spec.padding + (3 - dy) * cell + (1.5 / 14) * cell;
            const rect = {
              x0: left,
              x1: left + (11 / 14) * cell,
              y0: top,
              y1: top + (11 / 14) * cell,
            };
            expect(
              overlaps(badge, rect),
              `${String(size)}px ${id} (${String(dx)},${String(dy)})`,
            ).toBe(false);
          }
        }
      }
    });
  }
});
