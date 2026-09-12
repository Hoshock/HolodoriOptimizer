import { describe, expect, it } from "vite-plus/test";

import { cards as realCards, holomen as realHolomen } from "../data";
import { cardAtBloom } from "../data/bloom";
import type { Card } from "../data/types";
import { computeDisplayScoreBonus } from "./displayScore";
import {
  experimentalBlueAdjustedProbability,
  experimentalErrorStats,
  experimentalRedSupportEvaluate,
  experimentalRedSupportGain,
} from "./displayScoreExperimental";
import type { ExperimentalRateModel } from "./displayScoreExperimental";
import { buildHolomenMap } from "./score";

/**
 * **これはゲーム仕様の Golden ではなく、赤「全員のスコアサポート効果」の現在最有力仮説（解析用・production 未採用）の回帰評価。**
 *
 *   ΔRed(X) = (X / 100) × E_blue
 *   E_blue  = 200 秒タイムライン・条件解決済みスコア UP・確率和の正規化（production のアクティブ欄と同じ評価器）に、
 *             青を p_i = min(1, p0_i × (1 + 発動率 UP_i / 100))（乗算型）、interval_i / (1 + 発動頻度 UP_i / 100) で入れたアクティブ期待値
 *
 * 実機 13 対照（docs/human/repro/display-score-20260912.md「赤+24 matched pairs」「R-061単独差分」「旧R-002 +10単独差分」）に対し
 * raw の予測値を比べる。実測値はモデルに合わせて変えない。ガードは仮説の回帰（RMSE < 0.15 / 最大 0.25 pt）で、完全一致は求めない。
 * 旧近似 `X × 基準候補秒 / 200`（反証済み）と、production の青と同じ加算型 p0 + r も同じ 13 対照へ当てて比較する。
 *
 * 青の実効値は**観測時点ごと**に分ける（現在値で過去観測を上書きしない）:
 * - 2026-09-08 の実効値（displayScore.test.ts の BLUE）: 2026-09-11 の旧おかゆ編成の R-002 +10（当時の青・緑は未共有。既存ゴールデンと同じ扱い）
 * - 2026-09-12 のアカウント構造化データ（docs/human/repro/20260912-account-snapshot.md から再計算。displayScore.test.ts の BLUE_CURRENT）:
 *   2026-09-12 の matched pairs / R-061 / フワワ入り 3 編成目と、2026-09-11 のノエル入替（ノエルは実験時の頻度 12%）
 * - 水着フワワの青は 2026-09-12 の構造化データどおり**なし（0 / 0）**。displayScore.test.ts の BLUE_AT_FUWAWA_OBSERVATION は
 *   構造化データの共有前に 2026-09-09 の実機報告値 45 / 0 を仮置きしたもので食い違う（要再確認 — pending）。45 / 0 にすると
 *   +24 の 9 件が系統的に +0.1〜0.3 pt 高く出る（RMSE 0.21）が、ここでは同日の構造化データを優先し合わせ込みはしない
 */

const holomenMap = buildHolomenMap(realHolomen);
const real = (id: string): Card => {
  const card = realCards.find((c) => c.id === id);
  if (!card) throw new Error(`${id} がない`);
  return card;
};
/** ホロメン ID → 青の実効値 [発動率 UP %, 発動頻度 UP %]。青はホロメン単位でそのホロメンの全カードに載る */
type BlueTable = Record<string, [number, number]>;
const holomenIdOf = (cardId: string): string => cardId.replace(/-0\d$/, "");

/** 2026-09-08 時点（displayScore.test.ts の BLUE と同じ値） */
const BLUE_2026_09_08: BlueTable = {
  "usada-pekora": [30, 8],
  "inugami-korone": [33.6, 4],
  "nekomata-okayu": [35.1, 12],
  "shirakami-fubuki": [39, 8],
  "ookami-mio": [0, 0],
};
/** 2026-09-12 のアカウント構造化データから再計算した値（displayScore.test.ts の BLUE_CURRENT + みこ・マリン） */
const BLUE_SNAPSHOT_2026_09_12: BlueTable = {
  "nekomata-okayu": [35.1, 12],
  "inugami-korone": [39.6, 0],
  "shirakami-fubuki": [15.0, 0],
  "usada-pekora": [30.0, 8],
  "ookami-mio": [36.6, 8],
  "shirogane-noel": [42.0, 8],
  "sakura-miko": [42.0, 0],
  "houshou-marine": [0, 0],
  // 構造化データに青マスなし（2026-09-09 の実機報告 45 / 0 と食い違う — 要再確認）
  "fuwawa-abyssgard": [0, 0],
};
/** ノエル入替の観測時点（2026-09-11）はノエルの頻度 12% */
const BLUE_AT_NOEL_OBSERVATION: BlueTable = {
  ...BLUE_SNAPSHOT_2026_09_12,
  "shirogane-noel": [42.0, 12],
};

type Slot = [cardId: string, bloom: number];
function member(slot: Slot, table: BlueTable): Card {
  const [id, bloom] = slot;
  const bloomed = cardAtBloom(real(id), bloom);
  const [r, f] = table[holomenIdOf(id)] ?? [0, 0];
  return {
    ...bloomed,
    naturalStats: bloomed.stats,
    boardLive: { activeRatePercent: r, activeFrequencyPercent: f },
  };
}

const MIKO2: Slot = ["sakura-miko-02", 1];
const FUWAWA2: Slot = ["fuwawa-abyssgard-02", 0];
const OKAYU2: Slot = ["nekomata-okayu-02", 5];
const KORONE2: Slot = ["inugami-korone-02", 2];
const KORONE1: Slot = ["inugami-korone-01", 3];
const MIO2: Slot = ["ookami-mio-02", 1];
const FUBUKI2: Slot = ["shirakami-fubuki-02", 0];
const FUBUKI1: Slot = ["shirakami-fubuki-01", 1];
const NOEL2: Slot = ["shirogane-noel-02", 0];
const MARINE1: Slot = ["houshou-marine-01", 1];
const PEKORA1: Slot = ["usada-pekora-01", 1];
/** matched pairs の共通編成（水着みこ 1凸 / A / 水着フワワ 0凸 / 水着おかゆ 5凸 / B。リーダーは水着フワワ 0凸で E_blue には効かない） */
const pair = (a: Slot, b: Slot): Slot[] => [MIKO2, a, FUWAWA2, OKAYU2, b];

interface Contrast {
  name: string;
  members: Slot[];
  blue: BlueTable;
  /** 赤スコアサポートの差 X（%） */
  x: number;
  /** 実機の合計スコアボーナス差（pt。reported。モデルに合わせて変えない） */
  observed: number;
}

/** 実機 13 対照 */
const CONTRASTS: Contrast[] = [
  {
    name: "+24 水着ミオ1 / 水着ころね2",
    members: pair(MIO2, KORONE2),
    blue: BLUE_SNAPSHOT_2026_09_12,
    x: 24,
    observed: 20.9,
  },
  {
    name: "+24 水着フブキ0 / 水着ころね2",
    members: pair(FUBUKI2, KORONE2),
    blue: BLUE_SNAPSHOT_2026_09_12,
    x: 24,
    observed: 19.1,
  },
  {
    name: "+24 水着ノエル0 / 水着ころね2",
    members: pair(NOEL2, KORONE2),
    blue: BLUE_SNAPSHOT_2026_09_12,
    x: 24,
    observed: 20.0,
  },
  {
    name: "+24 恒常マリン1 / 水着ころね2",
    members: pair(MARINE1, KORONE2),
    blue: BLUE_SNAPSHOT_2026_09_12,
    x: 24,
    observed: 20.8,
  },
  {
    name: "+24 水着ミオ1 / 恒常マリン1",
    members: pair(MIO2, MARINE1),
    blue: BLUE_SNAPSHOT_2026_09_12,
    x: 24,
    observed: 20.9,
  },
  {
    name: "+24 水着フブキ0 / 恒常マリン1",
    members: pair(FUBUKI2, MARINE1),
    blue: BLUE_SNAPSHOT_2026_09_12,
    x: 24,
    observed: 18.6,
  },
  {
    name: "+24 恒常フブキ1 / 恒常マリン1",
    members: pair(FUBUKI1, MARINE1),
    blue: BLUE_SNAPSHOT_2026_09_12,
    x: 24,
    observed: 20.6,
  },
  {
    name: "+24 恒常フブキ1 / 水着ころね2",
    members: pair(FUBUKI1, KORONE2),
    blue: BLUE_SNAPSHOT_2026_09_12,
    x: 24,
    observed: 20.7,
  },
  {
    name: "+24 恒常フブキ1 / 恒常ころね3",
    members: pair(FUBUKI1, KORONE1),
    blue: BLUE_SNAPSHOT_2026_09_12,
    x: 24,
    observed: 20.5,
  },
  {
    name: "R-061 +3 水着ミオ1 / 水着ころね2",
    members: pair(MIO2, KORONE2),
    blue: BLUE_SNAPSHOT_2026_09_12,
    x: 3,
    observed: 2.7,
  },
  {
    name: "R-002 +10 旧おかゆ編成（2026-09-11、青は 09-08 の値）",
    members: [PEKORA1, KORONE2, OKAYU2, FUBUKI2, MIO2],
    blue: BLUE_2026_09_08,
    x: 10,
    observed: 8.8,
  },
  {
    name: "R-002 +10 ノエル入替（2026-09-11、ノエル頻度 12）",
    members: [OKAYU2, KORONE2, MIO2, FUBUKI2, NOEL2],
    blue: BLUE_AT_NOEL_OBSERVATION,
    x: 10,
    observed: 8.5,
  },
  {
    name: "R-002 +10 水着フワワ入り 3 編成目（2026-09-12）",
    members: [MIO2, OKAYU2, KORONE2, PEKORA1, FUWAWA2],
    blue: BLUE_SNAPSHOT_2026_09_12,
    x: 10,
    observed: 8.7,
  },
];

function evaluateAll(model: ExperimentalRateModel) {
  return CONTRASTS.map((c) => {
    const members = c.members.map((s) => member(s, c.blue));
    const r = experimentalRedSupportEvaluate(members, holomenMap, c.x, { model });
    return { ...c, predicted: r.gain, legacy: r.legacyGain, expectedActive: r.expectedActive };
  });
}

describe("赤スコアサポートの現在最有力仮説 ΔRed = X/100 × E_blue（解析用・production 未採用。仕様の Golden ではなく仮説の回帰評価）", () => {
  const rows = evaluateAll("multiplicative");
  const errors = rows.map((r) => r.predicted - r.observed);
  const stats = experimentalErrorStats(errors);
  const legacyStats = experimentalErrorStats(rows.map((r) => r.legacy - r.observed));
  const additiveStats = experimentalErrorStats(
    evaluateAll("additive").map((r) => r.predicted - r.observed),
  );

  it("13 対照の raw 予測値は RMSE < 0.15 pt・最大絶対誤差 ≤ 0.25 pt（仮説の回帰ガード。完全一致は求めない）", () => {
    // 2026-09-12 時点: RMSE ≈ 0.086 / 最大 ≈ 0.13（恒常フブキ1 / 恒常マリン1 −0.13、水着ノエル +0.13、旧おかゆ編成 −0.12）
    expect(stats.rmse).toBeLessThan(0.15);
    expect(stats.maxAbsError).toBeLessThanOrEqual(0.25);
    for (const r of rows) {
      expect(Math.abs(r.predicted - r.observed), r.name).toBeLessThanOrEqual(0.25);
    }
  });

  it("旧近似 X × 基準候補秒 / 200（反証済み）より 13 対照の RMSE が小さい（+24 の 9 件だけなら legacy ≈ 1.2 pt 対 新 ≈ 0.09 pt）", () => {
    expect(stats.rmse).toBeLessThan(legacyStats.rmse);
    const pairs24 = rows.filter((r) => r.x === 24);
    const legacy24 = experimentalErrorStats(pairs24.map((r) => r.legacy - r.observed));
    const new24 = experimentalErrorStats(pairs24.map((r) => r.predicted - r.observed));
    expect(legacy24.rmse).toBeGreaterThan(1);
    expect(new24.rmse).toBeLessThan(0.15);
    // 水着ミオ1 / 恒常マリン1（青補正なし候補秒 149/200）は旧近似 17.88 対 実機 20.9 で 3 pt 外す
    const mioMarine = rows.find((r) => r.name === "+24 水着ミオ1 / 恒常マリン1");
    expect(mioMarine).toBeDefined();
    expect(Math.abs((mioMarine?.legacy ?? 0) - 17.88)).toBeLessThan(0.01);
  });

  it("発動率 UP は乗算型 p0 × (1 + r) の方が、production の青と同じ加算型 p0 + r より 13 対照の RMSE が小さい（加算型 ≈ 0.8 pt）", () => {
    // これは赤増分の内部基準量としての比較で、production の青ボード欄の換算（blueActivationProbability）を変える根拠にはしない
    expect(stats.rmse).toBeLessThan(additiveStats.rmse);
    expect(additiveStats.rmse).toBeGreaterThan(0.5);
  });

  it("青がなければ E_blue は production のアクティブ欄の raw と一致し、増分は X に比例する", () => {
    const noBlue: BlueTable = {};
    const members = pair(MIO2, KORONE2).map((s) => member(s, noBlue));
    const r = experimentalRedSupportEvaluate(members, holomenMap, 24);
    const production = computeDisplayScoreBonus(
      { leader: real("fuwawa-abyssgard-02"), members },
      holomenMap,
      1,
    );
    expect(r.expectedActive).toBeCloseTo(r.baseActive, 9);
    expect(Math.ceil(r.baseActive * 10 - 1e-9) / 10).toBe(production.active);
    expect(experimentalRedSupportGain(r.expectedActive, 48)).toBeCloseTo(2 * r.gain, 9);
    expect(experimentalRedSupportEvaluate(members, holomenMap, 12).gain).toBeCloseTo(r.gain / 2, 9);
  });

  it("乗算型 / 加算型の発動確率は上限 1 で、発動率 UP 0 なら基礎確率のまま", () => {
    expect(experimentalBlueAdjustedProbability(0.46, 0, "multiplicative")).toBe(0.46);
    expect(experimentalBlueAdjustedProbability(0.46, 0, "additive")).toBe(0.46);
    expect(experimentalBlueAdjustedProbability(0.55, 39.6, "multiplicative")).toBeCloseTo(
      0.7678,
      4,
    );
    expect(experimentalBlueAdjustedProbability(0.55, 39.6, "additive")).toBeCloseTo(0.946, 4);
    expect(experimentalBlueAdjustedProbability(0.55, 100, "multiplicative")).toBe(1);
    expect(experimentalBlueAdjustedProbability(0.55, 60, "additive")).toBe(1);
  });
});
