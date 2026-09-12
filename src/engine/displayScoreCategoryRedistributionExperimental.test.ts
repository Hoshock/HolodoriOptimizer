import { describe, expect, it } from "vite-plus/test";
import type { Card } from "../data/types";
import { round1 } from "./displayScore";
import type { CategoryContrast, LeaderContrast } from "./displayScoreCategoryCorpus.fixture";
import {
  CATEGORY_CONTRASTS,
  holomenMap,
  LEADER_CONTRASTS,
  LEADER_SUPPORT_ID,
  LEADER_SUPPORT_PERCENT,
  memberFor,
  realCard,
} from "./displayScoreCategoryCorpus.fixture";
import type { Interval, ResidualRouting } from "./displayScoreCategoryRedistributionExperimental";
import {
  columnDeltas,
  commonScaleIntersection,
  impliedScale,
  redistributionErrors,
} from "./displayScoreCategoryRedistributionExperimental";
import type { LeaderSupportEnvironment } from "./displayScoreLeaderSupportExperimental";
import {
  buildLeaderSupportEnvironment,
  expectedActive,
  expectedActiveCStar,
} from "./displayScoreLeaderSupportExperimental";
import {
  attributeColumns,
  buildSourceEnvironment,
  sourceErrorStats,
} from "./displayScoreSourceAttributionExperimental";

/**
 * **これはゲーム仕様の Golden ではなく、「支援の総増分のうち衣装欄に出ない残差を ボード / パッシブ へどう配るか」の
 * 仮説の回帰評価（解析用・production 未採用）。** 実測値はモデルに合わせて変えない。固定するのは 2026-09-13 時点の
 * 支持・反証で、式ではない。
 *
 * 仮説（proportionalBaseline）: 残差 `R` を 支援なし側の ボード : パッシブ の比で分ける。
 * = 支援追加後に 両欄を共通倍率 `k = 1 + R/(B0 + P0)` で scale する。**総量は増やさない**（ゼロサム再配分）ので、
 * 既存の「総増分 = S/100 × E_blue(乗算)」「支援 3 種は加算合成」を壊さない。
 *
 * 対照（boardOnly）: 残差を全部ボードへ。既存の秒 × 候補単位の配賦ルール族が予測する姿（Δパッシブ = 0）と同じ。
 *
 * コーパス: Leader-only matched pairs K1〜K6 と、赤スコアサポートのカテゴリ配賦 16 行
 * （displayScoreCategoryCorpus.fixture.ts）。
 */

const S = LEADER_SUPPORT_PERCENT;
const kronii = realCard(LEADER_SUPPORT_ID);
const membersOf = (c: LeaderContrast): Card[] => c.members.map((s) => memberFor(s, c.blue));
const envFor = (c: LeaderContrast): LeaderSupportEnvironment =>
  buildLeaderSupportEnvironment(kronii, membersOf(c), holomenMap);
const byName = (prefix: string): LeaderContrast => {
  const c = LEADER_CONTRASTS.find((x) => x.name.startsWith(prefix));
  if (!c) throw new Error(`${prefix} がない`);
  return c;
};
const K1 = byName("K1");
const K2 = byName("K2");
const K3 = byName("K3");
const K4 = byName("K4");
const K5 = byName("K5");
const K6 = byName("K6");
/** 青ありの 4 組（K5 / K6 は青なしの negative control） */
const interacting = [K1, K2, K3, K4];

const scaleColumns = (c: LeaderContrast) => [
  { before: c.baseline[2], after: c.support[2] },
  { before: c.baseline[3], after: c.support[3] },
];
const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;
const asPair = (iv: Interval | null): [number, number] | null =>
  iv ? [round4(iv.lo), round4(iv.hi)] : null;

/** oracle: Δ衣装 を実測で与え、残差の配り方だけを見る */
const oracleErrors = (c: LeaderContrast, routing: ResidualRouting) => {
  const d = columnDeltas(c.baseline, c.support);
  return redistributionErrors(
    d.supportTotal,
    d.costume,
    c.baseline[2],
    c.baseline[3],
    { board: d.board, passive: d.passive },
    routing,
  );
};

describe("表示 0.1 量子化を考慮した共通倍率 k（リーダー支援）", () => {
  it("K1 / K3 / K4 は ボードとパッシブ を同じ k で説明できる（区間の共通部分が空でない）", () => {
    expect(asPair(commonScaleIntersection(scaleColumns(K1)).interval)).toEqual([2.1211, 2.1493]);
    expect(asPair(commonScaleIntersection(scaleColumns(K3)).interval)).toEqual([2.0657, 2.1111]);
    expect(asPair(commonScaleIntersection(scaleColumns(K4)).interval)).toEqual([1.9641, 1.9948]);
    for (const c of [K1, K3, K4]) {
      expect(commonScaleIntersection(scaleColumns(c)).informative).toBe(2);
    }
  });

  it("K2 はパッシブ欄 0.0 でボードだけの diagnostic、K5 は両欄 0.0 で情報なし", () => {
    const k2 = commonScaleIntersection(scaleColumns(K2));
    expect(k2.informative).toBe(1);
    expect(asPair(k2.interval)).toEqual([1.4039, 1.4197]);
    const k5 = commonScaleIntersection(scaleColumns(K5));
    expect(k5.informative).toBe(0);
    expect(k5.interval).toBeNull();
  });

  it("K6（青なし・パッシブ支援あり）は k ≈ 1 の negative control", () => {
    const k6 = commonScaleIntersection(scaleColumns(K6));
    expect(k6.informative).toBe(1);
    expect(asPair(k6.interval)).toEqual([0.9661, 1.0351]);
    const iv = k6.interval;
    if (!iv) throw new Error("K6 の区間がない");
    expect(iv.lo).toBeLessThanOrEqual(1);
    expect(iv.hi).toBeGreaterThanOrEqual(1);
  });

  it("oracle 残差から求めた k = 1 + R/(B0 + P0) は K1〜K4 のすべてで区間の中に入る", () => {
    for (const c of interacting) {
      const d = columnDeltas(c.baseline, c.support);
      const k = impliedScale(d.supportTotal - d.costume, c.baseline[2], c.baseline[3]);
      const iv = commonScaleIntersection(scaleColumns(c)).interval;
      if (k === null || !iv) throw new Error(`${c.name} の k / 区間がない`);
      expect(k).toBeGreaterThanOrEqual(iv.lo);
      expect(k).toBeLessThanOrEqual(iv.hi);
    }
  });
});

describe("oracle 比例再配分（実測 Δ衣装 を既知として B/P split だけを検証）", () => {
  // 注意: ここは「衣装式を既知と仮定したときの B/P split の isolated な検証」であって、ゲーム仕様の prediction ではない。
  // Δ衣装 は実測値を入れている（oracle）。完全予測は次の describe。
  it("K1〜K4 の Δボード / Δパッシブ を raw 誤差 0.14 以内・表示 1 桁で 0.1 以内に合わせる", () => {
    const expected: Record<string, [number, number]> = {
      K1: [-0.0322, 0.0322],
      K2: [-0.0, 0.0],
      K3: [-0.1342, 0.1342],
      K4: [-0.0598, 0.0598],
    };
    for (const c of interacting) {
      const e = oracleErrors(c, "proportionalBaseline");
      const key = c.name.slice(0, 2);
      const want = expected[key];
      if (!want) throw new Error(`${key} の期待値がない`);
      expect(round4(e.boardError)).toBeCloseTo(want[0], 4);
      expect(round4(e.passiveError)).toBeCloseTo(want[1], 4);
      const d = columnDeltas(c.baseline, c.support);
      expect(Math.abs(round1(e.predictedBoard) - d.board)).toBeLessThanOrEqual(0.1 + 1e-9);
      expect(Math.abs(round1(e.predictedPassive) - d.passive)).toBeLessThanOrEqual(0.1 + 1e-9);
    }
  });

  it("K1〜K4 の RMSE 0.075 / 最大 0.134（ボードとパッシブは総量保存で符号が逆の同値）", () => {
    const board = interacting.map((c) => oracleErrors(c, "proportionalBaseline").boardError);
    const passive = interacting.map((c) => oracleErrors(c, "proportionalBaseline").passiveError);
    const sb = sourceErrorStats(board);
    expect(sb.rmse).toBeCloseTo(0.0752, 3);
    expect(sb.maxAbsError).toBeCloseTo(0.1342, 3);
    expect(sourceErrorStats(passive).rmse).toBeCloseTo(0.0752, 3);
    for (let i = 0; i < board.length; i++) {
      expect((board[i] ?? 0) + (passive[i] ?? 0)).toBeCloseTo(0, 9);
    }
  });

  it("対照: 残差を全部ボードへ回す boardOnly は K1 / K4 を 1.1 / 1.4 外す（= 既存ルール族の Δパッシブ = 0）", () => {
    const board = interacting.map((c) => oracleErrors(c, "boardOnly").boardError);
    expect(board.map((x) => round4(x))).toEqual([1.1, -0, 0.4, 1.4]);
    const st = sourceErrorStats(board);
    expect(st.rmse).toBeCloseTo(0.9124, 3);
    expect(st.maxAbsError).toBeCloseTo(1.4, 6);
  });

  it("K5 / K6 は残差 0 で再配分が起きない（青なしの negative control）", () => {
    for (const c of [K5, K6]) {
      const e = oracleErrors(c, "proportionalBaseline");
      expect(e.residual).toBeCloseTo(0, 9);
      expect(e.predictedBoard).toBeCloseTo(0, 9);
      expect(e.predictedPassive).toBeCloseTo(0, 9);
      expect(e.passiveError).toBeCloseTo(0, 9);
    }
    // K6 はパッシブ欄 2.9 があっても Δパッシブ = 0。比例再配分は「P0 が大きいと必ず動く」ルールではない
    expect(K6.baseline[3]).toBe(2.9);
    expect(columnDeltas(K6.baseline, K6.support).passive).toBe(0);
  });
});

describe("完全予測（総量 S/100 × E_blue(乗算) − 衣装候補 を比例再配分）", () => {
  const predictedTotal = (c: LeaderContrast): number =>
    (S / 100) * expectedActive(envFor(c), { blue: "multiplicative" });
  const costumeCandidates = {
    /** 秒 × 候補単位の配賦ルール族の最良（発動率 UP ぶんだけボードへ） */
    p0Only: (c: LeaderContrast): number =>
      attributeColumns(buildSourceEnvironment(kronii, membersOf(c), holomenMap), {
        passive: "static",
        rule: "p0Only",
      }).costume,
    /** C* = S/100 ×（編成条件未解決 up × 青の頻度込み窓 × p0） */
    cStar: (c: LeaderContrast): number => (S / 100) * expectedActiveCStar(envFor(c)),
  };

  it("総量 S/100 × E_blue(乗算) は K1〜K4 で RMSE 0.11 / 最大 0.18（既存結果の再確認）", () => {
    const errors = interacting.map(
      (c) => predictedTotal(c) - columnDeltas(c.baseline, c.support).supportTotal,
    );
    const st = sourceErrorStats(errors);
    expect(st.rmse).toBeCloseTo(0.108, 2);
    expect(st.maxAbsError).toBeCloseTo(0.184, 2);
  });

  it("衣装候補がボトルネック: C の誤差はそのままボードへ回り、パッシブ欄だけは 0.07〜0.23 で合う", () => {
    const table: Record<string, { c: number; b: number; p: number; cMax: number }> = {};
    for (const [name, candidate] of Object.entries(costumeCandidates)) {
      const ec: number[] = [];
      const eb: number[] = [];
      const ep: number[] = [];
      for (const c of interacting) {
        const d = columnDeltas(c.baseline, c.support);
        const cost = candidate(c);
        const e = redistributionErrors(
          predictedTotal(c),
          cost,
          c.baseline[2],
          c.baseline[3],
          { board: d.board, passive: d.passive },
          "proportionalBaseline",
        );
        ec.push(cost - d.costume);
        eb.push(e.boardError);
        ep.push(e.passiveError);
      }
      table[name] = {
        c: round4(sourceErrorStats(ec).rmse),
        b: round4(sourceErrorStats(eb).rmse),
        p: round4(sourceErrorStats(ep).rmse),
        cMax: round4(sourceErrorStats(ec).maxAbsError),
      };
    }
    // 衣装 RMSE は既存の反証どおり（p0Only は K2 を −3.6、C* は K1 / K3 / K4 を 1.4〜1.5 外す）
    expect(table.p0Only?.c).toBeCloseTo(1.9059, 2);
    expect(table.p0Only?.cMax).toBeCloseTo(3.6164, 2);
    expect(table.cStar?.c).toBeCloseTo(1.2513, 2);
    expect(table.cStar?.cMax).toBeCloseTo(1.4661, 2);
    // ボード誤差は衣装誤差の鏡像（総量保存）
    expect(table.p0Only?.b).toBeCloseTo(1.8521, 2);
    expect(table.cStar?.b).toBeCloseTo(1.1123, 2);
    // パッシブ欄は衣装が 3.6 外れても 0.12 以内。P0/(B0+P0) が小さいので誤差はボードへ落ちる
    expect(table.p0Only?.p).toBeCloseTo(0.0731, 2);
    expect(table.cStar?.p).toBeCloseTo(0.1263, 2);
    // 「Δパッシブ = 0」と置く既存ルール族の RMSE 0.91 よりは良い
    expect(
      sourceErrorStats(interacting.map((c) => -columnDeltas(c.baseline, c.support).passive)).rmse,
    ).toBeCloseTo(0.9124, 3);
  });

  it("完全予測の k は K1〜K4 のすべてで観測区間の外（構造ではなく衣装候補の値が外している）", () => {
    for (const [, candidate] of Object.entries(costumeCandidates)) {
      for (const c of interacting) {
        const k = impliedScale(predictedTotal(c) - candidate(c), c.baseline[2], c.baseline[3]);
        const iv = commonScaleIntersection(scaleColumns(c)).interval;
        if (k === null || !iv) throw new Error(`${c.name} の k / 区間がない`);
        expect(k < iv.lo || k > iv.hi).toBe(true);
      }
    }
  });

  it("K5 / K6 では衣装候補が総量と厳密に一致し、残差 0 で再配分が起きない", () => {
    for (const c of [K5, K6]) {
      for (const candidate of Object.values(costumeCandidates)) {
        expect(candidate(c)).toBeCloseTo(predictedTotal(c), 9);
      }
    }
  });
});

describe("赤スコアサポートのコーパスへ同じルールを当てる（反証）", () => {
  const redRows = CATEGORY_CONTRASTS.map((c: CategoryContrast) => {
    const d = columnDeltas(c.before, c.after);
    return { c, d };
  });
  const redErrors = (routing: ResidualRouting) =>
    redRows.map(({ c, d }) =>
      redistributionErrors(
        d.supportTotal,
        d.costume,
        c.before[2],
        c.before[3],
        { board: d.board, passive: d.passive },
        routing,
      ),
    );

  it("比例再配分は赤 16 行で RMSE 0.58 / 最大 1.38、しかも符号が一方向（パッシブへ配り過ぎ）", () => {
    const e = redErrors("proportionalBaseline");
    const st = sourceErrorStats(e.map((x) => x.passiveError));
    expect(st.rmse).toBeCloseTo(0.5836, 2);
    expect(st.maxAbsError).toBeCloseTo(1.3841, 2);
    expect(st.bias).toBeCloseTo(0.4692, 2);
    // 16 行すべてでパッシブへ過剰配分（過小が 1 行もない）
    expect(e.every((x) => x.passiveError >= -1e-9)).toBe(true);
  });

  it("boardOnly は赤 16 行で RMSE 0.20 / 最大 0.50。ただし Δパッシブ 0.3〜0.5 の 3 行を説明できない", () => {
    const e = redErrors("boardOnly");
    const st = sourceErrorStats(e.map((x) => x.passiveError));
    expect(st.rmse).toBeCloseTo(0.2019, 2);
    expect(st.maxAbsError).toBeCloseTo(0.5, 6);
    const leaking = redRows.filter(({ d }) => d.passive >= 0.3);
    expect(leaking.length).toBe(3);
    expect(leaking.map(({ d }) => d.passive)).toEqual([0.4, 0.5, 0.3]);
  });

  it("共通倍率 k は赤では 14 行中 13 行で区間が空（リーダーの K1 / K3 / K4 とは逆）", () => {
    let informative = 0;
    let empty = 0;
    for (const { c } of redRows) {
      const r = commonScaleIntersection([
        { before: c.before[2], after: c.after[2] },
        { before: c.before[3], after: c.after[3] },
      ]);
      if (r.informative < 2) continue;
      informative++;
      if (!r.interval) empty++;
    }
    expect(informative).toBe(14);
    expect(empty).toBe(13);
  });

  it("二重解離: 比例再配分はリーダーで最大 0.13 / 赤で最大 1.38、boardOnly は赤で最大 0.50 / リーダーで最大 1.4", () => {
    const leaderProp = sourceErrorStats(
      interacting.map((c) => oracleErrors(c, "proportionalBaseline").passiveError),
    );
    const leaderBoard = sourceErrorStats(
      interacting.map((c) => oracleErrors(c, "boardOnly").passiveError),
    );
    const redProp = sourceErrorStats(redErrors("proportionalBaseline").map((x) => x.passiveError));
    const redBoard = sourceErrorStats(redErrors("boardOnly").map((x) => x.passiveError));
    expect(leaderProp.maxAbsError).toBeCloseTo(0.1342, 3);
    expect(leaderBoard.maxAbsError).toBeCloseTo(1.4, 6);
    expect(redProp.maxAbsError).toBeCloseTo(1.3841, 2);
    expect(redBoard.maxAbsError).toBeCloseTo(0.5, 6);
    // どちらのルールも両コーパスは説明しない。source（リーダー衣装 / 赤）で配賦が違うという仮説が残るだけで、
    // 赤の Δパッシブ 0.1〜0.5 は boardOnly でも未説明。「確定」とは書かない
    expect(leaderProp.maxAbsError).toBeLessThan(leaderBoard.maxAbsError);
    expect(redBoard.maxAbsError).toBeLessThan(redProp.maxAbsError);
  });
});
