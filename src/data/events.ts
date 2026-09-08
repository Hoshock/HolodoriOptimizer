import { events } from "./index";
import type { EventChapter, EventData } from "./types";

/**
 * イベント(src/data/events.json)の補助。ボーナスの計算は src/engine/event.ts。
 *
 * - イベントの一覧・開催期間・チャプターの切替はデータで持ち、UI やエンジンを編集せずにデータ 1 件の追加で
 *   新イベントに対応する(2026-09-08 ユーザー指示)
 * - 開花ボーナスは全イベント共通(EVENT_AWAKENING_BONUS)。イベント側に awakening があればそれを優先する
 */

/**
 * 獲得量の開花ボーナス(%)。レアリティ → 開花数(0〜5)ごとの値。全イベント共通(2026-09-08 ユーザー共有)。
 * 対象カード・対象ホロメンでなくても、編成したすべてのカードにレアリティと開花数で加算する
 */
export const EVENT_AWAKENING_BONUS: Readonly<Record<3 | 4 | 5, readonly number[]>> = {
  3: [0, 1, 1, 2, 2, 3],
  4: [0, 6, 7, 8, 9, 10],
  5: [0, 15, 18, 22, 26, 30],
};

/** イベントの開花ボーナス表(イベント固有の表があればそれ、なければ共通表) */
export function awakeningBonusTable(
  event: EventData,
  rarity: 3 | 4 | 5,
): readonly number[] | undefined {
  return event.acquisitionBonus.awakening?.[rarity] ?? EVENT_AWAKENING_BONUS[rarity];
}

/** 開催期間内か(開始・終了とも含む。終了は「19:59」の分まで表示どおりに持つので、その分の終わりまでを期間内とする) */
function isWithin(startAt: string, endAt: string, at: Date): boolean {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime() + 60_000; // 表示は分単位。19:59 表示なら 19:59:59 まで開催中
  const t = at.getTime();
  return start <= t && t < end;
}

/** 指定時刻に開催中のイベント(なければ null)。開催期間は重ならない前提(events.test.ts で固定) */
export function activeEvent(at: Date, list: readonly EventData[] = events): EventData | null {
  return list.find((e) => isWithin(e.startAt, e.endAt, at)) ?? null;
}

/** 指定時刻に進行中のチャプター(チャプター制でない、または期間外なら null) */
export function activeChapter(event: EventData, at: Date): EventChapter | null {
  return event.chapters?.find((c) => isWithin(c.startAt, c.endAt, at)) ?? null;
}

/** ID でチャプターを引く(そのイベントのチャプターでなければ undefined) */
export function chapterOf(event: EventData, chapterId: string): EventChapter | undefined {
  return event.chapters?.find((c) => c.id === chapterId);
}

/** チャプター制(spotlight。ホロメンボーナスと課題曲がチャプターごと)か */
export function hasChapters(event: EventData): boolean {
  return (event.chapters?.length ?? 0) > 0;
}
