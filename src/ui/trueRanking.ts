/**
 * 結果一覧の「最適化順」の並び(2026-10-08 ユーザー指示)。探索の上位(`scores` の添字 = 探索の順位)を最適化後のユニットスコアの高い順に並べ、
 * 上位 `limit` 件の添字を返す。同じ値なら探索の順位が上のものを先にする。値のない(計算できなかった)ものは並べない
 */
export function rankByOptimized(scores: readonly (number | null)[], limit: number): number[] {
  return scores
    .map((score, index) => ({ score, index }))
    .filter((e): e is { score: number; index: number } => e.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((e) => e.index);
}
