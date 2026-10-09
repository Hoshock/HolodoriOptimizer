import type { PlanStep } from "../engine/boardConnectPlan";

/**
 * 組み直しプランの「最適化を実行」の進み具合(2026-10-09 ユーザー指示 — モック 3 案から 2: ボタンをゲージにして中央に残り時間だけ)。
 * 計算は段(ボード → コネクトを最大 3 周 → 発動頻度)の切れ目でしか知らせないので、段ごとの目安の時間を重みにして見積もり、
 * 1 つでも段が済んだら、目安に対する実測の速さで補正する(端末で大きく変わる。`rankingEstimate` と同じ考え方)。
 * 周が早く止まれば、まだ回るかもしれない段が減って残りも減る
 */

/**
 * 段ごとの目安の時間(ミリ秒)。2026-10-09 にユーザーのアカウントの上位 8 編成で測った平均(開発機・1 スレッド。
 * ボード 808 / コネクト 58 / 頻度 138)を丸めた値。比だけが効く(実測で補正する)
 */
export const PLAN_STEP_MS: Readonly<Record<PlanStep, number>> = {
  board: 800,
  connect: 60,
  frequency: 140,
};

export interface PlanEstimate {
  /** ゲージの割合(0〜1)。段の途中は目安の時間ぶん進め、次の段の頭は越えない */
  fraction: number;
  /** 残り時間の見積もり(ミリ秒) */
  remainingMs: number;
}

/**
 * 進み具合(最後に届いた段の報告と、そのときの経過時間)と、いまの経過時間から、ゲージの割合と残り時間を出す。
 * 報告がまだなければ、全部の段がこれからとして目安で出す
 */
export function planEstimate(
  progress: { done: readonly PlanStep[]; remaining: readonly PlanStep[]; elapsedMs: number } | null,
  nowElapsedMs: number,
  planned: readonly PlanStep[],
): PlanEstimate {
  const weight = (steps: readonly PlanStep[]): number =>
    steps.reduce((sum, s) => sum + PLAN_STEP_MS[s], 0);
  const done = progress?.done ?? [];
  const remaining = progress?.remaining ?? planned;
  const completed = weight(done);
  const total = completed + weight(remaining);
  if (total <= 0) return { fraction: 1, remainingMs: 0 };
  // 実測の速さ(目安 1 ms あたりの実時間)。まだ何も済んでいなければ目安どおり
  const speed = completed > 0 && progress ? progress.elapsedMs / completed : 1;
  const since = Math.max(0, nowElapsedMs - (progress?.elapsedMs ?? 0));
  const current = remaining[0] ? PLAN_STEP_MS[remaining[0]] : 0;
  const inStep = Math.min(since / speed, current);
  return {
    fraction: Math.min(1, (completed + inStep) / total),
    remainingMs: Math.max(0, (total - completed) * speed - since),
  };
}
