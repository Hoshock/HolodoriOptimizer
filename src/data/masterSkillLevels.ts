import masterJson from "./masterSkillLevels.json";

/**
 * ★4 54 枚のスキル文言を抽出マスターの**スキル level 1 / 2 のまま**保持した資料(2026-10-09 収録 — ADR-022)。
 * `cards.json` の最大開花側レコードは level 2 の文言を所属名の読み替え・区切りの規約(`src/data/README.md`)に
 * そろえて入れてあり、ここは読み替え前の原文と level 1 の文言、マスター側のカード ID を残す。
 *
 * **計算にも表示にも使わない。** マスターの level 番号と画面の凸段階の対応はカード共通で保証できないので
 * (`docs/ai/card-data-provenance.md`)、level 1 を 0凸の `bloomVariants` に転記しない。強化前の区間は実機で
 * 確かめるまで「未確認」のまま(`cardAtBloomWithProvenance` の `unknown`)
 */
export interface MasterSkillLevels {
  cardId: string;
  masterCardId: string;
  costume: string;
  passive: { level1: string; level2: string };
  active: { level1: string; level2: string };
  special: { level1: string; level2: string };
}

export interface MasterSkillLevelsSource {
  repo: string;
  commit: string;
  asOf: string;
  files: readonly string[];
}

export const masterSkillLevelsSource = masterJson.source as MasterSkillLevelsSource;
export const masterSkillLevels = masterJson.cards as MasterSkillLevels[];
export const masterSkillLevelsByCardId: ReadonlyMap<string, MasterSkillLevels> = new Map(
  masterSkillLevels.map((m) => [m.cardId, m]),
);
