/**
 * 「ベスト編成をさがす」の進み具合(2026-10-09 ユーザー指示「スピナーやめて左からゲージが満たされつつ、今何分の何かの数字を出して欲しい。
 * それと終わりの見込み時間」— モック 3 案から A: ボタン全体がゲージで、左に 済んだ数 / 全体、右に残り時間)。
 * 残り時間は「計算中」とは出さず、最初の進み具合が届いたときから見込みを出して、届くたびに直す(同日ユーザー指示)。
 * 届くあいだは 1 秒ごとに減らして見せる
 */

/** 見積もりを出し始めるまで(数え始めてからの時間、または済んだ割合のどちらかに届いたら出す) */
const SETTLE_MS = 800;
const SETTLE_FRACTION = 0.03;

/** 組合せの数の短い表示(「8,400」「1,105万」「3.69億」)。桁が多いので 3 けたほどに丸める */
export function formatCombinationCount(n: number): string {
  if (n < 10_000) return Math.round(n).toLocaleString("ja-JP");
  if (n < 100_000_000) return `${Math.floor(n / 10_000).toLocaleString("ja-JP")}万`;
  const oku = n / 100_000_000;
  const digits = oku < 10 ? 2 : oku < 100 ? 1 : 0;
  return `${(Math.floor(oku * 10 ** digits) / 10 ** digits).toFixed(digits)}億`;
}

/**
 * 残り時間の見積もり(ミリ秒)。最後に届いた進み具合までの速さ(経過時間 ÷ 済んだ数)で残りの数を割り振り、
 * 届いてから経った時間を引く。数え始めの 0.8 秒かつ 3% までは null(何も出さない)— 始めは計算が温まっておらず遅いので、
 * そこで見積もると数倍に出る(2026-10-09、2 秒で終わる探索が「約 25 秒」から始まっていた)
 */
export function searchRemainingMs(
  progress: { done: number; total: number; elapsedMs: number },
  nowElapsedMs: number,
): number | null {
  const { done, total, elapsedMs } = progress;
  if (done <= 0 || elapsedMs <= 0) return null;
  if (elapsedMs < SETTLE_MS && done / Math.max(1, total) < SETTLE_FRACTION) return null;
  const remaining = (elapsedMs / done) * Math.max(0, total - done);
  return Math.max(0, remaining - Math.max(0, nowElapsedMs - elapsedMs));
}

/** 残り時間の表示(「残り 約 3 分 20 秒」「残り 約 40 秒」「残り 数秒」)。10 分以上は分だけ */
export function searchRemainingLabel(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 10) return "残り 数秒";
  if (seconds < 60) return `残り 約 ${String(Math.min(55, Math.round(seconds / 5) * 5))} 秒`;
  if (seconds < 600) {
    const rounded = Math.round(seconds / 10) * 10;
    const m = Math.floor(rounded / 60);
    const s = rounded % 60;
    return s === 0 ? `残り 約 ${String(m)} 分` : `残り 約 ${String(m)} 分 ${String(s)} 秒`;
  }
  return `残り 約 ${String(Math.round(seconds / 60))} 分`;
}
