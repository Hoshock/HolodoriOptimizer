import { describe, expect, it } from "vite-plus/test";

import { cards, holomen } from "../data";
import { BLUE_BOARD_NODE_IDS } from "../data/blueBoard";
import { CONNECT_EXTENTS, connectBestPermil, connectTargets } from "../data/connect";
import type { ConnectAnchor, ConnectPlacement } from "../data/connect";
import { GREEN_BOARD_NODE_IDS } from "../data/greenBoard";
import { RED_BOARD_NODE_IDS } from "../data/redBoard";
import { YELLOW_BOARD_NODE_IDS } from "../data/yellowBoard";
import type { ConnectPlacementMap } from "../storage/connect";
import { chooseConnectPlacements, connectOptions } from "./connectOptimize";
import type { UnlockedByColor } from "./connectOptimize";
import { NO_ACCOUNT_BONUS } from "./power";
import { runOptimize } from "./request";
import type { OptimizeRunRequest } from "./request";

/**
 * 「コネクトを外した」探索が置く最適なコネクト(2026-10-02 ユーザー指示)。
 * 探索は増幅なしで行い、上位の編成をまとめて最大にする配置を選んで数値と順位を計算し直す。
 * 倍率はそのレベルで取りうる最大に固定し、選ぶのは形だけ。値はこのリポジトリのデータから作った検証用の入力で、
 * 実機の観測値ではない(テストは大小・一致の関係だけを固定し、スコアの数値は書かない)
 */

const OKAYU = "nekomata-okayu";
const full = (ids: readonly string[]): ReadonlySet<string> => new Set(ids);
const FULL: UnlockedByColor = {
  blue: full(BLUE_BOARD_NODE_IDS),
  red: full(RED_BOARD_NODE_IDS),
  yellow: full(YELLOW_BOARD_NODE_IDS),
  green: full(GREEN_BOARD_NODE_IDS),
};
const NONE: UnlockedByColor = {
  blue: new Set(),
  red: new Set(),
  yellow: new Set(),
  green: new Set(),
};

describe("connectOptions(置ける形の候補)", () => {
  it("倍率はそのレベルで取りうる最大に固定され、Lv2 は Lv1 より低くない", () => {
    for (const level of [1, 2] as const) {
      for (const anchor of ["center", "leader", "card", "content"] as const) {
        for (const o of connectOptions(OKAYU, anchor, FULL, level, true)) {
          expect(o.placement.permil).toBe(connectBestPermil(o.placement.extent, level));
        }
      }
    }
    for (const extent of Object.keys(CONNECT_EXTENTS) as (keyof typeof CONNECT_EXTENTS)[]) {
      expect(connectBestPermil(extent, 2)).toBeGreaterThanOrEqual(connectBestPermil(extent, 1));
      expect(connectBestPermil(extent, 1)).toBeGreaterThan(0);
    }
  });

  it("解放済みのマスに掛からない形は出さない(何も解放していなければ空)", () => {
    for (const anchor of ["center", "leader", "card", "content"] as const) {
      expect(connectOptions(OKAYU, anchor, NONE, 2, true)).toEqual([]);
    }
  });

  it("黄は曲を指定したときだけ効く: 黄だけに掛かる黄のコネクトは、曲がなければ候補がなく、あれば候補がある", () => {
    expect(connectOptions(OKAYU, "content", FULL, 2, false)).toEqual([]);
    expect(connectOptions(OKAYU, "content", FULL, 2, true).length).toBeGreaterThan(0);
  });

  it("範囲が他の形に含まれて倍率も低い形は出さない(必ず負ける)", () => {
    for (const anchor of ["center", "leader", "card", "content"] as const) {
      const list = connectOptions(OKAYU, anchor, FULL, 2, true);
      for (const a of list) {
        for (const b of list) {
          if (a === b) continue;
          const subset = [...a.cells].every((c) => b.cells.has(c));
          expect(subset && b.placement.permil >= a.placement.permil, `${anchor}`).toBe(false);
        }
      }
    }
  });

  it("候補の範囲は connectTargets と一致する(解放済みに限る)", () => {
    const layout = holomen.find((h) => h.id === OKAYU)?.board;
    expect(layout).toBeDefined();
    if (!layout) return;
    const options = connectOptions(OKAYU, "card", FULL, 2, true);
    for (const o of options) {
      const targets = connectTargets(layout, "card", o.placement.extent).filter((t) =>
        FULL[t.color].has(t.nodeId),
      );
      expect(o.cells.size).toBeLessThanOrEqual(targets.length);
      expect(o.cells.size).toBeGreaterThan(0);
    }
  });
});

describe("chooseConnectPlacements(配置の選び方。評価器は差し替え)", () => {
  const team = (leader: string, ...members: string[]) => ({
    leaderHolomenId: leader,
    memberHolomenIds: members,
  });
  const ids = holomen.map((h) => h.id);
  const base = {
    hasSong: false,
    unlocked: {
      blue: new Map(ids.map((id) => [id, FULL.blue])),
      red: new Map(ids.map((id) => [id, FULL.red])),
      yellow: new Map(ids.map((id) => [id, FULL.yellow])),
      green: new Map(ids.map((id) => [id, FULL.green])),
    },
    holomenIds: ids,
    level: 2 as const,
  };

  it("評価が上がる形を選び、何も効かなければ何も置かない", () => {
    const teams = [team("tokino-sora", OKAYU, "inugami-korone")];
    expect(
      chooseConnectPlacements({ ...base, teams, evaluate: (_p, idx) => idx.map(() => 1000) }),
    ).toEqual({});

    // おかゆの青のコネクトに置く最初の候補の形だけに、評価の加点がある
    const target = connectOptions(OKAYU, "card", FULL, 2, false)[0]?.placement as ConnectPlacement;
    const evaluate = (p: ConnectPlacementMap, idx: readonly number[]): number[] =>
      idx.map(() => 1000 + (p[OKAYU]?.card?.extent === target.extent ? 50 : 0));
    const chosen = chooseConnectPlacements({ ...base, teams, evaluate });
    expect(chosen[OKAYU]?.card).toEqual(target);
  });

  it("編成にいないホロメンの青・赤、リーダーでないホロメンの赤は試さない(評価に渡る配置に出ない)", () => {
    const teams = [team("tokino-sora", OKAYU, "inugami-korone")];
    const seen: ConnectPlacementMap[] = [];
    chooseConnectPlacements({
      ...base,
      teams,
      evaluate: (p, idx) => {
        seen.push(structuredClone(p));
        return idx.map(() => 1000);
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    // 編成にいないホロメンは card(青)・leader(赤)に置かれない
    for (const p of seen) {
      for (const [id, anchors] of Object.entries(p) as [
        string,
        Partial<Record<ConnectAnchor, unknown>>,
      ][]) {
        if (id !== OKAYU && id !== "inugami-korone") expect(anchors.card, id).toBeUndefined();
        if (id !== "tokino-sora") expect(anchors.leader, id).toBeUndefined();
      }
    }
  });

  it("編成が空なら何も置かない", () => {
    expect(chooseConnectPlacements({ ...base, teams: [], evaluate: () => [] })).toEqual({});
  });
});

describe("runOptimize の connectOptimize(実データ)", () => {
  const fullBoards = (nodeIds: readonly string[]) =>
    Object.fromEntries(holomen.map((h) => [h.id, [...nodeIds]]));
  const request: OptimizeRunRequest = {
    leaderId: "hakui-koyori-02",
    fixedMemberIds: ["nekomata-okayu-02", "inugami-korone-02", "shirogane-noel-01"],
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
    topN: 10,
  };
  const key = (c: { leader: { id: string }; members: { id: string }[] }): string =>
    `${c.leader.id}/${c.members
      .map((m) => m.id)
      .sort()
      .join(",")}`;
  const scoreOf = (c: { modifiers: { adjustedUnitScore: number } }): number =>
    c.modifiers.adjustedUnitScore;

  it("指定しなければ従来どおり(配置を返さず、増幅なしのまま)", () => {
    const plain = runOptimize(request);
    expect(plain.connectPlacements).toBeUndefined();
  });

  it(
    "上位の編成の値は増幅なしより下がらず、降順に並び、レベルが高いほど下がらない",
    { timeout: 60_000 },
    () => {
      const plain = runOptimize(request);
      const lv1 = runOptimize({ ...request, connectOptimize: { level: 1 } });
      const lv2 = runOptimize({ ...request, connectOptimize: { level: 2 } });
      for (const result of [lv1, lv2]) {
        expect(result.connectPlacements).toBeDefined();
        expect(Object.keys(result.connectPlacements ?? {}).length).toBeGreaterThan(0);
        const scores = result.candidates.map(scoreOf);
        expect(scores).toEqual([...scores].sort((a, b) => b - a));
      }
      const before = new Map(plain.candidates.map((c) => [key(c), scoreOf(c)]));
      for (const c of lv1.candidates) {
        const was = before.get(key(c));
        if (was !== undefined) expect(scoreOf(c)).toBeGreaterThanOrEqual(was);
      }
      const sum = (r: typeof plain): number => r.candidates.reduce((a, c) => a + scoreOf(c), 0);
      expect(sum(lv1)).toBeGreaterThan(sum(plain));
      expect(sum(lv2)).toBeGreaterThanOrEqual(sum(lv1));
      // 置いた倍率はどれもそのレベルの最大
      for (const [level, result] of [
        [1, lv1],
        [2, lv2],
      ] as const) {
        for (const anchors of Object.values(result.connectPlacements ?? {})) {
          for (const p of Object.values(anchors)) {
            expect(p.permil).toBe(connectBestPermil(p.extent, level));
          }
        }
      }
    },
  );

  it(
    "画面に出す値は、同じ配置を登録して 6 枠固定で出した値と一致する(別の計算経路を作らない)",
    { timeout: 60_000 },
    () => {
      const result = runOptimize({ ...request, connectOptimize: { level: 2 } });
      const top = result.candidates[0];
      expect(top).toBeDefined();
      if (!top) return;
      const again = runOptimize({
        ...request,
        leaderId: top.leader.id,
        fixedMemberIds: top.members.map((m) => m.id),
        connectPlacements: result.connectPlacements,
        topN: 1,
      }).candidates[0];
      expect(again && scoreOf(again)).toBe(scoreOf(top));
      expect(again?.breakdown.totalPower).toBe(top.breakdown.totalPower);
    },
  );

  it(
    "登録したコネクトの値は見ない(探索に渡した配置より最適な配置を選び直す)",
    { timeout: 60_000 },
    () => {
      const withRegistered = runOptimize({
        ...request,
        connectPlacements: { [OKAYU]: { card: { extent: "card-2", permil: 1 } } },
        connectOptimize: { level: 1 },
      });
      const without = runOptimize({ ...request, connectOptimize: { level: 1 } });
      expect(withRegistered.connectPlacements).toEqual(without.connectPlacements);
      expect(withRegistered.candidates.map(scoreOf)).toEqual(without.candidates.map(scoreOf));
    },
  );
});
