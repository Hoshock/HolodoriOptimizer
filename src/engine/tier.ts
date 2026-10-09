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
 * 様々な観点から評価して今あるツールの計算を元に」→ 同日「最高ユニットスコア編成はツール探索で調べればわかるから重視しない。
 * 強いという実感を定量的に評価したい。強ければ現実的な編成の多くで使われるはず」)。
 *
 * 評価はこのツールの探索(`runOptimize`)そのもので、**前提は さがすの「全カード」と同じ**(開花最大・4 色ボード全解放・曲なし・コネクトなし・
 * アカウント補正なし)。カードの数値を足し合わせた独自の点数は作らない(計算の正典は 1 つにする)。
 *
 * **段を決めるのは採用率**(仮想アカウント法。ADR-024 Update): ★5 から現実的な所持数(20〜50 枚)のアカウントを均衡配置で多数作り
 * (1 ラウンド = 84 枚をシャッフルして塊に切る。全カードが各ラウンドにちょうど 1 回入る)、それぞれでおまかせの探索を回して最高編成を記録する。
 * 採用率 = そのカードを持っていたアカウントのうち、最高編成にメンバー(またはリーダー)として入った割合。噛み合う相手が 1 枚しかないカードは
 * その相手を持たないアカウントで落ちるので、「現実的な編成の多くで使われるか」がそのまま数になる。
 * ラウンド数は統計で決めた(`ACCOUNT_DESIGN`): 採用率 p の標準誤差 √(p(1−p)/n) が最大の p = 0.5 で 95% 信頼区間の半幅を 3 pt 以内にするには
 * n ≥ 0.25 × (1.96 / 0.03)² ≈ 1,068 で、均衡配置なら n = ラウンド数なので 1,100 ラウンド(3,034 アカウント。所持数は残りを範囲に収める
 * 切り方のため小さい側に偏り、平均約 30 枚)。リーダーは選ばれたカードと同じ衣装スキルの所持カード全部に数える(`assembleTierDataset`)。
 *
 * 参考の観点(段には使わず、評価画面の表に出す): そのカードをメンバーに固定して残りをおまかせで探した最高(`member`)/ 同じくそのカードだけ 0凸
 * (`memberBloom0`)/ リーダーに固定した最高(`leader`。リーダーからスコアに入るのは衣装スキルと赤ボードだけなので、全解放では衣装スキルの評価)。
 *
 * 探索は 1 件 1〜53 秒かかる(全部で 4 コア約 1 時間)ので、画面で計算せず `scripts/tier/build.mjs`(`pnpm tier`)で事前に計算して
 * `src/data/tierList.json` に同梱する。データ(★5 のカード・ボード)や設計が変わると指紋(`tierFingerprint`)が変わり、`tier.test.ts` が
 * 作り直しを求める。評価の式(エンジン)を変えたときは `TIER_MODEL_VERSION` を上げて作り直す
 */
export const TIER_MODEL_VERSION = 3;

/** 仮想アカウントの設計(所持数の範囲・ラウンド数・乱数の種) */
export interface AccountDesign {
  rounds: number;
  minSize: number;
  maxSize: number;
  seed: number;
}

/** 現在の設計。変えたら指紋が変わる */
export const ACCOUNT_DESIGN: AccountDesign = {
  rounds: 1100,
  minSize: 20,
  maxSize: 50,
  seed: 20261009,
};

/** 評価の段。上から順。SS は「全体の最良にほぼ届く」カードだけ(2026-10-09 ユーザー指示「ガチで強いカードを SS とするなどもしてもいい」) */
export const TIER_RANKS = ["SS", "S", "A", "B", "C", "D"] as const;
export type TierRank = (typeof TIER_RANKS)[number];

/**
 * 段の下限(採用率)。採用率がこの値以上なら、その段。メンバーとリーダーで別 — メンバーは 5 枠を所持 20〜50 枚で争うので平均 17%、
 * リーダーは 1 アカウントに 1 人なので平均 3%。値は 2026-10-09 の分布の切れ目で決めた(ADR-024 Update):
 * メンバー 59.8〜49.0% の 8 枚 → 40.8〜32.8% の 7 枚 → 29.2〜20.4% の 13 枚 → 18.7〜11.3% の 15 枚 → 9.0〜4.0% の 17 枚 → 2.6% 以下 24 枚。
 * リーダーの D は「1,100 件で 1 度も選ばれない」。**値は `ACCOUNT_DESIGN` の所持数の範囲に紐づく**(平均の採用率 ≈ 5 ÷ 平均所持数)。
 * 順位の割合ではなく固定値なので、カードが増えても「何 % のアカウントで使われるか」という段の意味は変わらない(各カードの値はプールで変わる)
 */
export const TIER_THRESHOLDS: Readonly<
  Record<"member" | "leader", Readonly<Record<TierRank, number>>>
> = {
  member: { SS: 0.45, S: 0.3, A: 0.2, B: 0.1, C: 0.03, D: 0 },
  leader: { SS: 0.2, S: 0.1, A: 0.03, B: 0.01, C: 0.0005, D: 0 },
};

export function tierRankOf(role: "member" | "leader", adoptionRate: number): TierRank {
  const t = TIER_THRESHOLDS[role];
  for (const rank of TIER_RANKS) if (adoptionRate >= t[rank]) return rank;
  return "D";
}

/** 探索 1 回の結果(最良の編成とそのユニットスコア) */
export interface TierTeam {
  unitScore: number;
  leaderId: string;
  memberIds: string[];
}

/** 仮想アカウントでの採用の集計(所持していた数・メンバーに入った数・リーダーに選ばれた数) */
export interface TierAdoption {
  owned: number;
  member: number;
  leader: number;
}

export interface TierCardRecord {
  member: TierTeam;
  memberBloom0: TierTeam;
  leader: TierTeam;
  adoption: TierAdoption;
}

/** `src/data/tierList.json` の形 */
export interface TierDataset {
  fingerprint: string;
  /** 全体の最良(リーダーもメンバーもおまかせ) */
  best: TierTeam;
  /** 仮想アカウントの設計と、作ったアカウントの数 */
  accounts: { rounds: number; minSize: number; maxSize: number; seed: number; count: number };
  cards: Record<string, TierCardRecord>;
}

/** 事前計算の仕事 1 件(全体の最良 + カードごとに 3 観点 + 仮想アカウント) */
export type TierJob =
  | { kind: "best" }
  | { kind: "member" | "memberBloom0" | "leader"; cardId: string }
  | { kind: "account"; round: number; index: number; cardIds: string[] };

/** 決定的な乱数(mulberry32)。同じ種なら同じアカウントの並びになる */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 仮想アカウント 1 件(どのラウンドの何番目か、所持する ★5) */
export interface TierAccount {
  round: number;
  index: number;
  cardIds: string[];
}

/**
 * 仮想アカウントを均衡配置で作る: ラウンドごとに ★5 全枚をシャッフルし、所持数 minSize〜maxSize の塊に切る
 * (残りが minSize 未満にならない大きさだけから選ぶので、どの塊も範囲に収まり、全カードが各ラウンドにちょうど 1 回入る)
 */
export function tierAccounts(design: AccountDesign = ACCOUNT_DESIGN): TierAccount[] {
  const random = mulberry32(design.seed);
  const ids = star5Cards.map((c) => c.id);
  const accounts: TierAccount[] = [];
  for (let round = 0; round < design.rounds; round++) {
    const pool = [...ids];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    let index = 0;
    let at = 0;
    while (at < pool.length) {
      const remaining = pool.length - at;
      const sizes: number[] = [];
      for (let size = design.minSize; size <= Math.min(design.maxSize, remaining); size++) {
        const rest = remaining - size;
        if (rest === 0 || rest >= design.minSize) sizes.push(size);
      }
      if (sizes.length === 0) throw new Error(`所持数の範囲で切れない: 残り ${remaining}`);
      const size = sizes[Math.floor(random() * sizes.length)]!;
      accounts.push({ round, index, cardIds: pool.slice(at, at + size) });
      at += size;
      index += 1;
    }
  }
  return accounts;
}

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
    case "account": {
      // 持っていない ★5 を除外する(★4 は固定していないので自動で除外される — star4Pool.ts)
      const owned = new Set(job.cardIds);
      return {
        ...base,
        excludedCardIds: star5Cards.filter((c) => !owned.has(c.id)).map((c) => c.id),
      };
    }
  }
}

/** カードごとの観点と全体の最良の仕事(重い順: リーダー固定 → メンバー固定 × 2 → 全体の最良)。分担はこの並びの添字の余りで */
export function tierCardJobs(): TierJob[] {
  const ids = star5Cards.map((c) => c.id);
  return [
    ...ids.map((cardId): TierJob => ({ kind: "leader", cardId })),
    ...ids.map((cardId): TierJob => ({ kind: "member", cardId })),
    ...ids.map((cardId): TierJob => ({ kind: "memberBloom0", cardId })),
    { kind: "best" },
  ];
}

/** 仮想アカウントの仕事(設計から決定的に作る) */
export function tierAccountJobs(design: AccountDesign = ACCOUNT_DESIGN): TierJob[] {
  return tierAccounts(design).map((a): TierJob => ({
    kind: "account",
    round: a.round,
    index: a.index,
    cardIds: a.cardIds,
  }));
}

/** 全部の仕事 */
export function tierJobs(design: AccountDesign = ACCOUNT_DESIGN): TierJob[] {
  return [...tierCardJobs(), ...tierAccountJobs(design)];
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

/** 事前計算の入力の指紋(★5 のカードデータ・ホロメン・4 色ボードのマス・モデルの版・仮想アカウントの設計) */
export function tierFingerprint(design: AccountDesign = ACCOUNT_DESIGN): string {
  return fingerprintOf(
    JSON.stringify({
      version: TIER_MODEL_VERSION,
      design,
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

/** 仕事の結果を 1 つのデータにまとめる(`scripts/tier/build.mjs`)。仮想アカウントは所持・採用の数に畳む */
export function assembleTierDataset(
  results: readonly { job: TierJob; team: TierTeam }[],
  design: AccountDesign = ACCOUNT_DESIGN,
): TierDataset {
  let best: TierTeam | null = null;
  const records = new Map<string, Partial<Omit<TierCardRecord, "adoption">>>();
  const adoption = new Map<string, TierAdoption>(
    star5Cards.map((c) => [c.id, { owned: 0, member: 0, leader: 0 }]),
  );
  let accountCount = 0;
  for (const { job, team } of results) {
    if (job.kind === "best") {
      best = team;
      continue;
    }
    if (job.kind === "account") {
      accountCount += 1;
      for (const id of job.cardIds) {
        const a = adoption.get(id);
        if (a) a.owned += 1;
      }
      for (const id of team.memberIds) {
        const a = adoption.get(id);
        if (a) a.member += 1;
      }
      // リーダーは、選ばれたカードと同じ衣装スキル(構造)を持つ所持カード全部に数える。前提では赤ボードが全員同じなので
      // 同じ衣装スキルのリーダーは探索で同点になり、どれが 1 位になるかは候補の並び順(cards.json)で決まるだけ
      // (2026-10-09 レビュー: 同じ衣装の 2 枚を持つ 482 件すべてで並び順の先頭が勝っていた)。
      // 「そのカードをリーダーにして最高編成が組める」割合として数える
      const key = costumeKey(team.leaderId);
      for (const id of job.cardIds) {
        if (id === team.leaderId || (key !== null && costumeKey(id) === key)) {
          const l = adoption.get(id);
          if (l) l.leader += 1;
        }
      }
      continue;
    }
    const rec = records.get(job.cardId) ?? {};
    rec[job.kind] = team;
    records.set(job.cardId, rec);
  }
  if (!best) throw new Error("全体の最良がない");
  const expected = tierAccounts(design).length;
  if (accountCount !== expected)
    throw new Error(`仮想アカウントの結果が足りない: ${accountCount} / ${expected}`);
  const cards: Record<string, TierCardRecord> = {};
  for (const c of star5Cards) {
    const rec = records.get(c.id);
    if (!rec?.member || !rec.memberBloom0 || !rec.leader)
      throw new Error(`結果が足りない: ${c.id}`);
    cards[c.id] = {
      member: rec.member,
      memberBloom0: rec.memberBloom0,
      leader: rec.leader,
      adoption: adoption.get(c.id)!,
    };
  }
  return {
    fingerprint: tierFingerprint(design),
    best,
    accounts: { ...design, count: accountCount },
    cards,
  };
}

/** 衣装スキルの構造の鍵(同じ鍵 = 同じ衣装スキル。構造がなければ null) */
const costumeKeys = new Map<string, string | null>(
  star5Cards.map((c) => [
    c.id,
    c.costumeSkill.structured ? JSON.stringify(c.costumeSkill.structured) : null,
  ]),
);
function costumeKey(cardId: string): string | null {
  return costumeKeys.get(cardId) ?? null;
}

/** 採用率の 95% 信頼区間の半幅(二項分布の正規近似。所持 0 なら 0) */
export function adoptionHalfWidth(count: number, owned: number): number {
  if (owned <= 0) return 0;
  const p = count / owned;
  return 1.96 * Math.sqrt((p * (1 - p)) / owned);
}

/** カード 1 枚の評価(データから導く。画面の文言は `src/ui/tier.ts`) */
export interface TierCardEvaluation {
  cardId: string;
  role: "member" | "leader";
  rank: TierRank;
  /** 採用率(その役割で最高編成に入った割合。段の根拠) */
  adoptionRate: number;
  /** 採用率の 95% 信頼区間の半幅 */
  adoptionHalfWidth: number;
  adoption: TierAdoption;
  /** 参考: その役割で固定した最高のユニットスコア ÷ 全体の最高 */
  ratio: number;
  /** メンバーだけ: 0凸で固定したときの比 */
  bloom0Ratio: number | null;
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
  const count = role === "member" ? rec.adoption.member : rec.adoption.leader;
  const adoptionRate = rec.adoption.owned > 0 ? count / rec.adoption.owned : 0;
  const team = role === "member" ? rec.member : rec.leader;
  return {
    cardId,
    role,
    rank: tierRankOf(role, adoptionRate),
    adoptionRate,
    adoptionHalfWidth: adoptionHalfWidth(count, rec.adoption.owned),
    adoption: rec.adoption,
    ratio: team.unitScore / bestScore,
    bloom0Ratio: role === "member" ? rec.memberBloom0.unitScore / bestScore : null,
    inBest:
      role === "member"
        ? dataset.best.memberIds.includes(cardId)
        : dataset.best.leaderId === cardId,
    team,
  };
}

/** 役割ごとの全 ★5 の評価(採用率の高い順。同じなら固定した最高の高い順 → ID 順) */
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
      b.adoptionRate - a.adoptionRate || b.ratio - a.ratio || a.cardId.localeCompare(b.cardId),
  );
}
