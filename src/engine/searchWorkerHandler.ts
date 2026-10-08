import type { DisplayScoreBreakdown } from "./displayScore";
import type {
  RankedKeys,
  ScoreModifierBreakdown,
  SearchContext,
  SearchPartition,
  Shortlist,
} from "./optimize";
import type { StaticPowerBreakdown } from "./power";
import { prepareRunSearch } from "./request";
import type { OptimizeRunRequest } from "./request";

/**
 * 探索(さがす)の Worker 1 本ぶんの受け答え(2026-10-08「計算の高速化」)。探索は組合せの 1 枚目の添字で何本かに分担し
 * (`SearchPartition`)、UI 側(`useOptimizer`)が `optimize.ts` の `searchInProcess` と同じ手順で回す:
 * 準備(`prepare`)→ 数える(`enumerate`。shortlist の並べ替えの鍵だけを返し、中身はこの Worker が持つ)→ UI が全体の上位を選んで
 * 分担ごとの件数を返す → その件数ぶんを正確に評価する(`score`)→ UI がまとめる(要れば 2 パス目)。
 * `self` に触らない純粋な部分だけをここに置き、テストから Worker なしで同じ受け答えを確かめられるようにする(`worker.ts` は登録だけ)
 */
export type SearchWorkerRequest =
  | { kind: "prepare"; request: OptimizeRunRequest; partition: SearchPartition }
  | { kind: "enumerate"; floor: number; size: number; progress: boolean }
  | { kind: "score"; take: number };

/** 正確に評価した候補(カードは ID)と、並べ替えの鍵 */
export interface RankedView extends RankedKeys {
  leaderId: string;
  memberIds: string[];
  breakdown: StaticPowerBreakdown;
  display: DisplayScoreBreakdown;
  modifiers: ScoreModifierBreakdown;
}

export type SearchWorkerResponse =
  | { kind: "prepared"; total: number; topN: number; baseShortlistSize: number }
  | { kind: "progress"; done: number; total: number }
  | { kind: "counted"; scores: Float64Array; seqs: Float64Array; evaluated: number }
  | { kind: "ranked"; ranked: RankedView[] }
  | { kind: "error"; message: string };

/** Worker 1 本ぶんの状態を持ち、届いた依頼に答える関数を返す */
export function createSearchHandler(
  post: (response: SearchWorkerResponse, transfer?: Transferable[]) => void,
): (message: SearchWorkerRequest) => void {
  let context: SearchContext | null = null;
  let partition: SearchPartition = { index: 0, count: 1 };
  let shortlist: Shortlist | null = null;
  return (message) => {
    try {
      if (message.kind === "prepare") {
        partition = message.partition;
        shortlist = null;
        context = prepareRunSearch(message.request, (done, total) => {
          post({ kind: "progress", done, total });
        });
        post({
          kind: "prepared",
          total: context.total,
          topN: context.topN,
          baseShortlistSize: context.baseShortlistSize,
        });
        return;
      }
      if (!context) throw new Error("探索の準備がまだ届いていない");
      if (message.kind === "enumerate") {
        const counted = context.enumerate({
          partition,
          floor: message.floor,
          size: message.size,
          progress: message.progress,
        });
        shortlist = counted.shortlist;
        // 鍵は写しを渡す(中身はこの Worker が正確に評価するときに使う)
        const scores = shortlist.scores.slice();
        const seqs = shortlist.seqs.slice();
        post({ kind: "counted", scores, seqs, evaluated: counted.evaluated }, [
          scores.buffer,
          seqs.buffer,
        ]);
        return;
      }
      if (!shortlist) throw new Error("数える前に評価を頼まれた");
      post({
        kind: "ranked",
        ranked: context.score(shortlist, message.take).map((c) => ({
          leaderId: c.leader.id,
          memberIds: c.members.map((m) => m.id),
          breakdown: c.breakdown,
          display: c.display,
          modifiers: c.modifiers,
          bound: c.bound,
          seq: c.seq,
          leaderOrder: c.leaderOrder,
        })),
      });
    } catch (error) {
      post({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };
}
