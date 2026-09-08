import { holomen } from "./index";
import type { Song } from "./types";

/**
 * 楽曲の区分と歌唱者(2026-09-08 ユーザー定義 — ゲーム内の区分ルール):
 * - ソロ楽曲   = そのアーティスト(ホロメン 1 人)だけが歌っている曲
 * - ユニット楽曲 = 何人かで歌っている曲(歌唱者に含まれる 1 人にとってユニット曲)
 * - 全体楽曲   = hololive IDOL PROJECT の曲
 * 区分は songs.json の artists(表示名)から導く。ホロメン名はそのまま歌唱者、所属名(1期生・Myth など)は
 * その所属の全員が歌唱者。所属に対応しないユニット名(Blue Journey・不知火建設)は曲ごとの歌唱者を
 * SONG_SINGER_OVERRIDES に持つ(2026-09-08 ユーザー共有)。それもなければ歌唱者は未確認(null)—
 * 推測で埋めない(ADR-002)。黄ホロメンボードの楽曲スコアボーナスの対象判定に使う
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
  AREA15: "id-gen1",
  holoro: "id-gen2",
  holoh3ro: "id-gen3",
  ReGLOSS: "regloss",
};

/** 曲ごとの歌唱者(アーティスト表記から導けないユニット名の曲。2026-09-08 ユーザー共有) */
export const SONG_SINGER_OVERRIDES: Readonly<Record<string, readonly string[]>> = {
  /** なかま歌(不知火建設): すいせい・フレア・みこ・ノエル・ポルカ */
  "song-108": [
    "hoshimachi-suisei",
    "shiranui-flare",
    "sakura-miko",
    "shirogane-noel",
    "omaru-polka",
  ],
  /** また傷に触れる(Blue Journey): フレア・トワ・ポルカ(Blue Journey 全体のメンバーではなくこの曲の歌唱者) */
  "song-131": ["shiranui-flare", "tokoyami-towa", "omaru-polka"],
  /*
   * 2026-09-08 12:00 追加の 3 曲(歌唱者はユーザー確認済み)。songs.json の artists はホロメン名で持つので artists からも
   * 導けるが、公式表記の「FUWAMOCO」はフワワ・モココの 2 人で 1 人扱いしない、を明示するために曲ごとにも持つ
   */
  /** 三位一体♡ラブシステム(鷹嶺ルイ / FUWAMOCO): ルイ・フワワ・モココ */
  "song-195": ["takane-lui", "fuwawa-abyssgard", "mococo-abyssgard"],
  /** ホロホーク(鷹嶺ルイ) */
  "song-196": ["takane-lui"],
  /** めくるめくランデヴー(FUWAMOCO): フワワ・モココ */
  "song-197": ["fuwawa-abyssgard", "mococo-abyssgard"],
};

const holomenIdByName: ReadonlyMap<string, string> = new Map(holomen.map((h) => [h.name, h.id]));

function membersOf(affiliation: string): string[] {
  return holomen.filter((h) => h.affiliations.includes(affiliation)).map((h) => h.id);
}

export function songSingers(song: Pick<Song, "artists"> & Partial<Pick<Song, "id">>): SongSingers {
  const artists = song.artists;
  if (artists.length === 1 && artists[0] === ALL_SONG_ARTIST)
    return { scope: "all", holomenIds: [] };
  const override = song.id === undefined ? undefined : SONG_SINGER_OVERRIDES[song.id];
  if (override) return { scope: override.length === 1 ? "solo" : "unit", holomenIds: override };
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
