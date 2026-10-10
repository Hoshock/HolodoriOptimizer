import { describe, expect, it } from "vite-plus/test";

import { badgeAtBottom } from "./connectBadge";
import { CONNECT_EXTENT_IDS, CONNECT_EXTENTS } from "../data/connect";

describe("形のタイルの数字の置き場所", () => {
  it("右上の角にマスがある形(上十字)だけ右下に置き、右下の角は空いている", () => {
    expect(CONNECT_EXTENT_IDS.filter(badgeAtBottom)).toEqual(["center-1"]);
    for (const id of CONNECT_EXTENT_IDS.filter(badgeAtBottom)) {
      expect(CONNECT_EXTENTS[id].some(([dx, dy]) => dx >= 1 && dy <= -2)).toBe(false);
    }
  });
});
