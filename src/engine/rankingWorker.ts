/// <reference lib="webworker" />
import { holomen } from "../data";
import type { HolomenBoards } from "../data/boardState";
import { registeredBoardsOf } from "./boardPlan";
import {
  optimizeRankingTeam,
  proxyBoardOf,
  proxyJobs,
  searchJobOf,
  searchJobs,
} from "./trueRanking";
import type {
  Proxy,
  ProxyBoards,
  ProxyJob,
  SearchFound,
  SearchJob,
  TrueRankingInput,
  TrueRankingItem,
} from "./trueRanking";
import type { TeamIds } from "./request";

/**
 * 結果の「組み直すと」(2026-10-08 ユーザー指示)を UI スレッド外で計算する Web Worker。計算そのものは `trueRanking.ts` が持つ。
 * **仕事を 1 つずつ受けて 1 つずつ返す**(2026-10-08「計算の高速化」): 見込みのボード → 見込みでの探索 → 最適化 の 3 段は、どれも
 * 互いに独立した仕事の集まりなので、UI 側(`useTrueRanking`)が Worker を何本か立てて配る。段の切れ目(全部の仕事の結果をまとめる)は UI 側。
 * 依頼は最初の `start` で 1 回だけ受け取り、仕事は添字で指す(どの Worker も同じ依頼から同じ仕事の並びを作る)
 */
export type RankingWorkerRequest =
  | { kind: "start"; input: TrueRankingInput }
  | { kind: "proxy"; index: number }
  | { kind: "useProxy"; proxy: ProxyBoards }
  | { kind: "search"; index: number }
  | { kind: "optimize"; index: number; team: TeamIds };

export type RankingWorkerResponse =
  | { kind: "proxy"; index: number; proxy: Proxy }
  | { kind: "search"; index: number; found: SearchFound[] }
  | { kind: "item"; index: number; item: TrueRankingItem }
  | { kind: "error"; message: string };

let input: TrueRankingInput | null = null;
let registered: Record<string, HolomenBoards> | null = null;
let jobs: ProxyJob[] = [];
let proxy: ProxyBoards | null = null;
let search: SearchJob[] = [];

self.addEventListener("message", (event: MessageEvent<RankingWorkerRequest>) => {
  const post = (response: RankingWorkerResponse): void => {
    self.postMessage(response);
  };
  try {
    const data = event.data;
    if (data.kind === "start") {
      input = data.input;
      registered = registeredBoardsOf(
        input.request,
        input.connects,
        holomen.map((h) => h.id),
      );
      jobs = proxyJobs(input);
      proxy = null;
      search = [];
      return;
    }
    if (!input || !registered) throw new Error("組み直すとの依頼がまだ届いていない");
    if (data.kind === "useProxy") {
      proxy = data.proxy;
      search = searchJobs(input, proxy);
      return;
    }
    if (data.kind === "proxy") {
      const job = jobs[data.index];
      if (!job) throw new Error(`見込みのボードの仕事がない: ${String(data.index)}`);
      post({ kind: "proxy", index: data.index, proxy: proxyBoardOf(input, job, registered) });
      return;
    }
    if (data.kind === "search") {
      const job = search[data.index];
      if (!proxy || !job) throw new Error(`見込みでの探索の仕事がない: ${String(data.index)}`);
      post({
        kind: "search",
        index: data.index,
        found: searchJobOf(input, proxy, job, registered),
      });
      return;
    }
    post({ kind: "item", index: data.index, item: optimizeRankingTeam(input, data.team) });
  } catch (error) {
    post({ kind: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
