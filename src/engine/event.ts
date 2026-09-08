import { awakeningBonusTable, chapterOf, hasChapters } from "../data/events";
import type {
  Card,
  EventChapter,
  EventData,
  EventHolomenBonus,
  EventScoreBonusSong,
} from "../data/types";

/**
 * イベントボーナスの計算(2026-09-08 ユーザー共有の仕様)。UI に依存しない純関数で、スコアの試算(src/engine/score.ts・
 * optimize.ts)からは隔離する。
 *
 * 1. 獲得ボーナス(イベント Pt・イベントバッジの獲得量): 編成した各カードについて
 *    メンバー(特定カード。イベント対象の新★5 なら +30% など)+ ホロメン(人物。カードの種類を問わず)+ 開花(レアリティと開花数。
 *    全カード)を別々に足し、編成全体で合計する(水着ルイ 2凸 = 30 + 30 + 18 = 78%)。
 *    イベント Pt の絶対値はライブスコア・曲長・ブーストにも依存するので換算しない(獲得ボーナス % を返すまで)。
 * 2. イベントスコアボーナス(課題曲のライブスコア +10%): 課題曲ごとの対象カード(特定カード。通常版では発動しない)が編成に
 *    1 枚でもあれば percent、複数あっても重複せず capPercent が上限。イベント期間中だけ有効で、ゲーム内ではイベント用スコアと
 *    通常スコアが別に保存される。ツールでは通常の総合期待スコアを求めた後に (1 + percent/100) を掛ける(第一候補の実装。
 *    src/engine/optimize.ts の eventScore)。
 *
 * どちらも「編成」はメンバー 5 枠のカードを渡す想定(リーダー枠が対象判定に入るかは未確認 — pending 11。呼び出し側が
 * 含めたいカードを渡す)。チャプター制(spotlight)イベントはチャプターの指定が必須で、ホロメンボーナスと課題曲はチャプター側の値を使う
 */

/** 編成 1 枠(カードと開花数) */
export interface EventUnitEntry {
  card: Card;
  /** 開花数(0〜5) */
  bloom: number;
}

export interface EventCardBonus {
  cardId: string;
  memberBonusPercent: number;
  holomenBonusPercent: number;
  awakeningBonusPercent: number;
  totalPercent: number;
}

export interface EventAcquisitionBonus {
  /** 編成全体の獲得ボーナス(%)。member + holomen + awakening の合計 */
  totalPercent: number;
  memberBonusPercent: number;
  holomenBonusPercent: number;
  awakeningBonusPercent: number;
  perCard: EventCardBonus[];
}

export interface EventScoreBonus {
  /** 0 または percent(capPercent 上限) */
  percent: number;
  /** 編成に含まれる対象カードの ID(複数返してよいが percent は重複しない) */
  matchedCardIds: string[];
}

/**
 * チャプターの解決。チャプター制イベントで未指定なら例外(黙って本体の空配列で 0 を返さない)。
 * 文字列なら ID で引き、そのイベントのチャプターでなければ例外
 */
function resolveChapter(
  event: EventData,
  chapter: EventChapter | string | undefined,
): EventChapter | null {
  if (chapter === undefined) {
    if (hasChapters(event)) {
      throw new Error(`イベント ${event.id} はチャプター制なのでチャプターの指定が必要`);
    }
    return null;
  }
  const resolved = typeof chapter === "string" ? chapterOf(event, chapter) : chapter;
  if (!resolved || !event.chapters?.some((c) => c.id === resolved.id)) {
    throw new Error(
      `イベント ${event.id} にチャプター ${typeof chapter === "string" ? chapter : chapter.id} はない`,
    );
  }
  return resolved;
}

/** 効いているホロメンボーナス(チャプター制ならチャプターの値。チャプターに定義がなければ本体) */
function holomenBonusOf(event: EventData, chapter: EventChapter | null): EventHolomenBonus {
  return chapter?.holomenBonus ?? event.acquisitionBonus.holomen;
}

/** 効いている課題曲(本体 + チャプター) */
export function eventScoreBonusSongs(
  event: EventData,
  chapter?: EventChapter | string,
): EventScoreBonusSong[] {
  const resolved = resolveChapter(event, chapter);
  return [...event.scoreBonus.songs, ...(resolved?.scoreBonusSongs ?? [])];
}

/** 開花ボーナス(%)。レアリティの表がない・開花数が範囲外なら例外(推測で 0 にしない) */
export function awakeningBonusPercent(event: EventData, card: Card, bloom: number): number {
  const table = awakeningBonusTable(event, card.rarity);
  if (!table) throw new Error(`レアリティ ${String(card.rarity)} の開花ボーナス表がない`);
  const value = table[bloom];
  if (value === undefined)
    throw new Error(`開花数 ${String(bloom)} は範囲外(0〜${String(table.length - 1)})`);
  return value;
}

/** 編成の獲得ボーナス(イベント Pt・イベントバッジの獲得量 %)。entries はメンバー枠のカードと開花数 */
export function eventAcquisitionBonus(
  event: EventData,
  entries: readonly EventUnitEntry[],
  chapter?: EventChapter | string,
): EventAcquisitionBonus {
  const resolved = resolveChapter(event, chapter);
  const member = event.acquisitionBonus.member;
  const memberIds = new Set(member.cardIds);
  const holomenBonus = holomenBonusOf(event, resolved);
  const holomenIds = new Set(holomenBonus.holomenIds);

  const perCard = entries.map(({ card, bloom }): EventCardBonus => {
    const memberBonusPercent = memberIds.has(card.id) ? member.percent : 0;
    const holomenBonusPercent = holomenIds.has(card.holomenId) ? holomenBonus.percent : 0;
    const awakening = awakeningBonusPercent(event, card, bloom);
    return {
      cardId: card.id,
      memberBonusPercent,
      holomenBonusPercent,
      awakeningBonusPercent: awakening,
      totalPercent: memberBonusPercent + holomenBonusPercent + awakening,
    };
  });
  const sum = (pick: (c: EventCardBonus) => number): number =>
    perCard.reduce((acc, c) => acc + pick(c), 0);
  return {
    totalPercent: sum((c) => c.totalPercent),
    memberBonusPercent: sum((c) => c.memberBonusPercent),
    holomenBonusPercent: sum((c) => c.holomenBonusPercent),
    awakeningBonusPercent: sum((c) => c.awakeningBonusPercent),
    perCard,
  };
}

/** 曲のイベントスコアボーナスの対象カード ID(課題曲でなければ空)。探索の前計算(optimize の eventScore)にも使う */
export function eventScoreTargetCardIds(
  event: EventData,
  songId: string,
  chapter?: EventChapter | string,
): string[] {
  const ids = new Set<string>();
  for (const s of eventScoreBonusSongs(event, chapter)) {
    if (s.songId === songId) for (const id of s.cardIds) ids.add(id);
  }
  return [...ids];
}

/** 課題曲のイベントスコアボーナス(%)。対象カードが編成に 1 枚でもあれば percent(capPercent 上限)、なければ 0 */
export function eventScoreBonus(
  event: EventData,
  songId: string,
  cards: readonly Card[],
  chapter?: EventChapter | string,
): EventScoreBonus {
  const targets = new Set(eventScoreTargetCardIds(event, songId, chapter));
  const matchedCardIds = cards.filter((c) => targets.has(c.id)).map((c) => c.id);
  const percent =
    matchedCardIds.length > 0 ? Math.min(event.scoreBonus.percent, event.scoreBonus.capPercent) : 0;
  return { percent, matchedCardIds };
}

/** 通常のスコア(総合期待スコア)にイベントスコアボーナスを掛けたイベント用スコア(「ライブスコア +10%」を最後に掛ける第一候補の実装) */
export function applyEventScoreBonus(score: number, percent: number): number {
  return score * (1 + percent / 100);
}
