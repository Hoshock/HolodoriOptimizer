import { describe, expect, it } from "vite-plus/test";

import { cards, holomen, songById } from "../data";
import { BLUE_BOARD_NODE_IDS } from "../data/blueBoard";
import { connectFactorMapOf, factorsForColor } from "../data/connect";
import { GREEN_BOARD_NODE_IDS, accountGreenEffects } from "../data/greenBoard";
import { RED_BOARD_NODE_IDS, redUnitEffectsByHolomen } from "../data/redBoard";
import { resolveCard } from "../data/resolve";
import {
  YELLOW_BOARD_NODE_IDS,
  accountYellowEffects,
  yellowSongBonusPermil,
} from "../data/yellowBoard";
import { optimizeExact } from "./exactSearch";
import { optimize } from "./optimize";
import { buildHolomenMap } from "./score";

/**
 * 実データ + ボードを開けたアカウントでの、shortlist(上限値の上位)の取りこぼしの回帰テスト(2026-09-30)。
 *
 * 症状: リーダーと「水着こより」を固定して探したときより、メンバーを全部おまかせにしたときのユニットスコアが低い。
 * おまかせの探索空間は固定メンバーの探索空間を含むので、探索が厳密なら起こらない。原因は shortlist の上限値が、
 * 青ボードで発動率・頻度を上げたアカウントでは正確な値の 1.3 倍近くまで緩み(同時候補の正規化 max(1, Σp) を無視した
 * 線形和だったため)、上限値の緩い編成が上位 500 件を埋めて真の上位を落としたこと。ボードを開けたランダムなアカウント
 * 40 通り(プール 18〜23 枚)のうち 9 通りで、おまかせ探索の 1 位が厳密探索の 1 位に届かなかった。
 *
 * アカウントの値は擬似乱数(固定 seed)で作った検証用の入力で、実機の観測値ではない。
 */

const holomenMap = buildHolomenMap(holomen);
const song = songById.get("song-206");
const LEADER_ID = "hakui-koyori-02";

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function scenario(seed: number) {
  const r = rng(seed);
  const frac = r();
  const keepN = 18 + Math.floor(r() * 6);
  const keep = new Set([LEADER_ID]);
  const ids = cards.map((c) => c.id);
  while (keep.size < keepN) keep.add(ids[Math.floor(r() * ids.length)] ?? LEADER_ID);
  const blooms = Object.fromEntries(cards.map((c) => [c.id, Math.floor(r() * 6)]));
  const pick = (nodeIds: readonly string[]) =>
    Object.fromEntries(holomen.map((h) => [h.id, nodeIds.filter(() => r() < frac)]));
  const boards = pick(BLUE_BOARD_NODE_IDS);
  const greenBoards = pick(GREEN_BOARD_NODE_IDS);
  const yellowBoards = pick(YELLOW_BOARD_NODE_IDS);
  const redBoards = pick(RED_BOARD_NODE_IDS);
  const account = { memoryPercent: r() * 10, enhancementPercent: r() * 10 };
  const connect = connectFactorMapOf({});
  const green = accountGreenEffects(greenBoards, factorsForColor(connect, "green"));
  const resolved = cards
    .filter((c) => keep.has(c.id))
    .map((c) => resolveCard(c, blooms, boards, green, connect));
  const leader = resolved.find((c) => c.id === LEADER_ID) ?? null;
  const songBonus = song
    ? yellowSongBonusPermil(
        accountYellowEffects(yellowBoards, factorsForColor(connect, "yellow")),
        song,
      ) / 1000
    : 0;
  const redByHolomen = redUnitEffectsByHolomen(
    redBoards,
    song ?? null,
    factorsForColor(connect, "red"),
  );
  return { resolved, leader, request: { leader, songBonus, redByHolomen, account, topN: 10 } };
}

describe("shortlist の取りこぼし(実データ・ボード開放済みアカウント)", () => {
  // seed 100 + trial: 旧実装で取りこぼしが出た trial 0 / 7 / 25 を含む
  for (const seed of [100, 107, 125]) {
    it(`shortlist を小さくしても検証パスで厳密探索の Top10 と一致する(seed ${String(seed)})`, () => {
      const { resolved, request } = scenario(seed);
      const approx = optimize({ ...request, shortlistSize: 100 }, resolved, holomenMap);
      const exact = optimizeExact(request, resolved, holomenMap, { maxEvaluations: 10_000_000 });
      const key = (c: { leader: { id: string }; members: { id: string }[] }) =>
        `${c.leader.id}|${c.members
          .map((m) => m.id)
          .sort()
          .join(",")}`;
      expect(approx.candidates.map((c) => c.modifiers.adjustedUnitScore)).toEqual(
        exact.candidates.map((c) => c.modifiers.adjustedUnitScore),
      );
      expect(new Set(approx.candidates.map(key))).toEqual(new Set(exact.candidates.map(key)));
      // 厳密探索は★5 の枚数に応じて時間が延びる（カード追加で 5 秒を超えたので余裕を持たせる）
    }, 30_000);

    it(`メンバーをおまかせにした結果は、水着こよりを固定した結果より低くならない(seed ${String(seed)})`, () => {
      const { resolved, leader, request } = scenario(seed);
      const fixedMember = resolved.find((c) => c.id === LEADER_ID);
      expect(leader).not.toBeNull();
      expect(fixedMember).toBeDefined();
      const fixed = optimize(
        { ...request, fixedMembers: fixedMember ? [fixedMember] : [], shortlistSize: 100 },
        resolved,
        holomenMap,
      );
      const auto = optimize({ ...request, shortlistSize: 100 }, resolved, holomenMap);
      expect(auto.candidates[0]?.modifiers.adjustedUnitScore ?? 0).toBeGreaterThanOrEqual(
        fixed.candidates[0]?.modifiers.adjustedUnitScore ?? 0,
      );
    });
  }
});
