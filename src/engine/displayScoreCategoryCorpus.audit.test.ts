import { describe, expect, it } from "vite-plus/test";

import { cardAtBloomWithProvenance } from "../data/bloom";
import type { BloomResolvedSource } from "../data/bloom";
import type { Slot } from "./displayScoreCategoryCorpus.fixture";
import {
  CATEGORY_CONTRASTS,
  LEADER_BASELINE_ID,
  LEADER_CONTRASTS,
  LEADER_SUPPORT_ID,
  realCard,
} from "./displayScoreCategoryCorpus.fixture";

/**
 * 表示スコア解析コーパス（CATEGORY_CONTRASTS / LEADER_CONTRASTS）の**全入力カードの provenance 監査**（2026-09-12）。
 * 解析に入る Active / Passive / SP の解決値がどの出所か（最大側レコード・実機 variant・再構成観測・抽出マスター・仮定倍率推定）を
 * スロット単位で固定し、`estimated-from-max` を使うスロットを明示的に列挙する。ここに載らない推定入力が増えたら失敗する。
 *
 * 2026-09-12 の抽出マスター訂正で、K5 の 5 枚の 0凸 Active、恒常マリン 1凸 / 恒常ころね 3凸 / 恒常フブキ 1凸 の Passive、
 * 恒常フブキ 1凸 の SP は推定経路から外れた。残る推定は 恒常みこ 0凸（exploratory 行のみ）と、K5 の 5 枚の Passive / SP
 * （コーパスの評価では条件不成立または未使用）。
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
  "sakura-miko-01@0": ["estimated-from-max", "estimated-from-max", "estimated-from-max"],
  // K5 clean control の 5 枚: Active は抽出マスター Lv1。Passive / SP は未確認（K5 ではパッシブにスコアサポートがなく、SP 欄は比較に使わない）
  "tokino-sora-01@0": ["extracted-master-variant", "estimated-from-max", "estimated-from-max"],
  "aki-rosenthal-01@0": ["extracted-master-variant", "estimated-from-max", "estimated-from-max"],
  "oozora-subaru-01@0": ["extracted-master-variant", "estimated-from-max", "estimated-from-max"],
  "shiranui-flare-01@0": ["extracted-master-variant", "estimated-from-max", "estimated-from-max"],
  "shishiro-botan-01@0": ["extracted-master-variant", "estimated-from-max", "estimated-from-max"],
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

  it("Active の解決値に仮定倍率の推定が残るのは 恒常みこ 0凸（exploratory）だけ", () => {
    const estimatedActive = corpusSlots()
      .filter(([id, bloom]) => {
        const r = cardAtBloomWithProvenance(realCard(id), bloom);
        return r.provenance.activeSkill.source === "estimated-from-max";
      })
      .map(([id, bloom]) => `${id}@${String(bloom)}`);
    expect(estimatedActive).toEqual(["sakura-miko-01@0"]);
    // 恒常みこ 0凸を使うのは exploratory 行だけ
    const users = CATEGORY_CONTRASTS.filter((c) =>
      c.members.some(([id]) => id === "sakura-miko-01"),
    );
    expect(users.map((c) => c.group)).toEqual(["exploratory"]);
    expect(LEADER_CONTRASTS.some((c) => c.members.some(([id]) => id === "sakura-miko-01"))).toBe(
      false,
    );
  });

  it("スコアサポートを供給するパッシブの解決値は、exploratory の恒常みこ 0凸を除きすべて推定ではない整数（÷1.1 の推定値が fit に入らない）", () => {
    const estimatedSuppliers: string[] = [];
    for (const [id, bloom] of corpusSlots()) {
      const key = `${id}@${String(bloom)}`;
      const r = cardAtBloomWithProvenance(realCard(id), bloom);
      for (const e of r.card.passiveSkill.structured?.effects ?? []) {
        if (e.kind !== "scoreSupport") continue;
        if (r.provenance.passiveSkill.source === "estimated-from-max") {
          estimatedSuppliers.push(key);
          continue;
        }
        expect(Number.isInteger(e.percent), key).toBe(true);
      }
    }
    // 恒常みこ 0凸（パッシブ「キュートタイプ2人のスコアサポート」の 0凸値は未確認、11 ÷ 1.1 = 10）は exploratory 行だけで使う
    expect(estimatedSuppliers).toEqual(["sakura-miko-01@0"]);
  });

  it("K5 の 5 枚: Active は抽出マスター Lv1 の整数値、パッシブにスコアサポートはなく、青は 0", () => {
    const k5 = LEADER_CONTRASTS.find((c) => c.cleanControl);
    if (!k5) throw new Error("K5 がない");
    const ups = k5.members.map(([id, bloom]) => {
      const r = cardAtBloomWithProvenance(realCard(id), bloom);
      expect(r.provenance.activeSkill.source).toBe("extracted-master-variant");
      expect(r.card.passiveSkill.structured?.effects.some((e) => e.kind === "scoreSupport")).toBe(
        false,
      );
      expect(k5.blue[r.card.holomenId] ?? [0, 0]).toEqual([0, 0]);
      const a = r.card.activeSkill.structured;
      return [a?.scoreUpPercent, a?.conditionalScoreUp?.percent ?? null];
    });
    expect(ups).toEqual([
      [85, null],
      [50, 95],
      [95, null],
      [50, 100],
      [50, 105],
    ]);
  });

  it("リーダー 2 枚（恒常みこ 0凸 / 典獄クロニー 0凸）の衣装は開花で変わらないレコード（variant なし）", () => {
    for (const id of [LEADER_BASELINE_ID, LEADER_SUPPORT_ID]) {
      const card = realCard(id);
      expect(card.costumeSkill.bloomVariants).toBeUndefined();
      expect(cardAtBloomWithProvenance(card, 0).provenance.costumeSkill.source).toBe("max-record");
    }
  });
});
