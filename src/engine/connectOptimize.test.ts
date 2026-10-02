import { describe, expect, it } from "vite-plus/test";

import { cards, holomen } from "../data";
import { BLUE_BOARD_NODE_IDS } from "../data/blueBoard";
import { connectPermilCandidates } from "../data/connect";
import type { ConnectPlacement } from "../data/connect";
import { GREEN_BOARD_NODE_IDS } from "../data/greenBoard";
import { RED_BOARD_NODE_IDS } from "../data/redBoard";
import { YELLOW_BOARD_NODE_IDS } from "../data/yellowBoard";
import type { ConnectPlacementMap } from "../storage/connect";
import { assignConnects } from "./connectOptimize";
import type { ConnectItem, UnlockedByColor } from "./connectOptimize";
import { NO_ACCOUNT_BONUS } from "./power";
import { runOptimize, teamEvaluator } from "./request";
import type { OptimizeRunRequest } from "./request";

/**
 * コネクトの最適化(2026-10-02 ユーザー指示)。所持のコネクト(形 × ％ × 枚数)を、その編成のユニットスコアが最大になるように
 * ホロメン × コネクトマスへ置く。値はこのリポジトリのデータから作った検証用の入力で、実機の観測値ではない
 * (テストは大小・一致の関係だけを固定し、スコアの数値は書かない)
 */

const OKAYU = "nekomata-okayu";
const KORONE = "inugami-korone";
const KOYORI = "hakui-koyori";
const ids = holomen.map((h) => h.id);
const everyone = (nodes: readonly string[]): ReadonlyMap<string, ReadonlySet<string>> =>
  new Map(ids.map((id) => [id, new Set(nodes)]));
const FULL: UnlockedByColor = {
  blue: everyone(BLUE_BOARD_NODE_IDS),
  red: everyone(RED_BOARD_NODE_IDS),
  yellow: everyone(YELLOW_BOARD_NODE_IDS),
  green: everyone(GREEN_BOARD_NODE_IDS),
};
const best = (extent: ConnectPlacement["extent"]): ConnectPlacement => ({
  extent,
  permil: connectPermilCandidates(extent).at(-1) ?? 0,
});
const base = {
  leaderHolomenId: KOYORI,
  memberHolomenIds: [OKAYU, KORONE],
  hasSong: false,
  unlocked: FULL,
  holomenIds: ids,
};

describe("assignConnects(置き場所の選び方。評価器は差し替え)", () => {
  it("所持が空なら何も置かない", () => {
    expect(assignConnects({ ...base, items: [], evaluate: () => 1000 })).toEqual({});
    expect(
      assignConnects({
        ...base,
        items: [{ placement: best("card-3"), count: 0 }],
        evaluate: () => 1000,
      }),
    ).toEqual({});
  });

  it("評価が上がらない置き方は置かない", () => {
    const items: ConnectItem[] = [{ placement: best("card-3"), count: 3 }];
    expect(assignConnects({ ...base, items, evaluate: () => 1000 })).toEqual({});
  });

  it("1 枚は 1 か所にだけ置く: 枚数の上限を超えず、1 つのコネクトマスには 1 枚", () => {
    const items: ConnectItem[] = [
      { placement: best("card-3"), count: 2 },
      { placement: best("general-1"), count: 1 },
    ];
    // 置くほど評価が上がる(置いた枚数 × 10)ので、枚数の上限まで置く
    const evaluate = (p: ConnectPlacementMap): number =>
      1000 +
      10 *
        Object.values(p).reduce(
          (sum, anchors) => sum + Object.values(anchors).filter((x) => x).length,
          0,
        );
    const chosen = assignConnects({ ...base, items, evaluate });
    const placed = Object.values(chosen).flatMap((a) => Object.values(a));
    expect(placed.length).toBeLessThanOrEqual(3);
    expect(placed.filter((p) => p.extent === "card-3").length).toBeLessThanOrEqual(2);
    expect(placed.filter((p) => p.extent === "general-1").length).toBeLessThanOrEqual(1);
    for (const anchors of Object.values(chosen)) {
      expect(Object.keys(anchors).length).toBeLessThanOrEqual(4);
    }
  });

  it("増分の大きい置き場所から使う: 1 枚だけなら一番効く場所に置く", () => {
    const items: ConnectItem[] = [{ placement: best("card-3"), count: 1 }];
    // おかゆの中心にだけ大きな増分がある評価
    const evaluate = (p: ConnectPlacementMap): number =>
      1000 + (p[OKAYU]?.center ? 500 : 0) + (p[KORONE]?.center ? 100 : 0);
    const chosen = assignConnects({ ...base, items, evaluate });
    expect(Object.keys(chosen)).toEqual([OKAYU]);
    expect(chosen[OKAYU]?.center).toEqual(items[0]?.placement);
  });

  it("編成にいないホロメンの青・赤、リーダーでないホロメンの赤は試さない(評価に渡る配置に出ない)", () => {
    const seen: ConnectPlacementMap[] = [];
    assignConnects({
      ...base,
      items: [
        { placement: best("card-3"), count: 1 },
        { placement: best("general-1"), count: 1 },
      ],
      evaluate: (p) => {
        seen.push(structuredClone(p));
        return 1000;
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    for (const p of seen) {
      for (const [id, anchors] of Object.entries(p)) {
        if (id !== OKAYU && id !== KORONE) expect(anchors.card, id).toBeUndefined();
        if (id !== KOYORI) expect(anchors.leader, id).toBeUndefined();
      }
    }
  });

  it("黄は曲を指定したときだけ効く: 曲がなければ黄のコネクトマスには試さない", () => {
    const seenContent = (hasSong: boolean): boolean => {
      let seen = false;
      assignConnects({
        ...base,
        hasSong,
        items: [{ placement: best("general-1"), count: 1 }],
        // 黄の範囲にだけ掛かるコネクトマス(content)に置いた配置が評価に渡るか
        evaluate: (p) => {
          if (Object.values(p).some((a) => a.content)) seen = true;
          return 1000;
        },
      });
      return seen;
    };
    expect(seenContent(false)).toBe(false);
    expect(seenContent(true)).toBe(true);
  });
});

describe("コネクトの最適化(実データ)", () => {
  const fullBoards = (nodeIds: readonly string[]) =>
    Object.fromEntries(holomen.map((h) => [h.id, [...nodeIds]]));
  const request: OptimizeRunRequest = {
    leaderId: "hakui-koyori-02",
    fixedMemberIds: [
      "nekomata-okayu-02",
      "inugami-korone-02",
      "shirogane-noel-01",
      "ookami-mio-02",
      "sakura-miko-01",
    ],
    excludedCardIds: [],
    excludedLeaderCardIds: [],
    excludedMemberCardIds: [],
    leaderCandidateIds: null,
    requiredMemberHolomenIds: [],
    songId: null,
    blooms: Object.fromEntries(cards.map((c) => [c.id, 5])),
    boards: fullBoards(BLUE_BOARD_NODE_IDS),
    greenBoards: fullBoards(GREEN_BOARD_NODE_IDS),
    yellowBoards: fullBoards(YELLOW_BOARD_NODE_IDS),
    redBoards: fullBoards(RED_BOARD_NODE_IDS),
    connectPlacements: {},
    account: NO_ACCOUNT_BONUS,
    topN: 1,
  };
  const team = { leaderId: request.leaderId ?? "", memberIds: request.fixedMemberIds };
  const evaluate = teamEvaluator(request, team);
  const scoreOf = (p: ConnectPlacementMap): number => evaluate(p)?.modifiers.adjustedUnitScore ?? 0;
  const holomenOf = (id: string): string => cards.find((c) => c.id === id)?.holomenId ?? "";
  const input = {
    leaderHolomenId: holomenOf(team.leaderId),
    memberHolomenIds: team.memberIds.map(holomenOf),
    hasSong: false,
    unlocked: FULL,
    holomenIds: ids,
    evaluate: scoreOf,
  };

  it(
    "所持を置くと、何も置かないより下がらず、所持が多いほど下がらない",
    { timeout: 60_000 },
    () => {
      const few: ConnectItem[] = [{ placement: best("card-3"), count: 1 }];
      const many: ConnectItem[] = [
        { placement: best("card-3"), count: 3 },
        { placement: best("general-1"), count: 2 },
        { placement: best("center-2"), count: 2 },
      ];
      const none = scoreOf({});
      const withFew = assignConnects({ ...input, items: few });
      const withMany = assignConnects({ ...input, items: many });
      expect(scoreOf(withFew)).toBeGreaterThanOrEqual(none);
      expect(scoreOf(withMany)).toBeGreaterThanOrEqual(scoreOf(withFew));
      expect(scoreOf(withMany)).toBeGreaterThan(none);
      // 置いたものは所持の枚数を超えない
      const placed = Object.values(withMany).flatMap((a) => Object.values(a));
      for (const item of many) {
        const used = placed.filter(
          (p) => p.extent === item.placement.extent && p.permil === item.placement.permil,
        ).length;
        expect(used).toBeLessThanOrEqual(item.count);
      }
      expect(placed.length).toBeLessThanOrEqual(7);
    },
  );

  it(
    "画面に出す値は、同じ配置を登録して 6 枠固定で出した値と一致する(別の計算経路を作らない)",
    { timeout: 60_000 },
    () => {
      const items: ConnectItem[] = [
        { placement: best("card-3"), count: 2 },
        { placement: best("general-1"), count: 2 },
      ];
      const chosen = assignConnects({ ...input, items });
      const fixed = runOptimize({ ...request, connectPlacements: chosen }).candidates[0];
      expect(fixed?.modifiers.adjustedUnitScore).toBe(scoreOf(chosen));
    },
  );
});
