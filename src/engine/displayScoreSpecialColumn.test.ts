import { describe, expect, it } from "vite-plus/test";

import { cardAtBloom, cardAtBloomWithProvenance } from "../data/bloom";
import type { Card } from "../data/types";
import {
  compileDisplayMember,
  computeDisplayScoreRaw,
  scoreBonusPercent,
  SP_RATE_UP_DIVISOR,
  SP_SUPPORT_DIVISOR,
  triggerMet,
} from "./displayScore";
import { holomenMap, realCard } from "./displayScoreCategoryCorpus.fixture";
import { buildAffIndex } from "./power";

/**
 * **SP 欄の閉じた形（2026-09-13 確定）。**
 *
 * ```
 * SP 欄 = 表示アクティブ欄 × Σ_i (効果時間_i / 120) × (支援_i / 100) × (1 + 発動率 UP_i / 200)
 * ```
 *
 * を 0.1% 単位で切り上げる。ここで `表示アクティブ欄` は raw ではなく**アクティブ欄の表示値**（0.1% 単位に
 * 切り上げ済み）。性質はすべて実機側から出ている:
 *
 * - **SP スキルごとに独立な加法項**。編成の SP 集合を足し合わせた形で説明できる。
 * - **発動率 UP はタイムラインを動かさない**。自分のスコアサポート項を定数倍するだけで、係数は編成に依存しない。
 * - **発動率 UP の条件は SP ごとに評価する**（成立していなければ倍率 1）。
 *
 * 2026-09-13 以前の production（`効果時間 / 100 × 発動確率を +X した基準タイムラインの再評価差分`）は、
 * 同じ発動率 UP 50% でもデッキによって差分が 1.2 倍変わるので**デッキ非依存を満たさず反証済み**。
 * 一時的に置いていた fit 係数 `β35 ≈ 0.0907 / β50 ≈ 0.1387`（`(効果時間/120) × (1 + 支援/100) × β` 型）も、
 * 下の 23 編成をどの β でも通らないので棄却した。
 *
 * **恒常 0凸 のカードを含む編成（K5 / K6 / K7 と exploratory の 恒常みこ0凸）は corpus に入れない** —
 * SP のスコアサポート % が実機未確認（`unknown`）で、2026-09-15 からは最近傍の凸（最大側レコード）の値を
 * そのまま流用しているためゲーム事実ではない（CLAUDE.md「カードデータ」）。その 4 編成は下の「未確認を含む編成」で分離して扱う。
 *
 * 観測の出所: docs/human/repro/display-score-20260908-11.md（B / 9.7〜9.17）、
 * docs/human/repro/display-score-20260912.md（対照 16 行・Leader-only matched pairs）、
 * docs/human/repro/display-score-20260913-frequency.md（F0〜F3）、
 * docs/human/repro/display-score-20260913-sp.md（発動率 UP 40% の切り分け観測）。
 */
const BLOOM: Record<string, number> = {
  "usada-pekora-01": 1,
  "inugami-korone-01": 3,
  "inugami-korone-02": 2,
  "nekomata-okayu-01": 1,
  "nekomata-okayu-02": 5,
  "shirakami-fubuki-01": 1,
  "shirakami-fubuki-02": 0,
  "ookami-mio-02": 1,
  "sakura-miko-01": 0,
  "sakura-miko-02": 1,
  "houshou-marine-01": 1,
  "fuwawa-abyssgard-02": 0,
  "shirogane-noel-02": 0,
  "tokino-sora-01": 0,
  "aki-rosenthal-01": 0,
  "oozora-subaru-01": 0,
  "shiranui-flare-01": 0,
  "shishiro-botan-01": 0,
};
const member = (id: string): Card => {
  const b = cardAtBloom(realCard(id), BLOOM[id] ?? 0);
  return {
    ...b,
    naturalStats: b.stats,
    boardLive: { activeRatePercent: 0, activeFrequencyPercent: 0 },
  };
};
const spUnknown = (id: string): boolean =>
  cardAtBloomWithProvenance(realCard(id), BLOOM[id] ?? 0).provenance.specialSkill.source ===
  "unknown";

const P1 = "usada-pekora-01";
const KO1 = "inugami-korone-01";
const KO2 = "inugami-korone-02";
const OK1 = "nekomata-okayu-01";
const OK2 = "nekomata-okayu-02";
const FB1 = "shirakami-fubuki-01";
const FB2 = "shirakami-fubuki-02";
const MIO2 = "ookami-mio-02";
const MI1 = "sakura-miko-01";
const MI2 = "sakura-miko-02";
const MA1 = "houshou-marine-01";
const FW2 = "fuwawa-abyssgard-02";
const NO2 = "shirogane-noel-02";
const SORA = "tokino-sora-01";
const AKI = "aki-rosenthal-01";
const SUBARU = "oozora-subaru-01";
const FLARE = "shiranui-flare-01";
const BOTAN = "shishiro-botan-01";
/** 2026-09-12 以降の対照でずっと使っている 5 枚（2 枠だけ差し替える） */
const pair = (a: string, b: string): string[] => [MI2, a, FW2, OK2, b];

/**
 * `[名前, リーダー, メンバー 5 人, 実機アクティブ欄, 実機 SP 欄]`。
 * SP 欄は 青 / 赤 / 黄 / リーダーのどれでも動かない（実機確定）ので、青は 0 で評価し、同じ 5 人の観測はまとめている。
 */
type Deck = [string, string, string[], number, number];
const DECKS: Deck[] = [
  ["B（= R-002 旧おかゆ編成 / 水着ミオリーダー）", OK2, [P1, KO2, OK2, FB2, MIO2], 77.0, 46.0],
  ["9.7", OK2, [OK2, MI2, P1, MA1, FW2], 76.7, 44.2],
  ["9.8", OK2, [OK2, FB2, P1, MA1, FW2], 63.7, 38.6],
  ["9.9", OK2, [OK2, FB2, P1, MA1, KO2], 68.8, 41.7],
  ["9.10", OK2, [OK2, FB2, P1, MA1, MIO2], 70.4, 42.1],
  ["9.11", OK2, [OK2, FB2, P1, MA1, MI2], 75.6, 45.2],
  ["9.12", OK2, [OK1, FB2, P1, MA1, MI2], 78.4, 44.0],
  ["9.13〜9.17", OK2, [OK1, MI2, FB2, MIO2, P1], 77.0, 42.7],
  ["+24 水着ミオ1 / 水着ころね2（= K1）", FW2, pair(MIO2, KO2), 77.7, 47.0],
  ["+24 水着フブキ0 / 水着ころね2（= K4）", FW2, pair(FB2, KO2), 71.7, 43.4],
  ["+24 水着ノエル0 / 水着ころね2", FW2, pair(NO2, KO2), 74.8, 44.5],
  ["+24 恒常マリン1 / 水着ころね2", FW2, pair(MA1, KO2), 78.2, 47.9],
  ["+24 水着ミオ1 / 恒常マリン1（= K2）", FW2, pair(MIO2, MA1), 72.1, 43.6],
  ["+24 水着フブキ0 / 恒常マリン1（= K3 = F0〜F3）", FW2, pair(FB2, MA1), 70.8, 42.8],
  ["+24 恒常フブキ1 / 恒常マリン1", FW2, pair(FB1, MA1), 77.4, 46.9],
  ["+24 恒常フブキ1 / 水着ころね2", FW2, pair(FB1, KO2), 79.4, 48.1],
  ["+24 恒常フブキ1 / 恒常ころね3", FW2, pair(FB1, KO1), 77.4, 49.7],
  ["R-002 水着ノエル0 入替", OK2, [OK2, KO2, MIO2, FB2, NO2], 78.9, 46.3],
  ["R-002 水着フワワ0 入り 3 編成目", OK2, [MIO2, OK2, KO2, P1, FW2], 77.9, 47.2],
  ["発動率 UP 40% 成立（2026-09-13）", FW2, [MI2, NO2, MA1, OK2, KO2], 77.6, 47.7],
  // 恒常 0凸 5 枚の編成。2026-09-15 に全区間を実機で確認するまでは SP 支援 % が未確認で corpus に入れられず、
  // SP 欄だけ 3.8〜4.2 高く出ていた。実機値を入れたら 3 編成とも誤差 0 になったので corpus へ移した
  // （ずれていたのは式ではなくカードデータのほうだった）
  ["K5 clean control", MI1, [SORA, AKI, SUBARU, FLARE, BOTAN], 63.3, 36.9],
  ["K6 青なし + パッシブ支援あり", MI1, [SORA, AKI, SUBARU, FLARE, MA1], 73.7, 43.3],
  ["K7 青 1 人", MI1, [SORA, AKI, SUBARU, FLARE, FB2], 67.6, 39.3],
];
/**
 * アクティブ欄そのものが実機と合わない編成（「Lv 約 20」で入力条件の確度が低い）。SP 欄の裁定には使えない。
 * 2026-09-15 に恒常みこ 0凸 の全区間を実機で確認したので、ずれは 3.5 → 0.5 まで縮んだが 0 にはならない
 */
const EXPLORATORY_DECKS: Deck[] = [
  ["exploratory 恒常みこ0（Lv 約 20）", FW2, [MI1, FB2, FW2, OK2, MA1], 61.0, 37.5],
];

interface Entry {
  durationSeconds: number;
  scoreSupportPercent: number;
  /** 条件が成立している発動率 UP %（不成立・なしは 0） */
  rateUpPercent: number;
}
const entryCache = new Map<string, Entry[]>();
/** 編成の SP スキルを「効果時間・支援 %・成立している発動率 UP %」へ落とす（production と同じ条件判定を通す） */
function entriesOf(deck: Deck): Entry[] {
  const cached = entryCache.get(deck[0]);
  if (cached) return cached;
  const affIndex = buildAffIndex(holomenMap);
  const views = deck[2].map((id) => compileDisplayMember(member(id), holomenMap, affIndex));
  const typeCounts = new Int32Array(3);
  const affCounts = new Int32Array(affIndex.size);
  for (const v of views) {
    typeCounts[v.typeIndex] = (typeCounts[v.typeIndex] ?? 0) + 1;
    for (const a of v.affIndices) affCounts[a] = (affCounts[a] ?? 0) + 1;
  }
  const entries: Entry[] = [];
  for (const v of views) {
    const sp = v.special;
    if (!sp) continue;
    entries.push({
      durationSeconds: sp.durationSeconds,
      scoreSupportPercent: sp.scoreSupportPercent,
      rateUpPercent:
        sp.rate && triggerMet(sp.rate.trigger, typeCounts, affCounts) ? sp.rate.percent : 0,
    });
  }
  entryCache.set(deck[0], entries);
  return entries;
}
const rawActiveCache = new Map<string, number>();
/** アクティブ欄の raw（モデル） */
function rawActiveOf(deck: Deck): number {
  const cached = rawActiveCache.get(deck[0]);
  if (cached !== undefined) return cached;
  const members = deck[2].map(member);
  const value = computeDisplayScoreRaw({ leader: member(deck[1]), members }, holomenMap).active;
  rawActiveCache.set(deck[0], value);
  return value;
}
/** アクティブ欄の表示値（モデル）。corpus 23 編成すべてで実機のアクティブ欄と一致する */
function displayedActiveOf(deck: Deck): number {
  return scoreBonusPercent(rawActiveOf(deck));
}
const ceilPermil = (value: number): number => Math.ceil(value * 10 - 1e-9) / 10;

describe("SP 欄の閉じた形(2026-09-13 確定)", () => {
  it("corpus 23 編成の SP はすべて記録のある値（実機未確認の流用値を検証に使わない）", () => {
    expect(DECKS.flatMap(([, , ids]) => ids).filter(spUnknown)).toEqual([]);
    expect(EXPLORATORY_DECKS.flatMap(([, , ids]) => ids).filter(spUnknown)).toEqual([]);
    expect(DECKS.length).toBe(23);
  });

  it("アクティブ欄は corpus 23 編成すべてで実機と一致する(SP の基準値として使える)", () => {
    for (const deck of DECKS) expect(displayedActiveOf(deck), deck[0]).toBe(deck[3]);
  });

  it("発動率 UP は 35 / 40 / 50 / 55% の 4 値が現れ、条件が不成立の編成もある", () => {
    const met = new Set<number>();
    let unmet = 0;
    for (const deck of DECKS) {
      for (const e of entriesOf(deck)) {
        if (e.rateUpPercent > 0) met.add(e.rateUpPercent);
      }
      // 水着ノエル0凸 の 40% は 3期生 2 人の編成でだけ成立する
      if (deck[2].includes(NO2) && entriesOf(deck).every((e) => e.rateUpPercent !== 40)) unmet++;
    }
    expect([...met].sort((a, b) => a - b)).toEqual([35, 40, 50, 55]);
    expect(unmet).toBe(2);
  });

  it("閉じた形は corpus 23 編成すべてで実機 SP と完全一致する(誤差 0)", () => {
    for (const deck of DECKS) {
      const raw =
        displayedActiveOf(deck) *
        entriesOf(deck).reduce(
          (sum, e) =>
            sum +
            ((e.durationSeconds * e.scoreSupportPercent) / SP_SUPPORT_DIVISOR) *
              (1 + e.rateUpPercent / SP_RATE_UP_DIVISOR),
          0,
        );
      expect(ceilPermil(raw), deck[0]).toBe(deck[4]);
    }
  });

  it("production の SP 欄も corpus 23 編成すべてで実機と完全一致する", () => {
    for (const deck of DECKS) {
      const members = deck[2].map(member);
      const raw = computeDisplayScoreRaw({ leader: member(deck[1]), members }, holomenMap);
      expect(scoreBonusPercent(raw.special), deck[0]).toBe(deck[4]);
    }
  });

  /** 係数の形を差し替えて、実機 SP と一致する編成の数を数える */
  const exactCount = (
    coefficient: (e: Entry) => number,
    base: (deck: Deck) => number = displayedActiveOf,
  ): number =>
    DECKS.filter(
      (deck) =>
        Math.abs(
          ceilPermil(base(deck) * entriesOf(deck).reduce((s, e) => s + coefficient(e), 0)) -
            deck[4],
        ) < 1e-9,
    ).length;
  const closedForm = (divisor: number) => (e: Entry) =>
    ((e.durationSeconds * e.scoreSupportPercent) / SP_SUPPORT_DIVISOR) *
    (1 + e.rateUpPercent / divisor);

  it("基準はアクティブ欄の raw ではなく表示値(raw だと 23 編成中 15 しか合わない)", () => {
    expect(exactCount(closedForm(SP_RATE_UP_DIVISOR))).toBe(23);
    expect(exactCount(closedForm(SP_RATE_UP_DIVISOR), rawActiveOf)).toBe(15);
    // 最終の整数化も切り上げ。四捨五入だと 23 編成中 7 しか合わない
    const rounded = (deck: Deck): number =>
      Math.round(
        displayedActiveOf(deck) * entriesOf(deck).reduce((s, e) => s + closedForm(200)(e), 0) * 10,
      ) / 10;
    expect(DECKS.filter((d) => Math.abs(rounded(d) - d[4]) < 1e-9).length).toBe(7);
  });

  it("発動率 UP の分母は 200 だけ(20〜800 を総当たりしても他に解がない)", () => {
    const solutions: number[] = [];
    for (let d = 20; d <= 800; d++) if (exactCount(closedForm(d)) === 23) solutions.push(d);
    expect(solutions).toEqual([SP_RATE_UP_DIVISOR]);
    // 連続値でも許容区間は 199.5〜200.2 しかない(幅 0.3%)。丸い値はこの中に 200 しかない
    expect(exactCount(closedForm(199.5))).toBeLessThan(23);
    expect(exactCount(closedForm(200.2))).toBeLessThan(23);
    // 発動率 UP なしは 1 編成しか合わない(この項は必要)
    expect(
      exactCount((e) => (e.durationSeconds * e.scoreSupportPercent) / SP_SUPPORT_DIVISOR),
    ).toBe(1);
  });

  it("スコアサポート部分の分母も 120 秒 × 100% だけ(連続値で 119.98〜120.01 しか通らない)", () => {
    const withDivisor = (seconds: number) => (e: Entry) =>
      (((e.durationSeconds / seconds) * e.scoreSupportPercent) / 100) * (1 + e.rateUpPercent / 200);
    expect(exactCount(withDivisor(120))).toBe(23);
    expect(exactCount(withDivisor(119.9))).toBeLessThan(23);
    expect(exactCount(withDivisor(120.1))).toBeLessThan(23);
  });

  it("発動率 UP はスコアサポート % に掛かる(支援に掛けない加法型はどの分母でも通らない)", () => {
    const additive = (divisor: number) => (e: Entry) =>
      (e.durationSeconds * e.scoreSupportPercent) / SP_SUPPORT_DIVISOR +
      (e.durationSeconds / 120) * (e.rateUpPercent / divisor);
    for (let d = 20; d <= 800; d++) expect(exactCount(additive(d)), `分母 ${d}`).toBeLessThan(23);
  });

  it("旧 experimental の fit 係数型 (効果時間/120) × (1 + 支援/100) × β は 23 編成を通らない", () => {
    const fitted = (beta: number) => (e: Entry) =>
      (e.durationSeconds * e.scoreSupportPercent) / SP_SUPPORT_DIVISOR +
      (e.rateUpPercent > 0
        ? (e.durationSeconds / 120) * (1 + e.scoreSupportPercent / 100) * beta
        : 0);
    for (let i = 1; i <= 3000; i++) expect(exactCount(fitted(i / 10000))).toBeLessThan(23);
  });

  /**
   * 2026-09-15 ユーザー方針「テストするときには必ず実機の値を使う。推定値でテストはしない」。
   * この 4 編成は SP のスコアサポート % が実機未確認で、最近傍の凸の値をそのまま流用している。
   * 流用値から出した係数の区間（以前ここで 0.89〜0.92 と固定していた値）は**実機の値ではない**ので、
   * 数値としては固定しない。固定するのは実機どうしで言える 2 点だけ:
   * 入力条件は正しい（アクティブ欄が実機と一致する）のに SP 欄が実機と合わない、ということ。
   * 実機の全凸データが入ったら、この 4 編成を corpus（DECKS）へ移す。
   */
});
