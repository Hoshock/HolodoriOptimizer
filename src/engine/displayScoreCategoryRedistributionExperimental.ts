import type { Five } from "./displayScoreCategoryCorpus.fixture";

/**
 * **解析用 / production 未採用。** スコアサポートの総増分のうち、衣装欄に出ない残差 `R` を
 * **ボード欄 / パッシブ欄へどう配るか**だけを調べるハーネス。
 *
 * ここで扱う仮説は「総量を増やす相互作用」ではない。総量 `S/100 × E_blue(乗算)` と支援 3 種の加算合成
 * （displayScoreSourceAttributionExperimental.ts）はそのままで、**表示カテゴリ間のゼロサム再配分**だけを候補にする。
 *
 * - proportionalBaseline: `R` を 支援なし側の ボード : パッシブ の比で分ける。
 *   これは「支援追加後にボードとパッシブを共通倍率 k = 1 + R/(B0 + P0) で scale する」と同じ主張。
 * - boardOnly: `R` を全部ボードへ（パッシブは動かない）。source が赤スコアサポートのときの対照。
 *
 * 表示は 0.1 刻みなので、真値は `[d − 0.05, d + 0.05)`。共通倍率の検証は点推定ではなく
 * **区間の共通部分**で行う（`commonScaleIntersection`）。自由係数・ケース別定数・カード別分岐は置かない。
 */

/** 表示の刻み（%） */
export const DISPLAY_TICK = 0.1;

export interface Interval {
  lo: number;
  hi: number;
}

/** 表示値 d の真値区間 `[d − 0.05, d + 0.05)`。上端は開区間だが、共通部分の有無の判定には閉区間で足りる */
export function displayInterval(displayed: number): Interval {
  return { lo: displayed - DISPLAY_TICK / 2, hi: displayed + DISPLAY_TICK / 2 };
}

/**
 * 表示値 before → after の倍率 k = after/before が取りうる区間。
 * before の下端が 0 以下（表示 0.0）のときは k に上限がなく情報を持たないので null。
 */
export function scaleInterval(after: number, before: number): Interval | null {
  const b = displayInterval(before);
  if (b.lo <= 0) return null;
  const a = displayInterval(after);
  return { lo: a.lo / b.hi, hi: a.hi / b.lo };
}

export function intersect(a: Interval, b: Interval): Interval | null {
  const lo = Math.max(a.lo, b.lo);
  const hi = Math.min(a.hi, b.hi);
  return lo <= hi ? { lo, hi } : null;
}

export interface CommonScaleResult {
  /** 情報を持つ欄の数（表示 0.0 の欄は k を拘束しないので数えない） */
  informative: number;
  /** 全欄を同じ k で説明できる区間。informative = 0 なら「情報なし」、空なら反証 */
  interval: Interval | null;
}

/**
 * 複数の欄を**同じ倍率 k** で説明できるかを、表示量子化込みで判定する。
 * K5 のように全欄が 0.0 なら informative = 0（情報なし。反証ではない）。
 */
export function commonScaleIntersection(
  columns: readonly { before: number; after: number }[],
): CommonScaleResult {
  const intervals = columns
    .map((c) => scaleInterval(c.after, c.before))
    .filter((iv): iv is Interval => iv !== null);
  const first = intervals[0];
  if (!first) return { informative: 0, interval: null };
  let interval: Interval | null = first;
  for (const iv of intervals.slice(1)) {
    interval = interval ? intersect(interval, iv) : null;
    if (!interval) break;
  }
  return { informative: intervals.length, interval };
}

/** 残差 R の配り方 */
export type ResidualRouting =
  /** 支援なし側の ボード : パッシブ の比で分ける（= 共通倍率 scaling） */
  | "proportionalBaseline"
  /** 全部ボードへ */
  | "boardOnly";

export interface ResidualSplit {
  board: number;
  passive: number;
}

export function routeResidual(
  residual: number,
  baselineBoard: number,
  baselinePassive: number,
  routing: ResidualRouting,
): ResidualSplit {
  if (routing === "boardOnly") return { board: residual, passive: 0 };
  const denom = baselineBoard + baselinePassive;
  if (denom <= 0) return { board: 0, passive: 0 };
  return {
    board: (residual * baselineBoard) / denom,
    passive: (residual * baselinePassive) / denom,
  };
}

/** 共通倍率 k = 1 + R/(B0 + P0)（proportionalBaseline と同値。区間判定に使う点推定） */
export function impliedScale(
  residual: number,
  baselineBoard: number,
  baselinePassive: number,
): number | null {
  const denom = baselineBoard + baselinePassive;
  if (denom <= 0) return null;
  return 1 + residual / denom;
}

export interface ColumnDeltas {
  costume: number;
  active: number;
  board: number;
  passive: number;
  special: number;
  /** 衣装 + ボード + パッシブ（アクティブ / SP は支援で動かない） */
  supportTotal: number;
}

/** 表示 5 欄 [衣装, アクティブ, ボード, パッシブ, SP] の前後差（0.1 刻みの表示値どうしの差） */
export function columnDeltas(before: Five, after: Five): ColumnDeltas {
  const d = (i: number): number => Math.round((after[i] - before[i]) * 10) / 10;
  const costume = d(0);
  const board = d(2);
  const passive = d(3);
  return {
    costume,
    active: d(1),
    board,
    passive,
    special: d(4),
    supportTotal: Math.round((costume + board + passive) * 10) / 10,
  };
}

export interface RedistributionErrors {
  residual: number;
  predictedBoard: number;
  predictedPassive: number;
  boardError: number;
  passiveError: number;
}

/**
 * 残差 `R = supportTotal − Δ衣装` を routing で配り、実測 Δボード / Δパッシブ との誤差を返す。
 * `costumeGain` を実測 Δ衣装 にすれば **oracle 試験**（衣装式を既知と仮定して B/P split だけを見る）、
 * 候補評価器の値にすれば予測試験。どちらかは呼び出し側が明示する。
 */
export function redistributionErrors(
  supportTotal: number,
  costumeGain: number,
  baselineBoard: number,
  baselinePassive: number,
  observed: { board: number; passive: number },
  routing: ResidualRouting,
): RedistributionErrors {
  const residual = supportTotal - costumeGain;
  const split = routeResidual(residual, baselineBoard, baselinePassive, routing);
  return {
    residual,
    predictedBoard: split.board,
    predictedPassive: split.passive,
    boardError: split.board - observed.board,
    passiveError: split.passive - observed.passive,
  };
}
