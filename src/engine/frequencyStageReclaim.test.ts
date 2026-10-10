import { describe, expect, it } from "vite-plus/test";

import { cardById } from "../data";
import { readAccountSnapshot, snapshotConnectPlacements } from "../data/accountSnapshot.fixture";
import { boardPointsForRank, HOLOMEN_RANK_MAX } from "../data/boardPoints";
import {
  BOARD_STATE_COLORS,
  boardGraphOf,
  isFrequencyNode,
  spentBoardPoints,
  UNLOCKABLE_ANCHORS,
  unlockSetOf,
  withoutFrequencyNodes,
} from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import type { UnlockableAnchor } from "../data/boardState";
import { emptyBoardResources } from "../storage/boardResources";
import { planFrequencyStage } from "./frequencyStage";
import type { OptimizeRunRequest } from "./request";

/**
 * 頻度の段で Pt を空けるときは、足りないぶんだけ外す(2026-10-10 ユーザー指摘「リーダー以外の赤を全部外してるケースがあった。
 * Pt 足りてるのに全部外すことない？」)。メンバーの赤はスコアに効かず、どのマスを外しても「外して失うスコア ÷ 空く Pt」が 0 で並ぶ。
 * 同じ比のときに空く Pt の少ないマスを選ばないと、中心寄りの R-001 を外して赤が全部外れていた(ミオの赤 44 マス、Pt 98 / 231)。
 * 再現は 2026-10-10 のスナップショットのラミィのソロ曲の編成(水着こぼリーダー)。ボードの段は登録の頻度マスを外してその Pt を
 * 使い切るので、ここではミオの盤面を「登録から頻度マスを外したもの」、ランクをそれがちょうど収まる段にして同じ状況を作る
 * (ランクはこのテスト用の入力で、実機の値ではない)
 */
const acc = readAccountSnapshot("2026-10-10");
type Row = (typeof acc.holomen)[number] & { unlockedConnects?: UnlockableAnchor[] };
const registered: Record<string, HolomenBoards> = {};
const nodes: Record<"red" | "blue" | "yellow" | "green", Record<string, string[]>> = {
  red: {},
  blue: {},
  yellow: {},
  green: {},
};
for (const r of acc.holomen as Row[]) {
  registered[r.holomenId] = {
    red: r.red ?? [],
    blue: r.blue ?? [],
    yellow: r.yellow ?? [],
    green: r.green ?? [],
    connects: UNLOCKABLE_ANCHORS.filter((a) => r.unlockedConnects?.includes(a)),
  };
  for (const c of ["red", "blue", "yellow", "green"] as const) {
    const list = r[c];
    if (list?.length) nodes[c][r.holomenId] = list;
  }
}
const leaderId = "kobo-kanaeru-02";
const memberIds = [
  "ookami-mio-01",
  "inugami-korone-01",
  "nekomata-okayu-02",
  "hakos-baelz-02",
  "ouro-kronii-01",
];
const request: OptimizeRunRequest = {
  leaderId,
  fixedMemberIds: memberIds,
  excludedCardIds: [],
  excludedLeaderCardIds: [],
  excludedMemberCardIds: [],
  leaderCandidateIds: null,
  requiredMemberHolomenIds: [],
  songId: "song-212",
  blooms: Object.fromEntries(acc.members.map((m) => [m.cardId, m.bloom])),
  boards: nodes.blue,
  greenBoards: nodes.green,
  yellowBoards: nodes.yellow,
  redBoards: nodes.red,
  connectPlacements: snapshotConnectPlacements(acc),
  account: { memoryPercent: acc.memoryPercent, enhancementPercent: acc.enhancementPercent },
  topN: 1,
};

describe("頻度の段: Pt を空けるのは足りないぶんだけ", () => {
  it("メンバーの赤(外しても損のないマス)を丸ごと外さず、外したマスはどれも戻すと予算を超える", () => {
    const mio = "ookami-mio";
    expect(cardById.get(memberIds[0] ?? "")?.holomenId).toBe(mio);
    const before = registered[mio];
    if (!before) throw new Error("ミオの登録がない");
    const base = withoutFrequencyNodes(before);
    const frequency = before.blue.filter(isFrequencyNode);
    expect(frequency.length).toBe(2);
    expect(before.red.length).toBe(44);
    // 頻度マスを外した盤面がちょうど収まる段 = 頻度マスを戻すには Pt を空ける必要がある
    let rank = 1;
    while (rank < HOLOMEN_RANK_MAX && boardPointsForRank(rank) < spentBoardPoints(base)) rank += 1;
    const cap = boardPointsForRank(rank);
    expect(cap).toBeLessThan(spentBoardPoints(before));

    const result = planFrequencyStage({
      request,
      team: { leaderId, memberIds },
      boards: { ...registered, [mio]: base },
      placements: request.connectPlacements ?? {},
      remaining: emptyBoardResources(),
      ranks: { [mio]: rank },
      objective: "perfect",
      fixed: { [mio]: frequency.length },
      horizonSeconds: 120,
    });
    const after = result.boards[mio];
    if (!after) throw new Error("ミオの結果がない");
    expect(after.blue.filter(isFrequencyNode).sort()).toEqual([...frequency].sort());
    const spent = spentBoardPoints(after);
    expect(spent).toBeLessThanOrEqual(cap);
    expect(after.red.length, "赤が丸ごと外れている").toBeGreaterThan(0);
    // 外したマスはどれも、1 つ戻すだけで予算を超える(余計に外していない)
    for (const color of BOARD_STATE_COLORS) {
      const graph = boardGraphOf(color);
      const set = unlockSetOf(color, after[color], after.connects);
      for (const cell of base[color]) {
        if (set.has(cell)) continue;
        const plan = graph.planUnlock(set, cell);
        expect(plan === null || spent + plan.points > cap, `${color} ${cell} は戻せる`).toBe(true);
      }
    }
  });
});
