<script setup lang="ts">
import { computed, ref } from "vue";

import CardPicker from "./CardPicker.vue";
import { useGacha } from "../composables/useGacha";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById } from "../data";
import type { GachaKind } from "../data/gacha";
import { DIA_PACK, GACHA_KINDS, PITY_PULLS, PULL_COST, SUPPORT_PICK_COUNT } from "../data/gacha";
import type { PullResult } from "../engine/gacha";
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

const canSingle = computed(
  () => kind.value !== "startdash" && !needsTarget.value && gacha.blueDia.value >= PULL_COST.single,
);
const canTen = computed(() => {
  if (needsTarget.value) return false;
  if (kind.value === "startdash" && gacha.startDashUsed.value) return false;
  return gacha.blueDia.value >= PULL_COST.ten;
});
const canExchange = computed(
  () => gacha.pickupPity.value >= PITY_PULLS && gacha.pickupId.value !== null,
);

function doPull(mode: "single" | "ten"): void {
  message.value = null;
  const results = gacha.pull(kind.value, mode);
  if (results === null) {
    message.value = "ブルーダイヤが足りません。";
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
              <dt>ブルーダイヤ</dt>
              <dd>{{ formatScore(gacha.blueDia.value) }}</dd>
            </div>
            <div class="wallet-cell pay-cell">
              <div>
                <dt>課金額</dt>
                <dd>¥{{ formatScore(gacha.spentYen.value) }}</dd>
              </div>
              <button
                type="button"
                class="pay-button"
                :aria-label="`課金してブルーダイヤ×${formatScore(DIA_PACK.dia)} を購入(¥${formatScore(DIA_PACK.yen)})`"
                @click="gacha.buyPack"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
              </button>
            </div>
          </dl>
        </section>

        <section class="block">
          <div class="gacha-layout">
            <div class="kind-tabs" role="radiogroup" aria-label="ガチャの種類(1つ選択)">
              <button
                v-for="k in KIND_KEYS"
                :key="k"
                type="button"
                class="kind-tab"
                role="radio"
                :aria-checked="kind === k"
                :class="{ active: kind === k }"
                @click="kind = k"
              >
                {{ KIND_TAB_LABELS[k] }}
              </button>
            </div>
            <div class="pull-col">
              <button
                type="button"
                class="pull-button single"
                :disabled="!canSingle"
                @click="doPull('single')"
              >
                <span class="pull-name">1回</span>
                <span class="pull-cost">{{ formatScore(PULL_COST.single) }}</span>
              </button>
              <button
                type="button"
                class="pull-button ten"
                :disabled="!canTen"
                @click="doPull('ten')"
              >
                <span class="pull-name">10連</span>
                <span class="pull-cost">{{ formatScore(PULL_COST.ten) }}</span>
              </button>
            </div>
          </div>
          <p class="hint">{{ kindInfo.note }}</p>

          <template v-if="kind === 'pickup'">
            <button type="button" class="secondary-button wide" @click="picker = 'pickup'">
              ピックアップ対象を選ぶ
            </button>
            <p class="hint">
              対象:
              <template v-if="pickupCard">
                {{ holomenName(pickupCard.holomenId) }}「{{ pickupCard.name }}」
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
                {{ supportCards.map((c) => holomenName(c.holomenId)).join("・") }}
              </template>
              <template v-else>未選択</template>
            </p>
          </template>

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

/* 所持ダイヤ・課金額: 2 等分の固定グリッド(数値は tabular-nums) */
.wallet {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  margin: 0;
  overflow: hidden;
}

.wallet-cell {
  border-left: 1px solid var(--line);
  padding: 8px;
}

.wallet-cell:first-child {
  border-left: none;
}

/* ラベルは 1 行固定にしてセルの数値の縦位置を揃える */
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

/* 課金額の隣に課金(購入)アイコンを置く */
.pay-cell {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.pay-button {
  align-items: center;
  background: var(--bg);
  border: none;
  border-radius: 50%;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  height: 40px;
  justify-content: center;
  width: 40px;
}

/* ガチャの種類(縦タブ)+ 右側に 1回 / 10連(2 行・等幅) */
.gacha-layout {
  display: flex;
  gap: 8px;
}

.kind-tabs {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  overflow: hidden;
}

.kind-tab {
  background: var(--surface);
  border: none;
  border-top: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  min-height: 44px;
  padding: 0 14px;
}

.kind-tab:first-child {
  border-top: none;
}

.kind-tab.active {
  background: var(--ink);
  color: #fff;
  font-weight: 700;
}

.pull-col {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
}

/* 1回 / 10連: 名称+コストの 2 行ラベル・同幅同高。階層は背景色(白/濃色)で分ける */
.pull-button {
  align-items: center;
  border-radius: var(--r-m);
  cursor: pointer;
  display: flex;
  flex: 1 1 0; /* basis 0 で 2 つのボタンの高さを揃える(border の有無で揺らさない) */
  flex-direction: column;
  justify-content: center;
  width: 100%;
}

.pull-button.single {
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink);
}

.pull-button.ten {
  background: var(--primary);
  border: 1px solid transparent; /* single 側の 1px ボーダーと外形高さを揃える */
  color: #fff;
}

.pull-button.ten:active:not(:disabled) {
  background: var(--primary-press);
}

.pull-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.pull-name {
  font-size: 16px;
  font-weight: 700;
}

.pull-cost {
  font-feature-settings: "tnum";
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.hint {
  color: var(--ink-2);
  font-size: 13px;
  margin: 8px 0 0;
}

.warn-text {
  color: #b3261e;
  font-size: 13px;
  margin: 8px 0 0;
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
