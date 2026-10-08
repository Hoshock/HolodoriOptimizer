/** 計算に使う Worker の上限(スマートフォンの発熱とメモリを抑える) */
export const MAX_WORKERS = 6;

/**
 * 重い計算(さがす・「組み直すと」)に使う Worker の本数: 端末のコア数 − 1(画面の描画に 1 つ残す)。分からなければ 1 本、上限 `MAX_WORKERS`
 * (2026-10-08「計算の高速化」)
 */
export function workerCount(
  cores: number | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator.hardwareConcurrency,
): number {
  return Math.min(MAX_WORKERS, Math.max(1, (cores ?? 2) - 1));
}
