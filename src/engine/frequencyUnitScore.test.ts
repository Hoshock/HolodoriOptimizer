import { describe, expect, it } from "vite-plus/test";

import { cards, holomen as realHolomen, songById } from "../data";
import { BLUE_FREQUENCY_NODE_IDS, unlockNode } from "../data/blueBoard";
import type { Card } from "../data/types";
import type { BoardMap } from "../storage/boards";
import { optimizeFrequencyUnitScore } from "./frequencyUnitScore";
import { buildFrequencyMembers } from "./liveFrequencyOptimizer";
import { buildHolomenMap } from "./score";

/**
 * 発動頻度マスの「表示ユニットスコア重視」の目的関数（src/engine/frequencyUnitScore.ts）。
 * 式そのものは表示スコアのモデル（displayScore.ts）に任せ、ここでは**選び方の約束**を固定する:
 * 現在の案は追加も外すもない案であること、最良は現在を下回らないこと、同じ実効値の候補は畳むこと。
 */

const holomenMap = buildHolomenMap(realHolomen);
const account = { memoryPercent: 0, enhancementPercent: 0 };

/** 実在するカードから、ホロメンの重複しない 6 枚（リーダー + メンバー 5）を取る */
const unit = ((): { leader: Card; memberCards: Card[] } => {
  const picked: Card[] = [];
  const used = new Set<string>();
  for (const card of cards) {
    if (used.has(card.holomenId)) continue;
    used.add(card.holomenId);
    picked.push(card);
    if (picked.length === 6) break;
  }
  const [leader, ...memberCards] = picked;
  if (!leader || memberCards.length !== 5) throw new Error("テスト用のカードが足りない");
  return { leader, memberCards };
})();

/** 先頭のメンバーだけ発動頻度マスを 3 つとも開けた盤面（経路も一緒に開く） */
function boardsWithFrequency(holomenId: string): BoardMap {
  let nodes: ReadonlySet<string> = new Set<string>();
  for (const id of BLUE_FREQUENCY_NODE_IDS) nodes = unlockNode(nodes, id);
  return { [holomenId]: [...nodes] };
}

describe("ユニットスコア重視の発動頻度", () => {
  const boards = boardsWithFrequency(unit.memberCards[0]?.holomenId ?? "");
  const members = buildFrequencyMembers(unit.memberCards, boards, holomenMap);
  const result = optimizeFrequencyUnitScore({
    ...unit,
    members,
    holomenMap,
    boards,
    account,
    song: null,
  });

  it("現在の案は追加も外すもない", () => {
    expect(result.current.additionalNodeCount).toBe(0);
    expect(result.current.removedNodeCount).toBe(0);
    expect(result.current.choice).toEqual(members.map((m) => m.currentIndex));
  });

  it("最良は現在を下回らない（現在の状態も候補に含まれている）", () => {
    expect(result.best.unitScore).toBeGreaterThanOrEqual(result.current.unitScore);
    expect(result.current.unitScore).toBeGreaterThan(0);
  });

  it("同じ実効値の候補は畳むので、評価数は候補の直積を超えない", () => {
    const product = members.reduce((a, m) => a * Math.max(1, m.candidates.length), 1);
    expect(result.evaluated).toBeGreaterThan(0);
    expect(result.evaluated).toBeLessThanOrEqual(product);
  });

  it("曲を指定すると黄の楽曲スコアボーナスが入りうる（指定なしを下回らない）", () => {
    const song = songById.get("song-197") ?? null;
    const withSong = optimizeFrequencyUnitScore({
      ...unit,
      members,
      holomenMap,
      boards,
      account,
      song,
    });
    expect(withSong.current.unitScore).toBeGreaterThanOrEqual(result.current.unitScore);
  });
});
