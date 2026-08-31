import { holomenById } from "../data";
import type { Card, CardType } from "../data/types";

export const TYPE_LABELS: Record<CardType, string> = {
  cute: "キュート",
  happy: "ハッピー",
  pure: "ピュア",
};

export function holomenName(holomenId: string): string {
  return holomenById.get(holomenId)?.name ?? holomenId;
}

/** 選択肢・結果表示用のカードラベル(ホロメン名 + カード名) */
export function cardLabel(card: Card): string {
  return `${holomenName(card.holomenId)}「${card.name}」`;
}

export function formatScore(score: number): string {
  return Math.round(score).toLocaleString("ja-JP");
}

/** ホロメン名 → カード名の順で安定ソートした一覧(セレクト用) */
export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort(
    (a, b) =>
      holomenName(a.holomenId).localeCompare(holomenName(b.holomenId), "ja") ||
      a.name.localeCompare(b.name, "ja"),
  );
}
