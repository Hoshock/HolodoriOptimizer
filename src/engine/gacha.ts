/**
 * 仮想ガチャの抽選ロジック(純粋関数)。乱数は注入可能にしてテストで固定する。
 *
 * 提供割合の根拠は src/data/gacha.ts と docs/human/game-spec.md「ガチャと課金」。
 * ★3・★4 はカード単位の情報(カード名・種類数)が未確認のため、
 * 「1 ホロメン 1 枚」と仮定してホロメン単位で抽選する(表示もホロメン名のみ)。
 */

import { GACHA_RATES, GUARANTEED_SLOT_RATES } from "../data/gacha";
import type { Card } from "../data/types";

/** 0 以上 1 未満の乱数を返す関数(Math.random 互換) */
export type Rng = () => number;

export type PullResult =
  | { rarity: 5; cardId: string; pickup: boolean }
  | { rarity: 4 | 3; holomenId: string };

export interface GachaPools {
  /** ★5 の実カード(排出候補) */
  star5: Card[];
  /** ★3・★4 の排出候補(1 ホロメン 1 枚と仮定) */
  lowRarityHolomenIds: string[];
}

export interface GachaConfig {
  /** 個別の絶対排出率を持つ ★5(ピックアップ・初心者応援の選択枠)。プール外の ID は無視 */
  pickupIds: string[];
  /** pickupIds の 1 枚あたりの絶対排出率(例: 0.01 = 1%) */
  pickupRateEach: number;
  /** 10 連の確定枠を ★5 確定にする(スタートダッシュガチャ) */
  guaranteeStar5: boolean;
}

/** 設定に対して有効なピックアップ ID(プールに実在するもの) */
function effectivePickupIds(pools: GachaPools, config: GachaConfig): string[] {
  const inPool = new Set(pools.star5.map((c) => c.id));
  return config.pickupIds.filter((id) => inPool.has(id));
}

/** ピックアップ以外の ★5 1 枚あたりの絶対排出率(残りを均等割り) */
export function star5OtherRateEach(pools: GachaPools, config: GachaConfig): number {
  const pickups = effectivePickupIds(pools, config);
  const others = pools.star5.length - pickups.length;
  if (others <= 0) return 0;
  const remaining = Math.max(0, GACHA_RATES.star5 - pickups.length * config.pickupRateEach);
  return remaining / others;
}

/** ★5 が当たったときのカード選択(★5 内の相対確率で抽選) */
function drawStar5(pools: GachaPools, config: GachaConfig, rng: Rng): PullResult {
  const pickups = new Set(effectivePickupIds(pools, config));
  const otherRate = star5OtherRateEach(pools, config);
  const weights = pools.star5.map((c) => (pickups.has(c.id) ? config.pickupRateEach : otherRate));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pools.star5.length; i++) {
    r -= weights[i];
    if (r < 0) {
      const card = pools.star5[i];
      return { rarity: 5, cardId: card.id, pickup: pickups.has(card.id) };
    }
  }
  const last = pools.star5[pools.star5.length - 1];
  return { rarity: 5, cardId: last.id, pickup: pickups.has(last.id) };
}

function drawLowRarity(rarity: 3 | 4, pools: GachaPools, rng: Rng): PullResult {
  const ids = pools.lowRarityHolomenIds;
  const index = Math.min(ids.length - 1, Math.floor(rng() * ids.length));
  return { rarity, holomenId: ids[index] };
}

/** 通常枠 1 回の抽選 */
export function pullOne(pools: GachaPools, config: GachaConfig, rng: Rng): PullResult {
  const r = rng();
  if (r < GACHA_RATES.star5) return drawStar5(pools, config, rng);
  if (r < GACHA_RATES.star5 + GACHA_RATES.star4) return drawLowRarity(4, pools, rng);
  return drawLowRarity(3, pools, rng);
}

/** 確定枠(10 連の 10 枚目)の抽選。★4 以上確定、スタートダッシュは ★5 確定 */
export function pullGuaranteed(pools: GachaPools, config: GachaConfig, rng: Rng): PullResult {
  if (config.guaranteeStar5 || rng() < GUARANTEED_SLOT_RATES.star5) {
    return drawStar5(pools, config, rng);
  }
  return drawLowRarity(4, pools, rng);
}

/** 10 連(1〜9 枚目は通常枠、10 枚目は確定枠) */
export function pullTen(pools: GachaPools, config: GachaConfig, rng: Rng): PullResult[] {
  const results: PullResult[] = [];
  for (let i = 0; i < 9; i++) results.push(pullOne(pools, config, rng));
  results.push(pullGuaranteed(pools, config, rng));
  return results;
}
