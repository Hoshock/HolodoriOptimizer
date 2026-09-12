import { describe, expect, it } from "vite-plus/test";
import { cardAtBloomWithProvenance } from "../data/bloom";
import type { Card } from "../data/types";
import { displayUnitScore, round1, scoreBonusPercent } from "./displayScore";
import type { LeaderContrast, Slot } from "./displayScoreCategoryCorpus.fixture";
import {
  BLUE_SNAPSHOT_2026_09_12,
  CATEGORY_CONTRASTS,
  holomenMap,
  LEADER_BASELINE_ID,
  LEADER_CONTRASTS,
  LEADER_SUPPORT_ID,
  LEADER_SUPPORT_PERCENT,
  memberFor,
  realCard,
} from "./displayScoreCategoryCorpus.fixture";
import { experimentalRedSupportEvaluate } from "./displayScoreExperimental";
import type {
  BlueModel,
  ExpectedActiveOptions,
  LeaderSupportEnvironment,
} from "./displayScoreLeaderSupportExperimental";
import {
  buildLeaderSupportEnvironment,
  expectedActive,
  expectedActiveCStar,
  experimentalLeaderCostumeCandidate,
  experimentalLeaderPassiveCandidate,
  experimentalSupportGain,
  leaderSupportErrorStats,
} from "./displayScoreLeaderSupportExperimental";

/**
 * **これはゲーム仕様の Golden ではなく、リーダー衣装スコアサポートの「総量」と「カテゴリ配賦」の仮説の回帰評価（解析用・
 * production 未採用）。** 実測値はモデルに合わせて変えない。固定するのは 2026-09-12 時点の支持・反証で、式ではない。
 *
 * コーパス: Leader-only matched pairs K1〜K5（docs/human/repro/display-score-20260912.md「Leader-only matched pairs」）。
 * 同じメンバー 5 人・赤 0・黄 0・曲指定なしで、リーダーだけを 恒常みこ 0凸（支援 0%）→ 典獄クロニー 0凸（「全員のスコアサポート効果60%」）
 * に替えた 5 欄の差。K5 は青・パッシブ支援なしの clean control。
 */

const S = LEADER_SUPPORT_PERCENT;
const kronii = realCard(LEADER_SUPPORT_ID);
const miko1 = realCard(LEADER_BASELINE_ID);
const membersOf = (c: LeaderContrast): Card[] => c.members.map((s) => memberFor(s, c.blue));
const envFor = (c: LeaderContrast, leader: Card = kronii): LeaderSupportEnvironment =>
  buildLeaderSupportEnvironment(leader, membersOf(c), holomenMap);
const deltaOf = (c: LeaderContrast) => {
  const costume = round1(c.support[0] - c.baseline[0]);
  const board = round1(c.support[2] - c.baseline[2]);
  const passive = round1(c.support[3] - c.baseline[3]);
  return { costume, board, passive, total: round1(costume + board + passive) };
};
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
/** K1〜K4（青・パッシブ支援が入る 4 組）。K5 / K6 は青なしの negative control（Δボード = Δパッシブ = 0）で別扱い */
const interacting = LEADER_CONTRASTS.filter((c) => !c.cleanControl);
const clean = LEADER_CONTRASTS.find((c) => c.cleanControl && !c.passiveSupport);
const cleanWithPassive = LEADER_CONTRASTS.find((c) => c.cleanControl && c.passiveSupport);
if (!clean || !cleanWithPassive) throw new Error("clean control がない");
/** K5: 青なし・パッシブ支援なし */
const CLEAN: LeaderContrast = clean;
/** K6: 青なし・パッシブ支援あり（2026-09-13） */
const K6: LeaderContrast = cleanWithPassive;

/** 衣装欄の候補 C* = 編成条件を未解決にしたスコア UP × 青の頻度込みタイムライン × 基準確率 p0 */
const C_STAR: ExpectedActiveOptions = { ups: "deckUnresolved", blue: "none" };
const cStarValue = (env: LeaderSupportEnvironment, exclude?: readonly boolean[]): number =>
  expectedActiveCStar(env, exclude);

describe("Leader-only matched pairs のコーパス（2026-09-12 典獄クロニー 60%）", () => {
  it("クロニーのカード ID・衣装文言・支援 % を実機報告と突き合わせる（cards.json の推測ではなく ID で確認）", () => {
    expect(kronii.id).toBe("ouro-kronii-01");
    expect(kronii.name).toBe("典獄ささやくClock Tower");
    expect(kronii.holomenId).toBe("ouro-kronii");
    expect(kronii.costumeSkill.raw).toBe("全員のスコアサポート効果60%");
    expect(kronii.costumeSkill.structured).toEqual({
      condition: { kind: "always" },
      effects: [{ kind: "scoreSupport", target: { kind: "all" }, percent: 60 }],
    });
    // 恒常みこ 0凸の衣装はセンス UP だけ（スコアサポートなし）
    expect(miko1.id).toBe("sakura-miko-01");
    expect(miko1.costumeSkill.structured?.effects.some((e) => e.kind === "scoreSupport")).toBe(
      false,
    );
    for (const c of LEADER_CONTRASTS) {
      expect(envFor(c).supportPercent).toBe(S);
      expect(envFor(c, miko1).supportPercent).toBe(0);
    }
  });

  it("matched pair でアクティブ / SP は不変、K1〜K4 のアクティブ欄は評価器の E_base と一致、クロニー側はユニットスコア式と一致", () => {
    for (const c of LEADER_CONTRASTS) {
      expect(c.support[1]).toBe(c.baseline[1]);
      expect(c.support[4]).toBe(c.baseline[4]);
    }
    for (const c of interacting) {
      const env = envFor(c);
      expect(Math.abs(scoreBonusPercent(expectedActive(env)) - c.baseline[1])).toBeLessThanOrEqual(
        0.1,
      );
      const total = round1(sum(c.support));
      expect(displayUnitScore(c.supportPower, total)).toBe(c.supportUnitScore);
    }
  });

  it("K5 の 5 枚の 0凸アクティブ（2026-09-13 実機再確認）で、production の評価器はアクティブ欄 63.3 を再現する（raw 63.24）", () => {
    const env = envFor(CLEAN);
    for (const slot of CLEAN.members) {
      const [id, bloom] = slot;
      const resolved = cardAtBloomWithProvenance(realCard(id), bloom);
      expect(resolved.provenance.activeSkill.source).toBe("observed-variant");
    }
    // 2026-09-12 の仮定倍率入力では 67.9、抽出マスター level 1 を 0凸に当てた入力では 59.6 で、どちらも 63.3 を外していた。
    // そら 85 → 100、ぼたん 50→105 → 60→125 の実機値（master の level ↔ 凸の一律対応が誤り）に直すと、式を変えずに 63.3
    expect(Array.from(env.ups)).toEqual([100, 95, 95, 100, 60]);
    expect(expectedActive(env)).toBeCloseTo(63.235, 2);
    expect(scoreBonusPercent(expectedActive(env))).toBe(CLEAN.baseline[1]);
    // 青がないので E_base = E_blue
    expect(expectedActive(env, { blue: "multiplicative" })).toBeCloseTo(expectedActive(env), 9);
  });
});

describe("A. Leader total-gain conservation: Δ衣装 + Δボード + Δパッシブ = S/100 × E", () => {
  const BLUE: BlueModel[] = ["none", "additive", "multiplicative"];
  const errorsFor = (blue: BlueModel): number[] =>
    interacting.map((c) => experimentalSupportGain(envFor(c), S, blue) - deltaOf(c).total);

  it("E_blue（乗算型）が K1〜K4 で RMSE < 0.15 / 最大 0.2、E_base と加算型は明確に劣る", () => {
    const stats = Object.fromEntries(BLUE.map((b) => [b, leaderSupportErrorStats(errorsFor(b))]));
    expect(stats.multiplicative?.rmse).toBeLessThan(0.15);
    expect(stats.multiplicative?.maxAbsError).toBeLessThan(0.2);
    expect(stats.none?.rmse).toBeGreaterThan(5);
    expect(stats.none?.bias).toBeLessThan(-5); // E_base では総量が足りない
    expect(stats.additive?.rmse).toBeGreaterThan(2);
    expect(stats.additive?.bias).toBeGreaterThan(2); // 加算型は過大
    // 予測 vs 実測（表示 0.1 単位）
    expect(
      interacting.map((c) => round1(experimentalSupportGain(envFor(c), S, "multiplicative"))),
    ).toEqual([52.3, 52.4, 46.2, 47.7]);
    expect(interacting.map((c) => deltaOf(c).total)).toEqual([52.3, 52.5, 46.2, 47.9]);
  });

  it("総量の E_blue は赤の総量モデル（displayScoreExperimental）と同じ評価器の値（重複実装ではなく同じ量）", () => {
    for (const c of interacting) {
      const red = experimentalRedSupportEvaluate(membersOf(c), holomenMap, S);
      expect(experimentalSupportGain(envFor(c), S, "multiplicative")).toBeCloseTo(red.gain, 9);
      expect(expectedActive(envFor(c), { blue: "multiplicative" })).toBeCloseTo(
        red.expectedActive,
        9,
      );
    }
  });
});

describe("B. 青なしの negative control K5（パッシブ支援なし）/ K6（パッシブ支援あり）", () => {
  it("K5: Δボード = Δパッシブ = 0、Δ衣装 = 0.60 × 表示アクティブ（37.98 → 37.9）", () => {
    const d = deltaOf(CLEAN);
    expect(d.board).toBe(0);
    expect(d.passive).toBe(0);
    expect(Math.abs(d.costume - (S / 100) * CLEAN.baseline[1])).toBeLessThan(0.1);
    // 表示アクティブ 63.3 は切り上げなので raw ∈ (63.2, 63.3]。0.6 × raw ∈ (37.92, 37.98] で、衣装欄 37.9 は
    // 切り上げでは出ない（38.0 になる）。切り捨てなら区間全体、四捨五入なら raw < 63.25 のときだけ 37.9。
    // これだけで量子化規則は決めない（内部 raw と permil 量子化の可能性を残す）
    const lo = 0.6 * 63.2;
    const hi = 0.6 * 63.3;
    expect(Math.ceil(lo * 10 + 1e-9) / 10).toBe(38.0);
    expect(Math.floor(lo * 10 + 1e-9) / 10).toBe(37.9);
    expect(Math.floor(hi * 10 + 1e-9) / 10).toBe(37.9);
  });

  it("K6（2026-09-13）: パッシブ欄 2.9 があっても Δボード = Δパッシブ = 0、Δ衣装 = 0.60 × 表示アクティブ（44.22 → 44.3）。青がなければパッシブ支援の有無によらず全量が衣装欄", () => {
    expect(K6.members.map(([id]) => id)).toEqual([
      "tokino-sora-01",
      "aki-rosenthal-01",
      "oozora-subaru-01",
      "shiranui-flare-01",
      "houshou-marine-01",
    ]);
    expect(K6.baseline).toEqual([0, 73.7, 0, 2.9, 43.3]);
    expect(K6.support).toEqual([44.3, 73.7, 0, 2.9, 43.3]);
    const d = deltaOf(K6);
    expect(d.board).toBe(0);
    expect(d.passive).toBe(0);
    expect(d.costume).toBe(44.3);
    expect(Math.abs(d.costume - (S / 100) * K6.baseline[1])).toBeLessThan(0.1);
    // 乗算合成（リーダー支援がパッシブ支援ぶんも 1.6 倍する）なら Δ衣装 + Δパッシブ = 0.6 × (73.7 + 2.9) = 46.0 で 1.7 過大。
    // 加算合成（up × (1 + S + P)）なら 0.6 × 73.7 = 44.2。K6 は加算合成を支持し、L × P 単独の相互作用は 0
    expect(round1((S / 100) * (K6.baseline[1] + K6.baseline[3]))).toBe(46.0);
    expect(round1((S / 100) * K6.baseline[1])).toBe(44.2);
    // 環境: 青 0、恒常マリン 1凸のパッシブ 9%（抽出マスター level 1）がフレア（3）とマリン（4）の 2 人に成立
    const env = envFor(K6);
    expect(env.views.every((v) => (v.active?.pBlue ?? 0) === (v.active?.p0 ?? 0))).toBe(true);
    expect(Array.from(env.supportMatrix).filter((v) => v !== 0)).toEqual([9, 9]);
    expect(env.supportMatrix[4 * 5 + 3]).toBe(9);
    expect(env.supportMatrix[4 * 5 + 4]).toBe(9);
    // production の評価器はアクティブ欄 73.7 を再現する（raw 73.69。2026-09-13 の実機 0凸値）。衣装の比は 0.60
    expect(expectedActive(env)).toBeCloseTo(73.693, 2);
    expect(scoreBonusPercent(expectedActive(env))).toBe(K6.baseline[1]);
    expect(Math.abs(d.costume / K6.baseline[1] - S / 100)).toBeLessThan(0.002);
    expect(Math.abs(deltaOf(CLEAN).costume / CLEAN.baseline[1] - S / 100)).toBeLessThan(0.002);
  });

  it("K5 / K6 の衣装欄は S × 表示アクティブ の単一の量子化規則では出ない（K5 は切り上げで 38.0、K6 は切り捨てで 44.2）", () => {
    // 表示アクティブは切り上げなので raw ∈ (A − 0.1, A]。0.6 × raw の区間を各規則で量子化する
    const bands = (A: number) => [0.6 * (A - 0.1), 0.6 * A];
    const [lo5, hi5] = bands(CLEAN.baseline[1]);
    const [lo6, hi6] = bands(K6.baseline[1]);
    // K5 = 37.9: 切り上げは区間全体で 38.0（不一致）
    expect(Math.ceil((lo5 ?? 0) * 10 + 1e-9) / 10).toBe(38.0);
    expect(Math.floor((hi5 ?? 0) * 10 + 1e-9) / 10).toBe(37.9);
    // K6 = 44.3: 切り捨ては区間全体で 44.1〜44.2（不一致）、切り上げは raw > 73.67 のときだけ 44.3
    expect(Math.floor((hi6 ?? 0) * 10 + 1e-9) / 10).toBe(44.2);
    expect(Math.ceil((lo6 ?? 0) * 10 + 1e-9) / 10).toBe(44.2);
    expect(Math.ceil((hi6 ?? 0) * 10 - 1e-9) / 10).toBe(44.3);
    // したがって衣装欄の raw は S × アクティブ raw と 0.1 未満ずれる何かで、規則はここでは決めない
  });
});

describe("C/D. 衣装欄の配賦候補（総量と分ける）", () => {
  const costumeErrors = (value: (env: LeaderSupportEnvironment) => number): number[] =>
    interacting.map((c) => value(envFor(c)) - deltaOf(c).costume);

  it("一様倍率 S × E_base / S × E_blue は K1〜K4 を直接否定する（K5 だけ S × E_base）", () => {
    const eBase = costumeErrors((env) => experimentalLeaderCostumeCandidate(env));
    const eBlue = costumeErrors((env) =>
      experimentalLeaderCostumeCandidate(env, { blue: "multiplicative" }),
    );
    // S × E_base: K1 +8.0 / K2 −3.0 / K3 +4.1 / K4 +6.0 — 両符号で、K2 だけ実機の方が大きい
    expect(eBase.map(round1)).toEqual([8.0, -3.0, 4.1, 6.0]);
    // S × E_blue: 総量そのもの。全部 +6 以上過大（Δボード + Δパッシブ のぶん）
    expect(Math.min(...eBlue)).toBeGreaterThan(6);
  });

  it("主仮説 S × E_leader_base（編成条件を未解決にした基準 up・基準タイムライン・p0）は K2 で −7.0 と棄却", () => {
    const errors = costumeErrors((env) => experimentalLeaderCostumeCandidate(env, C_STAR));
    expect(errors.map(round1)).toEqual([-1.5, -7.0, 0.4, -3.0]);
    expect(leaderSupportErrorStats(errors).rmse).toBeGreaterThan(3.5);
    // 条件を全部未解決にしても同じ値（K1〜K4 の条件つき up は編成条件だけ）
    for (const c of interacting) {
      expect(expectedActive(envFor(c), { ups: "allUnresolved" })).toBeCloseTo(
        expectedActive(envFor(c), { ups: "deckUnresolved" }),
        9,
      );
    }
  });

  it("C*（編成条件未解決 up × 青の頻度込みタイムライン × p0）は最良だが RMSE ≈ 1.3 で式ではない", () => {
    const errors = costumeErrors((env) => (S / 100) * cStarValue(env));
    // K1 +1.5 / K2 −0.3 / K3 +1.4 / K4 −1.5: 符号が交互で、パッシブ支援の有無（K2 だけなし）とも対応しない
    expect(errors.map(round1)).toEqual([1.5, -0.3, 1.4, -1.5]);
    const stats = leaderSupportErrorStats(errors);
    expect(stats.rmse).toBeGreaterThan(1.1);
    expect(stats.rmse).toBeLessThan(1.5);
    expect(stats.maxAbsError).toBeLessThan(1.6);
    // K2（パッシブ支援なし）の観測 E_C = 46.2 / 0.6 = 77.0 は E_base 72.0 より大きく、水着ミオ 1凸の頻度 8% で
    // 恒常マリン 1凸との同一窓（23 秒 / 8 秒）がずれる効果（基準 65.4 → 頻度込み 76.6）を入れないと届かない
    const k2 = interacting[1];
    if (!k2) throw new Error("K2 がない");
    const env = envFor(k2);
    expect(expectedActive(env, C_STAR)).toBeCloseTo(65.35, 1);
    expect(cStarValue(env)).toBeCloseTo(76.56, 1);
    expect(deltaOf(k2).costume / (S / 100)).toBeGreaterThan(expectedActive(env));
  });

  it("K5 / K6 では C* = S × E_base（青なし）で、production の評価器のアクティブ raw から 0.6 倍した値が衣装欄に 0.1 以内で一致する", () => {
    for (const c of [CLEAN, K6]) {
      const env = envFor(c);
      expect(cStarValue(env)).toBeCloseTo(expectedActive(env), 9);
      // K5: 0.6 × 63.235 = 37.94 vs 37.9（+0.04）、K6: 0.6 × 73.693 = 44.22 vs 44.3（−0.08）
      expect(Math.abs((S / 100) * expectedActive(env) - deltaOf(c).costume), c.name).toBeLessThan(
        0.1,
      );
    }
  });
});

describe("残差 R = S × E_blue − 衣装候補 と パッシブ / ボード", () => {
  it("R*（C* の残差）は Δボード + Δパッシブ を ±1.5 で追う（総量が合う以上、衣装の誤差の鏡像）", () => {
    const errors = interacting.map((c) => {
      const env = envFor(c);
      const d = deltaOf(c);
      const residual =
        experimentalSupportGain(env, S, "multiplicative") - (S / 100) * cStarValue(env);
      return residual - (d.board + d.passive);
    });
    expect(errors.map(round1)).toEqual([-1.5, 0.2, -1.3, 1.3]);
    expect(leaderSupportErrorStats(errors).maxAbsError).toBeLessThan(1.6);
  });

  it("パッシブ欄の増分は S × 既存パッシブ marginal の約 1.6〜2 倍（自由係数なしでは分離できない）", () => {
    const ratios: number[] = [];
    for (const c of interacting) {
      const env = envFor(c);
      const d = deltaOf(c);
      const candidate = experimentalLeaderPassiveCandidate(env);
      if (d.passive === 0) {
        expect(candidate).toBe(0);
        continue;
      }
      ratios.push(d.passive / candidate);
    }
    // K1 1.1 / 0.58、K3 0.4 / 0.23、K4 1.4 / 0.82
    expect(ratios).toHaveLength(3);
    for (const r of ratios) {
      expect(r).toBeGreaterThan(1.6);
      expect(r).toBeLessThan(2.0);
    }
  });

  it("ボード = 総量 − 衣装（C*） − パッシブ候補 の conservation は ±2 pt（K4 で +1.9）", () => {
    const errors = interacting.map((c) => {
      const env = envFor(c);
      const board =
        experimentalSupportGain(env, S, "multiplicative") -
        (S / 100) * cStarValue(env) -
        experimentalLeaderPassiveCandidate(env);
      return board - deltaOf(c).board;
    });
    expect(errors.map(round1)).toEqual([-0.9, 0.2, -1.2, 1.9]);
    expect(leaderSupportErrorStats(errors).maxAbsError).toBeLessThan(2);
  });

  it("恒常みこリーダー（支援 0）のボード欄: パッシブ支援のない K2 は E_blue(乗算) − E_base に一致し、支援のある K1 / K3 / K4 は 0.5〜1.8 高い", () => {
    for (const c of interacting) {
      const env = envFor(c);
      const blueOnly = expectedActive(env, { blue: "multiplicative" }) - expectedActive(env);
      const additive = expectedActive(env, { blue: "additive" }) - expectedActive(env);
      const excess = c.baseline[2] - blueOnly;
      if (c.baseline[3] === 0) {
        expect(Math.abs(excess)).toBeLessThan(0.1); // K2: 15.28 vs 15.3
        expect(additive - c.baseline[2]).toBeGreaterThan(3); // production の加算型は 18.9
      } else {
        expect(excess).toBeGreaterThan(0.4);
        expect(excess).toBeLessThan(2.0);
      }
    }
  });
});

describe("過去の水着フワワ 25% + 赤 26% との接続", () => {
  const PAIRS: [string, string][] = [
    ["K1", "+24 水着ミオ1 / 水着ころね2"],
    ["K2", "+24 水着ミオ1 / 恒常マリン1"],
    ["K3", "+24 水着フブキ0 / 恒常マリン1"],
    ["K4", "+24 水着フブキ0 / 水着ころね2"],
  ];

  it("同じ 5 人で 支援 60 + 赤 0（クロニー） と 支援 25 + 赤 26（フワワ、黄 10% を表示値で除く）の合計差は 0.09 × E_blue に ±0.2 で一致", () => {
    for (const [k, name] of PAIRS) {
      const kc = LEADER_CONTRASTS.find((c) => c.name.startsWith(k));
      const fc = CATEGORY_CONTRASTS.find((c) => c.name === name);
      if (!kc || !fc) throw new Error(`${k} / ${name} がない`);
      expect(fc.members).toEqual(kc.members);
      const env = envFor(kc);
      const totalK = sum(kc.support);
      // 黄の増分は raw 5 欄が未知なので表示値で近似する（±0.05 程度）
      const yellow =
        fc.songBonus * (100 + fc.before[0] + fc.before[1] + fc.before[3] + fc.before[4]);
      const totalF = sum(fc.before) - yellow;
      const predicted =
        ((S - 25 - fc.xBefore) / 100) * expectedActive(env, { blue: "multiplicative" });
      expect(Math.abs(totalK - totalF - predicted)).toBeLessThan(0.2);
    }
  });

  it("フワワ 9 編成の衣装欄は C*（S=25）より 7〜18% 低く、リーダーと同じホロメンのメンバーを外す構造仮説でも RMSE 0.8 / 偏り +0.5（手掛かりとして記録）", () => {
    const rows = CATEGORY_CONTRASTS.filter((c) => c.group === "fuwawa+24");
    expect(rows).toHaveLength(9);
    const ratios: number[] = [];
    const exclusionErrors: number[] = [];
    for (const c of rows) {
      const members = c.members.map((s) => memberFor(s, c.blue));
      const env = buildLeaderSupportEnvironment(realCard(c.leaderId), members, holomenMap);
      expect(env.supportPercent).toBe(25);
      expect(env.sameHolomenAsLeader.filter(Boolean)).toHaveLength(1);
      const cStar = (env.supportPercent / 100) * cStarValue(env);
      ratios.push(c.before[0] / cStar);
      exclusionErrors.push(
        (env.supportPercent / 100) * cStarValue(env, env.sameHolomenAsLeader) - c.before[0],
      );
    }
    expect(Math.max(...ratios)).toBeLessThan(0.94);
    expect(Math.min(...ratios)).toBeGreaterThan(0.81);
    const stats = leaderSupportErrorStats(exclusionErrors);
    expect(stats.rmse).toBeGreaterThan(0.6);
    expect(stats.rmse).toBeLessThan(0.9);
    expect(stats.bias).toBeGreaterThan(0.3);
    expect(stats.maxAbsError).toBeGreaterThan(1.4); // 恒常フブキ1 / 恒常ころね3 で +1.6
  });
});

describe("判別実験の結果（2026-09-12 に予測した clean 4 枚 + 恒常マリン1 = K6）", () => {
  it("予測どおり 衣装 = 0.6 × 表示アクティブ・Δボード 0。ただし「Δパッシブ ≈ 0.6 × パッシブ marginal（≈ 0.6）」は 0 で外れ、L × P の相互作用は存在しない", () => {
    const slots: Slot[] = [
      ["tokino-sora-01", 0],
      ["aki-rosenthal-01", 0],
      ["oozora-subaru-01", 0],
      ["shiranui-flare-01", 0],
      ["houshou-marine-01", 1],
    ];
    expect(K6.members).toEqual(slots);
    const members = slots.map((s) => memberFor(s, BLUE_SNAPSHOT_2026_09_12));
    const env = buildLeaderSupportEnvironment(kronii, members, holomenMap);
    // 青なし: E_blue = E_base、C* = E_base
    expect(expectedActive(env, { blue: "multiplicative" })).toBeCloseTo(expectedActive(env), 9);
    expect(cStarValue(env)).toBeCloseTo(expectedActive(env), 9);
    expect(expectedActive(env)).toBeCloseTo(73.693, 2);
    // 供給側重みつきのパッシブ marginal ≈ 1.0 を S 倍した 0.6 は観測されなかった（Δパッシブ = 0）
    const passiveMarginal = expectedActive(env, { passiveSupport: true }) - expectedActive(env);
    expect(passiveMarginal).toBeGreaterThan(0.9);
    expect(passiveMarginal).toBeLessThan(1.2);
    expect(round1((S / 100) * passiveMarginal)).toBe(0.6);
    expect(deltaOf(K6).passive).toBe(0);
    // 「パッシブ支援との相互作用が衣装欄を減らす」側（K3 相当で −6.8）も外れ: 衣装は 0.6 × 表示アクティブ ± 0.1
    expect(Math.abs(deltaOf(K6).costume - (S / 100) * K6.baseline[1])).toBeLessThan(0.1);
  });
});
