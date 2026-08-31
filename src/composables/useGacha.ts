import { ref, watch } from "vue";

import { cards, holomen } from "../data";
import { DIA_PACK, PICKUP_RATE_EACH, PULL_COST } from "../data/gacha";
import type { GachaConfig, GachaPools, PullResult } from "../engine/gacha";
import { pullOne, pullTen } from "../engine/gacha";

/** 仮想ガチャの状態の保存先(このブラウザ内のみ。サーバ送信なし) */
const STORAGE_KEY = "holodori-optimizer:gacha";

export interface GachaTotals {
  pulls: number;
  star3: number;
  star4: number;
  star5: number;
}

export type PullMode = "single" | "ten";

interface PersistedState {
  /** 所持ブルーダイヤ(仮想ウォレットは有償ダイヤのみに簡略化 — 2026-08-31 ユーザー指定) */
  blueDia: number;
  spentYen: number;
  totals: GachaTotals;
  pickupId: string | null;
}

function defaults(): PersistedState {
  return {
    blueDia: 0,
    spentYen: 0,
    totals: { pulls: 0, star3: 0, star4: 0, star5: 0 },
    pickupId: null,
  };
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function load(): PersistedState {
  const d = defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return d;
    const p: unknown = JSON.parse(raw);
    if (typeof p !== "object" || p === null) return d;
    const o = p as Record<string, unknown>;
    const totals = (o.totals ?? {}) as Record<string, unknown>;
    const validCardId = (id: unknown): id is string =>
      typeof id === "string" && cards.some((c) => c.id === id);
    return {
      blueDia: asNumber(o.blueDia, d.blueDia),
      spentYen: asNumber(o.spentYen, d.spentYen),
      totals: {
        pulls: asNumber(totals.pulls, 0),
        star3: asNumber(totals.star3, 0),
        star4: asNumber(totals.star4, 0),
        star5: asNumber(totals.star5, 0),
      },
      pickupId: validCardId(o.pickupId) ? o.pickupId : null,
    };
  } catch {
    return d;
  }
}

export function useGacha() {
  const initial = load();
  const blueDia = ref(initial.blueDia);
  const spentYen = ref(initial.spentYen);
  const totals = ref<GachaTotals>(initial.totals);
  const pickupId = ref<string | null>(initial.pickupId);

  watch(
    [blueDia, spentYen, totals, pickupId],
    () => {
      const state: PersistedState = {
        blueDia: blueDia.value,
        spentYen: spentYen.value,
        totals: totals.value,
        pickupId: pickupId.value,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // 保存できない環境(プライベートブラウズ等)でも動作は継続する
      }
    },
    { deep: true },
  );

  const pools: GachaPools = {
    star5: cards,
    lowRarityHolomenIds: holomen.map((h) => h.id),
  };

  /** ピックアップガチャの抽選設定(仮想ガチャはピックアップのみ) */
  function config(): GachaConfig {
    return {
      pickupIds: pickupId.value ? [pickupId.value] : [],
      pickupRateEach: PICKUP_RATE_EACH,
      guaranteeStar5: false,
    };
  }

  function spendDia(cost: number): boolean {
    if (blueDia.value < cost) return false;
    blueDia.value -= cost;
    return true;
  }

  function countResults(results: PullResult[]): void {
    totals.value.pulls += results.length;
    for (const r of results) {
      if (r.rarity === 5) totals.value.star5 += 1;
      else if (r.rarity === 4) totals.value.star4 += 1;
      else totals.value.star3 += 1;
    }
  }

  /** 引く。ダイヤ不足なら null */
  function pull(mode: PullMode): PullResult[] | null {
    const cost = mode === "ten" ? PULL_COST.ten : PULL_COST.single;
    if (!spendDia(cost)) return null;
    const c = config();
    const results =
      mode === "ten" ? pullTen(pools, c, Math.random) : [pullOne(pools, c, Math.random)];
    countResults(results);
    return results;
  }

  /** 課金: ブルーダイヤのパックを購入する(課金額に加算) */
  function buyPack(): void {
    blueDia.value += DIA_PACK.dia;
    spentYen.value += DIA_PACK.yen;
  }

  /** 石・課金額・履歴をすべて初期状態に戻す */
  function reset(): void {
    const d = defaults();
    blueDia.value = d.blueDia;
    spentYen.value = d.spentYen;
    totals.value = d.totals;
    pickupId.value = d.pickupId;
  }

  return {
    blueDia,
    spentYen,
    totals,
    pickupId,
    pools,
    config,
    pull,
    buyPack,
    reset,
  };
}
