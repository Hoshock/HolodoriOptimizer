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

/** ホロメンボードの左右(ゲーム内の全体配置での位置) */
export type BoardSide = "left" | "right";

/**
 * ホロメンボードの全体配置のうち、ホロメンごとに異なる部分(2026-09-07 ユーザー共有。
 * 赤は常に上・緑は常に下で、青と黄の左右、赤ボード内のライフ系 / ステータス系エリアの左右が入れ替わる)
 */
export interface HolomenBoardLayout {
  /** 青ボードが全体配置の左か右か(黄はその反対)。青ボードのマス配置は左のとき左型、右のとき左右反転 */
  blueSide: BoardSide;
  /** 赤ボードのライフ系エリアが左か右か(ステータス系エリアはその反対) */
  lifeSide: BoardSide;
}

/** ホロメン(タレント)。affiliations は所属 ID の配列(複数所属あり) */
export interface Holomen {
  id: string;
  /** 表示名(日本語) */
  name: string;
  /** 表示名の読み(ひらがな。並び順・検索にだけ使い、表示しない。英字はカタカナ読みをひらがなで) */
  reading: string;
  affiliations: string[];
  /** ホロメンボードの配置(ホロメンごとに固定。ユーザーに選ばせない) */
  board: HolomenBoardLayout;
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

/**
 * アクティブ・SP の追加効果の発動条件。編成条件(SkillCondition)のほかにライブ中の状態(ライフ・コンボ)がある。
 * 表示ユニットスコアの試算(src/engine/displayScore.ts)ではライフ・コンボの条件は満たされているとみなす(仮説)
 */
export type SkillTrigger =
  | SkillCondition
  | { kind: "life"; min: number }
  | { kind: "combo"; min: number };

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
  /** extraCondition の構造化(条件を満たすとスコア UP % がこの値に置き換わる)。extraCondition があれば必須 */
  conditionalScoreUp?: { condition: SkillTrigger; percent: number };
}

/** スペシャルスキルの構造化表現 */
export interface SpecialSkillStructured {
  durationSeconds: number | null;
  scoreSupportPercent: number | null;
  /** SP 追加効果(原文のまま)。なければ null */
  extra: string | null;
  /** extra の構造化(SP 発動中のスキル発動率 UP %)。extra があれば必須 */
  skillRateUp?: { condition: SkillTrigger; percent: number };
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
  /** カード名の読み(ひらがな。同一ホロメン内の並び順・検索にだけ使う) */
  reading: string;
  holomenId: string;
  rarity: 5;
  type: CardType;
  /**
   * レベル最大・2凸以上の本体パラメータ(ホロメンボード・所属ボーナスを含まない —
   * 2026-09-06 実測 12 値で確認。parameter-calculation スキル)
   */
  stats: StatBlock;
  costumeSkill: CostumeSkill;
  passiveSkill: PassiveSkill;
  activeSkill: ActiveSkill;
  specialSkill: SpecialSkill;
  /**
   * 実行時のみ(データファイルには持たない): 青ホロメンボードのアクティブスキル
   * 発動率・発動頻度 UP(%)。src/data/blueBoard.ts が載せ、src/engine/displayScore.ts のタイムラインが使う
   */
  boardLive?: { activeRatePercent: number; activeFrequencyPercent: number };
  /**
   * 実行時のみ: 開花段階を解決した本体値(青・緑ホロメンボード・所属ボーナスを含まない「素のメンバーパラメータ」)。
   * src/data/resolve.ts が載せる。総合力の衣装・パッシブ・赤・メモリーの割合はカード詳細値(stats)でなくこの値を
   * 基準にする(2026-09-08 実機のユニットスコア内訳で確認 — src/engine/power.ts)。ないカードは stats と同じ扱い
   */
  naturalStats?: StatBlock;
}

export type Difficulty = "easy" | "normal" | "hard" | "expert";

export interface SongChart {
  level: number;
  /** 最大コンボ数(ノーツ数)。出典で確認できなければ null */
  combo: number | null;
}

/** SP1〜SP5 の発動開始時刻(秒)。整数秒へ丸めず、観測した小数秒を保持する */
export type SpActivationTimesSeconds = readonly [number, number, number, number, number];

/** 楽曲 */
export interface Song {
  id: string;
  /** 曲名(日本語または原題) */
  title: string;
  /**
   * 歌唱アーティスト名(ホロメン名、またはユニット名・企画名)。表示順のまま。
   * 楽曲の区分(ソロ / ユニット / 全体)と歌唱者はここから導く — src/data/songSingers.ts(2026-09-08 ユーザー定義)
   */
  artists: string[];
  kind: "original" | "cover";
  /** 演奏時間(秒)。不明なら null */
  durationSeconds: number | null;
  /**
   * SP1〜SP5 の発動開始時刻(秒)。難易度差の反例が確認されるまでは Song-level で保持する。
   * 未収集は undefined のままとし、曲長等から推測して埋めない。
   */
  spActivationTimesSeconds?: SpActivationTimesSeconds;
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

/** イベントの形式(point-rally = ポイントラリー / score-challenge = スコアチャレンジ / spotlight = チャプター制) */
export type EventType = "point-rally" | "score-challenge" | "spotlight";

/** 獲得ボーナス: メンバー(特定カード)。編成したそのカード 1 枚ごとに percent% */
export interface EventMemberBonus {
  percent: number;
  cardIds: string[];
}

/** 獲得ボーナス: ホロメン(人物)。カードの種類を問わず、編成 1 枚ごとに percent% */
export interface EventHolomenBonus {
  percent: number;
  holomenIds: string[];
}

/** 課題曲とそのイベントスコアボーナス(ライブスコア +X%)の対象カード */
export interface EventScoreBonusSong {
  songId: string;
  cardIds: string[];
}

/**
 * チャプター制(spotlight)イベントの 1 チャプター。ホロメンボーナスの対象人物と課題曲がチャプターごとに切り替わる。
 * メンバーボーナス(新★5)はイベント本体に持ち全チャプター共通
 */
export interface EventChapter {
  id: string;
  name: string;
  /** 開始・終了(ISO 8601、ゲーム内表示は日本時間) */
  startAt: string;
  endAt: string;
  holomenBonus?: EventHolomenBonus;
  scoreBonusSongs?: EventScoreBonusSong[];
}

/**
 * イベント(2026-09-08 ユーザー共有。全件を持ち、新イベントはデータ 1 件の追加で対応する)。
 * ID は表示名でなく cards.json / holomen.json / songs.json の正規 ID を保存し、表示名はそこから引く。
 * イベント Pt そのものの換算はしない(ライブスコア・曲長・ブーストにも依存する)
 */
export interface EventData {
  id: string;
  name: string;
  type: EventType;
  /** 開始・終了(ISO 8601、ゲーム内表示は日本時間。終了は「19:59」のような表示どおりの分まで) */
  startAt: string;
  endAt: string;
  /** イベント Pt・イベントバッジの獲得量ボーナス(メンバー + ホロメン + 開花を別々に加算) */
  acquisitionBonus: {
    member: EventMemberBonus;
    /** チャプター制ではチャプター側が持つので本体は空配列 */
    holomen: EventHolomenBonus;
    /** 開花ボーナス表(レアリティ → 開花数ごとの %)。省略時は全イベント共通の EVENT_AWAKENING_BONUS(src/data/events.ts) */
    awakening?: Partial<Record<3 | 4 | 5, number[]>>;
  };
  /** 課題曲のイベントスコアボーナス。対象カードを何枚編成しても capPercent を超えない */
  scoreBonus: {
    percent: number;
    capPercent: number;
    /** チャプター制ではチャプター側が持つので本体は空配列 */
    songs: EventScoreBonusSong[];
  };
  /** チャプター制(spotlight)のみ。開始順 */
  chapters?: EventChapter[];
}
