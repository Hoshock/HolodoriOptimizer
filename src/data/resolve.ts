import { applyBlueBoard } from "./blueBoard";
import { bloomOf, cardAtBloom } from "./bloom";
import type { BloomMap } from "./bloom";
import type { Card } from "./types";
import type { BoardMap } from "../storage/boards";

/**
 * カードを実行条件(開花段階 → 青ホロメンボード)に解決する。UI の表示・Worker の探索・
 * 詳細の検算がすべて同じ 1 本を通る(片方だけ直して齟齬が出ないように)
 */
export function resolveCard(
  card: Card,
  blooms: BloomMap | undefined,
  boards: BoardMap | undefined,
): Card {
  const bloomed = cardAtBloom(card, bloomOf(blooms, card.id));
  const nodes = boards?.[card.holomenId];
  return nodes && nodes.length > 0 ? applyBlueBoard(bloomed, nodes) : bloomed;
}
