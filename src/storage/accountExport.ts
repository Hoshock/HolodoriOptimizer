import { cardById, holomen as allHolomen, holomenById } from "../data";
import type { ConnectPlacements } from "../data/connect";
import type { AccountBonus } from "../engine/power";
import { BOARD_COLOR_ORDER } from "./boards";
import type { BoardColor, BoardEntry } from "./boards";
import type { BoardConnectEntry } from "./boardConnects";
import type { ConnectInventoryEntry } from "./connectInventory";
import type { HolomenRankEntry } from "./holomenRank";
import type { OwnedCard } from "./owned";

/**
 * アカウントの構造化データの出力（サイドメニュー「データの出力」— 2026-09-11 ユーザー指示。「ホロメン、メンバー、
 * イベントメモリー、メンバー強化ボーナスをひとつの JSON でコピーできるように」）。
 *
 *   {
 *     "format": "holodori-optimizer/account",
 *     "version": 1,
 *     "holomen": [ { "holomen": "猫又おかゆ", "holomenId": "nekomata-okayu",
 *                    "rank": 27,
 *                    "red": ["R-001"], "blue": [...], "yellow": [...], "green": [...],
 *                    "unlockedConnects": ["leader", "card"],
 *                    "connect": { "card": { "extent": "card-2", "permil": 850 } } } ],
 *     "members": [ { "holomen": "猫又おかゆ", "card": "パラソル下のリバティキャット", "cardId": "nekomata-okayu-02", "bloom": 5 } ],
 *     "connectInventory": [ { "extent": "card-3", "permil": 2600, "count": 2 } ],
 *     "memoryPercent": 6.0,
 *     "enhancementPercent": 3.0
 *   }
 *
 * `connectInventory` は持っているコネクト(アカウントの「コネクト」で登録した 形 × ‰ × 枚数。2026-10-02 ユーザー指示で追加)。
 * ホロメンごとの `connect` はボードに置いている配置で、こちらとは別管理。空でも `[]` で出す(キーがあることを示す)。
 * 版は上げない(後から足した項目で、読む側は無ければ空として扱える)。
 *
 * `rank` はホロメンランク(1〜50。**未登録なら省略**。未登録はボードPt の制限なし)、`unlockedConnects` は解放済みのコネクトマス
 * (leader = 赤 / card = 青 / content = 黄。中心は常に解放済みなので出さない。**空なら省略**)。どちらも 2026-10-04 に足した項目で、
 * 無ければ「未登録 / 解放なし」として読む(旧い出力はそのまま読める)。コネクトの `connect`(配置)とは別の状態で、
 * ランクだけ・コネクトの解放だけを登録しているホロメンも `holomen` から消さない。
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
  /** ホロメンランクの登録(省略は未登録) */
  ranks?: readonly HolomenRankEntry[];
  /** 解放済みのコネクトマス(省略は解放なし) */
  boardConnects?: readonly BoardConnectEntry[];
  owned: readonly OwnedCard[];
  /** 持っているコネクト(形 × ‰ × 枚数) */
  connectInventory: readonly ConnectInventoryEntry[];
  account: AccountBonus;
}

interface HolomenRow {
  holomen: string;
  holomenId: string;
  rank?: number;
  red?: string[];
  blue?: string[];
  yellow?: string[];
  green?: string[];
  unlockedConnects?: string[];
  connect?: ConnectPlacements;
}

/** JSON の項目の並びを固定する(名前・ID・ランク・4 色・コネクトの解放・コネクトの配置) */
function ordered(row: HolomenRow): HolomenRow {
  const out: HolomenRow = { holomen: row.holomen, holomenId: row.holomenId };
  if (row.rank !== undefined) out.rank = row.rank;
  for (const color of BOARD_COLOR_ORDER) {
    const nodes = row[color];
    if (nodes) out[color] = nodes;
  }
  if (row.unlockedConnects) out.unlockedConnects = row.unlockedConnects;
  if (row.connect) out.connect = row.connect;
  return out;
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
  for (const entry of input.ranks ?? []) rowOf(entry.holomenId).rank = entry.rank;
  for (const entry of input.boardConnects ?? []) {
    if (entry.unlocked.length === 0) continue;
    rowOf(entry.holomenId).unlockedConnects = [...entry.unlocked];
  }
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
  const holomenRows = [...rows.values()]
    .map(ordered)
    .sort((a, b) => (index.get(a.holomenId) ?? Infinity) - (index.get(b.holomenId) ?? Infinity));
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
      connectInventory: input.connectInventory.map((e) => ({
        extent: e.extent,
        permil: e.permil,
        count: e.count,
      })),
      memoryPercent: input.account.memoryPercent,
      enhancementPercent: input.account.enhancementPercent,
    },
    null,
    2,
  );
}
