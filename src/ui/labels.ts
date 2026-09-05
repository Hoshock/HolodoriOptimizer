import { affiliationById, holomen, holomenById } from "../data";
import type { Card, CardType, Song } from "../data/types";

export const TYPE_LABELS: Record<CardType, string> = {
  cute: "キュート",
  happy: "ハッピー",
  pure: "ピュア",
};

/** フィルタ UI に出す所属の表示順(JP 世代 → ゲーマーズ → holoX → EN → ID → DEV_IS) */
export const AFFILIATION_ORDER: string[] = [
  "gen0",
  "gen1",
  "gamers",
  "gen2",
  "gen3",
  "gen4",
  "gen5",
  "holox",
  "myth",
  "promise",
  "advent",
  "id-gen1",
  "id-gen2",
  "id-gen3",
  "regloss",
];

export function holomenName(holomenId: string): string {
  return holomenById.get(holomenId)?.name ?? holomenId;
}

export function affiliationName(affiliationId: string): string {
  return affiliationById.get(affiliationId)?.name ?? affiliationId;
}

export function affiliationsOfCard(card: Card): string[] {
  return holomenById.get(card.holomenId)?.affiliations ?? [];
}

/** 選択肢・結果表示用のカードラベル(ホロメン名 + カード名) */
export function cardLabel(card: Card): string {
  return `${holomenName(card.holomenId)}「${card.name}」`;
}

export function formatScore(score: number): string {
  return Math.round(score).toLocaleString("ja-JP");
}

/** 演奏時間(秒)を m:ss 表記にする */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${String(m)}:${String(s).padStart(2, "0")}`;
}

function holomenReading(holomenId: string): string {
  return holomenById.get(holomenId)?.reading ?? "";
}

/** 長音「ー」を直前の母音に置き換えるための対応表(あいうえお順の辞書式規則) */
const VOWEL_ROWS: [string, string][] = [
  ["あ", "あかさたなはまやらわがざだばぱぁゃゎ"],
  ["い", "いきしちにひみりぎじぢびぴぃゐ"],
  ["う", "うくすつぬふむゆるぐずづぶぷゔぅゅっ"],
  ["え", "えけせてねへめれげぜでべぺぇゑ"],
  ["お", "おこそとのほもよろをごぞどぼぽぉょ"],
];
const VOWEL_OF: ReadonlyMap<string, string> = new Map(
  VOWEL_ROWS.flatMap(([vowel, kana]) => kana.split("").map((k) => [k, vowel] as [string, string])),
);

/**
 * 読み(ひらがな)をあいうえお順の比較キーにする: 長音「ー」は直前の母音とみなす
 * (「あーにゃ」→「ああにゃ」)。濁音・小書きの前後は localeCompare("ja") に任せる
 */
export function readingSortKey(reading: string): string {
  let out = "";
  for (const ch of reading) {
    out += ch === "ー" ? (VOWEL_OF.get(out.at(-1) ?? "") ?? ch) : ch;
  }
  return out;
}

function compareReading(a: string, b: string): number {
  return readingSortKey(a).localeCompare(readingSortKey(b), "ja");
}

/** ホロメン名の読み → カード名の読みのあいうえお順で安定ソートした一覧(一覧表示用) */
export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort(
    (a, b) =>
      compareReading(holomenReading(a.holomenId), holomenReading(b.holomenId)) ||
      compareReading(a.reading, b.reading),
  );
}

/** 検索語(ホロメン名・カード名とその読み・所属名の部分一致)でカードを絞り込む */
export function matchesQuery(card: Card, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const haystack = [
    card.name,
    card.reading,
    holomenName(card.holomenId),
    holomenReading(card.holomenId),
    ...affiliationsOfCard(card).map(affiliationName),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/** ユニット名・企画名のアーティスト → 所属フィルタに対応づける所属 ID(該当なしは全体扱いで対応づけない) */
const ARTIST_GROUP_AFFILIATIONS: Record<string, string> = {
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

/** 曲のアーティストから導いた所属 ID(ホロメンは本人の所属、ユニット名は対応表。重複なし) */
export function affiliationsOfSong(song: Song): string[] {
  const result = new Set<string>();
  for (const artist of song.artists) {
    const holomenId = holomenIdByName.get(artist);
    if (holomenId !== undefined) {
      for (const aff of holomenById.get(holomenId)?.affiliations ?? []) result.add(aff);
      continue;
    }
    const group = ARTIST_GROUP_AFFILIATIONS[artist];
    if (group !== undefined) result.add(group);
  }
  return [...result];
}

/** 表示用のアーティスト名(複数は「・」区切り) */
export function artistsLabel(song: Song): string {
  return song.artists.join("・");
}

/** 検索語(曲名・アーティスト名の部分一致)で曲を絞り込む */
export function matchesSongQuery(song: Song, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return [song.title, ...song.artists].join(" ").toLowerCase().includes(q);
}
