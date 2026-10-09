import { cards, holomen, star5Cards } from "../data";
import { BLOOM_MAX } from "../data/bloom";
import type { BloomMap } from "../data/bloom";
import { BLUE_BOARD_NODE_IDS } from "../data/blueBoard";
import { GREEN_BOARD_NODE_IDS } from "../data/greenBoard";
import { RED_BOARD_NODE_IDS } from "../data/redBoard";
import { YELLOW_BOARD_NODE_IDS } from "../data/yellowBoard";
import type { BoardMap } from "../storage/boards";
import { NO_ACCOUNT_BONUS } from "./power";
import type { OptimizeRunRequest } from "./request";

/**
 * ティア表(サイドメニュー「ティア表」。2026-10-09 ユーザー指示「ユニットスコアあげる上で重要なカードの Tier を作成したい。星5のみ。
 * 様々な観点から評価して今あるツールの計算を元に」)。
 *
 * 評価はこのツールの探索(`runOptimize`)そのもので、**前提は さがすの「全カード」と同じ**(★5 全 84 枚・開花最大・4 色ボード全解放・
 * 曲なし・コネクトなし・アカウント補正なし)。カード 1 枚の価値は「そのカードを入れた最良の編成のユニットスコア ÷ 全体の最良のユニットスコア」
 * (限界貢献)で測る — カードの数値を足し合わせた独自の点数は作らない(計算の正典は 1 つにする)。観点は 3 つ:
 *
 * - メンバー: そのカードをメンバーに固定して、リーダーと残り 4 人をおまかせで探した最良(`member`)
 * - メンバー(0凸): 同じ探索を、そのカードだけ 0凸(ほかは最大)にして行った最良(`memberBloom0`。開花で伸びるぶんが分かる)
 * - リーダー: そのカードをリーダーに固定して、メンバー 5 人をおまかせで探した最良(`leader`)。リーダーからスコアに入るのは衣装スキルと
 *   赤ボードだけなので、全解放ではほぼ衣装スキルの評価になる
 *
 * 探索は 1 枚ごとに 9〜53 秒かかる(84 枚 × 3 観点で単一スレッド約 100 分)ので、画面で計算せず `scripts/tier/build.mjs` で
 * 事前に計算して `src/data/tierList.json` に同梱する(ADR-024)。データ(★5 のカード・ボード)が変わると指紋(`tierFingerprint`)が
 * 変わり、`tier.test.ts` が作り直しを求める。評価の式(エンジン)を変えたときは `TIER_MODEL_VERSION` を上げて作り直す
 */
export const TIER_MODEL_VERSION = 1;

/** 評価の段。上から順。SS は「全体の最良にほぼ届く」カードだけ(2026-10-09 ユーザー指示「ガチで強いカードを SS とするなどもしてもいい」) */
export const TIER_RANKS = ["SS", "S", "A", "B", "C", "D"] as const;
export type TierRank = (typeof TIER_RANKS)[number];

/**
 * 段の下限(全体の最良に対する比)。比がこの値以上なら、その段。SS / S は共通で、A 以下はメンバーとリーダーで別 —
 * リーダーは衣装スキルだけの差なので比の幅が狭い(84 枚が 95.7〜100% に収まる)。
 * 値は 2026-10-09 の全 84 枚の分布を見て決めた(ADR-024): メンバー SS 7 / S 12 / A 18 / B 28 / C 12 / D 7 枚、
 * リーダー SS 4 / S 10 / A 17 / B 29 / C 15 / D 10 枚。順位の割合ではなく比の固定値なので、カードが増えても段の意味は変わらない
 */
export const TIER_THRESHOLDS: Readonly<
  Record<"member" | "leader", Readonly<Record<TierRank, number>>>
> = {
  member: { SS: 0.995, S: 0.99, A: 0.984, B: 0.975, C: 0.96, D: 0 },
  leader: { SS: 0.995, S: 0.99, A: 0.983, B: 0.971, C: 0.966, D: 0 },
};

export function tierRankOf(role: "member" | "leader", ratio: number): TierRank {
  const t = TIER_THRESHOLDS[role];
  for (const rank of TIER_RANKS) if (ratio >= t[rank]) return rank;
  return "D";
}

/** 探索 1 回の結果(最良の編成とそのユニットスコア) */
export interface TierTeam {
  unitScore: number;
  leaderId: string;
  memberIds: string[];
}

export interface TierCardRecord {
  member: TierTeam;
  memberBloom0: TierTeam;
  leader: TierTeam;
}

/** `src/data/tierList.json` の形 */
export interface TierDataset {
  fingerprint: string;
  /** 全体の最良(リーダーもメンバーもおまかせ) */
  best: TierTeam;
  cards: Record<string, TierCardRecord>;
}

/** 事前計算の仕事 1 件(全体の最良 + カードごとに 3 観点) */
export type TierJob =
  | { kind: "best" }
  | { kind: "member" | "memberBloom0" | "leader"; cardId: string };

const fullBoards = (nodeIds: readonly string[]): BoardMap =>
  Object.fromEntries(holomen.map((h) => [h.id, [...nodeIds]]));

/** 前提: 全カード・開花最大・全解放・曲なし・コネクトなし・補正なし(`OptimizerPanel` の「全カード」と同じ値) */
export function tierBaseRequest(): OptimizeRunRequest {
  const blooms: BloomMap = Object.fromEntries(cards.map((c) => [c.id, BLOOM_MAX]));
  return {
    leaderId: null,
    fixedMemberIds: [],
    excludedCardIds: [],
    excludedLeaderCardIds: [],
    excludedMemberCardIds: [],
    leaderCandidateIds: null,
    requiredMemberHolomenIds: [],
    songId: null,
    blooms,
    boards: fullBoards(BLUE_BOARD_NODE_IDS),
    greenBoards: fullBoards(GREEN_BOARD_NODE_IDS),
    yellowBoards: fullBoards(YELLOW_BOARD_NODE_IDS),
    redBoards: fullBoards(RED_BOARD_NODE_IDS),
    account: NO_ACCOUNT_BONUS,
    topN: 1,
  };
}

/** 仕事 1 件の依頼 */
export function tierJobRequest(job: TierJob): OptimizeRunRequest {
  const base = tierBaseRequest();
  switch (job.kind) {
    case "best":
      return base;
    case "member":
      return { ...base, fixedMemberIds: [job.cardId] };
    case "memberBloom0":
      return {
        ...base,
        fixedMemberIds: [job.cardId],
        blooms: { ...base.blooms, [job.cardId]: 0 },
      };
    case "leader":
      return { ...base, leaderId: job.cardId };
  }
}

/** 全部の仕事(重い順に並べる: リーダー固定 → メンバー固定 × 2 → 全体の最良)。分担はこの並びの添字の余りで */
export function tierJobs(): TierJob[] {
  const ids = star5Cards.map((c) => c.id);
  return [
    ...ids.map((cardId): TierJob => ({ kind: "leader", cardId })),
    ...ids.map((cardId): TierJob => ({ kind: "member", cardId })),
    ...ids.map((cardId): TierJob => ({ kind: "memberBloom0", cardId })),
    { kind: "best" },
  ];
}

/** 文字列の簡単な指紋(FNV-1a 64bit を 2 本。暗号用ではない — 入力が変わったことに気づくためだけ) */
export function fingerprintOf(text: string): string {
  let h1 = 0xcbf29ce484222325n;
  let h2 = 0x84222325cbf29ce4n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i++) {
    const c = BigInt(text.charCodeAt(i));
    h1 = ((h1 ^ c) * prime) & mask;
    h2 = ((h2 ^ (c + 0x9en)) * prime) & mask;
  }
  return h1.toString(16).padStart(16, "0") + h2.toString(16).padStart(16, "0");
}

/** 事前計算の入力の指紋(★5 のカードデータ・ホロメン・4 色ボードのマス・モデルの版) */
export function tierFingerprint(): string {
  return fingerprintOf(
    JSON.stringify({
      version: TIER_MODEL_VERSION,
      cards: star5Cards,
      holomen,
      boards: [
        BLUE_BOARD_NODE_IDS,
        GREEN_BOARD_NODE_IDS,
        YELLOW_BOARD_NODE_IDS,
        RED_BOARD_NODE_IDS,
      ],
    }),
  );
}

/** 仕事の結果を 1 つのデータにまとめる(`scripts/tier/build.mjs`) */
export function assembleTierDataset(
  results: readonly { job: TierJob; team: TierTeam }[],
): TierDataset {
  let best: TierTeam | null = null;
  const records = new Map<string, Partial<TierCardRecord>>();
  for (const { job, team } of results) {
    if (job.kind === "best") {
      best = team;
      continue;
    }
    const rec = records.get(job.cardId) ?? {};
    rec[job.kind] = team;
    records.set(job.cardId, rec);
  }
  if (!best) throw new Error("全体の最良がない");
  const cards: Record<string, TierCardRecord> = {};
  for (const c of star5Cards) {
    const rec = records.get(c.id);
    if (!rec?.member || !rec.memberBloom0 || !rec.leader)
      throw new Error(`結果が足りない: ${c.id}`);
    cards[c.id] = { member: rec.member, memberBloom0: rec.memberBloom0, leader: rec.leader };
  }
  return { fingerprint: tierFingerprint(), best, cards };
}

/** カード 1 枚の評価(データから導く。画面の文言は `src/ui/tier.ts`) */
export interface TierCardEvaluation {
  cardId: string;
  role: "member" | "leader";
  rank: TierRank;
  /** 全体の最良に対する比(その役割で固定した最良) */
  ratio: number;
  /** メンバーだけ: 0凸で固定したときの比 */
  bloom0Ratio: number | null;
  /** メンバーだけ: リーダー固定の最良編成(★5 全枚)のうち、このカードがメンバーに入る数 */
  adoption: number | null;
  /** 全体の最良の編成そのものに入っているか */
  inBest: boolean;
  team: TierTeam;
}

export function evaluateTierCard(
  dataset: TierDataset,
  cardId: string,
  role: "member" | "leader",
): TierCardEvaluation | null {
  const rec = dataset.cards[cardId];
  if (!rec) return null;
  const bestScore = dataset.best.unitScore;
  if (role === "member") {
    const ratio = rec.member.unitScore / bestScore;
    let adoption = 0;
    for (const r of Object.values(dataset.cards))
      if (r.leader.memberIds.includes(cardId)) adoption += 1;
    return {
      cardId,
      role,
      rank: tierRankOf("member", ratio),
      ratio,
      bloom0Ratio: rec.memberBloom0.unitScore / bestScore,
      adoption,
      inBest: dataset.best.memberIds.includes(cardId),
      team: rec.member,
    };
  }
  const ratio = rec.leader.unitScore / bestScore;
  return {
    cardId,
    role,
    rank: tierRankOf("leader", ratio),
    ratio,
    bloom0Ratio: null,
    adoption: null,
    inBest: dataset.best.leaderId === cardId,
    team: rec.leader,
  };
}

/** 役割ごとの全 ★5 の評価(比の高い順。同じなら採用数の多い順 → ID 順) */
export function evaluateTier(
  dataset: TierDataset,
  role: "member" | "leader",
): TierCardEvaluation[] {
  const list: TierCardEvaluation[] = [];
  for (const c of star5Cards) {
    const e = evaluateTierCard(dataset, c.id, role);
    if (e) list.push(e);
  }
  return list.sort(
    (a, b) =>
      b.ratio - a.ratio ||
      (b.adoption ?? 0) - (a.adoption ?? 0) ||
      a.cardId.localeCompare(b.cardId),
  );
}
