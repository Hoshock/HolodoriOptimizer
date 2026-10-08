/// <reference lib="webworker" />
import { optimizeRankingTeam, proxyBoards, proxySearch } from "./trueRanking";
import type {
  ProxyBoards,
  TrueRankingInput,
  TrueRankingItem,
  TrueRankingPhase,
} from "./trueRanking";

/**
 * 結果の「組み直すと」(2026-10-08 ユーザー指示)を UI スレッド外で計算する Web Worker。計算そのものは `trueRanking.ts` が持つ。
 * 見込みのボード → 見込みでの探索 → 最適化 の 3 段で、段ごとの進み具合と、最適化が 1 件終わるごとの結果を返す。
 * 見込みのボードを渡されたら(同じ登録・同じ条件で計算し直すとき)、最初の段を飛ばす
 */
export interface RankingWorkerRequest {
  input: TrueRankingInput;
  proxy: ProxyBoards | null;
}

export type RankingWorkerResponse =
  | { kind: "progress"; phase: TrueRankingPhase; done: number; total: number }
  | { kind: "proxy"; proxy: ProxyBoards }
  | { kind: "item"; index: number; item: TrueRankingItem }
  | { kind: "done" }
  | { kind: "error"; message: string };

self.addEventListener("message", (event: MessageEvent<RankingWorkerRequest>) => {
  const post = (response: RankingWorkerResponse): void => {
    self.postMessage(response);
  };
  const progress =
    (phase: TrueRankingPhase) =>
    (done: number, total: number): void => {
      post({ kind: "progress", phase, done, total });
    };
  try {
    const { input } = event.data;
    let proxy = event.data.proxy;
    if (proxy === null) {
      proxy = proxyBoards(input, progress("proxy"));
      post({ kind: "proxy", proxy });
    }
    const teams = proxySearch(input, proxy, progress("search"));
    const step = progress("optimize");
    step(0, teams.length);
    teams.forEach((team, index) => {
      post({ kind: "item", index, item: optimizeRankingTeam(input, team) });
      step(index + 1, teams.length);
    });
    post({ kind: "done" });
  } catch (error) {
    post({ kind: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
