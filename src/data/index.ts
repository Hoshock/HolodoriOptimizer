import affiliationsJson from "./affiliations.json";
import cardsJson from "./cards.json";
import holomenJson from "./holomen.json";
import metaJson from "./meta.json";
import songsJson from "./songs.json";
import type { Affiliation, Card, DatasetMeta, Holomen, Song } from "./types";

export const affiliations = affiliationsJson as Affiliation[];
export const holomen = holomenJson as Holomen[];
export const cards = cardsJson as Card[];
export const songs = songsJson as Song[];
export const datasetMeta = metaJson as DatasetMeta;

export const cardById: ReadonlyMap<string, Card> = new Map(cards.map((c) => [c.id, c]));
export const songById: ReadonlyMap<string, Song> = new Map(songs.map((s) => [s.id, s]));
export const holomenById: ReadonlyMap<string, Holomen> = new Map(holomen.map((h) => [h.id, h]));
export const affiliationById: ReadonlyMap<string, Affiliation> = new Map(
  affiliations.map((a) => [a.id, a]),
);
