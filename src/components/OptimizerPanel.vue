<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";

import BoardSheet from "./BoardSheet.vue";
import CardPicker from "./CardPicker.vue";
import HolomenPicker from "./HolomenPicker.vue";
import PageCarousel from "./PageCarousel.vue";
import ResultDetail from "./ResultDetail.vue";
import ResultList from "./ResultList.vue";
import SongPicker from "./SongPicker.vue";
import SongRow from "./SongRow.vue";
import UnitSlot from "./UnitSlot.vue";
import { OKAYU_HOLOMEN_ID, okayuCardIds, useOkayuMode } from "../composables/useOkayuMode";
import { useOptimizer } from "../composables/useOptimizer";
import { cardById, cards, songById } from "../data";
import { BLOOM_MAX } from "../data/bloom";
import { accountGreenEffects } from "../data/greenBoard";
import type { GreenBoardEffects } from "../data/greenBoard";
import type { BloomMap } from "../data/bloom";
import { resolveCard } from "../data/resolve";
import type { Card } from "../data/types";
import { loadBoards, saveBoards, toBoardMap } from "../storage/boards";
import type { BoardColor, BoardEntry, BoardMap } from "../storage/boards";
import { loadOwned, saveOwned } from "../storage/owned";
import type { OwnedCard } from "../storage/owned";
import { holomenName } from "../ui/labels";

const MEMBER_SLOTS = 5;
/** 「全カード」の保存先(true = 全カードからさがす。UI は「持っているカードのみからさがす」の反転で、既定は持っているカードのみ — 2026-09-08) */
const SEARCH_ALL_STORAGE_KEY = "holodori-optimizer:search-all";
/** Step 5 のオプション(育成の反映・スキル発動条件)の保存先 */
const SEARCH_OPTIONS_STORAGE_KEY = "holodori-optimizer:search-options";
/** 旧キー(衣装・パッシブの 2 件だけを持っていた 2026-09-05〜06 の形式)。読み込みのみ */
const LEGACY_SKILL_FILTER_STORAGE_KEY = "holodori-optimizer:skill-filters";

interface SearchOptions {
  /** 登録したホロメンボードを反映する(持っているカードのときのみ効く) */
  board: boolean;
  /** 登録した開花段階を反映する(持っているカードのときのみ効く) */
  bloom: boolean;
  /** 衣装スキルが発動する編成だけ */
  costume: boolean;
  /** パッシブが全員発動する編成だけ */
  passives: boolean;
}

function readStoredObject(key: string): Record<string, unknown> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 既定はすべて ON。新キーがなければ旧キーの衣装・パッシブを引き継ぐ。壊れていれば既定値 */
function loadSearchOptions(): SearchOptions {
  const stored =
    localStorage.getItem(SEARCH_OPTIONS_STORAGE_KEY) !== null
      ? readStoredObject(SEARCH_OPTIONS_STORAGE_KEY)
      : readStoredObject(LEGACY_SKILL_FILTER_STORAGE_KEY);
  return {
    board: stored.board !== false,
    bloom: stored.bloom !== false,
    costume: stored.costume !== false,
    passives: stored.passives !== false,
  };
}

function loadSearchAll(): boolean {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_ALL_STORAGE_KEY) ?? "false") === true;
  } catch {
    return false;
  }
}

/**
 * 所持カードの登録(保存形式と後方互換は src/storage/owned.ts)。
 * 現在のデータにない ID も配列に残して書き戻す(登録を消さない)。UI で使うのは既知の ID のみ
 */
const ownedCards = ref<OwnedCard[]>(loadOwned());
watch(ownedCards, (owned) => saveOwned(owned), { deep: true });
const ownedIds = computed(() => ownedCards.value.map((o) => o.id).filter((id) => cardById.has(id)));

/**
 * ホロメンボードの登録(ホロメン単位・色ごと。保存形式は src/storage/boards.ts)。
 * Step 0 のホロメンピッカーから開く。ボードはカードでなくホロメンの状態。探索に効くのは
 * 持っているカードで「ボード状況を考慮する」が ON のときだけ(2026-09-06 ユーザー指定)。
 * 青はそのホロメンのカードに、緑は全ホロメン分の合計が全カードに効く(2026-09-07)。
 * 黄(2026-09-08)は曲を指定したときにその曲の楽曲スコアボーナスとして総合期待スコアに掛かる(アカウント全体)。
 * 赤(2026-09-08)はそのホロメンをリーダーにした編成のメンバー 5 人に効く(リーダー依存なので Worker の探索へ渡す)
 */
const redEntries = ref<BoardEntry[]>(loadBoards("red"));
watch(redEntries, (entries) => saveBoards("red", entries), { deep: true });
const redMap = computed<BoardMap>(() => toBoardMap("red", redEntries.value));
const boardEntries = ref<BoardEntry[]>(loadBoards("blue"));
watch(boardEntries, (entries) => saveBoards("blue", entries), { deep: true });
const boardMap = computed<BoardMap>(() => toBoardMap("blue", boardEntries.value));
const yellowEntries = ref<BoardEntry[]>(loadBoards("yellow"));
watch(yellowEntries, (entries) => saveBoards("yellow", entries), { deep: true });
const yellowMap = computed<BoardMap>(() => toBoardMap("yellow", yellowEntries.value));
const greenEntries = ref<BoardEntry[]>(loadBoards("green"));
watch(greenEntries, (entries) => saveBoards("green", entries), { deep: true });
const greenMap = computed<BoardMap>(() => toBoardMap("green", greenEntries.value));
/** ボードを開いているホロメン ID(null = 閉) */
const boardEditing = ref<string | null>(null);
const entryOf = (entries: BoardEntry[], holomenId: string | null): string[] =>
  entries.find((e) => e.holomenId === holomenId)?.nodes ?? [];
const editingRedNodes = computed(() => entryOf(redEntries.value, boardEditing.value));
const editingBlueNodes = computed(() => entryOf(boardEntries.value, boardEditing.value));
const editingYellowNodes = computed(() => entryOf(yellowEntries.value, boardEditing.value));
const editingGreenNodes = computed(() => entryOf(greenEntries.value, boardEditing.value));
function onBoardUpdate(holomenId: string, color: BoardColor, nodes: string[]): void {
  const entriesByColor: Record<BoardColor, BoardEntry[]> = {
    red: redEntries.value,
    blue: boardEntries.value,
    yellow: yellowEntries.value,
    green: greenEntries.value,
  };
  const entries = entriesByColor[color];
  const entry = entries.find((e) => e.holomenId === holomenId);
  if (entry) entry.nodes = nodes;
  else entries.push({ holomenId, nodes });
}

/** true = 所持リストを使わず全カードからさがす(リストは保持したまま)。UI ではオプション「持っているカードのみからさがす」の反転 */
const searchAll = ref(loadSearchAll());
/** オプションの開閉。既定で畳む(2026-09-08 ユーザー指示)。開閉は保存しない */
const optionsOpen = ref(false);
watch(searchAll, (value) => {
  try {
    localStorage.setItem(SEARCH_ALL_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 保存できない環境でも動作は継続する
  }
});

/** 探索のオプション(既定はすべて ON = 現在の育成で、スキルが発動する編成だけ) */
const searchOptions = ref<SearchOptions>(loadSearchOptions());
watch(
  searchOptions,
  (value) => {
    try {
      localStorage.setItem(SEARCH_OPTIONS_STORAGE_KEY, JSON.stringify(value));
    } catch {
      // 保存できない環境でも動作は継続する
    }
  },
  { deep: true },
);
/** 直前の実行でしぼりこみが効いていたか(0 件のときの案内文に使う) */
const ranFiltered = ref(false);

/** 探索・選択の対象プール。null = 全カード */
const pool = computed<Card[] | null>(() => {
  if (searchAll.value) return null;
  return ownedIds.value
    .map((id) => cardById.get(id))
    .filter((card): card is Card => card !== undefined);
});
const leaderId = ref<string | null>(null);
const fixedIds = ref<(string | null)[]>(Array.from({ length: MEMBER_SLOTS }, () => null));
/** 除外するカード。2026-09-08 に UI の入口(旧 Step 1 の行ボタン)を外したが、状態と探索への反映は保持する(ユーザー指示) */
const excludedIds = ref<string[]>([]);
/** 曲別最適化の対象。null = 代表曲条件(全曲の中央値)で期待値を計算する */
const songId = ref<string | null>(null);
/** 結果の件数(上位 n 件)。実行前の件数入力は置かず、結果側で 1 件ずつ送る。100 → 10(2026-09-08 ユーザー「10件をデフォにしていい」) */
const TOP_N = 10;
/** 詳細モーダルを開いている結果の順位(0 始まり)。null = 閉 */
const detailRank = ref<number | null>(null);

// プールが所持カードに絞られたら、プール外のカードのリーダー・固定枠は外す(枠は上詰めを保つ)
watch(pool, (nextPool) => {
  if (nextPool === null) return;
  const ids = new Set(nextPool.map((c) => c.id));
  if (leaderId.value !== null && !ids.has(leaderId.value)) leaderId.value = null;
  const kept = fixedIds.value.filter((id): id is string => id !== null && ids.has(id));
  fixedIds.value = [...kept, ...Array.from({ length: MEMBER_SLOTS - kept.length }, () => null)];
});

type PickerState =
  | { mode: "leader" }
  | { mode: "member"; slot: number }
  | { mode: "exclude" }
  | { mode: "owned" }
  | { mode: "holomen" }
  | { mode: "song" }
  | null;
const picker = ref<PickerState>(null);

const optimizer = useOptimizer();

/**
 * おかゆモード(開発者のお遊び機能。フッター右下のおにぎりで ON / OFF、再読み込みで解除)。
 * - リーダーはおかゆんのカード(おまかせならおかゆんのカードの中から探索)
 * - メンバーにもおかゆんが 1 枚入る(メンバー同士は同一ホロメン不可なのでちょうど 1 枚)
 * - 全カード: 上記のみ。持っているカード: おかゆんを登録するまでリーダー・メンバー・実行を止め、
 *   所持ピッカーのボタンで「おかゆんを選んでください」と案内する(エラー表示ではなく方針として)
 */
const okayu = useOkayuMode();
const okayuMode = computed(() => okayu.active.value);
const isOkayuCard = (id: string | null): boolean => id !== null && okayuCardIds.includes(id);
/** おかゆモードの前提が満たされているか: 全カードなら常に、持っているカードならおかゆんを登録済みのとき */
const okayuReady = computed(
  () => !okayuMode.value || searchAll.value || ownedIds.value.some((id) => isOkayuCard(id)),
);
/** おかゆモードで枠の操作と実行を止めるか(持っているカードモードでおかゆん未登録) */
const okayuBlocked = computed(() => okayuMode.value && !okayuReady.value);
/** 固定メンバーにおかゆんがいるか(いなければ最後の枠がおかゆんの枠になる) */
const fixedHasOkayu = computed(() => fixedIds.value.some((id) => isOkayuCard(id)));
/**
 * メンバー枠の空表示。おかゆモードで 4 枚選んでもおかゆんがいないときだけ、最後の枠を
 * 「おかゆん（おまかせ）」にする(最初から出さない。おかゆんを選んだ時点で出ない)
 */
function memberEmptyText(slot: number): string {
  const lastSlotForOkayu =
    okayuMode.value &&
    slot === MEMBER_SLOTS - 1 &&
    chosenFixedIds.value.length === MEMBER_SLOTS - 1 &&
    !fixedHasOkayu.value;
  return lastSlotForOkayu ? "おかゆん（おまかせ）" : "おまかせ";
}

/**
 * 現在の設定でのカード ID → 開花段階(0 は持たない疎な map)。
 * 全カード時は常に 0凸で計算し(2026-09-01 ユーザー指定)、持っているカード時は
 * オプション「開花状況を考慮する」が ON のときだけカードごとの登録値を使う(2026-09-06)
 */
const useBloom = computed(() => !searchAll.value && searchOptions.value.bloom);
const useBoard = computed(() => !searchAll.value && searchOptions.value.board);
const currentBlooms = computed<BloomMap>(() => {
  const map: BloomMap = {};
  if (!useBloom.value) return map;
  for (const o of ownedCards.value) {
    if (o.bloom > 0) map[o.id] = o.bloom;
  }
  return map;
});

/**
 * ボードは持っているカード時にオプション「ボード状況を考慮する」が ON のときだけ効く。
 * 全カード時は開花と同じく素の値で比べる(将来に向けた探索に現在の育成を混ぜない — 2026-09-06 ユーザー判断)
 */
const currentBoards = computed<BoardMap>(() => (useBoard.value ? boardMap.value : {}));
/** 緑ボードはアカウント全体の合計を 1 つの値にして全カードへ(null = 効かせない) */
const currentGreen = computed<GreenBoardEffects | null>(() =>
  useBoard.value ? accountGreenEffects(greenMap.value) : null,
);

/** 直近の実行に使った開花段階・ボード(結果・詳細の表示用スナップショット) */
const ranBlooms = ref<BloomMap>({});
const ranBoards = ref<BoardMap>({});
const ranGreen = ref<GreenBoardEffects | null>(null);
/** 直近の実行でリーダーを指定していたか(結果のリーダー行のピン表示) */
const ranLeaderFixed = ref(false);
/** 直近の実行がおかゆモードだったか(結果のおかゆん行のおにぎり表示・位置の散らし) */
const ranOkayu = ref(false);

const leader = computed(() => cardOf(leaderId.value));
const song = computed(() => (songId.value ? (songById.get(songId.value) ?? null) : null));
const chosenFixedIds = computed(() => fixedIds.value.filter((id): id is string => id !== null));
const openSlots = computed(() => MEMBER_SLOTS - chosenFixedIds.value.length);

/** スロット表示用: スキル文言を現在の開花段階・ボードに解決したカード */
function cardOf(id: string | null) {
  const card = id ? (cardById.get(id) ?? null) : null;
  return card
    ? resolveCard(card, currentBlooms.value, currentBoards.value, currentGreen.value)
    : null;
}

/** メンバーピッカーで選択不可のカード(他枠と同一ホロメン・除外中)。リーダーとの重複は可 */
const memberDisabled = computed(() => {
  const slot = picker.value?.mode === "member" ? picker.value.slot : -1;
  const map = new Map<string, string>();
  const takenHolomen = new Map<string, string>();
  fixedIds.value.forEach((id, i) => {
    if (i === slot || id === null) return;
    const card = cardById.get(id);
    if (card) takenHolomen.set(card.holomenId, holomenName(card.holomenId));
  });
  // おかゆモード: 最後の 1 枠までおかゆんがいなければ、その枠はおかゆんしか選べない
  const needOkayu =
    okayuMode.value && slot === MEMBER_SLOTS - 1 && !takenHolomen.has(OKAYU_HOLOMEN_ID);
  for (const card of cardById.values()) {
    if (takenHolomen.has(card.holomenId) && fixedIds.value[slot] !== card.id) {
      map.set(card.id, `${holomenName(card.holomenId)} は別の枠で固定中（メンバー同士は重複不可）`);
    } else if (excludedIds.value.includes(card.id)) {
      map.set(card.id, "除外中のカードです（除外を解除すると選べます）");
    } else if (needOkayu && card.holomenId !== OKAYU_HOLOMEN_ID) {
      map.set(card.id, "最後の 1 枠はおかゆんです（おかゆモード）");
    }
  }
  return map;
});

/** 除外ピッカーで選択不可のカード(固定中のもの。おかゆモードではおかゆんも) */
const excludeDisabled = computed(() => {
  const map = new Map<string, string>();
  for (const id of chosenFixedIds.value) {
    map.set(id, "固定中のカードは除外できません");
  }
  if (okayuMode.value) {
    for (const id of okayuCardIds) map.set(id, "おかゆモードではおかゆんを除外できません");
  }
  return map;
});

/** リーダーピッカーで選択不可のカード(おかゆモードではおかゆん以外) */
const leaderDisabled = computed(() => {
  const map = new Map<string, string>();
  if (!okayuMode.value) return map;
  for (const card of cardById.values()) {
    if (card.holomenId !== OKAYU_HOLOMEN_ID)
      map.set(card.id, "リーダーはおかゆんです（おかゆモード）");
  }
  return map;
});

/** メンバー枠は上から順に埋める(先頭の空き枠だけが選択可能) */
const firstEmptySlot = computed(() => fixedIds.value.indexOf(null));

/**
 * メンバー枠は 1 枠ずつの横スクロール(PageCarousel)で見せる — 縦に 5 枠は長い(2026-09-08 ユーザー指示)。
 * スワイプはパネル全体(見出し・ナビを含む)で拾う。カードを入れたら次の枠(唯一選べる空き枠)へ
 * アニメーションなしで切り替える(送ると入れたカードの面が最後にチラ見えする — 2026-09-08 ユーザー指摘)
 */
const memberSection = useTemplateRef<HTMLElement>("memberSection");
const memberCarousel = useTemplateRef<{ jumpTo: (i: number) => void }>("memberCarousel");
const memberIndex = ref(0);
const resultSection = useTemplateRef<HTMLElement>("resultSection");

function onPick(cardId: string): void {
  const state = picker.value;
  if (!state) return;
  if (state.mode === "leader") {
    leaderId.value = cardId;
  } else if (state.mode === "member") {
    fixedIds.value[state.slot] = cardId;
    if (state.slot + 1 < MEMBER_SLOTS) {
      void nextTick(() => {
        memberCarousel.value?.jumpTo(state.slot + 1);
      });
    }
  }
  picker.value = null;
}

function onToggleExclude(cardId: string): void {
  const index = excludedIds.value.indexOf(cardId);
  if (index >= 0) {
    excludedIds.value.splice(index, 1);
  } else {
    excludedIds.value.push(cardId);
  }
}

function onToggleOwned(cardId: string): void {
  const index = ownedCards.value.findIndex((o) => o.id === cardId);
  if (index >= 0) {
    ownedCards.value.splice(index, 1);
  } else {
    ownedCards.value.push({ id: cardId, bloom: 0 });
  }
}

function onOwnedBloom(cardId: string, delta: number): void {
  const owned = ownedCards.value.find((o) => o.id === cardId);
  if (!owned) return;
  owned.bloom = Math.min(BLOOM_MAX, Math.max(0, owned.bloom + delta));
}

function clearSlot(slot: number): void {
  // 解除したら後続を上へ詰め、空き枠を常に末尾へまとめる
  const ids = fixedIds.value.slice();
  ids.splice(slot, 1);
  ids.push(null);
  fixedIds.value = ids;
}

/**
 * 実行可否。リーダーは常におまかせ(未指定なら全リーダー候補を探索)でよいため、
 * 探索プールが空のときだけ実行できない
 */
const canRun = computed(() => {
  if (optimizer.running.value) return false;
  if (okayuBlocked.value) return false;
  return pool.value === null || pool.value.length > 0;
});

function run(): void {
  if (!canRun.value) return;
  detailRank.value = null;
  // 所持しぼりこみ時は所持カード以外を除外に足してプールを絞る(エンジンは共通)
  const excluded = new Set(excludedIds.value);
  if (pool.value !== null) {
    const poolIdSet = new Set(pool.value.map((c) => c.id));
    for (const card of cards) {
      if (!poolIdSet.has(card.id)) excluded.add(card.id);
    }
  }
  // リアクティブ Proxy は postMessage で複製できないため、プレーン配列・オブジェクトに写す
  const blooms = { ...currentBlooms.value };
  const boards: BoardMap = Object.fromEntries(
    Object.entries(currentBoards.value).map(([k, v]) => [k, [...v]]),
  );
  const greenBoards: BoardMap = useBoard.value
    ? Object.fromEntries(Object.entries(greenMap.value).map(([k, v]) => [k, [...v]]))
    : {};
  const yellowBoards: BoardMap = useBoard.value
    ? Object.fromEntries(Object.entries(yellowMap.value).map(([k, v]) => [k, [...v]]))
    : {};
  const redBoards: BoardMap = useBoard.value
    ? Object.fromEntries(Object.entries(redMap.value).map(([k, v]) => [k, [...v]]))
    : {};
  ranBlooms.value = blooms;
  ranBoards.value = boards;
  ranGreen.value = useBoard.value ? accountGreenEffects(greenBoards) : null;
  ranLeaderFixed.value = leaderId.value !== null;
  ranOkayu.value = okayuMode.value;
  const applyFilters = !fullyFixed.value;
  const requireCostumeSkill = applyFilters && searchOptions.value.costume;
  const requireAllPassives = applyFilters && searchOptions.value.passives;
  ranFiltered.value = requireCostumeSkill || requireAllPassives;
  optimizer.run({
    leaderId: leaderId.value,
    fixedMemberIds: [...chosenFixedIds.value],
    excludedCardIds: [...excluded],
    // おかゆモード: リーダーおまかせはおかゆんのカードから、メンバーにもおかゆんを必ず入れる
    leaderCandidateIds: okayuMode.value ? [...okayuCardIds] : null,
    requiredMemberHolomenIds: okayuMode.value ? [OKAYU_HOLOMEN_ID] : [],
    requireCostumeSkill,
    requireAllPassives,
    songId: songId.value,
    blooms,
    boards,
    greenBoards,
    yellowBoards,
    redBoards,
    topN: TOP_N,
  });
}

/**
 * 6 枠すべて固定(この編成のスコアを試算)。しぼりこみは適用しない — 除いて何も出ないより不発の理由を見せる —
 * ので、そのあいだはチップを disabled にして「効いていない」ことを示す(2026-09-05 ユーザー指摘。状態は保持)
 */
const fullyFixed = computed(() => leaderId.value !== null && openSlots.value === 0);

const detailCandidate = computed(() => {
  if (detailRank.value === null) return null;
  return optimizer.candidates.value?.[detailRank.value] ?? null;
});

/** 詳細モーダルに出すリーダー(候補ごとに持つ leaderId から引き、実行時の開花段階に解決する) */
const detailLeader = computed(() => {
  if (!detailCandidate.value) return null;
  const card = cardById.get(detailCandidate.value.leaderId) ?? null;
  return card ? resolveCard(card, ranBlooms.value, ranBoards.value, ranGreen.value) : null;
});
</script>

<template>
  <div class="panel-group">
    <section class="panel" aria-labelledby="account-heading">
      <h2 id="account-heading"><span class="step-badge">0</span>アカウント</h2>
      <!-- 左から ホロメン(ボード) / メンバー(持っているカードと開花) / ユニット(お気に入り編成の記録・未実装)。件数は出さない(2026-09-06 ユーザー指定) -->
      <div class="account-row">
        <button type="button" class="account-button" @click="picker = { mode: 'holomen' }">
          ホロメン
        </button>
        <button type="button" class="account-button" @click="picker = { mode: 'owned' }">
          メンバー
        </button>
        <button type="button" class="account-button" disabled aria-label="ユニット（準備中）">
          ユニット
        </button>
      </div>
      <!--
        おかゆモードでおかゆんを登録するまでは、ボタンの下の行にエラー文を出す(例外的処理 — 2026-09-06 ユーザー指示。
        ボタンのラベルを変える案は 3 列に収まらず却下)。出ていないときはこの行の余白も取らない
      -->
      <p v-if="okayuBlocked" class="account-error" role="alert">
        おかゆんを持っているカードに指定してください
      </p>
    </section>

    <section class="panel" aria-labelledby="leader-heading">
      <h2 id="leader-heading"><span class="step-badge">1</span>リーダー</h2>
      <div class="slot-list">
        <UnitSlot
          label="リーダー枠"
          variant="leader"
          :card="leader"
          :empty-text="okayuMode ? 'おかゆん（おまかせ）' : 'おまかせ'"
          clearable
          :disabled="okayuBlocked"
          @activate="picker = { mode: 'leader' }"
          @clear="leaderId = null"
        />
      </div>
    </section>

    <section ref="memberSection" class="panel" aria-labelledby="member-heading">
      <h2 id="member-heading"><span class="step-badge">2</span>メンバー</h2>
      <!-- 1 枠ずつ横スクロール。下に現在位置「n / 5」と前後の三角(端は disabled)。スワイプはパネル全体 -->
      <PageCarousel
        ref="memberCarousel"
        v-model="memberIndex"
        class="slot-carousel"
        :items="fixedIds"
        label="メンバー枠（横にスクロール）"
        :swipe-element="memberSection"
      >
        <template #page="{ item: id, index: slot }">
          <UnitSlot
            :label="`メンバー枠${slot + 1}`"
            variant="member"
            :card="cardOf(id)"
            :empty-text="memberEmptyText(slot)"
            clearable
            :disabled="okayuBlocked || (id === null && slot !== firstEmptySlot)"
            @activate="picker = { mode: 'member', slot }"
            @clear="clearSlot(slot)"
          />
        </template>
      </PageCarousel>
    </section>

    <section class="panel" aria-labelledby="song-heading">
      <h2 id="song-heading"><span class="step-badge">3</span>曲</h2>
      <div class="song-slot">
        <SongRow
          :song="song"
          :clearable="song !== null"
          aria-label="曲"
          @activate="picker = { mode: 'song' }"
        />
        <button
          v-if="song"
          type="button"
          class="slot-clear"
          aria-label="曲の選択を解除"
          @click="songId = null"
        >
          ✕
        </button>
      </div>
    </section>

    <section class="panel" aria-labelledby="run-heading">
      <h2 id="run-heading"><span class="step-badge">4</span>さがす</h2>
      <!--
        オプション(既定で畳む — 2026-09-08 ユーザー指示。旧 Step 1「さがす対象」をここへ移し、除外するカードの入口は UI から外した。
        除外の状態そのものは保持する): 1 行目に「持っているカードのみからさがす」(既定 ON。旧セグメントの「持っているカード」)、
        その下に育成の反映 2 件 + スキル発動条件 2 件(複数選択可。既定はすべて ON)。
        育成の反映は全カードでは効かない(素の値で比べる)ので、そのあいだは未選択(白)+disabled にする —
        そのモードでは意味を持たない設定は選択された見た目にしない(2026-09-06 ユーザー指示)。設定値は保持し、
        持っているカードに戻せば保存した ON/OFF(既定は両方 ON)で復帰する。
        発動条件は 6 枠すべて固定では一時的に効かないだけなので、見た目を保って disabled(2026-09-05)
      -->
      <button
        type="button"
        class="options-toggle"
        :aria-expanded="optionsOpen"
        aria-controls="search-options"
        @click="optionsOpen = !optionsOpen"
      >
        <span>オプション</span>
        <span aria-hidden="true">{{ optionsOpen ? "▲" : "▼" }}</span>
      </button>
      <div
        v-if="optionsOpen"
        id="search-options"
        class="option-chips"
        role="group"
        aria-label="オプション"
      >
        <button
          type="button"
          class="chip wide"
          role="checkbox"
          :aria-checked="!searchAll"
          :class="{ active: !searchAll }"
          @click="searchAll = !searchAll"
        >
          持っているカードのみからさがす
        </button>
        <button
          type="button"
          class="chip"
          role="checkbox"
          :aria-checked="useBoard"
          :class="{ active: useBoard }"
          :disabled="searchAll"
          @click="searchOptions.board = !searchOptions.board"
        >
          ボード状況を考慮する
        </button>
        <button
          type="button"
          class="chip"
          role="checkbox"
          :aria-checked="useBloom"
          :class="{ active: useBloom }"
          :disabled="searchAll"
          @click="searchOptions.bloom = !searchOptions.bloom"
        >
          開花状況を考慮する
        </button>
        <button
          type="button"
          class="chip"
          role="checkbox"
          :aria-checked="searchOptions.costume"
          :class="{ active: searchOptions.costume }"
          :disabled="fullyFixed"
          @click="searchOptions.costume = !searchOptions.costume"
        >
          衣装スキル発動に限る
        </button>
        <button
          type="button"
          class="chip"
          role="checkbox"
          :aria-checked="searchOptions.passives"
          :class="{ active: searchOptions.passives }"
          :disabled="fullyFixed"
          @click="searchOptions.passives = !searchOptions.passives"
        >
          パッシブ全員発動に限る
        </button>
      </div>
      <!-- 実行中はボタンの中のスピナーだけで示す(進捗バー・件数・中止ボタンは置かない — 2026-09-07 ユーザー指示)。
           ラベルは visibility で隠して幅と高さを保つ -->
      <button
        type="button"
        class="primary-button"
        :class="{ busy: optimizer.running.value }"
        :disabled="!canRun"
        :aria-busy="optimizer.running.value"
        :aria-label="optimizer.running.value ? '計算中' : undefined"
        @click="run"
      >
        <span class="label">
          {{ leader && openSlots === 0 ? "この編成のスコアを試算" : "ベスト編成をさがす" }}
        </span>
        <span v-if="optimizer.running.value" class="spinner" aria-hidden="true"></span>
      </button>

      <p v-if="optimizer.error.value" class="warn-text" role="alert">
        {{ optimizer.error.value }}
      </p>
    </section>

    <section
      v-if="optimizer.candidates.value"
      ref="resultSection"
      class="panel"
      aria-labelledby="results-heading"
    >
      <h2 id="results-heading">結果</h2>
      <p v-if="optimizer.candidates.value.length === 0" class="hint">
        {{
          ranFiltered
            ? "条件を満たす編成がありませんでした。しぼりこみを外して再度さがしてください。"
            : "条件を満たす編成がありません。カードの登録・固定・除外の条件を見直してください。"
        }}
      </p>
      <ResultList
        v-else
        :candidates="optimizer.candidates.value"
        :fixed-ids="chosenFixedIds"
        :blooms="ranBlooms"
        :leader-fixed="ranLeaderFixed"
        :okayu-holomen-id="ranOkayu ? OKAYU_HOLOMEN_ID : null"
        :swipe-element="resultSection"
        @select="detailRank = $event"
      />
    </section>

    <ResultDetail
      v-if="detailRank !== null && detailCandidate && detailLeader"
      :rank="detailRank + 1"
      :candidate="detailCandidate"
      :leader="detailLeader"
      :fixed-ids="chosenFixedIds"
      :blooms="ranBlooms"
      :boards="ranBoards"
      :green="ranGreen"
      @close="detailRank = null"
    />

    <CardPicker
      v-if="picker?.mode === 'leader'"
      title="リーダー"
      mode="pick"
      skill-view="costume"
      :pool="pool ?? undefined"
      :selected-id="leaderId"
      :disabled="leaderDisabled"
      :blooms="currentBlooms"
      @pick="onPick"
      @close="picker = null"
    />
    <CardPicker
      v-else-if="picker?.mode === 'member'"
      :title="`メンバー枠${picker.slot + 1}`"
      mode="pick"
      skill-view="member"
      :pool="pool ?? undefined"
      :selected-id="fixedIds[picker.slot] ?? null"
      :disabled="memberDisabled"
      :blooms="currentBlooms"
      :bloom-badge="useBloom"
      @pick="onPick"
      @close="picker = null"
    />
    <CardPicker
      v-else-if="picker?.mode === 'exclude'"
      title="除外するカード"
      mode="exclude"
      skill-view="member"
      :excluded-ids="excludedIds"
      :disabled="excludeDisabled"
      :blooms="currentBlooms"
      memory-key="exclude"
      @toggle="onToggleExclude"
      @close="picker = null"
    />
    <CardPicker
      v-else-if="picker?.mode === 'owned'"
      title="メンバー"
      mode="multi"
      skill-view="member"
      :selected-ids="ownedIds"
      :blooms="currentBlooms"
      bloom-control
      memory-key="owned"
      @toggle="onToggleOwned"
      @bloom="onOwnedBloom"
      @close="picker = null"
    />
    <HolomenPicker
      v-else-if="picker?.mode === 'holomen'"
      :red-boards="redMap"
      :boards="boardMap"
      :yellow-boards="yellowMap"
      :green-boards="greenMap"
      @pick="boardEditing = $event"
      @close="picker = null"
    />
    <BoardSheet
      v-if="boardEditing !== null"
      :holomen-id="boardEditing"
      :red-nodes="editingRedNodes"
      :nodes="editingBlueNodes"
      :yellow-nodes="editingYellowNodes"
      :green-nodes="editingGreenNodes"
      @update="onBoardUpdate"
      @close="boardEditing = null"
    />
    <SongPicker
      v-else-if="picker?.mode === 'song'"
      :selected-id="songId"
      @pick="
        (id) => {
          songId = id;
          picker = null;
        }
      "
      @close="picker = null"
    />
  </div>
</template>

<style scoped>
/*
 * ステップは白いパネル(カード)で区切り、番号バッジで順番を示す(2026-09-05 に帯・角丸ブロック・
 * ステッパー案を試した末、この形が基準と確定)。カード・曲の部品はピッカーと同じ部品・同じ固定高
 */
.panel-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-card);
  padding: 16px;
}

.panel h2 {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  font-size: 18px;
  gap: 8px;
  margin: 0 0 8px;
}

.step-badge {
  align-items: center;
  background: var(--ink);
  border-radius: 50%;
  color: #fff;
  display: inline-flex;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  height: 24px;
  justify-content: center;
  width: 24px;
}

.hint {
  color: var(--ink-2);
  font-size: 13px;
  margin: 8px 0 0;
}

.warn-text {
  color: #b3261e;
  font-size: 13px;
}

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
  position: relative;
  width: 100%;
}

.primary-button:disabled:not(.busy) {
  cursor: not-allowed;
  opacity: 0.45;
}

/* 実行中: 色はそのまま、ラベルの代わりに白い細線のリングを回す(ボタンの寸法は変えない) */
.primary-button.busy {
  cursor: progress;
}

.primary-button.busy .label {
  visibility: hidden;
}

.spinner {
  animation: spin 0.8s linear infinite;
  border: 2.5px solid rgba(255, 255, 255, 0.35);
  border-radius: 50%;
  border-top-color: #fff;
  height: 22px;
  left: 50%;
  margin: -11px 0 0 -11px;
  position: absolute;
  top: 50%;
  width: 22px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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

/* 選択モーダルを開く行ボタン: ラベル左・現在値(件数)右の設定行パターン */
.picker-button {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  justify-content: space-between;
  padding: 0 16px;
  width: 100%;
}

.picker-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.picker-value {
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}

/* Step 0: 3 つの入口を横並びに(ホロメン / メンバー / ユニット)。値は持たない */
.account-row {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, 1fr);
}

.account-button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  padding: 0 4px;
}

.account-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.account-error {
  color: var(--error);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  margin: 8px 0 0;
  text-align: center;
}

/* オプションの開閉行: 実行ボタンと形で分ける(枠なし・文字のみ)。▼/▲ は開閉の状態記号。既定で畳む(2026-09-08) */
.options-toggle {
  align-items: center;
  background: none;
  border: none;
  color: var(--ink-2);
  cursor: pointer;
  display: flex;
  font-size: 13px;
  font-weight: 600;
  height: 36px;
  justify-content: space-between;
  margin: -6px 0 6px;
  padding: 0 4px;
  width: 100%;
}

/*
 * オプションのチップ: 複数選択可(セグメントと区別して 1 個ずつ角丸にする。選択は濃色地で伝え、記号は付けない)。
 * 2 列 × 2 行の等幅にして上段 = 育成の反映、下段 = スキルの発動条件と読めるようにする(2026-09-06「2 行に収められない？」)。
 * 最長ラベル 11 文字が 375px 幅(セル 152px)に収まるよう、このチップだけ 12px・左右 6px
 */
.option-chips {
  display: grid;
  gap: 6px;
  grid-template-columns: 1fr 1fr;
  margin-bottom: 12px;
}

.option-chips .chip {
  font-size: 12px;
  padding: 0 6px;
  white-space: nowrap;
}

/* 1 行目「持っているカードのみからさがす」は幅いっぱい(さがす対象の切替。旧 Step 1 のセグメントから移設 — 2026-09-08) */
.option-chips .chip.wide {
  grid-column: 1 / -1;
}

.chip {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  height: 32px;
  padding: 0 14px;
}

/* 6 枠すべて固定のあいだ(しぼりこみが効かない)。状態は保ったまま薄くする */
.chip:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.chip.active {
  background: var(--ink);
  border-color: var(--ink);
  color: #fff;
  font-weight: 700;
}

/* リーダー枠: 横幅いっぱい */
.slot-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

/* メンバー枠: 1 枠 = 1 ページの横スクロール(PageCarousel) */
.slot-carousel {
  margin-top: 8px;
}

/* 曲枠: ピッカーと同じ SongRow を置き、右上に解除ボタンを重ねる */
.song-slot {
  margin-top: 8px;
  position: relative;
  width: 100%;
}

.slot-clear {
  align-items: center;
  background: var(--ink);
  border: 2px solid var(--surface);
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  display: flex;
  font-size: 11px;
  height: 28px;
  justify-content: center;
  position: absolute;
  right: 8px;
  top: 8px;
  width: 28px;
}
</style>
