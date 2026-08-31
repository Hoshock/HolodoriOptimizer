import { ref, watch } from "vue";

import { cards, holomen } from "../data";
import type { GachaKind } from "../data/gacha";
import {
  DIA_PACK,
  PICKUP_RATE_EACH,
  PITY_PULLS,
  PULL_COST,
  SUPPORT_RATE_EACH,
} from "../data/gacha";
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
  /** ピックアップガチャの累計ガチャ Pt(対象変更でリセット = 別バナー扱い) */
  pickupPity: number;
  pickupId: string | null;
  supportIds: string[];
  startDashUsed: boolean;
}

function defaults(): PersistedState {
  return {
    blueDia: 0,
    spentYen: 0,
    totals: { pulls: 0, star3: 0, star4: 0, star5: 0 },
    pickupPity: 0,
    pickupId: null,
    supportIds: [],
    startDashUsed: false,
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
      pickupPity: asNumber(o.pickupPity, 0),
      pickupId: validCardId(o.pickupId) ? o.pickupId : null,
      supportIds: Array.isArray(o.supportIds) ? o.supportIds.filter(validCardId) : [],
      startDashUsed: o.startDashUsed === true,
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
  const pickupPity = ref(initial.pickupPity);
  const pickupId = ref<string | null>(initial.pickupId);
  const supportIds = ref<string[]>(initial.supportIds);
  const startDashUsed = ref(initial.startDashUsed);

  watch(
    [blueDia, spentYen, totals, pickupPity, pickupId, supportIds, startDashUsed],
    () => {
      const state: PersistedState = {
        blueDia: blueDia.value,
        spentYen: spentYen.value,
        totals: totals.value,
        pickupPity: pickupPity.value,
        pickupId: pickupId.value,
        supportIds: [...supportIds.value],
        startDashUsed: startDashUsed.value,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // 保存できない環境(プライベートブラウズ等)でも動作は継続する
      }
    },
    { deep: true },
  );

  // ピックアップ対象の変更は別バナー扱いなのでガチャ Pt をリセットする
  watch(pickupId, (next, prev) => {
    if (next !== prev) pickupPity.value = 0;
  });

  const pools: GachaPools = {
    star5: cards,
    lowRarityHolomenIds: holomen.map((h) => h.id),
  };

  function configFor(kind: GachaKind): GachaConfig {
    if (kind === "pickup") {
      return {
        pickupIds: pickupId.value ? [pickupId.value] : [],
        pickupRateEach: PICKUP_RATE_EACH,
        guaranteeStar5: false,
      };
    }
    if (kind === "support") {
      return {
        pickupIds: [...supportIds.value],
        pickupRateEach: SUPPORT_RATE_EACH,
        guaranteeStar5: false,
      };
    }
    return { pickupIds: [], pickupRateEach: 0, guaranteeStar5: kind === "startdash" };
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

  /** 引く。ダイヤ不足・制約(スタートダッシュは 10 連 1 回限り)に反する場合は null */
  function pull(kind: GachaKind, mode: PullMode): PullResult[] | null {
    if (kind === "startdash") {
      if (mode !== "ten" || startDashUsed.value) return null;
      if (!spendDia(PULL_COST.ten)) return null;
      startDashUsed.value = true;
    } else {
      const cost = mode === "ten" ? PULL_COST.ten : PULL_COST.single;
      if (!spendDia(cost)) return null;
    }
    const config = configFor(kind);
    const results =
      mode === "ten" ? pullTen(pools, config, Math.random) : [pullOne(pools, config, Math.random)];
    countResults(results);
    if (kind === "pickup") pickupPity.value += results.length;
    return results;
  }

  /** 天井交換: ガチャ Pt 200 でピックアップ対象と交換する */
  function exchangePickup(): PullResult | null {
    if (pickupPity.value < PITY_PULLS || pickupId.value === null) return null;
    pickupPity.value -= PITY_PULLS;
    totals.value.star5 += 1;
    return { rarity: 5, cardId: pickupId.value, pickup: true };
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
    pickupPity.value = d.pickupPity;
    pickupId.value = d.pickupId;
    supportIds.value = d.supportIds;
    startDashUsed.value = d.startDashUsed;
  }

  return {
    blueDia,
    spentYen,
    totals,
    pickupPity,
    pickupId,
    supportIds,
    startDashUsed,
    pools,
    configFor,
    pull,
    exchangePickup,
    buyPack,
    reset,
  };
}
