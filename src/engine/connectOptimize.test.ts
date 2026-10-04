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
 * コネクトの最適化(2026-10-02 ユーザー指示)。所持のコネクト(形 × ％ × 枚数)の範囲で、いまの配置から、その編成のユニットスコアが
 * 上がる変更だけを重ねる。値はこのリポジトリのデータから作った検証用の入力で、実機の観測値ではない
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

describe("assignConnects(置き方の選び方。評価器は差し替え)", () => {
  const MIO = "ookami-mio";
  const MIKO = "sakura-miko";
  const A = best("card-3");
  const B = best("general-1");
  const anchorsOf = (p: ConnectPlacementMap, id: string) => p[id] ?? {};
  const common = { ...base, scope: "unit" as const };
  const countOf = (p: ConnectPlacementMap, x: ConnectPlacement): number =>
    Object.values(p)
      .flatMap((a) => Object.values(a))
      .filter((q) => q.extent === x.extent && q.permil === x.permil).length;
  /** 置いた場所に応じて加点する評価器 */
  const scoring =
    (rewards: (p: ConnectPlacementMap) => number) =>
    (p: ConnectPlacementMap): number =>
      1000 + rewards(p);

  it("評価が上がる変更がなければ、いまの配置のまま返す(置いても置かなくても関係ない場所は外さない)", () => {
    const current: ConnectPlacementMap = { [OKAYU]: { center: A, card: B }, [MIO]: { leader: B } };
    const items: ConnectItem[] = [
      { placement: A, count: 1 },
      { placement: B, count: 2 },
    ];
    expect(assignConnects({ ...common, items, current, evaluate: () => 1000 })).toEqual(current);
    expect(
      assignConnects({ ...common, scope: "all", items, current, evaluate: () => 1000 }),
    ).toEqual(current);
    // 所持が空でも、いまの配置は動かさない
    expect(assignConnects({ ...common, items: [], current, evaluate: () => 1000 })).toEqual(
      current,
    );
  });

  it("空いている場所へ、評価が上がるように 1 枚置く", () => {
    const evaluate = scoring((p) => (anchorsOf(p, OKAYU).center?.extent === A.extent ? 500 : 0));
    const chosen = assignConnects({
      ...common,
      items: [{ placement: A, count: 1 }],
      current: {},
      evaluate,
    });
    expect(chosen).toEqual({ [OKAYU]: { center: A } });
  });

  it("同じ評価なら置き換えない(厳密に上がるときだけ置き換え、置き換えた古い 1 枚は空きに戻る)", () => {
    const tie = scoring((p) => {
      const x = anchorsOf(p, OKAYU).center;
      return x?.extent === B.extent ? 500 : x?.extent === A.extent ? 500 : 0;
    });
    const items: ConnectItem[] = [
      { placement: A, count: 1 },
      { placement: B, count: 1 },
    ];
    const current: ConnectPlacementMap = { [OKAYU]: { center: B } };
    expect(assignConnects({ ...common, items, current, evaluate: tie })).toEqual(current);
    const better = scoring((p) => {
      const x = anchorsOf(p, OKAYU).center;
      return x?.extent === B.extent ? 500 : x?.extent === A.extent ? 501 : 0;
    });
    expect(assignConnects({ ...common, items, current, evaluate: better })).toEqual({
      [OKAYU]: { center: A },
    });
  });

  it("枚数が足りないときは、ユニット外が使っているものを外して回す(外して失うぶんより増えるときだけ)", () => {
    const items: ConnectItem[] = [{ placement: A, count: 1 }];
    const current: ConnectPlacementMap = { [MIO]: { center: A } };
    const rewards = (okayu: number) =>
      scoring((p) => {
        const gain = anchorsOf(p, OKAYU).center?.extent === A.extent ? okayu : 0;
        const keep = anchorsOf(p, MIO).center?.extent === A.extent ? 5 : 0;
        return gain + keep;
      });
    // 回すと +500 − 5 → ユニット外から外してユニットへ
    expect(assignConnects({ ...common, items, current, evaluate: rewards(500) })).toEqual({
      [OKAYU]: { center: A },
    });
    // 回しても +3 − 5 < 0 → そのまま
    expect(assignConnects({ ...common, items, current, evaluate: rewards(3) })).toEqual(current);
  });

  it("ユニットのみはユニット外の空きへ置かず、すべてなら置く", () => {
    // 緑だけに掛かる形(center-5)は、編成にいないホロメンでもアカウント全体に効くので置き場所になる
    const G = best("center-5");
    const items: ConnectItem[] = [{ placement: G, count: 2 }];
    const evaluate = scoring((p) => {
      const at = (id: string, n: number) => (anchorsOf(p, id).center?.extent === G.extent ? n : 0);
      return at(MIKO, 300) + at(OKAYU, 100);
    });
    const unit = assignConnects({ ...common, items, current: {}, evaluate });
    expect(unit).toEqual({ [OKAYU]: { center: G } });
    const all = assignConnects({ ...common, scope: "all", items, current: {}, evaluate });
    expect(all).toEqual({ [MIKO]: { center: G }, [OKAYU]: { center: G } });
  });

  it("持っている枚数を超えて置かない", () => {
    const items: ConnectItem[] = [
      { placement: A, count: 2 },
      { placement: B, count: 1 },
    ];
    // 置くほど上がる評価(置いた数 × 10)
    const evaluate = scoring((p) => 10 * Object.values(p).flatMap((a) => Object.values(a)).length);
    for (const scope of ["unit", "all"] as const) {
      const chosen = assignConnects({ ...common, scope, items, current: {}, evaluate });
      expect(countOf(chosen, A)).toBeLessThanOrEqual(2);
      expect(countOf(chosen, B)).toBeLessThanOrEqual(1);
    }
  });

  it("編成にいないホロメンの青・赤、リーダーでないホロメンの赤は試さない(評価に渡る配置に出ない)", () => {
    const seen: ConnectPlacementMap[] = [];
    assignConnects({
      ...common,
      scope: "all",
      current: {},
      items: [
        { placement: A, count: 1 },
        { placement: B, count: 1 },
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
        ...common,
        hasSong,
        current: {},
        items: [{ placement: B, count: 1 }],
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
  const unitIds = [team.leaderId, ...team.memberIds].map(holomenOf);
  const input = {
    leaderHolomenId: holomenOf(team.leaderId),
    memberHolomenIds: team.memberIds.map(holomenOf),
    hasSong: false,
    unlocked: FULL,
    holomenIds: ids,
    evaluate: scoreOf,
  };
  const items: ConnectItem[] = [
    { placement: best("card-3"), count: 3 },
    { placement: best("general-1"), count: 2 },
    { placement: best("center-2"), count: 2 },
  ];

  it(
    "現在の配置から出発するので、推奨は現在より下がらず、すべては ユニットのみ より下がらない",
    { timeout: 60_000 },
    () => {
      const current: ConnectPlacementMap = { [OKAYU]: { center: best("card-3") } };
      const unit = assignConnects({ ...input, items, current, scope: "unit" });
      const all = assignConnects({ ...input, items, current, scope: "all" });
      expect(scoreOf(unit)).toBeGreaterThanOrEqual(scoreOf(current));
      expect(scoreOf(all)).toBeGreaterThanOrEqual(scoreOf(unit));
      expect(scoreOf(unit)).toBeGreaterThan(scoreOf({}));
      // ユニットのみで変わるのは、ユニットのホロメンと、そこへ回すために外したホロメンだけ
      for (const [id, anchors] of Object.entries(unit)) {
        const before = current[id] ?? {};
        for (const [anchor, p] of Object.entries(anchors)) {
          const was = before[anchor as keyof typeof before];
          const changed = was?.extent !== p.extent || was.permil !== p.permil;
          if (changed) expect(unitIds, `${id}/${anchor}`).toContain(id);
        }
      }
      // 持っている枚数を超えない
      for (const item of items) {
        const used = Object.values(all)
          .flatMap((a) => Object.values(a))
          .filter((p) => p.extent === item.placement.extent && p.permil === item.placement.permil);
        expect(used.length).toBeLessThanOrEqual(item.count);
      }
    },
  );

  it(
    "選んだ配置からもう一度選んでも変わらない(これ以上は厳密に上がる変更がない)",
    { timeout: 60_000 },
    () => {
      const once = assignConnects({ ...input, items, current: {}, scope: "unit" });
      const twice = assignConnects({ ...input, items, current: once, scope: "unit" });
      expect(scoreOf(twice)).toBe(scoreOf(once));
      expect(twice).toEqual(once);
    },
  );

  it(
    "画面に出す値は、同じ配置を登録して 6 枠固定で出した値と一致する(別の計算経路を作らない)",
    { timeout: 60_000 },
    () => {
      const chosen = assignConnects({ ...input, items, current: {}, scope: "unit" });
      const fixed = runOptimize({ ...request, connectPlacements: chosen }).candidates[0];
      expect(fixed?.modifiers.adjustedUnitScore).toBe(scoreOf(chosen));
    },
  );
});

describe("assignConnects: 解放していないコネクトマスには置かない(2026-10-04 ユーザー指示)", () => {
  const A = best("card-3");
  const common = {
    ...base,
    scope: "unit" as const,
    items: [{ placement: A, count: 4 }],
    current: {},
  };
  /** 置いた場所の数だけ加点する評価器(どのコネクトマスも同じだけ効く) */
  const evaluate = (p: ConnectPlacementMap): number =>
    1000 + Object.values(p).reduce((sum, anchors) => sum + Object.keys(anchors).length * 100, 0);

  const nonCenter = (p: ConnectPlacementMap): [string, string][] =>
    Object.entries(p).flatMap(([id, anchors]) =>
      Object.keys(anchors)
        .filter((anchor) => anchor !== "center")
        .map((anchor): [string, string] => [id, anchor]),
    );

  it("置くのは解放済みのコネクトマスと中心だけ(未解放の赤・青・黄は候補にしない)", () => {
    const unlockedConnects = { [OKAYU]: ["card" as const], [KOYORI]: ["leader" as const] };
    const chosen = assignConnects({ ...common, evaluate, unlockedConnects });
    for (const [id, anchor] of nonCenter(chosen))
      expect(unlockedConnects[id as keyof typeof unlockedConnects] as readonly string[]).toContain(
        anchor,
      );
    // 解放済みのコネクトにはちゃんと置く(制限だけで何も置かなくなっていない)
    expect(nonCenter(chosen).length).toBeGreaterThan(0);
  });

  it("どのコネクトマスも未解放なら、中心にしか置かない", () => {
    const chosen = assignConnects({ ...common, evaluate, unlockedConnects: {} });
    expect(nonCenter(chosen)).toEqual([]);
    expect(Object.keys(chosen).length).toBeGreaterThan(0);
  });

  it("unlockedConnects を渡さないとどのコネクトマスにも置ける(旧来の呼び方。制限の効果の対照)", () => {
    expect(nonCenter(assignConnects({ ...common, evaluate })).length).toBeGreaterThan(0);
  });
});
