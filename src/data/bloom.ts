import type { BloomVariant, BuffSkillStructured, Card } from "./types";

/**
 * 開花(凸)段階の解決。スキル本体の raw / structured とパラメータは
 * 開花最大(BLOOM_MAX)の内容とみなす(2026-09-01 ユーザー確認)。
 *
 * 段階ごとの強化内容(2026-09-01 ユーザー確認。出典は Game8/AppMedia/Gamerch の検索要約):
 * 1凸=アクティブスキル / 2凸=パラメータ / 3凸=スペシャルスキル / 4凸=パッシブスキル /
 * 5凸=コネクト効果(★5。スコア計算対象外)。衣装スキルは強化対象外。
 *
 * 強化の実数値はカード固有で非公開のため、確認済みの文言(bloomVariants)がない段階は
 * 下の仮定倍率で開花最大の値から割り戻して試算する(推定値でよい — 2026-09-01 ユーザー指示)。
 * bloomVariants に確認済みの内容がある段階はそちらを優先し、割り戻しはしない。
 */

/** 開花の最大段階。カードの raw / structured / stats はこの段階の内容 */
export const BLOOM_MAX = 5;

/** 各スキル・パラメータが強化される開花段階(この段階以上で強化後の値になる) */
export const BLOOM_UPGRADE_STAGE = {
  active: 1,
  params: 2,
  special: 3,
  passive: 4,
} as const;

/**
 * 【仮定値】強化後の値 = 強化前の値 × この倍率、とみなす。
 * パラメータの 1.05 は先行ツール holodori-sim の既定概算(+5%)と同値。
 * スキルの 1.1 は公開情報がないための推定。実測が判明したらここだけ差し替える
 */
export const ASSUMED_PARAM_UPGRADE_RATIO = 1.05;
export const ASSUMED_SKILL_UPGRADE_RATIO = 1.1;

/** bloom 段階に適用する variant を返す。本体(開花最大)を使うべきなら null */
function variantAt<S>(
  bloom: number,
  variants: BloomVariant<S>[] | undefined,
): BloomVariant<S> | null {
  if (!variants || variants.length === 0 || bloom >= BLOOM_MAX) return null;
  // 昇順を前提(バリデーションで強制)に、指定段階以下で最大の段階を選ぶ
  let chosen: BloomVariant<S> | null = null;
  for (const v of variants) {
    if (v.bloom <= bloom) chosen = v;
  }
  // 下位に確認済みがなければ、最も近い上位の確認済み段階(過大評価を最小にする)
  return chosen ?? variants[0] ?? null;
}

/** 条件+効果型スキル(パッシブ)の % を仮定倍率で割り戻す */
function derateBuff(structured: BuffSkillStructured | null): BuffSkillStructured | null {
  if (!structured) return null;
  return {
    condition: structured.condition,
    effects: structured.effects.map((e) => ({
      ...e,
      percent: e.percent / ASSUMED_SKILL_UPGRADE_RATIO,
    })),
  };
}

/**
 * カードを指定の開花段階の内容に解決した Card を返す。id は変わらない。
 * 確認済みの bloomVariants がある段階はその文言・構造化を使い、
 * ない段階は仮定倍率による割り戻しで推定する。開花最大なら元のオブジェクトをそのまま返す
 */
export function cardAtBloom(card: Card, bloom: number): Card {
  if (bloom >= BLOOM_MAX) return card;

  const costume = variantAt(bloom, card.costumeSkill.bloomVariants);
  const passive = variantAt(bloom, card.passiveSkill.bloomVariants);
  const active = variantAt(bloom, card.activeSkill.bloomVariants);
  const special = variantAt(bloom, card.specialSkill.bloomVariants);

  const result: Card = { ...card };

  // 衣装スキルは開花で強化されない(確認済み文言があるときだけ差し替え)
  if (costume) {
    result.costumeSkill = {
      ...card.costumeSkill,
      raw: costume.raw,
      structured: costume.structured,
    };
  }

  // パラメータ: 2凸未満は仮定倍率で割り戻す(段階別の実値は非公開)
  if (bloom < BLOOM_UPGRADE_STAGE.params) {
    result.stats = {
      performance: Math.round(card.stats.performance / ASSUMED_PARAM_UPGRADE_RATIO),
      technique: Math.round(card.stats.technique / ASSUMED_PARAM_UPGRADE_RATIO),
      sense: Math.round(card.stats.sense / ASSUMED_PARAM_UPGRADE_RATIO),
    };
  }

  // アクティブ(1凸で強化): 確認済み文言 > 仮定倍率の割り戻し
  if (active) {
    result.activeSkill = { ...card.activeSkill, raw: active.raw, structured: active.structured };
  } else if (bloom < BLOOM_UPGRADE_STAGE.active && card.activeSkill.structured) {
    const s = card.activeSkill.structured;
    result.activeSkill = {
      ...card.activeSkill,
      structured: {
        ...s,
        scoreUpPercent:
          s.scoreUpPercent === null ? null : s.scoreUpPercent / ASSUMED_SKILL_UPGRADE_RATIO,
      },
    };
  }

  // スペシャル(3凸で強化)
  if (special) {
    result.specialSkill = {
      ...card.specialSkill,
      raw: special.raw,
      structured: special.structured,
    };
  } else if (bloom < BLOOM_UPGRADE_STAGE.special && card.specialSkill.structured) {
    const s = card.specialSkill.structured;
    result.specialSkill = {
      ...card.specialSkill,
      structured: {
        ...s,
        scoreSupportPercent:
          s.scoreSupportPercent === null
            ? null
            : s.scoreSupportPercent / ASSUMED_SKILL_UPGRADE_RATIO,
      },
    };
  }

  // パッシブ(4凸で強化)
  if (passive) {
    result.passiveSkill = {
      ...card.passiveSkill,
      raw: passive.raw,
      structured: passive.structured,
    };
  } else if (bloom < BLOOM_UPGRADE_STAGE.passive) {
    result.passiveSkill = {
      ...card.passiveSkill,
      structured: derateBuff(card.passiveSkill.structured),
    };
  }

  return result;
}

/** カード ID → 開花段階(未登録は 0)。UI と worker のメッセージで使う */
export type BloomMap = Record<string, number>;

/** map から開花段階を引く(未登録は 0凸) */
export function bloomOf(blooms: BloomMap | undefined, cardId: string): number {
  return blooms?.[cardId] ?? 0;
}
