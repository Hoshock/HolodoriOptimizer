import { affiliationById, holomenById } from "../data";
import type { Card, CardType } from "../data/types";

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

/** ホロメン名 → カード名の順で安定ソートした一覧(一覧表示用) */
export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort(
    (a, b) =>
      holomenName(a.holomenId).localeCompare(holomenName(b.holomenId), "ja") ||
      a.name.localeCompare(b.name, "ja"),
  );
}

/** 検索語(ホロメン名・カード名・所属名の部分一致)でカードを絞り込む */
export function matchesQuery(card: Card, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const haystack = [
    card.name,
    holomenName(card.holomenId),
    ...affiliationsOfCard(card).map(affiliationName),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
