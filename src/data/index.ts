import affiliationsJson from "./affiliations.json";
import cardsJson from "./cards.json";
import eventsJson from "./events.json";
import holomenJson from "./holomen.json";
import metaJson from "./meta.json";
import songsJson from "./songs.json";
import type { Affiliation, Card, DatasetMeta, EventData, Holomen, Song } from "./types";

export const affiliations = affiliationsJson as Affiliation[];
export const holomen = holomenJson as Holomen[];
export const cards = cardsJson as Card[];
export const songs = songsJson as Song[];
export const events = eventsJson as EventData[];
export const datasetMeta = metaJson as DatasetMeta;

export const cardById: ReadonlyMap<string, Card> = new Map(cards.map((c) => [c.id, c]));
export const songById: ReadonlyMap<string, Song> = new Map(songs.map((s) => [s.id, s]));
export const eventById: ReadonlyMap<string, EventData> = new Map(events.map((e) => [e.id, e]));
export const holomenById: ReadonlyMap<string, Holomen> = new Map(holomen.map((h) => [h.id, h]));
/**
 * 全曲の演奏時間の中央値(秒)。曲を指定しないときの代表値として UI の表示にだけ使う
 * (`SongRow.vue` の「指定なし」の行)。表示ユニットスコアの試算には曲長を使わない —
 * 実ライブのスコア計算は未実装(ADR-006)
 */
export const MEDIAN_SONG_DURATION_SECONDS = (() => {
  const durations = songs
    .map((s) => s.durationSeconds)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);
  return durations[Math.floor(durations.length / 2)] ?? 120;
})();

export const affiliationById: ReadonlyMap<string, Affiliation> = new Map(
  affiliations.map((a) => [a.id, a]),
);
