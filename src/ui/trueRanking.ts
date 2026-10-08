import type { TrueRankingPhase } from "../engine/trueRanking";

/**
 * 結果一覧の「最適化順」(2026-10-08 ユーザー指示)の並びと、進み具合・残り時間の見積もり。
 */

/** 最適化後のユニットスコアの高い順に、上位 `limit` 件の添字を返す。同じ値なら添字の小さいもの(見込みの順位が上)を先にする。値のないものは並べない */
export function rankByOptimized(scores: readonly (number | null)[], limit: number): number[] {
  return scores
    .map((score, index) => ({ score, index }))
    .filter((e): e is { score: number; index: number } => e.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((e) => e.index);
}

export const RANKING_PHASES: readonly TrueRankingPhase[] = ["proxy", "search", "optimize"];

/**
 * 1 つの仕事にかかる時間の目安(ミリ秒)。2026-10-08 に開発環境で計った値(見込みのボード 1 件 2.7 秒・見込みでの探索 1 回 2.1 秒・
 * 最適化 1 件 3.5 秒)で、端末の速さは始めてからの実測で補正する(`rankingEstimate`)
 */
export const RANKING_UNIT_MS: Readonly<Record<TrueRankingPhase, number>> = {
  proxy: 2700,
  search: 2100,
  optimize: 3500,
};

export interface RankingEstimateInput {
  /** 段ごとの仕事の数(飛ばす段は 0) */
  workload: Readonly<Record<TrueRankingPhase, number>>;
  /** いまの段(始める前は null) */
  phase: TrueRankingPhase | null;
  /** いまの段の済んだ数 */
  done: number;
  /** 始めてからの経過(ミリ秒) */
  elapsedMs: number;
}

export interface RankingEstimate {
  /** 全体の進み具合(0〜1) */
  fraction: number;
  /** 残り時間の見積もり(ミリ秒) */
  remainingMs: number;
}

/**
 * 全体の進み具合と残り時間。段ごとの仕事の数 × 目安の時間を重みにして、済んだぶんの割合を出す。
 * 始めてから 3 秒たって 1 つでも済んでいれば、目安に対する実測の速さで残りを補正する(端末で大きく変わるため)
 */
export function rankingEstimate(input: RankingEstimateInput): RankingEstimate {
  const { workload, phase, done, elapsedMs } = input;
  const weight = (p: TrueRankingPhase, n: number): number => n * RANKING_UNIT_MS[p];
  const total = RANKING_PHASES.reduce((sum, p) => sum + weight(p, workload[p]), 0);
  if (total <= 0) return { fraction: 1, remainingMs: 0 };
  let completed = 0;
  if (phase !== null) {
    for (const p of RANKING_PHASES) {
      if (p === phase) {
        completed += weight(p, Math.min(done, workload[p]));
        break;
      }
      completed += weight(p, workload[p]);
    }
  }
  const speed = completed > 0 && elapsedMs >= 3000 ? elapsedMs / completed : 1;
  return {
    fraction: Math.min(1, completed / total),
    remainingMs: Math.max(0, (total - completed) * speed),
  };
}

/** 残り時間の表示(「約 4 分」「1 分未満」) */
export function remainingLabel(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return minutes < 1 ? "1 分未満" : `約 ${String(minutes)} 分`;
}
