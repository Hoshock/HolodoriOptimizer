import type { TrueRankingPhase } from "../engine/trueRanking";

/**
 * 結果の「組み直すと」(2026-10-08 ユーザー指示。初めの名前は「最適化順」)の並びと、進み具合・残り時間の見積もり。
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
 * 1 つの仕事にかかる時間の目安(ミリ秒。Worker 1 本ぶん)。2026-10-08 に開発環境で計った値(見込みのボード 1 件 2.7 秒・見込みでの探索 1 回 2.1 秒・
 * 最適化 1 件 3.5 秒)に、同日の高速化(ADR-018)で縮んだ割合(同じ環境の比較で 見込みのボード・最適化は約 0.3 倍、見込みでの探索は約 0.9 倍)を
 * 掛けたもの。段の重みの比にだけ効き、端末の速さと Worker の本数は始めてからの実測で補正する(`rankingEstimate`)
 */
export const RANKING_UNIT_MS: Readonly<Record<TrueRankingPhase, number>> = {
  proxy: 800,
  search: 1850,
  optimize: 1000,
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

/**
 * 残り時間の表示(「約 4 分」。1 分を切ったら秒で「約 40 秒」「数秒」— 2026-10-09 ユーザー指示「1分を割ったら秒数表記なのいいね。
 * 組み直すとの方もそうしよう」。秒の刻みはさがすのボタン(`searchProgress.ts`)と同じ 5 秒)
 */
export function remainingLabel(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 10) return "数秒";
  if (seconds < 60) return `約 ${String(Math.min(55, Math.round(seconds / 5) * 5))} 秒`;
  return `約 ${String(Math.max(1, Math.round(seconds / 60)))} 分`;
}
