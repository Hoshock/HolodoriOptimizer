import { cardById, holomen as allHolomen, holomenById } from "../data";
import type { ConnectPlacements } from "../data/connect";
import type { AccountBonus } from "../engine/power";
import type { BoardColor, BoardEntry } from "./boards";
import { BOARD_COLOR_ORDER } from "./boardsExchange";
import type { OwnedCard } from "./owned";

/**
 * アカウントの構造化データの出力（サイドメニュー「データの出力」— 2026-09-11 ユーザー指示。「ホロメン、メンバー、
 * イベントメモリー、メンバー強化ボーナスをひとつの JSON でコピーできるように」）。
 *
 *   {
 *     "format": "holodori-optimizer/account",
 *     "version": 1,
 *     "holomen": [ { "holomen": "猫又おかゆ", "holomenId": "nekomata-okayu",
 *                    "red": ["R-001"], "blue": [...], "yellow": [...], "green": [...],
 *                    "connect": { "card": { "extent": "card-2", "permil": 850 } } } ],
 *     "members": [ { "holomen": "猫又おかゆ", "card": "パラソル下のリバティキャット", "cardId": "nekomata-okayu-02", "bloom": 5 } ],
 *     "memoryPercent": 6.0,
 *     "enhancementPercent": 3.0
 *   }
 *
 * 読む側の都合で ID と表示名を両方出す（ID が正、名前は人が読むため）。空の色・空のコネクトは省く。
 * プレイヤー名・ユーザー ID・フレンドコードのような個人情報は持たない（登録している内容だけ）。
 * ここは値 → 文字列の純関数で、保存には触らない
 */
export const ACCOUNT_EXPORT_FORMAT = "holodori-optimizer/account";
export const ACCOUNT_EXPORT_VERSION = 1;

export interface AccountExportInput {
  boards: Readonly<Record<BoardColor, readonly BoardEntry[]>>;
  connect: Readonly<Record<string, ConnectPlacements>>;
  owned: readonly OwnedCard[];
  account: AccountBonus;
}

interface HolomenRow {
  holomen: string;
  holomenId: string;
  red?: string[];
  blue?: string[];
  yellow?: string[];
  green?: string[];
  connect?: ConnectPlacements;
}

export function serializeAccountExport(input: AccountExportInput): string {
  const rows = new Map<string, HolomenRow>();
  const rowOf = (holomenId: string): HolomenRow => {
    let row = rows.get(holomenId);
    if (!row) {
      row = { holomen: holomenById.get(holomenId)?.name ?? holomenId, holomenId };
      rows.set(holomenId, row);
    }
    return row;
  };
  for (const color of BOARD_COLOR_ORDER) {
    for (const entry of input.boards[color]) {
      if (entry.nodes.length === 0) continue;
      rowOf(entry.holomenId)[color] = [...entry.nodes];
    }
  }
  for (const [holomenId, placements] of Object.entries(input.connect)) {
    if (Object.keys(placements).length === 0) continue;
    rowOf(holomenId).connect = Object.fromEntries(
      Object.entries(placements).map(([anchor, p]) => [anchor, { ...p }]),
    ) as ConnectPlacements;
  }
  const index = new Map(allHolomen.map((h, i) => [h.id, i]));
  const holomenRows = [...rows.values()].sort(
    (a, b) => (index.get(a.holomenId) ?? Infinity) - (index.get(b.holomenId) ?? Infinity),
  );
  const members = input.owned.map((o) => {
    const card = cardById.get(o.id);
    return {
      holomen: card ? (holomenById.get(card.holomenId)?.name ?? card.holomenId) : "",
      card: card?.name ?? "",
      cardId: o.id,
      bloom: o.bloom,
    };
  });
  return JSON.stringify(
    {
      format: ACCOUNT_EXPORT_FORMAT,
      version: ACCOUNT_EXPORT_VERSION,
      holomen: holomenRows,
      members,
      memoryPercent: input.account.memoryPercent,
      enhancementPercent: input.account.enhancementPercent,
    },
    null,
    2,
  );
}
