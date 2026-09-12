import affiliationsJson from "./affiliations.json";
import cardsJson from "./cards.json";
import eventsJson from "./events.json";
import holomenJson from "./holomen.json";
import metaJson from "./meta.json";
import songsJson from "./songs.json";
import { applyCardCorrections } from "./cardCorrections";
import type { Affiliation, Card, DatasetMeta, EventData, Holomen, Song } from "./types";

export const affiliations = affiliationsJson as Affiliation[];
export const holomen = holomenJson as Holomen[];

/**
 * cards.json は取り込み元レコード。ランタイムで使う正典は実機訂正を適用したこちら。
 * カード事実を調べるときも raw JSON の検索断片ではなく cards / cardById を使う。
 */
export const cards = applyCardCorrections(cardsJson as Card[]);

export const songs = songsJson as Song[];
export const events = eventsJson as EventData[];
export const datasetMeta = metaJson as DatasetMeta;

/** 全曲の演奏時間の中央値。ゲーム仕様の定数ではない。 */
export const medianSongDurationSeconds: number = (() => {
  const durations = songs
    .map((s) => s.durationSeconds)
    .filter((d): d is number => d !== null && d > 0)
    .sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  if (durations.length === 0) return 0;
  const lower = durations[middle - 1] ?? 0;
  const upper = durations[middle] ?? 0;
  return durations.length % 2 === 1 ? upper : Math.round((lower + upper) / 2);
})();

export const cardById: ReadonlyMap<string, Card> = new Map(cards.map((c) => [c.id, c]));
export const songById: ReadonlyMap<string, Song> = new Map(songs.map((s) => [s.id, s]));
export const eventById: ReadonlyMap<string, EventData> = new Map(events.map((e) => [e.id, e]));
export const holomenById: ReadonlyMap<string, Holomen> = new Map(holomen.map((h) => [h.id, h]));
export const affiliationById: ReadonlyMap<string, Affiliation> = new Map(
  affiliations.map((a) => [a.id, a]),
);
