import { bloomVariantEvidenceOf } from "./bloomEvidence";
import type { SkillKey } from "./bloomEvidence";
import type { BloomVariant, Card } from "./types";

/** 開花の最大段階。カード本体の raw / structured / stats は最大側レコード。 */
export const BLOOM_MAX = 5;

/**
 * 各項目が強化される開花段階（実機確認済み）。抽出マスターのスキル level 番号（1 / 2）と画面の凸段階の対応は
 * カード共通ではない（2026-09-13: 恒常そら / ぼたんの 0凸 Active は master level 2 側の値、アキ / スバル / フレアは level 1 側）。
 * 途中値は実機 variant だけを確定とし、master の level 番号から未観測の凸値を埋めない（src/data/bloomEvidence.ts）。
 */
export const BLOOM_UPGRADE_STAGE = {
  active: 1,
  params: 2,
  special: 3,
  passive: 4,
} as const;

/** 2凸の全パラメータ +10% は実測で確認済み。整数復元には丸め不確実性が残る。 */
export const CONFIRMED_PARAM_UPGRADE_RATIO = 1.1;

/**
 * 実機で確認できていない開花途中のスキル文言に出す語（2026-09-15 ユーザー方針）。
 * スキル文言は **確認済 / 未確認の 2 状態**だけで管理し、推定値を文言として出さない。
 * 未確認の段階のスコア計算には最近傍の凸（= 強化後の最大側レコード）の内容をそのまま流用する。
 */
export const UNKNOWN_SKILL_TEXT = "未確認";

export type BloomResolvedSource =
  /** 最大側レコードそのもの */
  | "max-record"
  /** 実機のゲーム内文言を記録した variant */
  | "observed-variant"
  /** 実機で数値・効果を確認し、文面だけ最大側に合わせて再構成した variant */
  | "reconstructed-observation"
  /** 抽出マスター（外部解析）由来の variant。実機目視ではない */
  | "extracted-master-variant"
  /** variant はあるが出所分類が未棚卸し。実データに残らないよう bloomEvidence.test.ts が禁じている */
  | "recorded-variant-unclassified"
  /** 2凸+10% という確認済み規則からの逆算（パラメータのみ） */
  | "derived-from-max-confirmed-ratio"
  /** 記録がない（実機未確認）。文言は「未確認」とし、計算には最近傍の凸の内容を流用する */
  | "unknown";

export interface BloomFieldProvenance {
  source: BloomResolvedSource;
  variantBloom?: number;
  exactBloom?: boolean;
}

export interface CardBloomProvenance {
  stats: BloomFieldProvenance;
  costumeSkill: BloomFieldProvenance;
  passiveSkill: BloomFieldProvenance;
  activeSkill: BloomFieldProvenance;
  specialSkill: BloomFieldProvenance;
}

export interface ResolvedCardAtBloom {
  card: Card;
  provenance: CardBloomProvenance;
}

/**
 * variant選択。
 * - 指定段階そのものの観測があれば最優先。
 * - スキル強化段階以上では最大側レコードへ戻す。
 * - 強化前は同じスキルが変化しない確認済み仕様を使い、variantを強化前区間へ適用する。
 *
 * 旧実装は0凸variantを1/3/4凸の強化境界後にも引きずり得たため、upgradeStageを必ず見る。
 */
function variantAt<S>(
  bloom: number,
  variants: BloomVariant<S>[] | undefined,
  upgradeStage: number | null,
): BloomVariant<S> | null {
  if (!variants || variants.length === 0 || bloom >= BLOOM_MAX) return null;
  const exact = variants.find((v) => v.bloom === bloom);
  if (exact) return exact;
  if (upgradeStage !== null && bloom >= upgradeStage) return null;

  const eligible = variants.filter((v) => upgradeStage === null || v.bloom < upgradeStage);
  if (eligible.length === 0) return null;

  let chosen: BloomVariant<S> | null = null;
  for (const v of eligible) {
    if (v.bloom <= bloom) chosen = v;
  }
  return chosen ?? eligible[0] ?? null;
}

function variantProvenance(
  cardId: string,
  skill: SkillKey,
  requestedBloom: number,
  variant: BloomVariant<unknown>,
): BloomFieldProvenance {
  const evidence = bloomVariantEvidenceOf(cardId, skill, variant.bloom);
  const common = {
    variantBloom: variant.bloom,
    exactBloom: variant.bloom === requestedBloom,
  };
  if (evidence.kind === "observed-text") return { source: "observed-variant", ...common };
  if (evidence.kind === "observed-values-reconstructed-text") {
    return { source: "reconstructed-observation", ...common };
  }
  if (evidence.kind === "extracted-master-text") {
    return { source: "extracted-master-variant", ...common };
  }
  return { source: "recorded-variant-unclassified", ...common };
}

function maxOrUnknown(bloom: number, stage: number): BloomFieldProvenance {
  return bloom < stage ? { source: "unknown" } : { source: "max-record" };
}

export function cardAtBloomWithProvenance(card: Card, bloom: number): ResolvedCardAtBloom {
  if (bloom >= BLOOM_MAX) {
    const max = { source: "max-record" } as const;
    return {
      card,
      provenance: {
        stats: max,
        costumeSkill: max,
        passiveSkill: max,
        activeSkill: max,
        specialSkill: max,
      },
    };
  }

  // 衣装スキルは開花段階で変わらない（upgradeStage なし）。記録された variant が出たときだけそれを使う
  const costume = variantAt(bloom, card.costumeSkill.bloomVariants, null);
  const passive = variantAt(bloom, card.passiveSkill.bloomVariants, BLOOM_UPGRADE_STAGE.passive);
  const active = variantAt(bloom, card.activeSkill.bloomVariants, BLOOM_UPGRADE_STAGE.active);
  const special = variantAt(bloom, card.specialSkill.bloomVariants, BLOOM_UPGRADE_STAGE.special);

  const result: Card = { ...card };

  if (costume) {
    result.costumeSkill = {
      ...card.costumeSkill,
      raw: costume.raw,
      structured: costume.structured,
    };
  }

  if (bloom < BLOOM_UPGRADE_STAGE.params) {
    result.stats = {
      performance: Math.round(card.stats.performance / CONFIRMED_PARAM_UPGRADE_RATIO),
      technique: Math.round(card.stats.technique / CONFIRMED_PARAM_UPGRADE_RATIO),
      sense: Math.round(card.stats.sense / CONFIRMED_PARAM_UPGRADE_RATIO),
    };
  }

  // 強化前で記録がない段階は「未確認」。structured は最大側のまま残し、
  // スコア計算には最近傍の凸の内容をそのまま流用する（2026-09-15 ユーザー指示）
  if (active) {
    result.activeSkill = { ...card.activeSkill, raw: active.raw, structured: active.structured };
  } else if (bloom < BLOOM_UPGRADE_STAGE.active) {
    result.activeSkill = { ...card.activeSkill, raw: UNKNOWN_SKILL_TEXT };
  }

  if (special) {
    result.specialSkill = {
      ...card.specialSkill,
      raw: special.raw,
      structured: special.structured,
    };
  } else if (bloom < BLOOM_UPGRADE_STAGE.special) {
    result.specialSkill = { ...card.specialSkill, raw: UNKNOWN_SKILL_TEXT };
  }

  if (passive) {
    result.passiveSkill = {
      ...card.passiveSkill,
      raw: passive.raw,
      structured: passive.structured,
    };
  } else if (bloom < BLOOM_UPGRADE_STAGE.passive) {
    result.passiveSkill = { ...card.passiveSkill, raw: UNKNOWN_SKILL_TEXT };
  }

  return {
    card: result,
    provenance: {
      stats:
        bloom < BLOOM_UPGRADE_STAGE.params
          ? { source: "derived-from-max-confirmed-ratio" }
          : { source: "max-record" },
      costumeSkill: costume
        ? variantProvenance(card.id, "costumeSkill", bloom, costume)
        : { source: "max-record" },
      passiveSkill: passive
        ? variantProvenance(card.id, "passiveSkill", bloom, passive)
        : maxOrUnknown(bloom, BLOOM_UPGRADE_STAGE.passive),
      activeSkill: active
        ? variantProvenance(card.id, "activeSkill", bloom, active)
        : maxOrUnknown(bloom, BLOOM_UPGRADE_STAGE.active),
      specialSkill: special
        ? variantProvenance(card.id, "specialSkill", bloom, special)
        : maxOrUnknown(bloom, BLOOM_UPGRADE_STAGE.special),
    },
  };
}

/** 後方互換API。出所が必要な解析ではcardAtBloomWithProvenanceを使う。 */
export function cardAtBloom(card: Card, bloom: number): Card {
  return cardAtBloomWithProvenance(card, bloom).card;
}

export type BloomMap = Record<string, number>;

export function bloomOf(blooms: BloomMap | undefined, cardId: string): number {
  return blooms?.[cardId] ?? 0;
}
