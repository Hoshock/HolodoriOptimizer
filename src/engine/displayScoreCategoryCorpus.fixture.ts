import { cards as realCards, holomen as realHolomen } from "../data";
import { cardAtBloom } from "../data/bloom";
import type { Card } from "../data/types";
import { buildHolomenMap } from "./score";

/**
 * **解析用の観測コーパス（fixture）。** 赤スコアサポートのカテゴリ配賦・衣装欄・リーダー衣装スコアサポートの逆解析で共有する実機観測。
 * 実測値はモデルに合わせて変えない。vitest の対象外（*.fixture.ts）。
 * - CATEGORY_CONTRASTS: 赤だけを変えた直接比較 16 行（下）
 * - LEADER_CONTRASTS: リーダーだけを 恒常みこ 0凸 → 典獄クロニー 0凸（支援 60%）に替えた 6 組（末尾。K5 / K6 は青なしの negative control）
 */
/**
 * **これはゲーム仕様の Golden ではなく、赤スコアサポートの総増分を 衣装 / ボード / パッシブ へ配賦する仮説の回帰評価（解析用・
 * production 未採用）。** 実測値はモデルに合わせて変えない。ここで固定するのは 2026-09-12 時点の**反証**で、式ではない。
 *
 * カテゴリ配賦の観測コーパス（docs/human/repro/display-score-20260912.md、displayScore.test.ts）。各行は赤だけを変えた
 * 直接比較で、赤変更前後の 5 欄の絶対値・X・黄を持つ。青の実効値は観測時点ごとに分ける（現在値で過去観測を上書きしない）。
 * - 2026-09-12 水着フワワリーダー +24 × 9（Gamers X=26 → FUWAMOCO X=50、黄 10%）: reported + cross-checked
 * - 2026-09-12 R-061 +3（曲なし X 23 → 26）: reported + cross-checked
 * - 2026-09-11 / 12 R-002 +10 × 3（衣装にスコアサポートなし。旧おかゆ編成の青は 09-08 の値、ノエル入替はノエル頻度 12）
 * - 2026-09-11 水着ミオリーダーの 4 象限（+24、黄 0 / 10%。衣装にスコアサポートなし。青・緑の観測時点の状態は未共有 → 09-08 の値）
 * - 2026-09-12 水着みこ → 恒常みこ（Lv「約 20」で入力条件の確度が低い）: exploratory。fit 条件には使わず外部検証だけ
 * 水着フワワの青は 2026-09-12 の構造化データどおり 0 / 0（2026-09-09 の実機報告 45 / 0 と食い違う — 下の感度テスト）。
 */

export const holomenMap = buildHolomenMap(realHolomen);
export const realCard = (id: string): Card => {
  const card = realCards.find((c) => c.id === id);
  if (!card) throw new Error(`${id} がない`);
  return card;
};
export type BlueTable = Record<string, [number, number]>;
const holomenIdOf = (cardId: string): string => cardId.replace(/-0\d$/, "");
export const BLUE_2026_09_08: BlueTable = {
  "usada-pekora": [30, 8],
  "inugami-korone": [33.6, 4],
  "nekomata-okayu": [35.1, 12],
  "shirakami-fubuki": [39, 8],
  "ookami-mio": [0, 0],
};
export const BLUE_SNAPSHOT_2026_09_12: BlueTable = {
  "nekomata-okayu": [35.1, 12],
  "inugami-korone": [39.6, 0],
  "shirakami-fubuki": [15.0, 0],
  "usada-pekora": [30.0, 8],
  "ookami-mio": [36.6, 8],
  "shirogane-noel": [42.0, 8],
  "sakura-miko": [42.0, 0],
  "houshou-marine": [0, 0],
  "fuwawa-abyssgard": [0, 0],
};
export const BLUE_AT_NOEL_OBSERVATION: BlueTable = {
  ...BLUE_SNAPSHOT_2026_09_12,
  "shirogane-noel": [42.0, 12],
};

export type Slot = [cardId: string, bloom: number];
export function memberFor(slot: Slot, table: BlueTable): Card {
  const [id, bloom] = slot;
  const bloomed = cardAtBloom(realCard(id), bloom);
  const [r, f] = table[holomenIdOf(id)] ?? [0, 0];
  return {
    ...bloomed,
    naturalStats: bloomed.stats,
    boardLive: { activeRatePercent: r, activeFrequencyPercent: f },
  };
}
const MIKO2: Slot = ["sakura-miko-02", 1];
const MIKO1: Slot = ["sakura-miko-01", 0];
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
const pair = (a: Slot, b: Slot): Slot[] => [MIKO2, a, FUWAWA2, OKAYU2, b];

/** 5 欄の表示値 [衣装, アクティブ, ボード, パッシブ, SP] */
export type Five = [number, number, number, number, number];
export interface CategoryContrast {
  name: string;
  group: "fuwawa+24" | "r061+3" | "noCostume+10" | "noCostume+24" | "exploratory";
  leaderId: string;
  members: Slot[];
  blue: BlueTable;
  songBonus: number;
  xBefore: number;
  xAfter: number;
  before: Five;
  after: Five;
}
const FL = "fuwawa-abyssgard-02";
const OL = "nekomata-okayu-02";
const ML = "ookami-mio-02";
const S12 = BLUE_SNAPSHOT_2026_09_12;
export const CATEGORY_CONTRASTS: CategoryContrast[] = [
  {
    name: "+24 水着ミオ1 / 水着ころね2",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(MIO2, KORONE2),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [14.1, 77.7, 64.8, 1.9, 47.0],
    after: [14.6, 77.7, 85.2, 1.9, 47.0],
  },
  {
    name: "+24 水着フブキ0 / 水着ころね2",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(FUBUKI2, KORONE2),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [13.7, 71.7, 58.8, 2.6, 43.4],
    after: [14.1, 71.7, 77.4, 2.7, 43.4],
  },
  {
    name: "+24 水着ノエル0 / 水着ころね2",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(NOEL2, KORONE2),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [13.4, 74.8, 62.8, 1.8, 44.5],
    after: [13.8, 74.8, 82.3, 1.9, 44.5],
  },
  {
    name: "+24 恒常マリン1 / 水着ころね2",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(MARINE1, KORONE2),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [15.6, 78.2, 61.7, 2.0, 47.9],
    after: [15.9, 78.2, 82.1, 2.1, 47.9],
  },
  {
    name: "+24 水着ミオ1 / 恒常マリン1",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(MIO2, MARINE1),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [17.4, 72.1, 65.9, 0, 43.6],
    after: [17.3, 72.1, 86.9, 0, 43.6],
  },
  {
    name: "+24 水着フブキ0 / 恒常マリン1",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(FUBUKI2, MARINE1),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [14.5, 70.8, 54.2, 0.8, 42.8],
    after: [14.9, 70.8, 72.4, 0.8, 42.8],
  },
  {
    name: "+24 恒常フブキ1 / 恒常マリン1",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(FUBUKI1, MARINE1),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [16.5, 77.4, 59.2, 0, 46.9],
    after: [16.8, 77.4, 79.5, 0, 46.9],
  },
  {
    name: "+24 恒常フブキ1 / 水着ころね2",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(FUBUKI1, KORONE2),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [14.5, 79.4, 61.5, 1.9, 48.1],
    after: [15.0, 79.4, 81.7, 1.9, 48.1],
  },
  {
    name: "+24 恒常フブキ1 / 恒常ころね3",
    group: "fuwawa+24",
    leaderId: FL,
    members: pair(FUBUKI1, KORONE1),
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [15.1, 77.4, 62.9, 2.0, 49.7],
    after: [15.5, 77.4, 83.0, 2.0, 49.7],
  },
  {
    name: "R-061 +3 水着ミオ1 / 水着ころね2（曲なし）",
    group: "r061+3",
    leaderId: FL,
    members: pair(MIO2, KORONE2),
    blue: S12,
    songBonus: 0,
    xBefore: 23,
    xAfter: 26,
    before: [14.0, 77.7, 38.1, 1.9, 47.0],
    after: [14.1, 77.7, 40.7, 1.9, 47.0],
  },
  {
    name: "R-002 +10 旧おかゆ編成（黄 3%、青は 09-08）",
    group: "noCostume+10",
    leaderId: OL,
    members: [PEKORA1, KORONE2, OKAYU2, FUBUKI2, MIO2],
    blue: BLUE_2026_09_08,
    songBonus: 0.03,
    xBefore: 0,
    xAfter: 10,
    before: [0, 77.0, 21.0, 2.3, 46.0],
    after: [0, 77.0, 29.4, 2.7, 46.0],
  },
  {
    name: "R-002 +10 ノエル入替（黄 3%）",
    group: "noCostume+10",
    leaderId: OL,
    members: [OKAYU2, KORONE2, MIO2, FUBUKI2, NOEL2],
    blue: BLUE_AT_NOEL_OBSERVATION,
    songBonus: 0.03,
    xBefore: 0,
    xAfter: 10,
    before: [0, 78.9, 17.3, 1.5, 46.3],
    after: [0, 78.9, 25.3, 2.0, 46.3],
  },
  {
    name: "R-002 +10 水着フワワ入り 3 編成目（黄 3%）",
    group: "noCostume+10",
    leaderId: OL,
    members: [MIO2, OKAYU2, KORONE2, PEKORA1, FUWAWA2],
    blue: S12,
    songBonus: 0.03,
    xBefore: 0,
    xAfter: 10,
    before: [0, 77.9, 18.6, 0.9, 47.2],
    after: [0, 77.9, 27.0, 1.2, 47.2],
  },
  {
    name: "水着ミオリーダー +24（黄 0、青は 09-08）",
    group: "noCostume+24",
    leaderId: ML,
    members: [OKAYU2, KORONE2, MIO2, FUBUKI2, PEKORA1],
    blue: BLUE_2026_09_08,
    songBonus: 0,
    xBefore: 28.1,
    xAfter: 52.1,
    before: [0, 77.0, 38.2, 3.1, 46.0],
    after: [0, 77.0, 59.1, 3.3, 46.0],
  },
  {
    name: "水着ミオリーダー +24（黄 10%、青は 09-08）",
    group: "noCostume+24",
    leaderId: ML,
    members: [OKAYU2, KORONE2, MIO2, FUBUKI2, PEKORA1],
    blue: BLUE_2026_09_08,
    songBonus: 0.1,
    xBefore: 28.1,
    xAfter: 52.1,
    before: [0, 77.0, 60.9, 3.1, 46.0],
    after: [0, 77.0, 81.8, 3.3, 46.0],
  },
  {
    name: "exploratory 恒常みこ0（Lv 約 20）/ 水着フブキ0 / 恒常マリン1",
    group: "exploratory",
    leaderId: FL,
    members: [MIKO1, FUBUKI2, FUWAWA2, OKAYU2, MARINE1],
    blue: S12,
    songBonus: 0.1,
    xBefore: 26,
    xAfter: 50,
    before: [0, 61.0, 46.2, 2.6, 37.5],
    after: [0, 61.0, 62.4, 2.8, 37.5],
  },
];

/**
 * Leader-only matched pairs（2026-09-12 K1〜K5、2026-09-13 K6）: 同じメンバー 5 人・赤 0・黄 0・曲指定なしで、リーダーだけを
 * 恒常みこ 0凸（衣装にスコアサポートなし）→ 典獄クロニー 0凸（衣装「全員のスコアサポート効果60%」、実機文言）に替えた 6 組。
 * 青は 2026-09-12 の構造化データ（K5 の 5 人は青 0）。`reported`。クロニー側は Power / ユニットスコアも報告があり、
 * 外側の式で cross-check できる（みこ側の Power は未報告）。docs/human/repro/display-score-20260912.md「Leader-only matched pairs」。
 */
export interface LeaderContrast {
  name: string;
  members: Slot[];
  blue: BlueTable;
  /** 恒常みこ 0凸リーダー（支援 0%）の 5 欄 */
  baseline: Five;
  /** 典獄クロニー 0凸リーダー（支援 60%）の 5 欄 */
  support: Five;
  /** クロニー側の総合力とユニットスコア（実機） */
  supportPower: number;
  supportUnitScore: number;
  /** 青なしの negative control（K5 = パッシブ支援なし、K6 = パッシブ支援あり）。Δボード = Δパッシブ = 0 */
  cleanControl: boolean;
  /** メンバーのパッシブにスコアサポートが成立している（K6: 恒常マリン 1凸 9% がフレアとの 3期生 2 人で成立） */
  passiveSupport: boolean;
}
export const LEADER_BASELINE_ID = "sakura-miko-01";
export const LEADER_SUPPORT_ID = "ouro-kronii-01";
export const LEADER_SUPPORT_PERCENT = 60;
const SORA1: Slot = ["tokino-sora-01", 0];
const AKI1: Slot = ["aki-rosenthal-01", 0];
const SUBARU1: Slot = ["oozora-subaru-01", 0];
const FLARE1: Slot = ["shiranui-flare-01", 0];
const BOTAN1: Slot = ["shishiro-botan-01", 0];
export const LEADER_CONTRASTS: LeaderContrast[] = [
  {
    name: "K1 水着ミオ1 / 水着ころね2",
    members: pair(MIO2, KORONE2),
    blue: S12,
    baseline: [0, 77.7, 11.1, 1.0, 47.0],
    support: [38.6, 77.7, 23.7, 2.1, 47.0],
    supportPower: 202888,
    supportUnitScore: 1195001,
    cleanControl: false,
    passiveSupport: true,
  },
  {
    name: "K2 水着ミオ1 / 恒常マリン1",
    members: pair(MIO2, MARINE1),
    blue: S12,
    baseline: [0, 72.1, 15.3, 0, 43.6],
    support: [46.2, 72.1, 21.6, 0, 43.6],
    supportPower: 195337,
    supportUnitScore: 1128239,
    cleanControl: false,
    passiveSupport: false,
  },
  {
    name: "K3 水着フブキ0 / 恒常マリン1",
    members: pair(FUBUKI2, MARINE1),
    blue: S12,
    baseline: [0, 70.8, 6.8, 0.5, 42.8],
    support: [38.4, 70.8, 14.2, 0.9, 42.8],
    supportPower: 189590,
    supportUnitScore: 1031699,
    cleanControl: false,
    passiveSupport: true,
  },
  {
    name: "K4 水着フブキ0 / 水着ころね2",
    members: pair(FUBUKI2, KORONE2),
    blue: S12,
    baseline: [0, 71.7, 9.7, 1.5, 43.4],
    support: [37.0, 71.7, 19.2, 2.9, 43.4],
    supportPower: 195814,
    supportUnitScore: 1093893,
    cleanControl: false,
    passiveSupport: true,
  },
  {
    name: "K5 clean control（恒常そら0 / 恒常アキ0 / 恒常スバル0 / 恒常フレア0 / 恒常ぼたん0）",
    members: [SORA1, AKI1, SUBARU1, FLARE1, BOTAN1],
    blue: S12,
    baseline: [0, 63.3, 0, 0, 36.9],
    support: [37.9, 63.3, 0, 0, 36.9],
    supportPower: 0,
    supportUnitScore: 0,
    cleanControl: true,
    passiveSupport: false,
  },
  {
    // 2026-09-13 ユーザー実機報告（reported）。青なし・パッシブ支援あり（恒常マリン 1凸「3期生が2人以上で3期生2人のスコアサポート効果9%」が
    // フレアとの 2 人で成立）の negative control。総合力・ユニットスコアは未報告
    name: "K6 青なし + パッシブ支援あり（恒常そら0 / 恒常アキ0 / 恒常スバル0 / 恒常フレア0 / 恒常マリン1）",
    members: [SORA1, AKI1, SUBARU1, FLARE1, MARINE1],
    blue: S12,
    baseline: [0, 73.7, 0, 2.9, 43.3],
    support: [44.3, 73.7, 0, 2.9, 43.3],
    supportPower: 0,
    supportUnitScore: 0,
    cleanControl: true,
    passiveSupport: true,
  },
];
