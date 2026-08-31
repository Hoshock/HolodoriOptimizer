<script setup lang="ts">
import { computed, ref } from "vue";

import CardPicker from "./CardPicker.vue";
import { useGacha, todayString } from "../composables/useGacha";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById } from "../data";
import type { GachaKind } from "../data/gacha";
import {
  DIA_PACK,
  GACHA_KINDS,
  GACHA_RATES,
  GUARANTEED_SLOT_RATES,
  PICKUP_RATE_EACH,
  PITY_PULLS,
  PULL_COST,
  SUPPORT_PICK_COUNT,
  SUPPORT_RATE_EACH,
} from "../data/gacha";
import type { PullResult } from "../engine/gacha";
import { star5OtherRateEach } from "../engine/gacha";
import { formatScore, holomenName } from "../ui/labels";

const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const gacha = useGacha();
const kind = ref<GachaKind>("normal");
const lastResults = ref<PullResult[] | null>(null);
const message = ref<string | null>(null);
type PickerState = "pickup" | "support" | null;
const picker = ref<PickerState>(null);

const KIND_TAB_LABELS: Record<GachaKind, string> = {
  normal: "通常",
  pickup: "ピックアップ",
  support: "初心者応援",
  startdash: "★5確定",
};

const kindInfo = computed(() => GACHA_KINDS.find((k) => k.id === kind.value) ?? GACHA_KINDS[0]);

function formatPercent(rate: number, digits = 4): string {
  return `${(rate * 100).toFixed(digits).replace(/\.?0+$/, "")}%`;
}

/** ピックアップ対象以外の ★5 1 枚あたりの排出率(表示用) */
const otherStar5Rate = computed(() => star5OtherRateEach(gacha.pools, gacha.configFor(kind.value)));

const pickupCard = computed(() =>
  gacha.pickupId.value ? (cardById.get(gacha.pickupId.value) ?? null) : null,
);
const supportCards = computed(() =>
  gacha.supportIds.value
    .map((id) => cardById.get(id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined),
);

/** 初心者応援は 3 人まで: 上限到達時は未選択カードを選べなくする */
const supportDisabled = computed(() => {
  const map = new Map<string, string>();
  if (gacha.supportIds.value.length < SUPPORT_PICK_COUNT) return map;
  for (const card of gacha.pools.star5) {
    if (!gacha.supportIds.value.includes(card.id)) {
      map.set(
        card.id,
        `選べるのは ${String(SUPPORT_PICK_COUNT)} 人までです(解除すると選び直せます)`,
      );
    }
  }
  return map;
});

function onToggleSupport(cardId: string): void {
  const ids = gacha.supportIds.value;
  const index = ids.indexOf(cardId);
  if (index >= 0) {
    ids.splice(index, 1);
  } else if (ids.length < SUPPORT_PICK_COUNT) {
    ids.push(cardId);
  }
}

/** 対象未選択のガチャは引けない(ピックアップ・初心者応援) */
const needsTarget = computed(() => {
  if (kind.value === "pickup") return gacha.pickupId.value === null;
  if (kind.value === "support") return gacha.supportIds.value.length === 0;
  return false;
});

const totalDia = computed(() => gacha.redDia.value + gacha.blueDia.value);
const canSingle = computed(
  () => kind.value !== "startdash" && !needsTarget.value && totalDia.value >= PULL_COST.single,
);
const canTen = computed(() => {
  if (needsTarget.value) return false;
  if (kind.value === "startdash") {
    return !gacha.startDashUsed.value && gacha.blueDia.value >= PULL_COST.ten;
  }
  return totalDia.value >= PULL_COST.ten;
});
const discountAvailable = computed(
  () => kind.value === "normal" && gacha.discountUsedDate.value !== todayString(),
);
const canDiscount = computed(
  () => discountAvailable.value && gacha.blueDia.value >= PULL_COST.discountSingle,
);
const canExchange = computed(
  () => gacha.pickupPity.value >= PITY_PULLS && gacha.pickupId.value !== null,
);

function doPull(mode: "single" | "ten" | "discount"): void {
  message.value = null;
  const results = gacha.pull(kind.value, mode);
  if (results === null) {
    message.value = "ダイヤが足りないか、この枠は今は引けません。";
    return;
  }
  lastResults.value = results;
}

function doExchange(): void {
  message.value = null;
  const result = gacha.exchangePickup();
  if (result === null) return;
  lastResults.value = [result];
}

function doReset(): void {
  if (!window.confirm("仮想ガチャの石・課金額・履歴をすべてリセットします。よろしいですか?")) {
    return;
  }
  gacha.reset();
  lastResults.value = null;
  message.value = null;
}

function resultName(result: PullResult): string {
  if (result.rarity === 5) {
    const card = cardById.get(result.cardId);
    return card ? holomenName(card.holomenId) : result.cardId;
  }
  return holomenName(result.holomenId);
}

function resultCardName(result: PullResult): string | null {
  if (result.rarity !== 5) return null;
  return cardById.get(result.cardId)?.name ?? null;
}

function resultType(result: PullResult): string | null {
  if (result.rarity !== 5) return null;
  return cardById.get(result.cardId)?.type ?? null;
}

const KIND_KEYS: GachaKind[] = GACHA_KINDS.map((k) => k.id);
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="仮想ガチャ">
      <header class="sheet-head">
        <h3>仮想ガチャ</h3>
        <button type="button" class="close-button" aria-label="閉じる" @click="emit('close')">
          ✕
        </button>
      </header>

      <div class="body">
        <section class="block">
          <dl class="wallet">
            <div class="wallet-cell">
              <dt>レッドダイヤ(無償)</dt>
              <dd>{{ formatScore(gacha.redDia.value) }}</dd>
            </div>
            <div class="wallet-cell">
              <dt>ブルーダイヤ(有償)</dt>
              <dd>{{ formatScore(gacha.blueDia.value) }}</dd>
            </div>
            <div class="wallet-cell">
              <dt>課金額</dt>
              <dd>¥{{ formatScore(gacha.spentYen.value) }}</dd>
            </div>
          </dl>
          <button type="button" class="secondary-button wide" @click="gacha.buyPack">
            ブルーダイヤ×{{ formatScore(DIA_PACK.dia) }} を購入(¥{{ formatScore(DIA_PACK.yen) }})
          </button>
          <p class="hint">
            ショップの通常価格パック(1 個あたり約
            {{ (DIA_PACK.yen / DIA_PACK.dia).toFixed(2) }}
            円)。他の販売パックは価格未確認のため未収録。
          </p>
        </section>

        <section class="block">
          <div class="segment" role="radiogroup" aria-label="ガチャの種類(1つ選択)">
            <button
              v-for="k in KIND_KEYS"
              :key="k"
              type="button"
              class="seg"
              role="radio"
              :aria-checked="kind === k"
              :class="{ active: kind === k }"
              @click="kind = k"
            >
              {{ KIND_TAB_LABELS[k] }}
            </button>
          </div>
          <p class="hint">{{ kindInfo.name }} — {{ kindInfo.note }}</p>

          <template v-if="kind === 'pickup'">
            <button type="button" class="secondary-button wide" @click="picker = 'pickup'">
              ピックアップ対象を選ぶ
            </button>
            <p class="hint">
              対象:
              <template v-if="pickupCard">
                {{ holomenName(pickupCard.holomenId) }}「{{ pickupCard.name }}」({{
                  formatPercent(PICKUP_RATE_EACH)
                }})
              </template>
              <template v-else>未選択</template>
            </p>
          </template>
          <template v-else-if="kind === 'support'">
            <button type="button" class="secondary-button wide" @click="picker = 'support'">
              対象を {{ SUPPORT_PICK_COUNT }} 人選ぶ
            </button>
            <p class="hint">
              対象:
              <template v-if="supportCards.length > 0">
                {{ supportCards.map((c) => holomenName(c.holomenId)).join("・") }}(各
                {{ formatPercent(SUPPORT_RATE_EACH) }})
              </template>
              <template v-else>未選択</template>
            </p>
          </template>

          <p class="hint rates">
            提供割合: ★5 {{ formatPercent(GACHA_RATES.star5) }} / ★4
            {{ formatPercent(GACHA_RATES.star4) }} / ★3 {{ formatPercent(GACHA_RATES.star3) }}。
            <template v-if="kind === 'startdash'">10 連の 10 枚目は ★5 確定。</template>
            <template v-else>
              10 連の 10 枚目は ★4 以上確定(★5 {{ formatPercent(GUARANTEED_SLOT_RATES.star5) }} / ★4
              {{ formatPercent(GUARANTEED_SLOT_RATES.star4) }})。
            </template>
            <template v-if="kind === 'pickup' || kind === 'support'">
              対象以外の ★5 は各 {{ formatPercent(otherStar5Rate) }}。
            </template>
          </p>

          <div class="pull-buttons">
            <button type="button" class="primary-button" :disabled="!canTen" @click="doPull('ten')">
              {{
                kind === "startdash"
                  ? gacha.startDashUsed.value
                    ? "10連を引く(購入済み)"
                    : `10連を引く(ブルーダイヤ${formatScore(PULL_COST.ten)}・1回限り)`
                  : `10連を引く(ダイヤ${formatScore(PULL_COST.ten)})`
              }}
            </button>
            <div v-if="kind !== 'startdash'" class="pull-row">
              <button
                type="button"
                class="secondary-button grow"
                :disabled="!canSingle"
                @click="doPull('single')"
              >
                1回引く({{ formatScore(PULL_COST.single) }})
              </button>
              <button
                v-if="kind === 'normal'"
                type="button"
                class="secondary-button grow"
                :disabled="!canDiscount"
                @click="doPull('discount')"
              >
                {{
                  discountAvailable
                    ? `割引1回(ブルー${formatScore(PULL_COST.discountSingle)})`
                    : "割引1回(使用済み)"
                }}
              </button>
            </div>
          </div>
          <p v-if="needsTarget" class="hint">先に対象のカードを選んでください。</p>

          <div v-if="kind === 'pickup'" class="pity-row">
            <span class="hint pity-count"
              >ガチャPt: {{ formatScore(gacha.pickupPity.value) }} / {{ PITY_PULLS }}</span
            >
            <button
              type="button"
              class="secondary-button"
              :disabled="!canExchange"
              @click="doExchange"
            >
              対象と交換
            </button>
          </div>

          <p v-if="message" class="warn-text" role="alert">{{ message }}</p>
        </section>

        <section v-if="lastResults" class="block" aria-label="ガチャ結果">
          <h4>結果</h4>
          <div class="result-grid" role="list">
            <div
              v-for="(r, i) in lastResults"
              :key="i"
              role="listitem"
              class="result-tile"
              :class="r.rarity === 5 && resultType(r) ? `type-${resultType(r)}` : 'low'"
            >
              <span class="result-rarity" :class="`rarity-${r.rarity}`">★{{ r.rarity }}</span>
              <span class="result-name">{{ resultName(r) }}</span>
              <span class="result-card-name">{{ resultCardName(r) ?? "" }}</span>
            </div>
          </div>
          <p class="hint">
            累計 {{ formatScore(gacha.totals.value.pulls) }} 回(★5
            {{ formatScore(gacha.totals.value.star5) }} / ★4
            {{ formatScore(gacha.totals.value.star4) }} / ★3
            {{ formatScore(gacha.totals.value.star3) }})
          </p>
        </section>

        <section class="block">
          <button type="button" class="reset-button" @click="doReset">
            石・課金額・履歴をリセット
          </button>
          <p class="note">
            実際の課金・排出とは無関係の仮想シミュレーションです。確率・価格は 2026-08-31
            時点の攻略情報に基づく参考値で、★3・★4
            はカード名が未確認のためホロメン名で表示しています。
          </p>
        </section>
      </div>

      <CardPicker
        v-if="picker === 'pickup'"
        title="ピックアップ対象を選ぶ"
        mode="pick"
        skill-view="member"
        :selected-id="gacha.pickupId.value"
        @pick="
          (id) => {
            gacha.pickupId.value = id;
            picker = null;
          }
        "
        @close="picker = null"
      />
      <CardPicker
        v-else-if="picker === 'support'"
        :title="`対象を ${SUPPORT_PICK_COUNT} 人選ぶ`"
        mode="multi"
        skill-view="member"
        :selected-ids="gacha.supportIds.value"
        :disabled="supportDisabled"
        @toggle="onToggleSupport"
        @close="picker = null"
      />
    </div>
  </div>
</template>

<style scoped>
.overlay {
  background: rgba(35, 48, 61, 0.4);
  inset: 0;
  position: fixed;
  z-index: 10;
}

/* モバイルはフルスクリーンシート、広い画面では中央のダイアログ(ピッカーと同形) */
.sheet {
  background: var(--surface);
  box-shadow: var(--shadow-sheet);
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  width: 100%;
}

@media (min-width: 48rem) {
  .overlay {
    align-items: center;
    display: flex;
    justify-content: center;
    padding: 24px;
  }

  .sheet {
    border-radius: var(--r-m);
    height: min(85dvh, 46rem);
    max-width: 46rem;
  }
}

.sheet-head {
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-shrink: 0;
  justify-content: space-between;
  padding: 12px 16px 8px;
}

.sheet-head h3 {
  font-size: 18px;
  margin: 0;
}

.close-button {
  align-items: center;
  background: var(--bg);
  border: none;
  border-radius: 50%;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-size: 15px;
  height: 44px;
  justify-content: center;
  width: 44px;
}

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.block h4 {
  font-size: 15px;
  margin: 0 0 8px;
}

/* 所持ダイヤ・課金額: 3 等分の固定グリッド(数値は tabular-nums) */
.wallet {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 0 0 8px;
  overflow: hidden;
}

.wallet-cell {
  border-left: 1px solid var(--line);
  padding: 8px;
}

.wallet-cell:first-child {
  border-left: none;
}

/* ラベルは 1 行固定にして 3 セルの数値の縦位置を揃える */
.wallet-cell dt {
  color: var(--ink-2);
  font-size: 10px;
  white-space: nowrap;
}

.wallet-cell dd {
  font-feature-settings: "tnum";
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  margin: 0;
}

/* ガチャ種類: 4 分割セグメンテッドコントロール(ピッカーと同形) */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  overflow: hidden;
}

.seg {
  background: var(--surface);
  border: none;
  border-left: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  height: 40px;
  padding: 0 2px;
}

.seg:first-child {
  border-left: none;
}

.seg.active {
  background: var(--ink);
  color: #fff;
  font-weight: 700;
}

.hint {
  color: var(--ink-2);
  font-size: 13px;
  margin: 8px 0 0;
}

.rates {
  font-feature-settings: "tnum";
  font-variant-numeric: tabular-nums;
}

.warn-text {
  color: #b3261e;
  font-size: 13px;
  margin: 8px 0 0;
}

.primary-button {
  background: var(--primary);
  border: none;
  border-radius: var(--r-m);
  color: #fff;
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  height: 48px;
  padding: 0 24px;
  width: 100%;
}

.primary-button:active:not(:disabled) {
  background: var(--primary-press);
}

.primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.secondary-button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  padding: 0 16px;
}

.secondary-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

/* パネル内の主要操作は secondary でも全幅・中央揃え */
.secondary-button.wide {
  margin-top: 8px;
  width: 100%;
}

.secondary-button.grow {
  flex: 1;
  padding: 0 8px;
}

.pull-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.pull-row {
  display: flex;
  gap: 8px;
}

.pity-row {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-top: 8px;
}

.pity-count {
  font-feature-settings: "tnum";
  font-variant-numeric: tabular-nums;
  margin: 0;
}

/* 結果: 5 列の固定グリッド。タイル高さは文字列長で揺らさない */
.result-grid {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(5, 1fr);
}

.result-tile {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 84px;
  padding: 6px 4px;
  text-align: center;
}

.result-tile.low {
  background: var(--surface);
}

.result-tile.type-cute {
  background: var(--cute-tint);
  border-color: var(--cute-tint);
}

.result-tile.type-happy {
  background: var(--happy-tint);
  border-color: var(--happy-tint);
}

.result-tile.type-pure {
  background: var(--pure-tint);
  border-color: var(--pure-tint);
}

.result-rarity {
  font-size: 11px;
  font-weight: 700;
}

.result-rarity.rarity-5 {
  color: var(--gold);
}

.result-rarity.rarity-4,
.result-rarity.rarity-3 {
  color: var(--ink-2);
}

.result-name {
  display: -webkit-box;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.3;
  min-height: calc(11px * 1.3 * 2);
  overflow: hidden;
  word-break: break-all;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.result-card-name {
  color: var(--ink-2);
  display: -webkit-box;
  font-size: 10px;
  line-height: 1.3;
  min-height: calc(10px * 1.3 * 2);
  overflow: hidden;
  word-break: break-all;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.reset-button {
  background: none;
  border: none;
  color: var(--link);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  text-decoration: underline;
}

.note {
  color: var(--ink-2);
  font-size: 12px;
  margin: 8px 0 0;
}
</style>
