<script lang="ts">
import CloseButton from "./CloseButton.vue";
import type {
  CardRarity as CardRarityForMemory,
  CardType as CardTypeForMemory,
} from "../data/types";

/** モーダルを閉じても絞り込みを復元するための保持領域(memoryKey ごと。ページ再読み込みでリセット) */
interface PickerFilterMemory {
  query: string;
  rarity: CardRarityForMemory | null;
  affiliation: string | null;
  type: CardTypeForMemory | null;
  selectedOnly: boolean;
}
const filterMemory = new Map<string, PickerFilterMemory>();
</script>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watchEffect } from "vue";

import CardTile from "./CardTile.vue";
import SkillIcon from "./SkillIcon.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { useScrollTopOnChange } from "../composables/useScrollTopOnChange";
import { cards, holomen as allHolomen } from "../data";
import { BLOOM_MAX, bloomOf, cardAtBloom } from "../data/bloom";
import { isBloomTextVerified } from "../data/bloomEvidence";
import type { BloomMap } from "../data/bloom";
import type { Card, CardRarity, CardType } from "../data/types";
import {
  AFFILIATION_ORDER,
  affiliationName,
  affiliationsOfCard,
  matchesCardQuery,
  matchesHolomenQuery,
  sortCards,
  sortHolomenByOrder,
  TYPE_LABELS,
} from "../ui/labels";

const props = defineProps<{
  title: string;
  /** pick: 1 枚選んで閉じる / exclude: タップで除外トグル(複数) / multi: タップで登録トグル(複数) */
  mode: "pick" | "exclude" | "multi";
  /** タイルに出すスキル(リーダー選択= costume、メンバー・除外= member) */
  skillView: "costume" | "member";
  /** 選択候補のカードプール(省略時は全カード) */
  pool?: Card[];
  /**
   * レアリティ(★5 / ★4)の絞り込みを出す(既定は ★5。2026-10-09 ユーザー指示 — ADR-022)。
   * 立てるのは ★4 を選べる入口(リーダー・メンバーの固定・所持の登録・カード一覧)だけで、
   * 立てない入口(除外・候補の選択・ガチャのピックアップ・開花文言)は ★5 だけを出す — おまかせの候補は ★5 だけ
   */
  rarities?: boolean;
  selectedId?: string | null;
  /** multi: 登録済み(選択中)のカード ID */
  selectedIds?: string[];
  excludedIds?: string[];
  disabled?: Map<string, string>;
  /** カード ID → 開花段階(未登録は 0)。スキル文言の表示解決に使う */
  blooms?: BloomMap;
  /** multi: 登録済みカードに開花段階のステッパーを出す(所持ピッカー = Step 0)。開花はここでしか変えない */
  bloomControl?: boolean;
  /** pick: 開花段階のアイコンだけを出す(持っているカードモードのメンバーピッカー) */
  bloomBadge?: boolean;
  /** multi / exclude: 状態フィルタの選択済み側のラベル(既定は 除外中 / 登録済み) */
  selectedLabel?: string;
  /** multi: 選択済みのタイルに何番目かを ① ② … で出す(枠数が決まっている選択) */
  ordered?: boolean;
  /**
   * 状態(`selectedLabel`)に絞っているあいだ、検索・所属・レアリティ・タイプを止める(メンバーの固定だけ —
   * たかだか 5 枚なので全部見せる。2026-10-11 ユーザー指示。所持の登録など枚数の多い入口では止めず、ほかの絞り込みと重ねて効かせる)
   */
  stateLocksFilters?: boolean;
  /**
   * 実機確認(開花文言フォーム)をまだ通していないカードのスキル文言を淡色で出す。
   * カード一覧だけで立てる(2026-09-15 ユーザー指示)
   */
  dimUnverified?: boolean;
  /** 指定すると、閉じても絞り込み(検索・所属・タイプ・状態)を保持して次回復元する */
  memoryKey?: string;
  /**
   * pick: 1 行目の右半分に状態フィルタ(すべて / `selectedLabel`)を出し、渡した ID のカードだけに絞れるようにする
   * (カード一覧の「登録中」— 2026-10-11 ユーザー指示 — と、開発用の開花文言の「所持」。ほかの pick のピッカーは渡さない)
   */
  ownedIds?: string[];
  /**
   * pick: 1 行目の右半分に「すべて / ホロメン」の切り替えを出す（リーダーピッカーだけ。2026-09-30 ユーザー指示）。
   * 「ホロメン」では同じホロメンのカードを区別せず 1 人 1 行で並べ、選ぶと `pickHolomen`（そのホロメンの全カードからおまかせ）
   */
  holomenOption?: boolean;
  /** holomenOption: いま選んでいるホロメン（あれば「ホロメン」の表示で開く） */
  selectedHolomenId?: string | null;
}>();

const emit = defineEmits<{
  pick: [cardId: string];
  pickHolomen: [holomenId: string];
  toggle: [cardId: string];
  bloom: [cardId: string, delta: number];
  close: [];
}>();

const saved = props.memoryKey ? filterMemory.get(props.memoryKey) : undefined;
/** 検索語(ホロメン名・カード名とその読み・所属名。2026-10-11 ユーザー指示で 1 行目の左半分に戻した) */
const query = ref(saved?.query ?? "");
/** レアリティ: すべて / ★5 / ★4 の排他(null = すべて。既定は ★5。`rarities` を立てない入口は ★5 固定) */
const rarityFilter = ref<CardRarity | null>(saved === undefined ? 5 : saved.rarity);
/** 所属: 単一選択(null = すべて) */
const affiliationFilter = ref<string | null>(saved?.affiliation ?? null);
/** タイプ: セグメンテッドコントロール(単一選択、null = すべて) */
const typeFilter = ref<CardType | null>(saved?.type ?? null);
/** 状態: 選択済み(登録済み / 除外中)だけに絞る(multi / exclude のみ。既定はすべて) */
const selectedOnly = ref(saved?.selectedOnly ?? false);
/**
 * 「ホロメン」の表示か（holomenOption のときだけ。1 行目の右半分の切り替え）。タイプ・レアリティの絞り込みとは両立しない:
 * 「ホロメン」にしているあいだ、タイプとレアリティは効かず disabled（下の `typeLocked` / `rarityLocked`）。
 * タイプを選んでいても「ホロメン」は選べる（2026-10-09 ユーザー指示「キュートとか選ぶとホロメン選べない」）
 */
const holomenView = ref(props.holomenOption === true && (props.selectedHolomenId ?? null) !== null);
const sheet = useTemplateRef("sheet");
const grid = useTemplateRef("grid");
/** 絞り込みを切り替えたら一覧を先頭へ戻す(選択のトグルでは動かさない) */
useScrollTopOnChange(grid, [
  query,
  rarityFilter,
  affiliationFilter,
  typeFilter,
  selectedOnly,
  holomenView,
]);
/** 状態フィルタを出すか: 複数選択・除外のピッカーは常に、1 枚選ぶピッカーは ownedIds を渡したときだけ */
const hasStateFilter = computed(() => props.mode !== "pick" || props.ownedIds !== undefined);
/** 1 行目の右半分に切り替え(状態 / 「すべて / ホロメン」)を置くか。ないときは検索欄が 1 行を占める */
const hasRowToggle = computed(() => hasStateFilter.value || props.holomenOption === true);
/**
 * 連動して効かなくなる絞り込み。**止めているあいだは効いている値(検索は空・ほかは「すべて」)を見せて disabled にし、
 * 選んでいた値は覚えておいて、止める理由が外れたら戻す**(2026-10-11 ユーザー指示「元々選択していたフィルタのまま disable に
 * なるのではなく、正しい状態を表しつつ disable になってほしい。解除したら戻ること」。それまでは選んだ値の見た目のまま薄くしていた)。
 * - 状態に絞っているあいだ(メンバーの固定だけ — `stateLocksFilters`): 検索・所属・レアリティ・タイプ
 * - 「ホロメン」の表示のあいだ: レアリティ(ホロメンを選ぶと ★4 も含む全カードからおまかせなので、絞ると選べるホロメンが隠れる)と
 *   タイプ(行がホロメンなので) — 2026-10-09 ユーザー指示
 */
const stateLocked = computed(
  () => props.stateLocksFilters === true && selectedOnly.value && hasStateFilter.value,
);
const rarityLocked = computed(() => stateLocked.value || holomenView.value);
const typeLocked = computed(() => stateLocked.value || holomenView.value);
/** 効いている値(画面に見せる値も同じ) */
const effectiveQuery = computed(() => (stateLocked.value ? "" : query.value));
const effectiveAffiliation = computed(() => (stateLocked.value ? null : affiliationFilter.value));
const effectiveType = computed(() => (typeLocked.value ? null : typeFilter.value));
/** null = すべて(`rarities` を立てない入口は ★5 だけ) */
const effectiveRarity = computed<CardRarity | null>(() =>
  props.rarities ? (rarityLocked.value ? null : rarityFilter.value) : 5,
);
const ownedSet = computed(() => new Set(props.ownedIds ?? []));
const selectedLabel = computed(
  () => props.selectedLabel ?? (props.mode === "exclude" ? "除外中" : "登録済み"),
);

watchEffect(() => {
  if (!props.memoryKey) return;
  filterMemory.set(props.memoryKey, {
    query: query.value,
    rarity: rarityFilter.value,
    affiliation: affiliationFilter.value,
    type: typeFilter.value,
    selectedOnly: selectedOnly.value,
  });
});

/**
 * 開いた時点で選択中のカードをリストの先頭にフィーチャーする(単一選択のみ)。
 * 持ち上げは開いた瞬間の 1 回だけで、開いている間に並びは動かさない
 */
const featuredId = props.mode === "pick" ? (props.selectedId ?? null) : null;

/** プールのうち、いまのレアリティのカード */
const inRarity = computed(() =>
  (props.pool ?? cards).filter(
    (c) => effectiveRarity.value === null || c.rarity === effectiveRarity.value,
  ),
);

const filtered = computed(() => {
  let list = inRarity.value.filter((c) => matchesCardQuery(c, effectiveQuery.value));
  const aff = effectiveAffiliation.value;
  if (aff !== null) list = list.filter((c) => affiliationsOfCard(c).includes(aff));
  if (effectiveType.value !== null) list = list.filter((c) => c.type === effectiveType.value);
  if (selectedOnly.value && hasStateFilter.value) {
    list = list.filter((c) =>
      props.mode === "pick"
        ? ownedSet.value.has(c.id)
        : props.mode === "exclude"
          ? isExcluded(c)
          : isSelected(c),
    );
  }
  const sorted = sortCards(list);
  if (featuredId !== null) {
    const index = sorted.findIndex((c) => c.id === featuredId);
    if (index > 0) {
      const [featured] = sorted.splice(index, 1);
      if (featured) sorted.unshift(featured);
    }
  }
  return sorted;
});

/** 「ホロメン」の表示の行: プール内にカードがあるホロメン（レアリティは効かない。検索と所属で絞り、ホロメン順） */
const holomenRows = computed(() => {
  const inPool = new Set(inRarity.value.map((c) => c.holomenId));
  let list = allHolomen.filter(
    (h) => inPool.has(h.id) && matchesHolomenQuery(h, effectiveQuery.value),
  );
  const aff = effectiveAffiliation.value;
  if (aff !== null) list = list.filter((h) => h.affiliations.includes(aff));
  return sortHolomenByOrder(list).map((h) => {
    // そのホロメンの選べるカードが 1 枚もないとき（おかゆモード）だけ選べない
    const own = inRarity.value.filter((c) => c.holomenId === h.id);
    const reasons = own.map((c) => props.disabled?.get(c.id));
    const disabledReason = reasons.every((r) => r !== undefined) ? reasons[0] : undefined;
    return { id: h.id, name: h.name, disabledReason };
  });
});

function isExcluded(card: Card): boolean {
  return props.excludedIds?.includes(card.id) ?? false;
}

function isSelected(card: Card): boolean {
  if (props.mode === "pick") return props.selectedId === card.id;
  if (props.mode === "multi") return props.selectedIds?.includes(card.id) ?? false;
  return false;
}

/** ordered のとき、選択済みカードの通し番号(1 始まり。未選択は null) */
function orderOf(card: Card): number | null {
  if (!props.ordered) return null;
  const index = props.selectedIds?.indexOf(card.id) ?? -1;
  return index < 0 ? null : index + 1;
}

/**
 * 表示するカード(スキル文言を開花段階に解決したもの)。id 等は元と同じ。
 * `blooms` を渡さない入口(カード一覧・ガチャのピックアップ・開花文言)は開花段階を扱わないので
 * **最大段階(5凸)の文言**で出す — 0凸として解決すると記録のない段階が「未確認」ばかりになる
 * (2026-09-15 ユーザー指示「カード一覧のページに関しては5凸の情報を書いておこう」)。
 * メンバーピッカーは `blooms` を受け取る側で、さがすの前提が「いまの育成で」なら所持カードの段階、
 * 育てきったら・全カードでは全カード 5凸(OptimizerPanel の currentBlooms)になる
 */
function displayCard(card: Card): Card {
  if (!props.blooms) return cardAtBloom(card, BLOOM_MAX);
  return cardAtBloom(card, bloomOf(props.blooms, card.id));
}

function activate(card: Card): void {
  if (props.mode === "pick") {
    emit("pick", card.id);
  } else {
    emit("toggle", card.id);
  }
}

useModalChrome(() => emit("close"));
// フォーカスはシート自体へ(入力欄に当てるとモバイルでキーボードが開いてしまう)
onMounted(() => {
  void nextTick(() => sheet.value?.focus());
});

const TYPE_KEYS: CardType[] = ["cute", "happy", "pure"];
/** レアリティの並び(左から すべて / ★5 / ★4。既定は ★5) */
const RARITY_KEYS: (CardRarity | null)[] = [null, 5, 4];
/**
 * タイプがレアリティと 1 行を分け合う入口(`rarities`)は頭文字 1 字(2026-09-11 ユーザー指示「左半分がすべて、C、H、P」)。
 * レアリティのない入口はタイプが 1 行を占めるので名前のまま
 */
const TYPE_SHORT: Record<CardType, string> = { cute: "C", happy: "H", pure: "P" };
const typeText = (t: CardType): string => (props.rarities ? TYPE_SHORT[t] : TYPE_LABELS[t]);
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div
      ref="sheet"
      class="sheet"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      :aria-label="props.title"
    >
      <header class="sheet-head">
        <h3>{{ props.title }}</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <!--
        絞り込みは 3 行(2026-10-11 ユーザー指示。カード一覧・リーダー・メンバー・所持の登録で同じ形):
        1 行目 = 左半分に検索欄・右半分に切り替え(状態「すべて / 登録中・固定中・除外中・所持」か、リーダーの「すべて / ホロメン」。
        切り替えのない入口は検索欄が 1 行を占める)/ 2 行目 = 所属 / 3 行目 = 左半分にレアリティ・右半分にタイプ(すべて / C / H / P。
        レアリティのない入口はタイプが 1 行を占め、名前のまま)。連動して効かない絞り込みは、効いている値を見せて disabled
      -->
      <div class="controls">
        <div class="filter-row" :class="{ single: !hasRowToggle }">
          <input
            type="search"
            class="search"
            placeholder="名前で検索"
            aria-label="ホロメン名・カード名で検索"
            :value="effectiveQuery"
            :disabled="stateLocked"
            @input="query = ($event.target as HTMLInputElement).value"
          />
          <div
            v-if="props.holomenOption"
            class="segment state-segment"
            role="radiogroup"
            aria-label="表示する単位（1つ選択）"
          >
            <button
              type="button"
              class="seg"
              role="radio"
              :aria-checked="!holomenView"
              :class="{ 'seg-all-active': !holomenView }"
              @click="holomenView = false"
            >
              すべて
            </button>
            <button
              type="button"
              class="seg"
              role="radio"
              :aria-checked="holomenView"
              :class="{ 'seg-all-active': holomenView }"
              @click="holomenView = true"
            >
              ホロメン
            </button>
          </div>
          <div
            v-else-if="hasStateFilter"
            class="segment state-segment"
            role="radiogroup"
            :aria-label="
              props.mode === 'pick'
                ? `${selectedLabel}で絞り込み（1つ選択）`
                : '選択状態で絞り込み（1つ選択）'
            "
          >
            <button
              type="button"
              class="seg"
              role="radio"
              :aria-checked="!selectedOnly"
              :class="{ 'seg-all-active': !selectedOnly }"
              @click="selectedOnly = false"
            >
              すべて
            </button>
            <button
              type="button"
              class="seg"
              role="radio"
              :aria-checked="selectedOnly"
              :class="{ 'seg-all-active': selectedOnly }"
              @click="selectedOnly = true"
            >
              {{ selectedLabel }}
            </button>
          </div>
        </div>

        <div class="chip-scroll-wrap" :class="{ 'is-disabled': stateLocked }">
          <div class="chip-scroll" role="radiogroup" aria-label="所属で絞り込み（1つ選択）">
            <button
              type="button"
              class="chip"
              role="radio"
              :aria-checked="effectiveAffiliation === null"
              :class="{ active: effectiveAffiliation === null }"
              :disabled="stateLocked"
              @click="affiliationFilter = null"
            >
              すべて
            </button>
            <button
              v-for="aff in AFFILIATION_ORDER"
              :key="aff"
              type="button"
              class="chip"
              role="radio"
              :aria-checked="effectiveAffiliation === aff"
              :class="{ active: effectiveAffiliation === aff }"
              :disabled="stateLocked"
              @click="affiliationFilter = aff"
            >
              {{ affiliationName(aff) }}
            </button>
          </div>
        </div>

        <div class="filter-row" :class="{ single: !props.rarities }">
          <!-- ★4 を選べない入口(`rarities` なし)では出さず ★5 だけを並べる -->
          <div
            v-if="props.rarities"
            class="segment rarity-segment"
            :class="{ 'is-disabled': rarityLocked }"
            role="radiogroup"
            aria-label="レアリティで絞り込み（1つ選択）"
          >
            <button
              v-for="r in RARITY_KEYS"
              :key="r ?? 'all'"
              type="button"
              class="seg"
              role="radio"
              :aria-checked="effectiveRarity === r"
              :aria-label="r === null ? 'すべて' : `★${r}`"
              :class="{ 'seg-all-active': effectiveRarity === r }"
              :disabled="rarityLocked"
              @click="rarityFilter = r"
            >
              <template v-if="r === null">すべて</template>
              <SkillIcon v-else kind="rarity" :count="r" />
            </button>
          </div>
          <div
            class="segment type-segment"
            :class="{ 'is-disabled': typeLocked }"
            role="radiogroup"
            aria-label="タイプで絞り込み（1つ選択）"
          >
            <button
              type="button"
              class="seg"
              role="radio"
              :aria-checked="effectiveType === null"
              :class="{ 'seg-all-active': effectiveType === null }"
              :disabled="typeLocked"
              @click="typeFilter = null"
            >
              すべて
            </button>
            <button
              v-for="t in TYPE_KEYS"
              :key="t"
              type="button"
              class="seg"
              role="radio"
              :aria-checked="effectiveType === t"
              :aria-label="TYPE_LABELS[t]"
              :class="{ 'seg-all-active': effectiveType === t }"
              :disabled="typeLocked"
              @click="typeFilter = t"
            >
              {{ typeText(t) }}
            </button>
          </div>
        </div>
      </div>

      <!-- 「ホロメン」の表示: ホロメンボードのピッカーと同じ行（解放マスのアイコンなし）。同じホロメンのカードは 1 行にまとまる -->
      <div v-if="holomenView" ref="grid" class="holomen-list" role="list">
        <button
          v-for="h in holomenRows"
          :key="h.id"
          type="button"
          class="holomen-row"
          role="listitem"
          :class="{ 'is-selected': props.selectedHolomenId === h.id }"
          :disabled="h.disabledReason !== undefined"
          :title="h.disabledReason"
          @click="emit('pickHolomen', h.id)"
        >
          <span class="holomen-name">{{ h.name }}</span>
        </button>
        <p v-if="holomenRows.length === 0" class="empty">条件に合うホロメンがいません</p>
      </div>
      <div v-else ref="grid" class="grid" role="list">
        <CardTile
          v-for="card in filtered"
          :key="card.id"
          role="listitem"
          :card="displayCard(card)"
          :skill-view="props.skillView"
          :selected="isSelected(card)"
          :order="orderOf(card)"
          :excluded="isExcluded(card)"
          :disabled="props.disabled?.has(card.id) ?? false"
          :disabled-reason="props.disabled?.get(card.id)"
          :bloom-control="props.bloomControl"
          :bloom="bloomOf(props.blooms, card.id)"
          :bloom-badge="props.bloomBadge"
          :dim-skills="props.dimUnverified === true && !isBloomTextVerified(card.id)"
          @activate="activate(card)"
          @bloom-change="(delta) => emit('bloom', card.id, delta)"
        />
        <p v-if="filtered.length === 0" class="empty">条件に合うカードがありません</p>
      </div>

      <!-- 複数選択のピッカーは下端に「確認」を固定する(タップで登録・解除するだけの画面に終わりの操作を置く — 2026-09-11 ユーザー指示) -->
      <div v-if="props.mode !== 'pick'" class="sheet-foot">
        <button type="button" class="primary-button" @click="emit('close')">確認</button>
      </div>
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

/* モバイルはフルスクリーンシート、広い画面では中央のダイアログ */
.sheet {
  background: var(--surface);
  box-shadow: var(--shadow-sheet);
  display: flex;
  flex-direction: column;
  height: 100dvh;
  outline: none; /* 開いた直後のフォーカス先(tabindex=-1)なのでリングを出さない */
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

/* ページヘッダ(App.vue .site-head)と同寸法・同文字サイズ: 開いたときにヘッダの高さが変わらない(2026-09-05) */
.sheet-head {
  align-items: center;
  background: var(--chrome-head);
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
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * ピッカーは白い 1 枚のシート(ヘッダ → 絞り込み → 一覧)。カードの入れ子や内側スクロールにしない
 * (カードスタイル案は「キモすぎるしわかりにくすぎる」で却下 — 2026-09-05)。
 * 部品(タイル・曲行)はメインのパネルと同じ固定高で、幅はシート幅に従う
 */
.controls {
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 8px;
  padding: 12px 16px;
}

/* 所属: 横スクロール 1 行チップ。右端フェードでスクロール可能性を示す */
.chip-scroll-wrap {
  margin-right: -16px;
  position: relative;
}

.chip-scroll-wrap::after {
  background: linear-gradient(to left, var(--surface), transparent);
  content: "";
  height: 100%;
  pointer-events: none;
  position: absolute;
  right: 0;
  top: 0;
  width: 24px;
}

.chip-scroll {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-right: 24px;
  scrollbar-width: none;
  white-space: nowrap;
}

.chip-scroll::-webkit-scrollbar {
  display: none;
}

.chip {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  color: var(--ink-2);
  cursor: pointer;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  height: 32px;
  padding: 0 14px;
}

.chip.active {
  background: var(--selected);
  border-color: var(--ink);
  color: var(--selected-ink);
}

/* タイプ: 4 分割セグメンテッドコントロール(単一選択) */
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
  font-size: 13px;
  font-weight: 600;
  height: 40px;
}

.seg:first-child {
  border-left: none;
}

/* 1 行目(検索 | 切り替え)と 3 行目(レアリティ | タイプ)は左右半分。相手のない入口は 1 つで 1 行を占める */
.filter-row {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr 1fr;
}

.filter-row.single {
  grid-template-columns: 1fr;
}

.filter-row .seg {
  padding: 0;
}

/* 検索欄は隣のセグメント(40px + 枠)と同じ高さ。文字は iOS の自動ズーム防止のため 16px 未満にしない */
.search {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink);
  font-size: 16px;
  height: 42px;
  min-width: 0;
  padding: 0 12px;
  width: 100%;
}

.search:focus {
  border-color: var(--link);
  outline: 2px solid var(--link);
  outline-offset: -1px;
}

.search:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

/* 状態(すべて / 登録中・固定中・除外中): 2 分割 */
.state-segment {
  grid-template-columns: 1fr 1fr;
}

/* レアリティ(すべて / ★5 / ★4): 3 分割。★ は星のアイコン */
.rarity-segment {
  grid-template-columns: 1fr 1fr 1fr;
}

.rarity-segment .seg {
  align-items: center;
  display: flex;
  justify-content: center;
}

/* 選択中は星のアイコンも反転させる(SkillIcon が自前で --ink-2 を持つので :deep で上書きする) */
.seg-all-active :deep(.skill-icon) {
  color: var(--selected-ink);
}

.seg-all-active {
  background: var(--selected);
  color: var(--selected-ink);
  font-weight: 700;
}

/* 連動して効かない絞り込みは、効いている値(すべて)を見せて薄くする(メンバーの固定で固定中に絞っているあいだの所属・レアリティ・タイプ、「ホロメン」のあいだのレアリティ・タイプ) */
.segment.is-disabled,
.chip-scroll-wrap.is-disabled {
  opacity: 0.45;
}

.chip:disabled {
  cursor: not-allowed;
}

.seg:disabled {
  cursor: not-allowed;
}

/* 「ホロメン」の表示: 1 行 1 人。ホロメンボードのピッカー（HolomenPicker）の行と同じ寸法で、解放マスのアイコンだけない */
.holomen-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 16px 16px;
}

.holomen-row {
  align-items: center;
  background: var(--surface);
  border: none;
  border-bottom: 1px solid var(--line);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  height: 56px;
  justify-content: space-between;
  padding: 0 4px;
  text-align: left;
  width: 100%;
}

.holomen-row:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.holomen-row.is-selected {
  background: var(--bg);
}

.holomen-name {
  font-size: 16px;
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 1 行 1 枚の縦リスト(タイルがスキル情報を持つため) */
.grid {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 16px 16px;
}

.empty {
  color: var(--ink-2);
  text-align: center;
}

/* 下端の固定エリア(結果詳細と同形)。地は --chrome-foot、上に罫線 */
.sheet-foot {
  background: var(--chrome-foot);
  border-top: 1px solid var(--line);
  flex-shrink: 0;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
}

/* 確認ボタンはメイン画面の実行ボタンと同じ寸法・色 */
.primary-button {
  background: var(--action);
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
</style>
