import { holomen } from "./index";
import type { Song } from "./types";

/**
 * 楽曲の区分と歌唱者(2026-09-08 ユーザー定義 — ゲーム内の区分ルール):
 * - ソロ楽曲   = そのアーティスト(ホロメン 1 人)だけが歌っている曲
 * - ユニット楽曲 = 何人かで歌っている曲(歌唱者に含まれる 1 人にとってユニット曲)
 * - 全体楽曲   = hololive IDOL PROJECT の曲
 * 区分は songs.json の artists(表示名)から導く。ホロメン名はそのまま歌唱者、所属名(1期生・Myth など)は
 * その所属の全員が歌唱者。所属に対応しないユニット名(Blue Journey・不知火建設)はユニット曲だが
 * 歌唱者は未確認(null)— 推測で埋めない(ADR-002)。黄ホロメンボードの楽曲スコアボーナスの対象判定に使う
 */

export type SongScope = "solo" | "unit" | "all";

export interface SongSingers {
  scope: SongScope;
  /** 歌唱者のホロメン ID。全体楽曲は空配列(全員)、歌唱者が未確認のユニット曲は null */
  holomenIds: readonly string[] | null;
}

/** 全体楽曲のアーティスト表記 */
export const ALL_SONG_ARTIST = "hololive IDOL PROJECT";

/** 所属名で表記されるアーティスト → 所属 ID(歌唱者はその所属の全員) */
export const AFFILIATION_ARTISTS: Readonly<Record<string, string>> = {
  ホロライブ1期生: "gen1",
  ホロライブゲーマーズ: "gamers",
  秘密結社holoX: "holox",
  "hololive English -Myth-": "myth",
  "hololive English -Promise-": "promise",
  "hololive English -Advent-": "advent",
  "hololive Indonesia 1期生": "id-gen1",
  "hololive Indonesia 2期生": "id-gen2",
  "hololive Indonesia 3期生": "id-gen3",
  ReGLOSS: "regloss",
};

const holomenIdByName: ReadonlyMap<string, string> = new Map(holomen.map((h) => [h.name, h.id]));

function membersOf(affiliation: string): string[] {
  return holomen.filter((h) => h.affiliations.includes(affiliation)).map((h) => h.id);
}

export function songSingers(song: Pick<Song, "artists">): SongSingers {
  const artists = song.artists;
  if (artists.length === 1 && artists[0] === ALL_SONG_ARTIST)
    return { scope: "all", holomenIds: [] };
  const ids: string[] = [];
  let unknown = false;
  let group = false;
  for (const artist of artists) {
    const id = holomenIdByName.get(artist);
    if (id !== undefined) {
      ids.push(id);
      continue;
    }
    const affiliation = AFFILIATION_ARTISTS[artist];
    if (affiliation !== undefined) {
      group = true;
      ids.push(...membersOf(affiliation));
      continue;
    }
    unknown = true;
  }
  const unique = [...new Set(ids)];
  if (!unknown && !group && unique.length === 1) return { scope: "solo", holomenIds: unique };
  return { scope: "unit", holomenIds: unknown ? null : unique };
}

/** そのホロメンが歌唱者に含まれるか(全体楽曲は false — 全体楽曲の効果は別枠) */
export function singsIn(singers: SongSingers, holomenId: string): boolean {
  return singers.holomenIds !== null && singers.holomenIds.includes(holomenId);
}
