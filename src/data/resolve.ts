import { applyBlueBoard } from "./blueBoard";
import { bloomOf, cardAtBloom } from "./bloom";
import type { BloomMap } from "./bloom";
import type { ConnectFactorMap } from "./connect";
import { applyGreenBoard } from "./greenBoard";
import type { GreenBoardEffects } from "./greenBoard";
import type { Card, StatBlock } from "./types";
import type { BoardMap } from "../storage/boards";

/**
 * カードを実行条件(開花段階 → 青ホロメンボード → 緑ホロメンボード)に解決する。UI の表示・Worker の探索・
 * 詳細の検算がすべて同じ 1 本を通る(片方だけ直して齟齬が出ないように)。
 * 青はそのホロメンの解放マス、緑はアカウント全体の合計(accountGreenEffects。コネクト増幅を入れるなら呼び出し側で
 * 倍率つきに作る)を渡す。connect はホロメン ID → 色 → マス ID → コネクト倍率(src/data/connect.ts。省略で増幅なし)
 */
export function resolveCard(
  card: Card,
  blooms: BloomMap | undefined,
  boards: BoardMap | undefined,
  green?: GreenBoardEffects | null,
  connect?: ConnectFactorMap,
): Card {
  const bloomed = cardAtBloom(card, bloomOf(blooms, card.id));
  const nodes = boards?.[card.holomenId];
  const blue =
    nodes && nodes.length > 0
      ? applyBlueBoard(bloomed, nodes, connect?.[card.holomenId]?.blue)
      : bloomed;
  const resolved = green ? applyGreenBoard(blue, green) : blue;
  // 開花後・ボード前の本体値を残す(総合力の割合効果の基準値。stats はカード詳細画面と同じボード込みの値)
  return { ...resolved, naturalStats: bloomed.stats };
}

/** 総合力の割合効果の基準になる素のパラメータ(resolveCard を通っていないカードは stats をそのまま) */
export function naturalStatsOf(card: Card): StatBlock {
  return card.naturalStats ?? card.stats;
}
