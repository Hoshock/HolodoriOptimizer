// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";

import { emptyHolomenBoards } from "../data/boardState";
import {
  applyConnectPlacements,
  holomenBoardsOf,
  isConnectUnlocked,
  placeConnect,
  setHolomenBoards,
  setRank,
  useBoardConnects,
  useBoards,
  useConnectPlacements,
  useHolomenRanks,
} from "./useBoards";

/**
 * 登録状態の入口(2026-10-04): コネクトの解放と配置は別の状態だが、「未解放なのに配置あり」は保存しない。
 * 解放が外れるとその配置も外れ、解放していないコネクトには置けない(中心は常に置ける)
 */
const OKAYU = "nekomata-okayu";
const placement = { extent: "card-3" as const, permil: 1600 };
const placementOf = (anchor: "center" | "leader" | "card" | "content") =>
  useConnectPlacements().value.find((e) => e.holomenId === OKAYU)?.placements[anchor];

describe("useBoards(コネクトの解放と配置の整合)", () => {
  it("解放していないコネクトには置けない。中心は常に置ける", () => {
    expect(isConnectUnlocked(OKAYU, "center")).toBe(true);
    expect(isConnectUnlocked(OKAYU, "card")).toBe(false);
    expect(placeConnect(OKAYU, "card", placement)).toBe(false);
    expect(placementOf("card")).toBeUndefined();
    expect(placeConnect(OKAYU, "center", placement)).toBe(true);
    expect(placementOf("center")).toEqual(placement);
    expect(placeConnect(OKAYU, "center", null)).toBe(true);
  });

  it("解放済みで配置なしの状態を保てる。解放したら置け、解放が外れると配置も外れる", () => {
    setHolomenBoards(OKAYU, { ...emptyHolomenBoards(), connects: ["card"] });
    expect(isConnectUnlocked(OKAYU, "card")).toBe(true);
    expect(placementOf("card")).toBeUndefined(); // 解放済み・配置なし
    expect(placeConnect(OKAYU, "card", placement)).toBe(true);
    expect(placementOf("card")).toEqual(placement);
    // 解放を外す(コネクトマスを閉じる)と、配置が残らない
    setHolomenBoards(OKAYU, emptyHolomenBoards());
    expect(isConnectUnlocked(OKAYU, "card")).toBe(false);
    expect(placementOf("card")).toBeUndefined();
  });

  it("ボードの 4 色の解放マスとコネクトの解放がまとめて保存され、読み戻せる", () => {
    setHolomenBoards(OKAYU, {
      red: ["R-001"],
      blue: ["B-001", "B-002"],
      yellow: [],
      green: ["G-001"],
      connects: ["leader", "content"],
    });
    expect(holomenBoardsOf(OKAYU)).toEqual({
      red: ["R-001"],
      blue: ["B-001", "B-002"],
      yellow: [],
      green: ["G-001"],
      connects: ["leader", "content"],
    });
    expect(useBoards().blue.value.find((e) => e.holomenId === OKAYU)?.nodes).toEqual([
      "B-001",
      "B-002",
    ]);
    expect(useBoardConnects().value.find((e) => e.holomenId === OKAYU)?.unlocked).toEqual([
      "leader",
      "content",
    ]);
    setHolomenBoards(OKAYU, emptyHolomenBoards());
  });

  it("コネクトの最適化の反映でも、解放していないコネクトへの配置は入れない", () => {
    setHolomenBoards(OKAYU, { ...emptyHolomenBoards(), connects: ["card"] });
    applyConnectPlacements({ [OKAYU]: { card: placement, leader: placement, center: placement } });
    expect(placementOf("card")).toEqual(placement);
    expect(placementOf("center")).toEqual(placement);
    expect(placementOf("leader")).toBeUndefined();
    setHolomenBoards(OKAYU, emptyHolomenBoards());
    applyConnectPlacements({});
  });

  it("ホロメンランクは登録・置き換え・null で未登録へ戻す(ボードは削除しない)", () => {
    setHolomenBoards(OKAYU, { ...emptyHolomenBoards(), blue: ["B-001"] });
    setRank(OKAYU, 27);
    expect(useHolomenRanks().value).toEqual([{ holomenId: OKAYU, rank: 27 }]);
    setRank(OKAYU, null);
    expect(useHolomenRanks().value).toEqual([]);
    expect(holomenBoardsOf(OKAYU).blue).toEqual(["B-001"]);
    setHolomenBoards(OKAYU, emptyHolomenBoards());
  });
});
