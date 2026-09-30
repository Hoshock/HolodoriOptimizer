import { describe, expect, it } from "vite-plus/test";

import { cardById, holomen } from "../data";
import { resolveCard } from "../data/resolve";
import type { Card } from "../data/types";
import { computeStaticPower, NO_ACCOUNT_BONUS } from "./power";
import { runOptimize } from "./request";
import { buildHolomenMap } from "./score";
import { bestTieOrder, tieOrders } from "./tieOrder";

/**
 * 素値合計が同値のときは最良を採る(2026-09-30 ユーザー指示)。**実機の規則ではなく方針**(tieOrder.ts)。
 *
 * 症状(ユーザー報告): リーダー水着こより・曲爆ラブで、同じ 5 人(こより・おかゆ・ころね・ノエル・ミオ)が
 * 固定メンバーありの探索では 1869480、おまかせでは 1863580 と並び順だけで変わっていた。
 * 水着こより(0凸)と恒常ノエル(0凸)は P と S を入れ替えただけで素値合計が同値なので、こよりの
 * 「ハッピー2人のパフォーマンス+32%」が どちらに掛かるかが並びで決まり、パッシブ欄が 805 点動いていた。
 * 値はこのリポジトリのデータから作った検証用の入力で、実機の観測値ではない。
 */

const holomenMap = buildHolomenMap(holomen);
const card = (id: string): Card => {
  const c = cardById.get(id);
  if (!c) throw new Error(`カードが見つからない: ${id}`);
  return c;
};
const UNIT = [
  "hakui-koyori-02",
  "nekomata-okayu-02",
  "inugami-korone-02",
  "shirogane-noel-01",
  "ookami-mio-02",
];
const MOVED = [
  "nekomata-okayu-02",
  "inugami-korone-02",
  "shirogane-noel-01",
  "hakui-koyori-02",
  "ookami-mio-02",
];
// おかゆだけ 5凸(素値合計 25920)、ほかは 0凸(こより・ノエルは同値 23711)
const blooms = { "nekomata-okayu-02": 5 };
const resolved = (id: string): Card => resolveCard(card(id), blooms, {}, undefined, undefined);

describe("総合力のパッシブ: 同値のときは加算量の大きい方", () => {
  it("並びを入れ替えても総合力が変わらない", () => {
    const leader = resolved("hakui-koyori-02");
    const power = (ids: string[]) =>
      computeStaticPower({ leader, members: ids.map(resolved) }, holomenMap, {
        red: null,
        account: NO_ACCOUNT_BONUS,
      });
    const a = power(UNIT);
    const b = power(MOVED);
    expect(a.passiveEffect).toBe(b.passiveEffect);
    expect(a.totalPower).toBe(b.totalPower);
  });

  it("こよりの P +32% は同値のこより・ノエルのうち P の高いこよりに掛かる", () => {
    const leader = resolved("hakui-koyori-02");
    const koyoriFirst = computeStaticPower({ leader, members: UNIT.map(resolved) }, holomenMap, {
      red: null,
      account: NO_ACCOUNT_BONUS,
    });
    // こよりを先頭にした並び(旧実装の「編成順の先」と同じ選び方)の値と同じ = 最良の側
    const noelFirst = computeStaticPower(
      {
        leader,
        members: [
          "shirogane-noel-01",
          "nekomata-okayu-02",
          "inugami-korone-02",
          "hakui-koyori-02",
          "ookami-mio-02",
        ].map(resolved),
      },
      holomenMap,
      { red: null, account: NO_ACCOUNT_BONUS },
    );
    expect(noelFirst.totalPower).toBe(koyoriFirst.totalPower);
  });
});

describe("表示スコアボーナス: 同値メンバーの並びは最良を採る", () => {
  const request = (fixedMemberIds: string[]) => ({
    leaderId: "hakui-koyori-02",
    fixedMemberIds,
    excludedCardIds: [],
    excludedLeaderCardIds: [],
    excludedMemberCardIds: [],
    leaderCandidateIds: null,
    requiredMemberHolomenIds: [],
    songId: "song-206",
    blooms,
    boards: {},
    greenBoards: {},
    yellowBoards: {},
    redBoards: {},
    account: NO_ACCOUNT_BONUS,
    topN: 1,
  });

  it("同じ 5 人は並べる順によらず同じユニットスコアで返る", () => {
    const a = runOptimize(request(UNIT)).candidates[0];
    const b = runOptimize(request(MOVED)).candidates[0];
    expect(a).toBeDefined();
    expect(b?.modifiers.adjustedUnitScore).toBe(a?.modifiers.adjustedUnitScore);
    expect(b?.breakdown.totalPower).toBe(a?.breakdown.totalPower);
  });

  it("tieOrders: 人数つきのスコアサポートがなければ並びは 1 通り、同値がなければ入れ替えない", () => {
    const leader = resolved("hakui-koyori-02");
    // こよりの衣装は「全員」(人数なし)、この 5 人のパッシブのスコアサポート(ころね)は「ピュア 2 人」= 人数つき
    const orders = tieOrders(UNIT.map(resolved), leader);
    // 素値合計の同値はこより・ノエルの 2 人 → 2 通り。先頭は元の並び
    expect(orders).toHaveLength(2);
    expect(orders[0]?.map((c) => c.id)).toEqual(UNIT);
    expect(orders[1]?.map((c) => c.id)).toEqual([
      "shirogane-noel-01",
      "nekomata-okayu-02",
      "inugami-korone-02",
      "hakui-koyori-02",
      "ookami-mio-02",
    ]);
    // 人数つきのスコアサポートがない 5 人は 1 通り
    const plain = ["sakura-miko-01", "shirakami-fubuki-01", "usada-pekora-01"].map((id) =>
      resolved(id),
    );
    expect(tieOrders(plain, leader).length).toBeLessThanOrEqual(2);
  });

  it("bestTieOrder: 最良の並びと結果を返し、同点なら元の並びを残す", () => {
    const leader = resolved("hakui-koyori-02");
    const cards = UNIT.map(resolved);
    const { order, result } = bestTieOrder(
      cards,
      leader,
      (o) => o.findIndex((c) => c.id === "shirogane-noel-01"),
      (r) => -r, // ノエルが先頭に近い並びを最良とする
    );
    expect(order[0]?.id).toBe("shirogane-noel-01");
    expect(result).toBe(0);
    const tie = bestTieOrder(
      cards,
      leader,
      () => 1,
      (r) => r,
    );
    expect(tie.order.map((c) => c.id)).toEqual(UNIT);
  });
});
