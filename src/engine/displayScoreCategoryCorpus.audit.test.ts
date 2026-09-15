import { describe, expect, it } from "vite-plus/test";

import { cardAtBloomWithProvenance } from "../data/bloom";
import type { BloomResolvedSource } from "../data/bloom";
import type { Slot } from "./displayScoreCategoryCorpus.fixture";
import {
  BLUE_SNAPSHOT_2026_09_12,
  BLUE_SNAPSHOT_2026_09_13,
  CATEGORY_CONTRASTS,
  holomenMap,
  LEADER_BASELINE_ID,
  LEADER_CONTRASTS,
  LEADER_SUPPORT_ID,
  memberFor,
  realCard,
} from "./displayScoreCategoryCorpus.fixture";
import { displayUnitScore, scoreBonusPercent } from "./displayScore";
import { kernelValue, SPEC_BASE } from "./displayScoreProjectiveWeightExperimental";
import { buildSourceEnvironment } from "./displayScoreSourceAttributionExperimental";

/**
 * 表示スコア解析コーパス（CATEGORY_CONTRASTS / LEADER_CONTRASTS）の**全入力カードの provenance 監査**（2026-09-12）。
 * 解析に入る Active / Passive / SP の解決値がどの出所か（最大側レコード・実機 variant・再構成観測・抽出マスター・不明）を
 * スロット単位で固定し、`unknown`（記録がなく、最近傍の凸の内容を流用しているスロット）を明示的に列挙する。
 * ここに載らない不明入力が増えたら失敗する。
 *
 * 2026-09-12 の抽出マスター訂正と 2026-09-13 の実機再確認で、K5 / K6 の 5 枚の 0凸 Active（実機）、恒常マリン 1凸 / 恒常ころね 3凸 /
 * 恒常フブキ 1凸 の Passive、恒常フブキ 1凸 の SP（抽出マスター）は推定経路から外れた。残る推定は 恒常みこ 0凸（exploratory 行のみ）と、
 * 5 枚の Passive / SP（コーパスの評価では条件不成立または未使用）。2026-09-15 に ÷1.1 の推定をやめたので、
 * これらは「不明」として最近傍の凸の内容をそのまま流用している。
 */

type Skill = "activeSkill" | "passiveSkill" | "specialSkill";
const SKILLS: readonly Skill[] = ["activeSkill", "passiveSkill", "specialSkill"];

/** コーパスが直接参照するスロット（cardId@bloom）を重複なしで集める */
function corpusSlots(): Slot[] {
  const seen = new Map<string, Slot>();
  for (const c of CATEGORY_CONTRASTS)
    for (const s of c.members) seen.set(`${s[0]}@${String(s[1])}`, s);
  for (const c of LEADER_CONTRASTS)
    for (const s of c.members) seen.set(`${s[0]}@${String(s[1])}`, s);
  return [...seen.values()];
}

/** 期待する provenance（スロット × スキル）。値はカード ID・開花・スキルを確認して 2026-09-12 に固定 */
const EXPECTED: Record<string, [BloomResolvedSource, BloomResolvedSource, BloomResolvedSource]> = {
  // [active, passive, special]
  "sakura-miko-02@1": ["max-record", "reconstructed-observation", "observed-variant"],
  "ookami-mio-02@1": ["max-record", "reconstructed-observation", "reconstructed-observation"],
  "fuwawa-abyssgard-02@0": ["observed-variant", "reconstructed-observation", "observed-variant"],
  "nekomata-okayu-02@5": ["max-record", "max-record", "max-record"],
  "inugami-korone-02@2": ["max-record", "reconstructed-observation", "reconstructed-observation"],
  "shirakami-fubuki-02@0": [
    "reconstructed-observation",
    "reconstructed-observation",
    "reconstructed-observation",
  ],
  "shirogane-noel-02@0": ["observed-variant", "observed-variant", "observed-variant"],
  "houshou-marine-01@1": ["max-record", "extracted-master-variant", "observed-variant"],
  "shirakami-fubuki-01@1": ["max-record", "extracted-master-variant", "extracted-master-variant"],
  "inugami-korone-01@3": ["max-record", "extracted-master-variant", "max-record"],
  "usada-pekora-01@1": ["max-record", "reconstructed-observation", "reconstructed-observation"],
  // exploratory 行だけが使う（Lv 約 20 の報告。fit には入れない）
  "sakura-miko-01@0": ["unknown", "unknown", "unknown"],
  // K5 / K6 の恒常 0凸 5 枚: Active は 2026-09-13 の実機再確認。Passive / SP は未確認（パッシブにスコアサポートがなく、SP 欄は比較に使わない）
  "tokino-sora-01@0": ["observed-variant", "unknown", "unknown"],
  "aki-rosenthal-01@0": ["observed-variant", "unknown", "unknown"],
  "oozora-subaru-01@0": ["observed-variant", "unknown", "unknown"],
  "shiranui-flare-01@0": ["observed-variant", "unknown", "unknown"],
  "shishiro-botan-01@0": ["observed-variant", "unknown", "unknown"],
};

describe("解析コーパスの入力 provenance 監査（2026-09-12 抽出マスター訂正後）", () => {
  it("コーパスの全スロットが監査表に載っていて、Active / Passive / SP の provenance が一致する", () => {
    const slots = corpusSlots();
    expect(slots.map((s) => `${s[0]}@${String(s[1])}`).sort()).toEqual(
      Object.keys(EXPECTED).sort(),
    );
    for (const [id, bloom] of slots) {
      const key = `${id}@${String(bloom)}`;
      const r = cardAtBloomWithProvenance(realCard(id), bloom);
      const actual = SKILLS.map((k) => r.provenance[k].source);
      expect(actual, key).toEqual(EXPECTED[key]);
      expect(r.card.id).toBe(id);
    }
  });

  it("Active が不明（最近傍の凸からの流用）のまま残るのは 恒常みこ 0凸（exploratory）だけ", () => {
    const unknownActive = corpusSlots()
      .filter(([id, bloom]) => {
        const r = cardAtBloomWithProvenance(realCard(id), bloom);
        return r.provenance.activeSkill.source === "unknown";
      })
      .map(([id, bloom]) => `${id}@${String(bloom)}`);
    expect(unknownActive).toEqual(["sakura-miko-01@0"]);
    // 恒常みこ 0凸を使うのは exploratory 行だけ
    const users = CATEGORY_CONTRASTS.filter((c) =>
      c.members.some(([id]) => id === "sakura-miko-01"),
    );
    expect(users.map((c) => c.group)).toEqual(["exploratory"]);
    expect(LEADER_CONTRASTS.some((c) => c.members.some(([id]) => id === "sakura-miko-01"))).toBe(
      false,
    );
  });

  it("スコアサポートを供給するパッシブの解決値は、exploratory の恒常みこ 0凸を除きすべて記録のある整数（不明の流用値が fit に入らない）", () => {
    const unknownSuppliers: string[] = [];
    for (const [id, bloom] of corpusSlots()) {
      const key = `${id}@${String(bloom)}`;
      const r = cardAtBloomWithProvenance(realCard(id), bloom);
      for (const e of r.card.passiveSkill.structured?.effects ?? []) {
        if (e.kind !== "scoreSupport") continue;
        if (r.provenance.passiveSkill.source === "unknown") {
          unknownSuppliers.push(key);
          continue;
        }
        expect(Number.isInteger(e.percent), key).toBe(true);
      }
    }
    // 恒常みこ 0凸（パッシブ「キュートタイプ2人のスコアサポート」の 0凸値は未確認）は exploratory 行だけで使う
    expect(unknownSuppliers).toEqual(["sakura-miko-01@0"]);
  });

  it("K5 の 5 枚: Active は 2026-09-13 実機再確認の整数値、パッシブにスコアサポートはなく、青は 0", () => {
    const k5 = LEADER_CONTRASTS.find((c) => c.cleanControl);
    if (!k5) throw new Error("K5 がない");
    const ups = k5.members.map(([id, bloom]) => {
      const r = cardAtBloomWithProvenance(realCard(id), bloom);
      expect(r.provenance.activeSkill.source).toBe("observed-variant");
      expect(r.card.passiveSkill.structured?.effects.some((e) => e.kind === "scoreSupport")).toBe(
        false,
      );
      expect(k5.blue[r.card.holomenId] ?? [0, 0]).toEqual([0, 0]);
      const a = r.card.activeSkill.structured;
      return [a?.scoreUpPercent, a?.conditionalScoreUp?.percent ?? null];
    });
    expect(ups).toEqual([
      [100, null],
      [50, 95],
      [95, null],
      [50, 100],
      [60, 125],
    ]);
  });

  it("K7 の 5 枚: 水着フブキ 0凸 の Active / Passive は 2026-09-13 の実機再確認値と一致し、青を持つのは 水着フブキ だけ", () => {
    const k7 = LEADER_CONTRASTS.find((c) => c.blueSnapshot === "2026-09-13");
    if (!k7) throw new Error("K7 がない");
    const blue = k7.members.map(([id, bloom]) => {
      const r = cardAtBloomWithProvenance(realCard(id), bloom);
      return [r.card.holomenId, k7.blue[r.card.holomenId] ?? [0, 0]];
    });
    expect(blue).toEqual([
      ["tokino-sora", [0, 0]],
      ["aki-rosenthal", [0, 0]],
      ["oozora-subaru", [0, 0]],
      ["shiranui-flare", [0, 0]],
      ["shirakami-fubuki", [15, 0]],
    ]);
    // 水着フブキ 0凸: 実機「35秒ごとに中確率で13秒間スコアが95%UP」「キュートタイプ2人のスコアサポート効果8%」
    const fubuki = cardAtBloomWithProvenance(realCard("shirakami-fubuki-02"), 0);
    const active = fubuki.card.activeSkill.structured;
    expect([active?.intervalSeconds, active?.durationSeconds, active?.scoreUpPercent]).toEqual([
      35, 13, 95,
    ]);
    expect(active?.probability).toBe("medium");
    expect(active?.conditionalScoreUp ?? null).toBeNull();
    expect(fubuki.card.passiveSkill.structured?.effects).toEqual([
      { kind: "scoreSupport", target: { kind: "type", type: "cute", count: 2 }, percent: 8 },
    ]);
  });

  it("青の実効値は repro の snapshot から導出する（このファイルでは手入力を持たない）", () => {
    // 導出そのものと 09-12 / 09-13 の全件一致は accountSnapshot.audit.test.ts が固定する
    expect(BLUE_SNAPSHOT_2026_09_12["shirakami-fubuki"]).toEqual([15.0, 0]);
    expect(BLUE_SNAPSHOT_2026_09_13["shirakami-fubuki"]).toEqual([15, 0]);
  });

  it("K7 の入力 cross-check: production の評価器が アクティブ欄 67.6 を出し、外側の式が両リーダーのユニットスコアに 1 点一致する", () => {
    const k7 = LEADER_CONTRASTS.find((c) => c.blueSnapshot === "2026-09-13");
    if (!k7) throw new Error("K7 がない");
    const env = buildSourceEnvironment(
      realCard(LEADER_BASELINE_ID),
      k7.members.map((s) => memberFor(s, k7.blue)),
      holomenMap,
    );
    // 青の発動率 UP は production のアクティブ欄に入らない（ボード欄側へ回る）ので、6 → 15 の訂正でも raw は変わらない
    expect(Array.from(env.blueRatePercent)).toEqual([0, 0, 0, 0, 15]);
    const raw = kernelValue(env, SPEC_BASE);
    expect(raw).toBeCloseTo(67.532, 3);
    expect(scoreBonusPercent(raw)).toBe(67.6);
    expect(k7.baseline[1]).toBe(67.6);
    expect(k7.support[1]).toBe(67.6);
    // 外側の式 ceil(総合力 × (1 + 合計/100) × 2.03734)
    const sum = (five: readonly number[]): number =>
      Math.round(five.reduce((a, b) => a + b, 0) * 10) / 10;
    expect(sum(k7.support)).toBe(150);
    expect(sum(k7.baseline)).toBe(109.4);
    expect(displayUnitScore(k7.supportPower, sum(k7.support))).toBe(k7.supportUnitScore);
    expect(displayUnitScore(k7.baselinePower ?? 0, sum(k7.baseline))).toBe(k7.baselineUnitScore);
  });

  it("リーダー 2 枚（恒常みこ 0凸 / 典獄クロニー 0凸）の衣装は開花で変わらないレコード（variant なし）", () => {
    for (const id of [LEADER_BASELINE_ID, LEADER_SUPPORT_ID]) {
      const card = realCard(id);
      expect(card.costumeSkill.bloomVariants).toBeUndefined();
      expect(cardAtBloomWithProvenance(card, 0).provenance.costumeSkill.source).toBe("max-record");
    }
  });
});
