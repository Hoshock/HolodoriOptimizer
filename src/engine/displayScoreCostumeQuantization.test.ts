import { describe, expect, it } from "vite-plus/test";

import { cards as realCards, holomen as realHolomen } from "../data";
import { cardAtBloomWithProvenance } from "../data/bloom";
import type { Card } from "../data/types";
import {
  compileDisplayMember,
  createDisplayMemberPart,
  createDisplayScratch,
  prepareDisplay,
} from "./displayScore";
import { buildAffIndex, NO_ACCOUNT_BONUS } from "./power";
import { buildHolomenMap } from "./score";

/**
 * **3 欄の配賦と 0.1% 量子化の位相（2026-09-15 実機・青 0 / 赤 0 / 黄 0 / 曲なし）。**
 *
 * リーダーを 典獄クロニー（全員のスコアサポート 60%）にした 16 編成、うち 3 編成は 恒常ぺこら（25%）でも、
 * 6 編成は 恒常みこ 0凸（支援 0）でも読んでいる。青も赤もないのでボード欄は 0 になり、表示は
 * 衣装 / アクティブ / パッシブ / SP の 4 欄へ縮退する。内部に残る自由度は「総量 `T` を 衣装 と パッシブ へ
 * どう割るか」と「0.1% へ落とす位相」の 2 つだけ。
 *
 * **`A` の扱いに 2 通りある。** モデルのアクティブ欄 raw `A` は実機の表示値を 16/16 で再現するが、
 * 表示は 0.1% 刻みの切り上げなので **`A` 自体には最大 1 quantum のぶれが残る**。
 * このファイルでは強い結論と弱い結論を分ける:
 * - **`A` のぶれを許しても残る**（頑健）: 衣装欄は「アクティブ欄との差」として量子化される（現行の独立切り上げは棄却）。
 *   総量 `T = 0.60 × A + ΔP` と対象選抜は正しい。配分の重みは production の「競合で正規化した取り分」ではない
 *   （11 編成中 8 で外れる）。`W_C` はリーダーのスコアサポート % に比例する。
 * - **モデルの `A` を厳密と仮定したときだけ言える**（条件つき）: 位相が 1 通りに決まる（パッシブ欄は素の切り上げ）。
 *
 * 2026-09-15 に「位相は 1 通り」「S2 → S3 で実機とモデルの向きが逆」と書いたのは `A` を厳密と仮定した計算で、
 * ぶれを入れると前者は 6 通りに増え（ただし衣装欄が差分型なのは変わらない）、後者は区間が重なって成立しない。
 *
 * 観測は docs/human/repro/display-score-20260915-costume.md。実測値はモデルに合わせて変えない。
 */
const holomenMap = buildHolomenMap(realHolomen);
const affIndex = buildAffIndex(holomenMap);
const realCard = (id: string): Card => {
  const c = realCards.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
};
const member = (id: string, bloom: number): Card => {
  const b = cardAtBloomWithProvenance(realCard(id), bloom).card;
  return {
    ...b,
    naturalStats: b.stats,
    boardLive: { activeRatePercent: 0, activeFrequencyPercent: 0 },
  };
};
const KRONII = 60;
const PEKORA = 25;

/** 実機の 1 行。`shown` はリーダー支援 % ごとの [衣装欄, パッシブ欄]、`baseline` は支援 0 のリーダーでのパッシブ欄 */
interface Observed {
  label: string;
  slots: [string, number][];
  active: number;
  shown: Record<number, [number, number]>;
  baseline: number | null;
}
const R = (
  label: string,
  slots: [string, number][],
  active: number,
  shown: Record<number, [number, number]>,
  baseline: number | null = null,
): Observed => ({ label, slots, active, shown, baseline });
const M = (...ids: [string, number][]): [string, number][] => ids;

const OBSERVED: Observed[] = [
  R(
    "1",
    M(
      ["houshou-marine-01", 1],
      ["roboco-san-01", 0],
      ["oozora-subaru-01", 0],
      ["anya-melfissa-01", 0],
      ["pavolia-reine-01", 0],
    ),
    69.3,
    { [KRONII]: [41.5, 2.5] },
    2.4,
  ),
  R(
    "2",
    M(
      ["roboco-san-01", 0],
      ["omaru-polka-01", 0],
      ["ayunda-risu-01", 0],
      ["koseki-bijou-01", 0],
      ["nerissa-ravencroft-01", 1],
    ),
    67.3,
    { [KRONII]: [40.6, 8.6] },
    8.8,
  ),
  R(
    "3",
    M(
      ["usada-pekora-01", 1],
      ["shiranui-flare-01", 0],
      ["oozora-subaru-01", 0],
      ["irys-01", 0],
      ["koseki-bijou-01", 0],
    ),
    65.8,
    { [KRONII]: [39.5, 2.1] },
  ),
  R(
    "6",
    M(
      ["usada-pekora-01", 1],
      ["shiranui-flare-01", 0],
      ["anya-melfissa-01", 0],
      ["kobo-kanaeru-01", 0],
      ["otonose-kanade-02", 0],
    ),
    68.3,
    { [KRONII]: [40.9, 0] },
  ),
  R(
    "7",
    M(
      ["usada-pekora-01", 1],
      ["airani-iofifteen-01", 0],
      ["pavolia-reine-01", 0],
      ["irys-01", 0],
      ["otonose-kanade-02", 0],
    ),
    65.3,
    { [KRONII]: [39.1, 0] },
  ),
  R(
    "8",
    M(
      ["oozora-subaru-01", 0],
      ["aki-rosenthal-01", 0],
      ["anya-melfissa-01", 0],
      ["kobo-kanaeru-01", 0],
      ["irys-01", 0],
    ),
    56.6,
    { [KRONII]: [33.9, 0] },
  ),
  R(
    "K5",
    M(
      ["tokino-sora-01", 0],
      ["aki-rosenthal-01", 0],
      ["oozora-subaru-01", 0],
      ["shiranui-flare-01", 0],
      ["shishiro-botan-01", 0],
    ),
    63.3,
    { [KRONII]: [37.9, 0] },
  ),
  R(
    "K6",
    M(
      ["tokino-sora-01", 0],
      ["aki-rosenthal-01", 0],
      ["oozora-subaru-01", 0],
      ["shiranui-flare-01", 0],
      ["houshou-marine-01", 1],
    ),
    73.7,
    { [KRONII]: [44.3, 2.9] },
  ),
  R(
    "S1",
    M(
      ["roboco-san-01", 0],
      ["pavolia-reine-01", 0],
      ["oozora-subaru-01", 0],
      ["anya-melfissa-01", 0],
      ["otonose-kanade-02", 0],
    ),
    66.2,
    { [KRONII]: [39.8, 2.3], [PEKORA]: [16.6, 2.3] },
    2.3,
  ),
  R(
    "S2",
    M(
      ["roboco-san-01", 0],
      ["omaru-polka-01", 0],
      ["oozora-subaru-01", 0],
      ["anya-melfissa-01", 0],
      ["otonose-kanade-02", 0],
    ),
    65.4,
    { [KRONII]: [39.4, 4.3], [PEKORA]: [16.5, 4.3] },
    4.4,
  ),
  R(
    "S3",
    M(
      ["roboco-san-01", 0],
      ["omaru-polka-01", 0],
      ["ayunda-risu-01", 0],
      ["oozora-subaru-01", 0],
      ["anya-melfissa-01", 0],
    ),
    58.0,
    { [KRONII]: [35.4, 5.7], [PEKORA]: [15.0, 5.8] },
    6.2,
  ),
  R(
    "S4",
    M(
      ["roboco-san-01", 0],
      ["pavolia-reine-01", 0],
      ["koseki-bijou-01", 0],
      ["nerissa-ravencroft-01", 1],
      ["oozora-subaru-01", 0],
    ),
    67.3,
    { [KRONII]: [40.5, 4.4] },
    4.4,
  ),
  // 6 枚プール（ロボ子 / ポルカ / リス / 奏 / スバル / アーニャ）から 5 人。S2 = −リス、S3 = −奏
  R(
    "−ポルカ",
    M(
      ["roboco-san-01", 0],
      ["ayunda-risu-01", 0],
      ["otonose-kanade-02", 0],
      ["oozora-subaru-01", 0],
      ["anya-melfissa-01", 0],
    ),
    59.1,
    { [KRONII]: [35.4, 4.0] },
  ),
  R(
    "−スバル",
    M(
      ["roboco-san-01", 0],
      ["omaru-polka-01", 0],
      ["ayunda-risu-01", 0],
      ["otonose-kanade-02", 0],
      ["anya-melfissa-01", 0],
    ),
    64.0,
    { [KRONII]: [38.5, 6.3] },
  ),
  R(
    "−アーニャ",
    M(
      ["roboco-san-01", 0],
      ["omaru-polka-01", 0],
      ["ayunda-risu-01", 0],
      ["otonose-kanade-02", 0],
      ["oozora-subaru-01", 0],
    ),
    59.3,
    { [KRONII]: [36.2, 5.8] },
  ),
  R(
    "−ロボ子",
    M(
      ["omaru-polka-01", 0],
      ["ayunda-risu-01", 0],
      ["otonose-kanade-02", 0],
      ["oozora-subaru-01", 0],
      ["anya-melfissa-01", 0],
    ),
    59.3,
    { [KRONII]: [35.5, 3.9] },
  ),
];

interface Row extends Observed {
  /** アクティブ欄 raw（モデル） */
  a: number;
  /** パッシブのスコアサポートがタイムラインへ足す量 */
  dp: number;
  support: number[];
  /** `H_C` のメンバーごとの取り分（production の重み） */
  share: number[];
}
const rows: Row[] = OBSERVED.map((o) => {
  const views = o.slots.map(([id, b]) =>
    compileDisplayMember(member(id, b), holomenMap, affIndex, NO_ACCOUNT_BONUS, 200),
  );
  const typeCounts = new Int32Array(3);
  const affCounts = new Int32Array(affIndex.size);
  for (const v of views) {
    typeCounts[v.typeIndex] = (typeCounts[v.typeIndex] ?? 0) + 1;
    for (const x of v.affIndices) affCounts[x] = (affCounts[x] ?? 0) + 1;
  }
  const scratch = createDisplayScratch();
  const part = createDisplayMemberPart();
  prepareDisplay(views, typeCounts, affCounts, scratch, part, 200);
  return {
    ...o,
    a: part.active,
    dp: part.withPassive - part.blue,
    support: Array.from(scratch.passiveSupport.slice(0, o.slots.length)),
    share: Array.from(part.costumeShare.slice(0, o.slots.length)),
  };
});
const withPassive = rows.filter((r) => r.dp > 0);

const ceil1 = (v: number): number => Math.ceil(v * 10 - 1e-9) / 10;
const floor1 = (v: number): number => Math.floor(v * 10 + 1e-9) / 10;
const round1s = (v: number): number => Math.round(v * 10 + 1e-9) / 10;
const d1 = (v: number): number => Math.round(v * 10) / 10;
const QUANT = { 切り上げ: ceil1, 切り捨て: floor1, 四捨五入: round1s };
type Phase = (a: number, x: number) => number;
const COLUMN_PHASES: Record<string, Phase> = {};
for (const [name, q] of Object.entries(QUANT)) {
  COLUMN_PHASES[`独立-${name}`] = (_a, x) => q(x);
  COLUMN_PHASES[`差分-${name}`] = (a, x) => (x === 0 ? 0 : d1(q(a + x) - q(a)));
}
const COSTUME_PHASE = COLUMN_PHASES["差分-切り上げ"]!;
const PASSIVE_PHASE = COLUMN_PHASES["独立-切り上げ"]!;

/** `A` の量子化区間を等分した候補（モデル値そのものだけを見るなら steps = 0） */
function activeCandidates(r: Row, steps: number): number[] {
  if (steps === 0) return [r.a];
  const shown = ceil1(r.a);
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = shown - 0.1 + (0.1 * i) / steps + 1e-9;
    if (ceil1(a) === shown) out.push(a);
  }
  return out;
}

/** 支援を受けるメンバーの合計支援 %（混在する編成 2 では最大値ではなく 0 を返す） */
function uniformSupportPercent(r: Row): number {
  const nonZero = new Set(r.support.filter((s) => s > 0));
  return nonZero.size === 1 ? [...nonZero][0]! : 0;
}

/** 重み `w` が、`A` のぶれを含めてその編成の全リーダー支援 % と両立するか */
function weightFits(r: Row, w: readonly number[], steps: number): boolean {
  const total = w.reduce((a, b) => a + b, 0);
  const wp = r.support.reduce((a, s, i) => a + (s / 100) * (w[i] ?? 0), 0);
  for (const a of activeCandidates(r, steps)) {
    const dp = r.dp * (a / r.a);
    let ok = true;
    for (const [percent, shown] of Object.entries(r.shown)) {
      const l = Number(percent);
      const wc = (l / 100) * total;
      const t = (l / 100) * a + dp;
      const costume = wc + wp > 0 ? (t * wc) / (wc + wp) : t;
      if (
        Math.abs(COSTUME_PHASE(a, costume) - shown[0]) >= 1e-9 ||
        Math.abs(PASSIVE_PHASE(a, t - costume) - shown[1]) >= 1e-9
      ) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** 実機が要求する「支援を受けるメンバーが重み全体に占める割合」`f` の範囲 */
function requiredFraction(r: Row, steps: number): [number, number] | null {
  const s = uniformSupportPercent(r);
  if (s === 0) throw new Error(`${r.label} は支援 % が混在していて f では書けない`);
  let lo: number | null = null;
  let hi = 0;
  for (const a of activeCandidates(r, steps)) {
    const dp = r.dp * (a / r.a);
    for (let k = 0; k <= 2000; k++) {
      const f = (k / 2000) * 1.0;
      let ok = true;
      for (const [percent, shown] of Object.entries(r.shown)) {
        const l = Number(percent);
        const rho = (s * f) / l;
        const t = (l / 100) * a + dp;
        const passive = (t * rho) / (1 + rho);
        if (
          Math.abs(COSTUME_PHASE(a, t - passive) - shown[0]) >= 1e-9 ||
          Math.abs(PASSIVE_PHASE(a, passive) - shown[1]) >= 1e-9
        ) {
          ok = false;
          break;
        }
      }
      if (ok) {
        if (lo === null) lo = f;
        hi = f;
      }
    }
  }
  return lo === null ? null : [lo, hi];
}

const modelWeight = (r: Row): number[] => r.share;
const uniformWeight = (r: Row): number[] => r.share.map(() => 1);

describe("3 欄の配賦と量子化の位相(2026-09-15 実機 16 編成・青なし)", () => {
  it("アクティブ欄は 16 編成すべて実機と一致する(食い違いは入力のせいではない)", () => {
    expect(rows.filter((r) => ceil1(r.a) !== r.active).map((r) => r.label)).toEqual([]);
  });

  it("みこ baseline(支援 0)のパッシブ欄は 6 件とも ceil(ΔP) と一致する — 総量 T と対象選抜が正しい", () => {
    const base = rows.filter((r) => r.baseline !== null);
    expect(base.length).toBe(6);
    expect(base.map((r) => ceil1(r.dp))).toEqual(base.map((r) => r.baseline));
  });

  it("【頑健】衣装欄はアクティブ欄との差として量子化される(A のぶれを許しても独立量子化は残らない)", () => {
    const survivors = new Set<string>();
    for (const [cn, qc] of Object.entries(COLUMN_PHASES)) {
      for (const [, qp] of Object.entries(COLUMN_PHASES)) {
        const failed = rows.some((r) => {
          for (const a of activeCandidates(r, 40)) {
            const dp = r.dp * (a / r.a);
            if (r.baseline !== null && Math.abs(qp(a, dp) - r.baseline) >= 1e-9) continue;
            const t60 = 0.6 * a + dp;
            if (r.dp === 0) {
              if (Math.abs(qc(a, t60) - r.shown[KRONII]![0]) < 1e-9) return false;
              continue;
            }
            let all = true;
            for (const [percent, shown] of Object.entries(r.shown)) {
              const l = Number(percent);
              const t = (l / 100) * a + dp;
              let found = false;
              for (let k = 0; k <= 1500 && !found; k++) {
                const p = t * (k / 1500);
                if (
                  Math.abs(qc(a, t - p) - shown[0]) < 1e-9 &&
                  Math.abs(qp(a, p) - shown[1]) < 1e-9
                ) {
                  found = true;
                }
              }
              if (!found) {
                all = false;
                break;
              }
            }
            if (all) return false;
          }
          return true;
        });
        if (!failed) survivors.add(cn);
      }
    }
    // 生き残る衣装欄の位相はすべて「アクティブ欄との差」型
    expect([...survivors].sort()).toEqual(["差分-切り上げ", "差分-切り捨て"]);
  });

  it("【条件つき: モデルの A を厳密とみなす】位相は 1 通りに決まる(パッシブ欄は素の切り上げ)", () => {
    const survivors: string[] = [];
    for (const [cn, qc] of Object.entries(COLUMN_PHASES)) {
      for (const [pn, qp] of Object.entries(COLUMN_PHASES)) {
        const failed = rows.some((r) => {
          if (r.baseline !== null && Math.abs(qp(r.a, r.dp) - r.baseline) >= 1e-9) return true;
          const t60 = 0.6 * r.a + r.dp;
          if (r.dp === 0) return Math.abs(qc(r.a, t60) - r.shown[KRONII]![0]) >= 1e-9;
          for (const [percent, shown] of Object.entries(r.shown)) {
            const t = (Number(percent) / 100) * r.a + r.dp;
            let found = false;
            for (let k = 0; k <= 4000 && !found; k++) {
              const p = t * (k / 4000);
              if (
                Math.abs(qc(r.a, t - p) - shown[0]) < 1e-9 &&
                Math.abs(qp(r.a, p) - shown[1]) < 1e-9
              ) {
                found = true;
              }
            }
            if (!found) return true;
          }
          return false;
        });
        if (!failed) survivors.push(`衣装=${cn} / パッシブ=${pn}`);
      }
    }
    expect(survivors).toEqual([
      "衣装=差分-切り上げ / パッシブ=独立-切り上げ",
      "衣装=差分-切り捨て / パッシブ=独立-切り上げ",
    ]);
  });

  it("【頑健】配分の重みは競合で正規化した取り分ではない(A のぶれを許しても 12 編成中 9 で外れる)", () => {
    const missed = rows.filter((r) => r.dp > 0 && !weightFits(r, modelWeight(r), 40));
    expect(missed.map((r) => r.label)).toEqual([
      "1",
      "2",
      "S2",
      "S3",
      "S4",
      "−ポルカ",
      "−スバル",
      "−アーニャ",
      "−ロボ子",
    ]);
  });

  it("【頑健】一様な重みでもない", () => {
    const missed = rows.filter((r) => r.dp > 0 && !weightFits(r, uniformWeight(r), 40));
    // −ポルカ（支援を受ける 2 人が ロボ子 + リス）は 2 人が平均より重いことを要求するので一様を落とす
    expect(missed.map((r) => r.label)).toContain("−ポルカ");
    expect(missed.length).toBeGreaterThanOrEqual(6);
  });

  it("【頑健】W_C はリーダーのスコアサポート % に比例する(25% と 60% が同じ f で通る)", () => {
    for (const label of ["S1", "S2", "S3"]) {
      const r = withPassive.find((x) => x.label === label)!;
      expect(Object.keys(r.shown).length, label).toBe(2);
      // 両方の支援 % を同時に満たす f が存在する
      expect(requiredFraction(r, 40), label).not.toBeNull();
    }
  });

  it("6 枚プールは 1 つの順位で 6 編成すべてを説明でき、対象選抜が一意に決まる", () => {
    // ロボ子 / ポルカ / リス / 奏 はどれもハッピーで、供給側は「ハッピー 2 人」へ同じ順位で配る。
    // 順位（実機の P + T + S の降順）は 6 編成で共通なので、24 通りの順位を総当たりして絞れる
    const HAPPY = ["roboco-san-01", "omaru-polka-01", "ayunda-risu-01", "otonose-kanade-02"];
    const POOL = ["−ポルカ", "−スバル", "−アーニャ", "−ロボ子", "S2", "S3"];
    const permutations = (xs: string[]): string[][] =>
      xs.length <= 1
        ? [xs]
        : xs.flatMap((x, i) =>
            permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]),
          );
    const pickedBy = (order: string[], r: Row): number[] =>
      r.slots
        .map(([id], i) => [id, i] as const)
        .filter(([id]) => HAPPY.includes(id))
        .sort((x, y) => order.indexOf(x[0]) - order.indexOf(y[0]))
        .slice(0, 2)
        .map(([, i]) => i);
    const consistent = permutations(HAPPY).filter((order) =>
      POOL.every((label) => {
        const r = withPassive.find((x) => x.label === label)!;
        const percent = uniformSupportPercent(r);
        const idx = pickedBy(order, r);
        const alt: Row = {
          ...r,
          support: r.support.map((_, k) => (idx.includes(k) ? percent : 0)),
          dp: (percent / 100) * idx.reduce((acc, k) => acc + (r.share[k] ?? 0), 0),
        };
        return requiredFraction(alt, 40) !== null;
      }),
    );
    // 24 通り中 2 通りだけが残り、どちらも 6 編成で同じ 2 人を選ぶ
    expect(consistent.length).toBe(2);
    for (const label of POOL) {
      const r = withPassive.find((x) => x.label === label)!;
      const picks = consistent.map((order) =>
        pickedBy(order, r)
          .sort((x, y) => x - y)
          .join(","),
      );
      expect(new Set(picks).size, label).toBe(1);
      // production の対象選抜（素の P + T + S 上位 2 人）と一致する
      const model = r.support
        .map((s, i) => [s, i] as const)
        .filter(([s]) => s > 0)
        .map(([, i]) => i)
        .sort((x, y) => x - y)
        .join(",");
      expect(picks[0], label).toBe(model);
    }
  });
});
