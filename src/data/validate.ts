import type { Affiliation, BuffTarget, Card, Holomen, SkillCondition, Song } from "./types";

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

    const cs = c.costumeSkill.structured;
    if (cs) {
      checkCondition(at, "costumeSkill", cs.condition, affIds, errors);
      for (const e of cs.effects) {
        checkTarget(at, "costumeSkill", e.target, affIds, errors);
        checkPercent(at, "costumeSkill", e.percent, errors);
      }
      if (cs.effects.length === 0) {
        errors.push(`${at}: costumeSkill.effects が空`);
      }
    }
    const ps = c.passiveSkill.structured;
    if (ps) {
      checkCondition(at, "passiveSkill", ps.condition, affIds, errors);
      for (const e of ps.effects) {
        checkTarget(at, "passiveSkill", e.target, affIds, errors);
        checkPercent(at, "passiveSkill", e.percent, errors);
      }
      if (ps.effects.length === 0) {
        errors.push(`${at}: passiveSkill.effects が空`);
      }
    }
    const as = c.activeSkill.structured;
    if (as) {
      if (as.intervalSeconds <= 0) {
        errors.push(`${at}: activeSkill.intervalSeconds が不正`);
      }
      if (as.durationSeconds !== null && as.durationSeconds <= 0) {
        errors.push(`${at}: activeSkill.durationSeconds が不正`);
      }
      if (as.scoreUpPercent !== null) {
        checkPercent(at, "activeSkill", as.scoreUpPercent, errors);
      }
    }
    const sp = c.specialSkill.structured;
    if (sp) {
      if (sp.durationSeconds !== null && sp.durationSeconds <= 0) {
        errors.push(`${at}: specialSkill.durationSeconds が不正`);
      }
      if (sp.scoreSupportPercent !== null) {
        checkPercent(at, "specialSkill", sp.scoreSupportPercent, errors);
      }
    }

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
    target.kind !== "all" &&
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
