/**
 * 発動頻度の最適化(`src/components/FrequencyPlanSheet.vue`)で、案の発動頻度と**いまのボード状況**の
 * 差を 3 状態で表す(2026-09-16 ユーザー指示「その頻度を達成してたら文字を緑色、少ないなら青色、
 * 過剰なら赤色」)。
 *
 * 色をつけるのは「所持カードから探す」ときだけ(同日ユーザー指示)。全カードから探した結果は持っていない
 * カードを含みうるので、登録しているボードがその編成の現状を表さない — 差そのものに意味がない。
 */
export type FrequencyTone = "met" | "short" | "over";

/** コネクト増幅込みの実効値(小数)を比べるので許容値を置く */
const EPS = 1e-9;

/**
 * - `met`: いまのボードで案の発動頻度に届いている(開けるものがない)
 * - `short`: いまが案より少ない(あと何マスか開ける)
 * - `over`: いまが案より多い(案としては開けすぎ。外せるかどうかは別の話)
 */
export function frequencyTone(planPercent: number, currentPercent: number): FrequencyTone {
  if (currentPercent > planPercent + EPS) return "over";
  if (currentPercent < planPercent - EPS) return "short";
  return "met";
}
