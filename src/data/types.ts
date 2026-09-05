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
  /** このスキルを持つメンバー自身(例:「自身の全パラメータが33%UP」) */
  | { kind: "self" }
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

/** スコアサポート効果(percent は % 値)。基礎スコアの試算対象外(ライブ中効果) */
export interface ScoreSupportBuff {
  kind: "scoreSupport";
  target: BuffTarget;
  /**
   * この効果だけ発動条件が異なる場合の上書き(省略時はスキル全体の condition)。
   * 例: 衣装スキル「◯◯タイプ2人以上で…UP、全員のスコアサポート効果25%」は
   * スコアサポート側に条件の再掲がないため無条件({ kind: "always" })と解釈する
   * (条件つきの場合は原文が条件を再掲している — 例: inugami-korone-02)
   */
  condition?: SkillCondition;
  percent: number;
}

export type SkillEffect = ParamBuff | ScoreSupportBuff;

/** 条件+効果型スキル(衣装・パッシブ)の構造化表現 */
export interface BuffSkillStructured {
  condition: SkillCondition;
  effects: SkillEffect[];
}

/** アクティブスキルの構造化表現 */
export interface ActiveSkillStructured {
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
}

/** スペシャルスキルの構造化表現 */
export interface SpecialSkillStructured {
  durationSeconds: number | null;
  scoreSupportPercent: number | null;
  /** SP 追加効果(原文のまま)。なければ null */
  extra: string | null;
}

/**
 * 開花(凸)段階で文言が変わるスキルの、開花途中の内容。
 * bloom はこの内容を確認した開花段階(0〜4)で、次に確認済みの段階の手前まで適用する。
 * スキル本体の raw / structured は開花最大(5)の内容。文言が変わる段階だけを疎に持ち、
 * 推測で埋めない(未確認の段階は最も近い確認済み段階の内容で試算する — src/data/bloom.ts)
 */
export interface BloomVariant<S> {
  bloom: number;
  raw: string;
  structured: S | null;
}

/** 衣装スキル(リーダー設定時のみ発動する常時効果)。scoreSupport は試算スコア外だが原文どおり保持する */
export interface CostumeSkill {
  /** ゲーム内のスキル説明テキスト(原文)。開花最大時の内容 */
  raw: string;
  /** 構造化表現。未構造化なら null(バリデーションが報告する) */
  structured: BuffSkillStructured | null;
  /** 開花段階別の内容(文言が変わる段階のみ・昇順)。省略時は全段階で raw と同一 */
  bloomVariants?: BloomVariant<BuffSkillStructured>[];
}

/** パッシブスキル(メンバー時に発動する常時効果) */
export interface PassiveSkill {
  raw: string;
  structured: BuffSkillStructured | null;
  bloomVariants?: BloomVariant<BuffSkillStructured>[];
}

/** アクティブスキル(ライブ中に周期・確率で発動) */
export interface ActiveSkill {
  raw: string;
  structured: ActiveSkillStructured | null;
  bloomVariants?: BloomVariant<ActiveSkillStructured>[];
}

/** スペシャルスキル */
export interface SpecialSkill {
  raw: string;
  structured: SpecialSkillStructured | null;
  bloomVariants?: BloomVariant<SpecialSkillStructured>[];
}

/** ★5 メンバーカード */
export interface Card {
  id: string;
  /** カード名(日本語) */
  name: string;
  holomenId: string;
  rarity: 5;
  type: CardType;
  /** レベル最大時のパラメータ(開花段階には依らない — 2026-09-01 ユーザー確認) */
  stats: StatBlock;
  costumeSkill: CostumeSkill;
  passiveSkill: PassiveSkill;
  activeSkill: ActiveSkill;
  specialSkill: SpecialSkill;
}

export type Difficulty = "easy" | "normal" | "hard" | "expert";

export interface SongChart {
  level: number;
  /** 最大コンボ数(ノーツ数)。出典で確認できなければ null */
  combo: number | null;
}

/** 楽曲 */
export interface Song {
  id: string;
  /** 曲名(日本語または原題) */
  title: string;
  /** 歌唱アーティスト名(ホロメン名、またはユニット名・企画名)。表示順のまま */
  artists: string[];
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
