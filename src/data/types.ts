/**
 * ゲームデータのスキーマ定義。
 *
 * スキル効果は入力時に構造化する(実行時にテキストをパースしない)。
 * 構造化できていないスキルは structured を null にして raw テキストだけを持ち、
 * バリデーションでカバレッジとして報告する。数値・効果を推測で埋めてはならない。
 */

/** カードのパラメータ 3 種 */
export type ParamKind = "performance" | "technique" | "sense";

/** カードのタイプ */
export type CardType = "cute" | "happy" | "pure";

export interface StatBlock {
  performance: number;
  technique: number;
  sense: number;
}

/** ホロメン(タレント)。affiliations は所属 ID の配列(複数所属あり) */
export interface Holomen {
  id: string;
  /** 表示名(日本語) */
  name: string;
  affiliations: string[];
}

/** 所属(世代・ユニットなど)。スキル発動条件の判定単位 */
export interface Affiliation {
  id: string;
  /** 表示名(日本語)。例: 0期生、ゲーマーズ */
  name: string;
}

/** スキルの発動条件 */
export type SkillCondition =
  | { kind: "always" }
  /** メンバー5人中、指定タイプが min 人以上 */
  | { kind: "typeCount"; type: CardType; min: number }
  /** メンバー5人中、指定所属が min 人以上 */
  | { kind: "affiliationCount"; affiliation: string; min: number };

/** バフの対象 */
export type BuffTarget =
  /** メンバー全員(5人) */
  | { kind: "all" }
  /** 条件(タイプ/所属)に合致するメンバー。count はゲーム内表記の対象人数(例:「1期生2人の」→ 2) */
  | { kind: "type"; type: CardType; count?: number }
  | { kind: "affiliation"; affiliation: string; count?: number };

/** パラメータ上昇効果(percent は % 値。例: 50% UP → 50) */
export interface ParamBuff {
  kind: "paramUp";
  target: BuffTarget;
  param: ParamKind | "all";
  percent: number;
}

/** スコアサポート効果(percent は % 値) */
export interface ScoreSupportBuff {
  kind: "scoreSupport";
  target: BuffTarget;
  percent: number;
}

export type PassiveEffect = ParamBuff | ScoreSupportBuff;

/** 衣装スキル(リーダー設定時のみ発動する常時効果) */
export interface CostumeSkill {
  /** ゲーム内のスキル説明テキスト(原文) */
  raw: string;
  /** 構造化表現。未構造化なら null(バリデーションが報告する) */
  structured: {
    condition: SkillCondition;
    effects: ParamBuff[];
  } | null;
}

/** パッシブスキル(メンバー時に発動する常時効果) */
export interface PassiveSkill {
  raw: string;
  structured: {
    condition: SkillCondition;
    effects: PassiveEffect[];
  } | null;
}

/** アクティブスキル(ライブ中に周期・確率で発動) */
export interface ActiveSkill {
  raw: string;
  structured: {
    /** 発動周期(秒) */
    intervalSeconds: number;
    /** 発動確率の段階(ゲーム内表記: 低/中/高 など)。数値は非公開のため保持しない */
    probability: "low" | "medium" | "high" | "unknown";
    /** 効果時間(秒)。瞬間効果は null */
    durationSeconds: number | null;
    /** スコア UP % 。スコア系でない効果は null */
    scoreUpPercent: number | null;
    /** ライフ条件等の追加条件(原文のまま)。なければ null */
    extraCondition: string | null;
  } | null;
}

/** スペシャルスキル */
export interface SpecialSkill {
  raw: string;
  structured: {
    durationSeconds: number | null;
    scoreSupportPercent: number | null;
    /** SP 追加効果(原文のまま)。なければ null */
    extra: string | null;
  } | null;
}

/** ★5 メンバーカード */
export interface Card {
  id: string;
  /** カード名(日本語) */
  name: string;
  holomenId: string;
  rarity: 5;
  type: CardType;
  /** 最大強化時のパラメータ */
  stats: StatBlock;
  costumeSkill: CostumeSkill;
  passiveSkill: PassiveSkill;
  activeSkill: ActiveSkill;
  specialSkill: SpecialSkill;
}

export type Difficulty = "easy" | "normal" | "hard" | "expert";

export interface SongChart {
  level: number;
  combo: number;
}

/** 楽曲 */
export interface Song {
  id: string;
  /** 曲名(日本語または原題) */
  title: string;
  kind: "original" | "cover";
  /** 演奏時間(秒)。不明なら null */
  durationSeconds: number | null;
  /** 難易度別譜面。存在しない難易度は省略 */
  charts: Partial<Record<Difficulty, SongChart>>;
}

/** データセット全体のメタ情報(出典・入力日を記録する) */
export interface DatasetMeta {
  /** データを確認した日付 (YYYY-MM-DD) */
  asOf: string;
  /** 出典の説明(URL 含む) */
  sources: string[];
  /** 検証状態に関する注記 */
  notes: string[];
}
