import type { Five } from "./displayScoreCategoryCorpus.fixture";

/**
 * **解析用 / production 未採用。** スコアサポートを 1 つだけ変えた matched pair で、表示スコアボーナスの
 * 衣装 / ボード / パッシブ の 3 欄がどう動くかを調べるハーネス。
 *
 * 扱う仮説は「総量を増やす相互作用」ではない。総量 `支援/100 × E_blue(乗算)` と支援 3 種の加算合成
 * （displayScoreSourceAttributionExperimental.ts）はそのままで、**表示カテゴリ間の再配分**だけを候補にする。
 *
 * ## native カテゴリ
 *
 * 支援の source ごとに、ゲーム上それが直接乗る欄（native カテゴリ）がある。
 *
 * | source                         | native  |
 * | :----------------------------- | :------ |
 * | リーダー衣装のスコアサポート   | 衣装    |
 * | 赤（ボード）のスコアサポート   | ボード  |
 * | パッシブのスコアサポート       | パッシブ |
 *
 * **仮説（非 native 共通 scale）**: 1 つの source だけを変えた matched pair では、**native 以外の 2 欄が
 * 共通倍率 k で scale する**。つまり非 native 2 欄の比が保存される。
 * - リーダーを変える → 衣装が native、ボード : パッシブ が保存
 * - 赤を変える → ボードが native、衣装 : パッシブ が保存
 * - パッシブを変える → パッシブが native、衣装 : ボード が保存（clean matched pair がなく未検証）
 *
 * ケース ID や source 名で式を変えない。source から native カテゴリを選ぶところだけが入力で、
 * 配り方の計算は 1 つ。
 *
 * ## 共通 normalization（機構の候補。ゲーム仕様とは断定しない）
 *
 * 非 native 2 欄の比が保存されるのは、カテゴリごとの独立な raw weight `W` と、3 欄に共通の
 * normalization `λ` があって `C = λ W_C` / `B = λ W_B` / `P = λ W_P` と書ける場合と整合する
 * （`commonNormalization`）。1 つの source が自分の `W` だけを変えるなら、残り 2 欄の比 `W_x : W_y` は
 * そのまま残り、両方が `λ' / λ` 倍になる。アクティブ欄・SP 欄はこの normalization の対象に入れない
 * （支援で動かない）。黄の楽曲スコアボーナスは既知の後段のボード加算なので、この仮説と混ぜない。
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
 * 両欄とも 0.0 なら informative = 0（情報なし。反証ではない）。informative = 1 は 1 列だけの
 * one-dimensional diagnostic で、共通倍率の**支持ケースには数えない**。
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

/** 表示スコアボーナスのうち、支援で動く 3 欄 */
export type DisplayCategory = "costume" | "board" | "passive";
export const DISPLAY_CATEGORIES: readonly DisplayCategory[] = ["costume", "board", "passive"];
export type CategoryTriple = Readonly<Record<DisplayCategory, number>>;

/** native 以外の 2 カテゴリ（この 2 つの比が保存される、というのが今回の仮説） */
export const NON_NATIVE: Readonly<
  Record<DisplayCategory, readonly [DisplayCategory, DisplayCategory]>
> = {
  costume: ["board", "passive"],
  board: ["costume", "passive"],
  passive: ["costume", "board"],
};

/** 表示 5 欄 [衣装, アクティブ, ボード, パッシブ, SP] から 3 欄を取り出す */
export function categoryTriple(five: Five): CategoryTriple {
  return { costume: five[0], board: five[2], passive: five[3] };
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

/** matched pair の 3 欄の差（0.1 刻みの表示値どうしの差） */
export function deltaTriple(before: Five, after: Five): CategoryTriple {
  const b = categoryTriple(before);
  const a = categoryTriple(after);
  return {
    costume: round1(a.costume - b.costume),
    board: round1(a.board - b.board),
    passive: round1(a.passive - b.passive),
  };
}

/** native 以外の 2 欄が共通倍率で説明できるか（表示量子化込み） */
export function nonNativeCommonScale(
  native: DisplayCategory,
  before: Five,
  after: Five,
): CommonScaleResult {
  const b = categoryTriple(before);
  const a = categoryTriple(after);
  return commonScaleIntersection(NON_NATIVE[native].map((c) => ({ before: b[c], after: a[c] })));
}

/** 非 native 2 欄の実測 Δ の和（oracle の残差。native 欄の実測は使わない） */
export function nonNativeResidual(native: DisplayCategory, deltas: CategoryTriple): number {
  const [x, y] = NON_NATIVE[native];
  return round1(deltas[x] + deltas[y]);
}

/** 残差 R の配り方 */
export type ResidualRouting =
  /** 非 native 2 欄の、支援なし側の値の比で分ける（= 2 欄が共通倍率で scale する） */
  | "proportionalBaseline"
  /** 全部 衣装欄 へ */
  | "costumeOnly"
  /** 全部 ボード欄 へ */
  | "boardOnly"
  /** 全部 パッシブ欄 へ */
  | "passiveOnly";

const SINGLE: Readonly<Record<string, DisplayCategory>> = {
  costumeOnly: "costume",
  boardOnly: "board",
  passiveOnly: "passive",
};

const ZERO: CategoryTriple = { costume: 0, board: 0, passive: 0 };

/**
 * 非 native へ回る残差 `residual` を配る。返すのは 3 欄の Δ 予測で、**native 欄は 0**
 * （この規則は native 欄の値を予測しない。native 欄は衣装候補や赤の総増分など別の式が決める）。
 * `costumeOnly` などで native カテゴリを指定した場合、非 native の予測はすべて 0 になる。
 */
export function routeResidual(
  native: DisplayCategory,
  baseline: CategoryTriple,
  residual: number,
  routing: ResidualRouting,
): CategoryTriple {
  const [x, y] = NON_NATIVE[native];
  if (routing !== "proportionalBaseline") {
    const target = SINGLE[routing];
    if (target === undefined || target === native) return ZERO;
    return { ...ZERO, [target]: residual };
  }
  const denom = baseline[x] + baseline[y];
  if (denom <= 0) return ZERO;
  return {
    ...ZERO,
    [x]: (residual * baseline[x]) / denom,
    [y]: (residual * baseline[y]) / denom,
  };
}

/** 非 native 2 欄の共通倍率 k = 1 + R/(x0 + y0)（proportionalBaseline と同値。区間判定に使う点推定） */
export function impliedScale(
  native: DisplayCategory,
  baseline: CategoryTriple,
  residual: number,
): number | null {
  const [x, y] = NON_NATIVE[native];
  const denom = baseline[x] + baseline[y];
  if (denom <= 0) return null;
  return 1 + residual / denom;
}

export interface RedistributionErrors {
  residual: number;
  /** 非 native 2 欄の Δ 予測（native は 0） */
  predicted: CategoryTriple;
  /** 予測 − 実測（native は比較しないので 0） */
  errors: CategoryTriple;
}

/**
 * 残差を routing で配り、実測の Δ と比べる。
 * `residual` に非 native 2 欄の実測 Δ の和を入れれば **oracle 試験**（native 欄の式を既知と仮定して
 * 非 native の分け方だけを見る）、`総増分 − native 候補` を入れれば予測試験。どちらかは呼び出し側が明示する。
 */
export function redistributionErrors(
  native: DisplayCategory,
  baseline: CategoryTriple,
  residual: number,
  observed: CategoryTriple,
  routing: ResidualRouting,
): RedistributionErrors {
  const predicted = routeResidual(native, baseline, residual, routing);
  const [x, y] = NON_NATIVE[native];
  return {
    residual,
    predicted,
    errors: { ...ZERO, [x]: predicted[x] - observed[x], [y]: predicted[y] - observed[y] },
  };
}

export interface NormalizationResult {
  /** 3 欄に共通の normalization。合計が targetTotal になるように決まる（自由係数ではない） */
  lambda: number;
  predicted: CategoryTriple;
}

/**
 * 共通 normalization 仮説: `C = λ W_C` / `B = λ W_B` / `P = λ W_P`。
 * λ は「3 欄の合計 = targetTotal」から一意に決まるので、fit する係数ではない。
 * W がすべて 0 なら λ は決まらない（0 を返す）。
 */
export function commonNormalization(
  weights: CategoryTriple,
  targetTotal: number,
): NormalizationResult {
  const sum = weights.costume + weights.board + weights.passive;
  if (sum <= 0) return { lambda: 0, predicted: ZERO };
  const lambda = targetTotal / sum;
  return {
    lambda,
    predicted: {
      costume: lambda * weights.costume,
      board: lambda * weights.board,
      passive: lambda * weights.passive,
    },
  };
}

/**
 * 共通 normalization から「非 native 2 欄の比は保存される」が出ることの代数的な確認に使う。
 * 与えた raw weight の、native 以外 2 欄の比（W_x / W_y）。W_y = 0 なら null
 */
export function nonNativeWeightRatio(
  native: DisplayCategory,
  weights: CategoryTriple,
): number | null {
  const [x, y] = NON_NATIVE[native];
  return weights[y] === 0 ? null : weights[x] / weights[y];
}
