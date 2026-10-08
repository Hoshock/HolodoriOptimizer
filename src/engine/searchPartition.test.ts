import { describe, expect, it } from "vite-plus/test";

import { cards, holomen } from "../data";
import { readAccountSnapshot } from "../data/accountSnapshot.fixture";
import { resolveCard } from "../data/resolve";
import { optimize, prepareSearch, searchInProcess } from "./optimize";
import type { OptimizeRequest } from "./optimize";
import { buildHolomenMap } from "./score";

/**
 * 探索を何本かに分けても(2026-10-08「計算の高速化」。組合せの 1 枚目の添字で分担する)、1 本で探したときと**同じ候補が同じ並び**で
 * 返ることを固定する。shortlist を小さくして 2 パス目(取りこぼしの検証)と、上限値が同じ候補の境目を通す。
 * スナップショットの所持カード・開花はテスト用の入力(実機の値ではない)
 */
const acc = readAccountSnapshot("2026-09-15");
const holomenMap = buildHolomenMap(holomen);
const blooms = Object.fromEntries(acc.members.map((m) => [m.cardId, m.bloom]));
const owned = new Set(acc.members.map((m) => m.cardId));
const boards: Record<string, string[]> = {};
for (const r of acc.holomen) if (r.blue?.length) boards[r.holomenId] = r.blue;
const resolved = cards
  .filter((c) => owned.has(c.id))
  .map((c) => resolveCard(c, blooms, boards, null, {}));
/** ホロメンの重ならない 5 枚(6 枠すべて固定の例) */
const five = (() => {
  const seen = new Set<string>();
  return resolved.filter((c) => {
    if (seen.has(c.holomenId) || seen.size >= 5) return false;
    seen.add(c.holomenId);
    return true;
  });
})();

const view = (r: ReturnType<typeof optimize>) => ({
  evaluated: r.evaluated,
  candidates: r.candidates.map((c) => ({
    leader: c.leader.id,
    members: c.members.map((m) => m.id),
    score: c.modifiers.adjustedUnitScore,
    breakdown: c.breakdown,
    display: c.display,
  })),
});

describe("探索の分担(searchInProcess)", () => {
  const pool = resolved.slice(0, 18);
  const cases: [string, OptimizeRequest, typeof resolved][] = [
    ["リーダーもおまかせ", { leader: null, topN: 20 }, pool],
    ["shortlist を小さくして 2 パス目を通す", { leader: null, topN: 15, shortlistSize: 40 }, pool],
    [
      "リーダーと固定メンバーあり",
      {
        leader: resolved[2] ?? null,
        fixedMembers: resolved.slice(5, 6),
        topN: 10,
        shortlistSize: 25,
      },
      pool,
    ],
    [
      "6 枠すべて固定(組合せが 1 通り)",
      { leader: resolved[0] ?? null, fixedMembers: five, topN: 3 },
      [...five, ...resolved.slice(0, 1)],
    ],
  ];
  for (const [label, request, cardsOf] of cases) {
    it(`${label}: 2〜4 本に分けても 1 本と同じ`, () => {
      const single = view(optimize(request, cardsOf, holomenMap));
      expect(single.candidates.length).toBeGreaterThan(0);
      for (const count of [2, 3, 4]) {
        const contexts = Array.from({ length: count }, () =>
          prepareSearch(request, cardsOf, holomenMap),
        );
        expect(view(searchInProcess(contexts))).toEqual(single);
      }
    });
  }
});
