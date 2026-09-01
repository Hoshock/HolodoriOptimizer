import { BLOOM_MAX } from "./bloom";
import type {
  ActiveSkillStructured,
  Affiliation,
  BloomVariant,
  BuffSkillStructured,
  BuffTarget,
  Card,
  Holomen,
  SkillCondition,
  Song,
  SpecialSkillStructured,
} from "./types";

export interface Dataset {
  affiliations: Affiliation[];
  holomen: Holomen[];
  cards: Card[];
  songs: Song[];
}

/** データセット全体の整合性を検査し、エラーメッセージの配列を返す(空なら正常) */
export function validateDataset(data: Dataset): string[] {
  const errors: string[] = [];
  const affIds = new Set(data.affiliations.map((a) => a.id));
  const holomenIds = new Set(data.holomen.map((h) => h.id));

  checkUniqueIds("affiliations", data.affiliations, errors);
  checkUniqueIds("holomen", data.holomen, errors);
  checkUniqueIds("cards", data.cards, errors);
  checkUniqueIds("songs", data.songs, errors);

  for (const h of data.holomen) {
    for (const a of h.affiliations) {
      if (!affIds.has(a)) {
        errors.push(`holomen ${h.id}: 未定義の所属 ${a}`);
      }
    }
  }

  for (const c of data.cards) {
    const at = `card ${c.id}`;
    if (!holomenIds.has(c.holomenId)) {
      errors.push(`${at}: 未定義のホロメン ${c.holomenId}`);
    }
    if (c.rarity !== 5) {
      errors.push(`${at}: rarity は 5 のみ対応 (${String(c.rarity)})`);
    }
    for (const [param, value] of Object.entries(c.stats)) {
      if (!Number.isInteger(value) || value <= 0) {
        errors.push(`${at}: stats.${param} が不正 (${String(value)})`);
      }
    }

    const checkBuff = (skillName: string, s: BuffSkillStructured): void => {
      checkCondition(at, skillName, s.condition, affIds, errors);
      for (const e of s.effects) {
        checkTarget(at, skillName, e.target, affIds, errors);
        checkPercent(at, skillName, e.percent, errors);
        if (e.kind === "scoreSupport" && e.condition) {
          checkCondition(at, skillName, e.condition, affIds, errors);
        }
      }
      if (s.effects.length === 0) {
        errors.push(`${at}: ${skillName}.effects が空`);
      }
    };
    const checkActive = (skillName: string, s: ActiveSkillStructured): void => {
      if (s.intervalSeconds <= 0) {
        errors.push(`${at}: ${skillName}.intervalSeconds が不正`);
      }
      if (s.durationSeconds !== null && s.durationSeconds <= 0) {
        errors.push(`${at}: ${skillName}.durationSeconds が不正`);
      }
      if (s.scoreUpPercent !== null) {
        checkPercent(at, skillName, s.scoreUpPercent, errors);
      }
    };
    const checkSpecial = (skillName: string, s: SpecialSkillStructured): void => {
      if (s.durationSeconds !== null && s.durationSeconds <= 0) {
        errors.push(`${at}: ${skillName}.durationSeconds が不正`);
      }
      if (s.scoreSupportPercent !== null) {
        checkPercent(at, skillName, s.scoreSupportPercent, errors);
      }
    };

    if (c.costumeSkill.structured) checkBuff("costumeSkill", c.costumeSkill.structured);
    if (c.passiveSkill.structured) checkBuff("passiveSkill", c.passiveSkill.structured);
    if (c.activeSkill.structured) checkActive("activeSkill", c.activeSkill.structured);
    if (c.specialSkill.structured) checkSpecial("specialSkill", c.specialSkill.structured);

    checkBloomVariants(at, "costumeSkill", c.costumeSkill.bloomVariants, errors, (v) => {
      if (v.structured) checkBuff("costumeSkill(開花)", v.structured);
    });
    checkBloomVariants(at, "passiveSkill", c.passiveSkill.bloomVariants, errors, (v) => {
      if (v.structured) checkBuff("passiveSkill(開花)", v.structured);
    });
    checkBloomVariants(at, "activeSkill", c.activeSkill.bloomVariants, errors, (v) => {
      if (v.structured) checkActive("activeSkill(開花)", v.structured);
    });
    checkBloomVariants(at, "specialSkill", c.specialSkill.bloomVariants, errors, (v) => {
      if (v.structured) checkSpecial("specialSkill(開花)", v.structured);
    });

    for (const key of ["costumeSkill", "passiveSkill", "activeSkill", "specialSkill"] as const) {
      if (c[key].raw.trim() === "") {
        errors.push(`${at}: ${key}.raw が空`);
      }
    }
  }

  for (const s of data.songs) {
    const at = `song ${s.id}`;
    const charts = Object.entries(s.charts);
    if (charts.length === 0) {
      errors.push(`${at}: charts が空`);
    }
    for (const [diff, chart] of charts) {
      if (!chart) continue;
      if (!Number.isInteger(chart.level) || chart.level <= 0) {
        errors.push(`${at}: ${diff}.level が不正 (${String(chart.level)})`);
      }
      if (!Number.isInteger(chart.combo) || chart.combo <= 0) {
        errors.push(`${at}: ${diff}.combo が不正 (${String(chart.combo)})`);
      }
    }
    if (s.durationSeconds !== null && s.durationSeconds <= 0) {
      errors.push(`${at}: durationSeconds が不正`);
    }
  }

  return errors;
}

/** 4 スキル種別ごとの構造化率(0〜1)。最適化の精度指標として使う */
export function structuredCoverage(cards: Card[]): Record<string, number> {
  const keys = ["costumeSkill", "passiveSkill", "activeSkill", "specialSkill"] as const;
  const result: Record<string, number> = {};
  for (const key of keys) {
    const done = cards.filter((c) => c[key].structured !== null).length;
    result[key] = cards.length === 0 ? 0 : done / cards.length;
  }
  return result;
}

/**
 * 開花段階別の内容の形式検査: 段階は 0〜BLOOM_MAX-1 の整数で昇順(重複なし)、
 * raw は非空、structured は必須(構造化 100% の方針をバリアントにも適用する)
 */
function checkBloomVariants<S>(
  at: string,
  skillName: string,
  variants: BloomVariant<S>[] | undefined,
  errors: string[],
  checkStructured: (v: BloomVariant<S>) => void,
): void {
  if (!variants) return;
  let prev = -1;
  for (const v of variants) {
    if (!Number.isInteger(v.bloom) || v.bloom < 0 || v.bloom >= BLOOM_MAX) {
      errors.push(`${at}: ${skillName}.bloomVariants の bloom が不正 (${String(v.bloom)})`);
    }
    if (v.bloom <= prev) {
      errors.push(`${at}: ${skillName}.bloomVariants が昇順でない (${String(v.bloom)})`);
    }
    prev = v.bloom;
    if (v.raw.trim() === "") {
      errors.push(`${at}: ${skillName}.bloomVariants[${String(v.bloom)}].raw が空`);
    }
    if (v.structured === null) {
      errors.push(`${at}: ${skillName}.bloomVariants[${String(v.bloom)}] が未構造化`);
    }
    checkStructured(v);
  }
}

function checkUniqueIds(label: string, items: { id: string }[], errors: string[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.id)) {
      errors.push(`${label}: id が命名規則外 (${item.id})`);
    }
    if (seen.has(item.id)) {
      errors.push(`${label}: id が重複 (${item.id})`);
    }
    seen.add(item.id);
  }
}

function checkCondition(
  at: string,
  skill: string,
  cond: SkillCondition,
  affIds: Set<string>,
  errors: string[],
): void {
  if (cond.kind === "affiliationCount" && !affIds.has(cond.affiliation)) {
    errors.push(`${at}: ${skill} の条件に未定義の所属 ${cond.affiliation}`);
  }
  if (cond.kind !== "always" && (!Number.isInteger(cond.min) || cond.min < 1 || cond.min > 5)) {
    errors.push(`${at}: ${skill} の条件人数が不正`);
  }
}

function checkTarget(
  at: string,
  skill: string,
  target: BuffTarget,
  affIds: Set<string>,
  errors: string[],
): void {
  if (target.kind === "affiliation" && !affIds.has(target.affiliation)) {
    errors.push(`${at}: ${skill} の対象に未定義の所属 ${target.affiliation}`);
  }
  if (
    (target.kind === "type" || target.kind === "affiliation") &&
    target.count !== undefined &&
    (!Number.isInteger(target.count) || target.count < 1 || target.count > 5)
  ) {
    errors.push(`${at}: ${skill} の対象人数が不正`);
  }
}

function checkPercent(at: string, skill: string, percent: number, errors: string[]): void {
  if (!(percent > 0) || percent > 1000) {
    errors.push(`${at}: ${skill} の percent が不正 (${String(percent)})`);
  }
}
