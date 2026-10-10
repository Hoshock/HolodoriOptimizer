import { connectEffectOfCard } from "../data/cardConnect";
import { CONNECT_ANCHORS, CONNECT_EXTENT_DISPLAY_ORDER, connectLevel } from "../data/connect";
import type { ConnectAnchor, ConnectExtentId, ConnectPlacement } from "../data/connect";
import type { ConnectPlacementMap } from "./connect";
import type { OwnedCard } from "./owned";

/**
 * 所持しているコネクト(形 × ％ × 枚数)。**保存しない** — 所持カード(`src/storage/owned.ts`。カード ID と開花段階)と
 * カード固有のコネクト効果(`src/data/cardConnect.ts`)から導く(2026-10-09 ユーザー指示 — ADR-022。カード 1 枚 = コネクト 1 枚で、
 * ％ は開花段階のレベル(`connectLevel`。0〜4凸 = Lv1、5凸 = Lv2)で決まる)。
 * 2026-10-02〜09 にあった「アカウントの『コネクト』で 形 × ％ × 枚数 を手で登録する」保存(`connect-inventory`)は廃止し、
 * 残っていれば読まずに消す(`clearLegacyConnectInventory`)。
 *
 * 使うのは**コネクトの最適化**(`src/engine/connectOptimize.ts`)と、ボードに置いている配置との見比べ(アカウントの「コネクト」の
 * 使用 / 所持、ボードで置くときの残りと警告、組み直しプランの実行可否)だけ。
 * ボードで置いているコネクト(`src/storage/connect.ts`。ホロメンごと・コネクトマスごと)とは別の概念で、探索・お気に入りと、
 * 最適化のボード・頻度の評価は置いている配置のほうを使う。
 */
export const LEGACY_CONNECT_INVENTORY_STORAGE_KEY = "holodori-optimizer:connect-inventory";

export interface ConnectInventoryEntry {
  extent: ConnectExtentId;
  /** 増幅 ‰(1500 = 「150% UP」) */
  permil: number;
  /** 持っている枚数(1 以上) */
  count: number;
}

/**
 * 所持カードから持っているコネクトを導く。同じ 形 × ‰ は枚数を合算し、並びは所持の並びで最初に出てきた順。
 * コネクト効果が未収録のカード(いまはない)と、データにないカード ID は数えない
 */
export function connectInventoryOf(owned: readonly OwnedCard[]): ConnectInventoryEntry[] {
  const out: ConnectInventoryEntry[] = [];
  for (const card of owned) {
    const def = connectEffectOfCard(card.id);
    if (def === null) continue;
    const permil = def.permil[connectLevel(card.bloom) - 1];
    const same = out.find((e) => e.extent === def.extent && e.permil === permil);
    if (same) same.count += 1;
    else out.push({ extent: def.extent, permil, count: 1 });
  }
  return out;
}

/** 廃止した手入力の所持コネクトの保存を消す(読まない。2026-10-09 ユーザー指示「既存で登録しているコネクトは削除」) */
export function clearLegacyConnectInventory(): void {
  try {
    localStorage.removeItem(LEGACY_CONNECT_INVENTORY_STORAGE_KEY);
  } catch {
    // 保存できない環境でも動作は継続する
  }
}

/** その 形 × ‰ の枚数(持っていなければ 0) */
export function inventoryCount(
  entries: readonly ConnectInventoryEntry[],
  extent: ConnectExtentId,
  permil: number,
): number {
  return entries.find((e) => e.extent === extent && e.permil === permil)?.count ?? 0;
}

/** その形の枚数の合計(％が違うものも合わせる) */
export function inventoryTotal(
  entries: readonly ConnectInventoryEntry[],
  extent: ConnectExtentId,
): number {
  return entries.filter((e) => e.extent === extent).reduce((sum, e) => sum + e.count, 0);
}

/** 最適化に渡す形(形 × ‰ × 枚数) */
export function inventoryItems(
  entries: readonly ConnectInventoryEntry[],
): { placement: ConnectPlacement; count: number }[] {
  return entries.map((e) => ({
    placement: { extent: e.extent, permil: e.permil },
    count: e.count,
  }));
}

/** 持っているコネクトがあるか(コネクトの最適化を使えるか) */
export function hasInventory(entries: readonly ConnectInventoryEntry[]): boolean {
  return entries.some((e) => e.count > 0);
}

/** ボードに置いている数が、持っている枚数を超えている 形 × ‰ */
export interface ConnectShortage {
  extent: ConnectExtentId;
  permil: number;
  /** ボードに置いている数 */
  placed: number;
  /** 持っている枚数(所持カードから導いた数) */
  owned: number;
}

/**
 * ボードで置いているコネクトのうち、所持カードから導いた所持にない(または枚数を超えている)ものを返す。空なら置き方は所持の範囲に収まっている。
 * コネクトの最適化は所持の範囲で置き方を決めるので、収まっていないときは最適化せず、所持カードを正しく登録してもらう(2026-10-02 ユーザー指示)。
 * 1 枚は 1 か所にしか置けないので、同じ 形 × ‰ を持っている枚数より多く置いていれば不足
 */
export function placementShortage(
  placements: ConnectPlacementMap,
  entries: readonly ConnectInventoryEntry[],
): ConnectShortage[] {
  const placed = new Map<string, ConnectShortage>();
  for (const anchors of Object.values(placements)) {
    for (const p of Object.values(anchors)) {
      const key = `${p.extent}/${String(p.permil)}`;
      const row = placed.get(key) ?? {
        extent: p.extent,
        permil: p.permil,
        placed: 0,
        owned: inventoryCount(entries, p.extent, p.permil),
      };
      row.placed += 1;
      placed.set(key, row);
    }
  }
  return [...placed.values()].filter((r) => r.placed > r.owned);
}

/** コネクトを置く場所(ホロメン × コネクトマス) */
export interface ConnectSlot {
  holomenId: string;
  anchor: ConnectAnchor;
}

/**
 * その 形 × ‰ をボードに置いている場所。`except` の場所(いま入力しているコネクトマス)は数えない。
 * 並びは保存の順 → コネクトマスの順(中心・赤・青・黄)
 */
export function placementSlots(
  placements: ConnectPlacementMap,
  extent: ConnectExtentId,
  permil: number,
  except: ConnectSlot | null = null,
): ConnectSlot[] {
  const out: ConnectSlot[] = [];
  for (const [holomenId, anchors] of Object.entries(placements)) {
    for (const anchor of CONNECT_ANCHORS) {
      const p = anchors[anchor];
      if (!p || p.extent !== extent || p.permil !== permil) continue;
      if (except && except.holomenId === holomenId && except.anchor === anchor) continue;
      out.push({ holomenId, anchor });
    }
  }
  return out;
}

/** 形 × ‰ ごとの 使用(ボードに置いている数)/ 所持 と、使っているホロメン */
export interface ConnectUsage {
  extent: ConnectExtentId;
  permil: number;
  used: number;
  owned: number;
  /** 使っているホロメン(保存の順。同じホロメンの 2 か所は 1 人) */
  holomenIds: string[];
}

/**
 * 置いているか持っている 形 × ‰ の 使用 / 所持(2026-10-10 ユーザー指示「アカウントのコネクト、今何個使われているかもそこから見たい」)。
 * 並びは図形一覧の固定順 → ‰ の小さい順。所持を超えて置いているもの(`used > owned`)も消さずに出す
 */
export function connectUsage(
  placements: ConnectPlacementMap,
  entries: readonly ConnectInventoryEntry[],
): ConnectUsage[] {
  const rows = new Map<string, ConnectUsage>();
  const rowOf = (extent: ConnectExtentId, permil: number): ConnectUsage => {
    const key = `${extent}/${String(permil)}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        extent,
        permil,
        used: 0,
        owned: inventoryCount(entries, extent, permil),
        holomenIds: [],
      };
      rows.set(key, row);
    }
    return row;
  };
  for (const e of entries) rowOf(e.extent, e.permil);
  for (const [holomenId, anchors] of Object.entries(placements)) {
    for (const anchor of CONNECT_ANCHORS) {
      const p = anchors[anchor];
      if (!p) continue;
      const row = rowOf(p.extent, p.permil);
      row.used += 1;
      if (!row.holomenIds.includes(holomenId)) row.holomenIds.push(holomenId);
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      CONNECT_EXTENT_DISPLAY_ORDER.indexOf(a.extent) -
        CONNECT_EXTENT_DISPLAY_ORDER.indexOf(b.extent) || a.permil - b.permil,
  );
}
