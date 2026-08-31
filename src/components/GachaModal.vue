<script setup lang="ts">
import { computed, ref } from "vue";

import CardPicker from "./CardPicker.vue";
import { useGacha } from "../composables/useGacha";
import { useModalChrome } from "../composables/useModalChrome";
import { cardById } from "../data";
import type { GachaKind } from "../data/gacha";
import { DIA_PACK, GACHA_KINDS, PULL_COST, SUPPORT_PICK_COUNT } from "../data/gacha";
import type { PullResult } from "../engine/gacha";
import { formatScore, holomenName } from "../ui/labels";

const emit = defineEmits<{ close: [] }>();

useModalChrome(() => emit("close"));

const gacha = useGacha();
const kind = ref<GachaKind>("normal");
const lastResults = ref<PullResult[] | null>(null);
type PickerState = "pickup" | "support" | null;
const picker = ref<PickerState>(null);

const KIND_TAB_LABELS: Record<GachaKind, string> = {
  normal: "通常",
  pickup: "ピックアップ",
  support: "初心者応援",
  startdash: "★5確定",
};

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

/** ピックアップ対象の選択(全種類で同じ位置に置き、対象のないガチャでは disabled) */
const canPickTarget = computed(() => kind.value === "pickup" || kind.value === "support");
const targetLabel = computed(() =>
  kind.value === "support" ? "ピックアップ対象を3人選ぶ" : "ピックアップ対象を選ぶ",
);

function openTargetPicker(): void {
  if (!canPickTarget.value) return;
  picker.value = kind.value === "support" ? "support" : "pickup";
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

function doPull(mode: "single" | "ten"): void {
  const results = gacha.pull(kind.value, mode);
  if (results !== null) lastResults.value = results;
}

function doReset(): void {
  if (!window.confirm("仮想ガチャの石・課金額・履歴をすべてリセットします。よろしいですか?")) {
    return;
  }
  gacha.reset();
  lastResults.value = null;
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
              <div>
                <dt>ブルーダイヤ</dt>
                <dd>{{ formatScore(gacha.blueDia.value) }}</dd>
              </div>
              <button
                type="button"
                class="cell-action"
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
            <div class="wallet-cell">
              <div>
                <dt>課金額</dt>
                <dd>¥{{ formatScore(gacha.spentYen.value) }}</dd>
              </div>
              <button
                type="button"
                class="cell-action"
                aria-label="石・課金額・履歴をリセット"
                @click="doReset"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4.5 9a8 8 0 1 1-.5 5" />
                  <path d="M4 4v5h5" />
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
                class="target-button"
                :disabled="!canPickTarget"
                @click="openTargetPicker"
              >
                {{ targetLabel }}
              </button>
              <div class="pull-row">
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
          </div>
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
        title="ピックアップ対象を3人選ぶ"
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

/* ページヘッダ(.site-head)と同寸法・同文字サイズにする — 画面遷移でヘッダを揺らさない */
.sheet-head {
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  justify-content: space-between;
  padding: 16px;
}

.sheet-head h3 {
  font-size: 24px;
  font-weight: 900;
  line-height: 1.35;
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

/* 各セルは数値+対になる操作アイコン(ブルーダイヤ→課金、課金額→リセット) */
.wallet-cell {
  align-items: center;
  border-left: 1px solid var(--line);
  display: flex;
  gap: 8px;
  justify-content: space-between;
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

.cell-action {
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

/* ガチャの種類(縦タブ)+ 右側: 上半分にピックアップ選択、下半分に 1回 / 10連 */
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

/* 上半分=ピックアップ選択、下半分= 1回/10連。grid の 1fr/1fr で border の有無によらず等分する */
.pull-col {
  display: grid;
  flex: 1;
  gap: 8px;
  grid-template-rows: 1fr 1fr;
}

/* ボタン構成は全種類で同一(使えない操作は disabled で示す) */
.target-button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  padding: 0 8px;
  width: 100%;
}

.pull-row {
  display: flex;
  gap: 8px;
}

/* 1回 / 10連: 名称+コストの 2 行ラベル・等幅・同色(等価な選択肢なので階層をつけない) */
.pull-button {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  justify-content: center;
}

.target-button:disabled,
.pull-button:disabled,
.cell-action:disabled {
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
</style>
