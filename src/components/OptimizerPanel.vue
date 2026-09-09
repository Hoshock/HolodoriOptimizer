<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";

import BoardSheet from "./BoardSheet.vue";
import CardPicker from "./CardPicker.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import HolomenPicker from "./HolomenPicker.vue";
import PageCarousel from "./PageCarousel.vue";
import ResultDetail from "./ResultDetail.vue";
import ResultList from "./ResultList.vue";
import SongPicker from "./SongPicker.vue";
import SongRow from "./SongRow.vue";
import UnitSaveModal from "./UnitSaveModal.vue";
import UnitSheet from "./UnitSheet.vue";
import FrequencyPlanSheet from "./FrequencyPlanSheet.vue";
import type { UnitPage } from "./UnitSheet.vue";
import UnitSlot from "./UnitSlot.vue";
import { OKAYU_HOLOMEN_ID, okayuCardIds, useOkayuMode } from "../composables/useOkayuMode";
import { useOptimizer } from "../composables/useOptimizer";
import type { CandidateView } from "../composables/useOptimizer";
import { cardById, cards, holomen, songById } from "../data";
import { BLOOM_MAX } from "../data/bloom";
import { BLUE_BOARD_NODE_IDS } from "../data/blueBoard";
import { accountGreenEffects, GREEN_BOARD_NODE_IDS } from "../data/greenBoard";
import type { GreenBoardEffects } from "../data/greenBoard";
import type { BloomMap } from "../data/bloom";
import { RED_BOARD_NODE_IDS } from "../data/redBoard";
import { resolveCard } from "../data/resolve";
import { YELLOW_BOARD_NODE_IDS } from "../data/yellowBoard";
import type { Card } from "../data/types";
import type { AccountBonus } from "../engine/power";
import { runOptimize } from "../engine/request";
import type { OptimizeRunRequest } from "../engine/request";
import { loadAccount, normalizeAccount, saveAccount } from "../storage/account";
import { loadBoards, saveBoards, toBoardMap } from "../storage/boards";
import type { BoardColor, BoardEntry, BoardMap } from "../storage/boards";
import { loadOwned, saveOwned } from "../storage/owned";
import type { OwnedCard } from "../storage/owned";
import {
  loadUnits,
  putUnit,
  removeUnit,
  saveUnits,
  UNIT_SLOT_COUNT,
  unitSlotOf,
} from "../storage/units";
import type { SavedUnit, UnitComposition } from "../storage/units";
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
 * 持っているカードで「ボード状況を考慮する」が ON のときだけで、考慮しないときは全解放として試算する。
 * 青はそのホロメンのカードに、緑は全ホロメン分の合計が全カードに効く(2026-09-07)。
 * 黄(2026-09-08)は曲を指定したとき、その曲の楽曲スコアボーナスとして表示ユニットスコアに後掛けする
 * score modifier に入る(アカウント全体。ADR-006)。
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

/**
 * アカウント共通の補正(メモリーの「ユニットパラメータ +X%」・メンバー強化ボーナス +X%。保存形式は src/storage/account.ts)。
 * Step 0 に数値欄で置く。総合力にメモリー効果・メンバー強化ボーナスとして別枠で加算する(src/engine/power.ts — 2026-09-08 実機内訳)
 */
const account = ref<AccountBonus>(loadAccount());
watch(account, (value) => saveAccount(normalizeAccount(value)), { deep: true });

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

/** いま探索に効いている除外の枚数(既知のカードで、所持カードから探すときは所持カードの中のもの) */
function effectiveExcludedCount(ids: readonly string[]): number {
  const poolIds = pool.value === null ? null : new Set(pool.value.map((c) => c.id));
  return ids.filter((id) => cardById.has(id) && (poolIds === null || poolIds.has(id))).length;
}
const excludedLeaderCount = computed(() => effectiveExcludedCount(excludedLeaderIds.value));
const excludedMemberCount = computed(() => effectiveExcludedCount(excludedMemberIds.value));

/** 探索・選択の対象プール。null = 全カード */
const pool = computed<Card[] | null>(() => {
  if (searchAll.value) return null;
  return ownedIds.value
    .map((id) => cardById.get(id))
    .filter((card): card is Card => card !== undefined);
});
const leaderId = ref<string | null>(null);
const fixedIds = ref<(string | null)[]>(Array.from({ length: MEMBER_SLOTS }, () => null));
/**
 * 除外するカード(役割別 — 2026-09-08 ユーザー指示「リーダーから除外、メンバーから除外の二つのタイルを用意しよう」)。
 * リーダーから除外はリーダーおまかせの候補から、メンバーから除外はメンバーおまかせの候補から外す。
 * 自分で指定したリーダー・固定したメンバーには効かない(ピッカー側で組合せを防ぐ)。保存しない
 */
const excludedLeaderIds = ref<string[]>([]);
const excludedMemberIds = ref<string[]>([]);
/**
 * 曲依存の score modifier(黄ボードの楽曲スコアボーナス・イベントスコアボーナス)の対象。
 * null = 曲依存の倍率を掛けない。曲長・譜面は現在の表示ユニットスコアの探索では使わない(ADR-006)
 */
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
  | { mode: "excludeLeader" }
  | { mode: "excludeMember" }
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
 * 「考慮しない」ときに使う最大の状態(全カード開花最大・全ホロメン 4 色ボード全解放)。
 * 全カードでの探索も、持っているカードでオプションを OFF にしたときも、これで試算する —
 * 育てきった前提で比べたい(2026-09-08 ユーザー指示。素の値で比べる 2026-09-06 の扱いから変更)
 */
const MAX_BLOOMS: BloomMap = Object.fromEntries(cards.map((c) => [c.id, BLOOM_MAX]));
/** リアクティブ Proxy は postMessage で複製できないため、プレーンな配列・オブジェクトに写す */
const plainBoardMap = (map: BoardMap): BoardMap =>
  Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v]]));
const fullBoards = (nodeIds: readonly string[]): BoardMap =>
  Object.fromEntries(holomen.map((h) => [h.id, [...nodeIds]]));
const MAX_BLUE_BOARDS = fullBoards(BLUE_BOARD_NODE_IDS);
const MAX_GREEN_BOARDS = fullBoards(GREEN_BOARD_NODE_IDS);
const MAX_YELLOW_BOARDS = fullBoards(YELLOW_BOARD_NODE_IDS);
const MAX_RED_BOARDS = fullBoards(RED_BOARD_NODE_IDS);

/**
 * 育成の反映は、持っているカードでオプションが ON のときだけ登録値を使う(2026-09-06)。
 * OFF・全カードでは登録値を見ずに最大の状態で試算する
 */
const useBloom = computed(() => !searchAll.value && searchOptions.value.bloom);
const useBoard = computed(() => !searchAll.value && searchOptions.value.board);
/** 登録した開花段階そのまま(0 は持たない疎な map)。所持ピッカーのステッパーは常にこれを出す */
const registeredBlooms = computed<BloomMap>(() => {
  const map: BloomMap = {};
  for (const o of ownedCards.value) {
    if (o.bloom > 0) map[o.id] = o.bloom;
  }
  return map;
});
const currentBlooms = computed<BloomMap>(() =>
  useBloom.value ? registeredBlooms.value : MAX_BLOOMS,
);

/**
 * ボードは青がそのホロメンのカードへ、緑と黄がアカウント全体、赤がリーダーのホロメンに効く。
 * 4 色まとめて「ボード状況を考慮する」で切り替わり、考慮しないときは全ホロメン全解放とする
 */
const currentBoards = computed<BoardMap>(() => (useBoard.value ? boardMap.value : MAX_BLUE_BOARDS));
const currentGreenBoards = computed<BoardMap>(() =>
  useBoard.value ? greenMap.value : MAX_GREEN_BOARDS,
);
const currentYellowBoards = computed<BoardMap>(() =>
  useBoard.value ? yellowMap.value : MAX_YELLOW_BOARDS,
);
const currentRedBoards = computed<BoardMap>(() => (useBoard.value ? redMap.value : MAX_RED_BOARDS));
/** 緑ボードはアカウント全体の合計を 1 つの値にして全カードへ */
const currentGreen = computed<GreenBoardEffects>(() =>
  accountGreenEffects(currentGreenBoards.value),
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
    } else if (excludedMemberIds.value.includes(card.id)) {
      map.set(card.id, "メンバーから除外中のカードです（除外を解除すると選べます）");
    } else if (needOkayu && card.holomenId !== OKAYU_HOLOMEN_ID) {
      map.set(card.id, "最後の 1 枠はおかゆんです（おかゆモード）");
    }
  }
  return map;
});

/** 「リーダーから除外」のピッカーで選択不可のカード(指定中のリーダー。おかゆモードではおかゆんも) */
const excludeLeaderDisabled = computed(() => {
  const map = new Map<string, string>();
  if (leaderId.value !== null) map.set(leaderId.value, "リーダーに指定中のカードは除外できません");
  if (okayuMode.value) {
    for (const id of okayuCardIds) map.set(id, "おかゆモードではおかゆんを除外できません");
  }
  return map;
});

/** 「メンバーから除外」のピッカーで選択不可のカード(固定中のもの。おかゆモードではおかゆんも) */
const excludeMemberDisabled = computed(() => {
  const map = new Map<string, string>();
  for (const id of chosenFixedIds.value) {
    map.set(id, "固定中のカードは除外できません");
  }
  if (okayuMode.value) {
    for (const id of okayuCardIds) map.set(id, "おかゆモードではおかゆんを除外できません");
  }
  return map;
});

/** リーダーピッカーで選択不可のカード(リーダーから除外中のもの。おかゆモードではおかゆん以外) */
const leaderDisabled = computed(() => {
  const map = new Map<string, string>();
  for (const id of excludedLeaderIds.value) {
    map.set(id, "リーダーから除外中のカードです（除外を解除すると選べます）");
  }
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

function toggleIn(list: string[], cardId: string): void {
  const index = list.indexOf(cardId);
  if (index >= 0) {
    list.splice(index, 1);
  } else {
    list.push(cardId);
  }
}
function onToggleExcludeLeader(cardId: string): void {
  toggleIn(excludedLeaderIds.value, cardId);
}
function onToggleExcludeMember(cardId: string): void {
  toggleIn(excludedMemberIds.value, cardId);
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
  // 所持しぼりこみ時は所持カード以外を(両方の役割の)除外に足してプールを絞る(エンジンは共通)。役割別の除外は別に渡す
  const excluded = new Set<string>();
  if (pool.value !== null) {
    const poolIdSet = new Set(pool.value.map((c) => c.id));
    for (const card of cards) {
      if (!poolIdSet.has(card.id)) excluded.add(card.id);
    }
  }
  // リアクティブ Proxy は postMessage で複製できないため、プレーン配列・オブジェクトに写す
  const blooms = { ...currentBlooms.value };
  const boards = plainBoardMap(currentBoards.value);
  const greenBoards = plainBoardMap(currentGreenBoards.value);
  const yellowBoards = plainBoardMap(currentYellowBoards.value);
  const redBoards = plainBoardMap(currentRedBoards.value);
  const accountBonus = normalizeAccount(account.value);
  ranBlooms.value = blooms;
  ranBoards.value = boards;
  ranGreen.value = accountGreenEffects(greenBoards);
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
    excludedLeaderCardIds: [...excludedLeaderIds.value],
    excludedMemberCardIds: [...excludedMemberIds.value],
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
    account: accountBonus,
    topN: TOP_N,
  });
}

/**
 * 6 枠すべて固定(この編成のスコアを試算)。しぼりこみは適用しない — 除いて何も出ないより不発の理由を見せる —
 * ので、そのあいだはチップを disabled にして「効いていない」ことを示す(2026-09-05 ユーザー指摘。状態は保持)
 */
const fullyFixed = computed(() => leaderId.value !== null && openSlots.value === 0);

/*
 * お気に入りユニット(2026-09-09 ユーザー指定)。
 * 結果の 1 件(スコアの数字があるパネル)の右上の星で、その編成を 1〜10 の番号へ登録する。
 * 登録済みならもう一度押して解除する。
 * 保存するのはカード ID だけ(src/storage/units.ts)で、Step 0「ユニット」で開くときに計算し直す —
 * 「数値は登録した時点ではなく表示した時点で最新の情報で計算した値にする」
 */
const savedUnits = ref<SavedUnit[]>(loadUnits());
watch(savedUnits, (units) => saveUnits(units), { deep: true });

/** 各候補が登録されている番号(未登録は null)。並びは結果の順位と同じ */
const resultUnitSlots = computed<(number | null)[]>(() =>
  (optimizer.candidates.value ?? []).map((c) =>
    unitSlotOf(savedUnits.value, { leaderId: c.leaderId, memberIds: c.memberIds }),
  ),
);

/** 星を押した順位(0 始まり)。番号選び・解除の対象になる編成 */
const favoriteRank = ref<number | null>(null);
const favoriteUnit = computed<UnitComposition | null>(() => {
  const candidate =
    favoriteRank.value === null ? null : (optimizer.candidates.value?.[favoriteRank.value] ?? null);
  return candidate === null
    ? null
    : { leaderId: candidate.leaderId, memberIds: [...candidate.memberIds] };
});

/** 番号選びのモーダルの開閉と、解除の確認中の番号 */
const unitSaveOpen = ref(false);
const unitReleasing = ref<number | null>(null);

function onFavorite(rank: number): void {
  // 未登録なら番号選び、登録済みなら解除の確認(星の状態でどちらかに分かれる)
  favoriteRank.value = rank;
  const slot = resultUnitSlots.value[rank] ?? null;
  if (slot === null) unitSaveOpen.value = true;
  else unitReleasing.value = slot;
}
function onUnitSave(slot: number): void {
  const unit = favoriteUnit.value;
  if (unit !== null) savedUnits.value = putUnit(savedUnits.value, slot, unit);
  unitSaveOpen.value = false;
  favoriteRank.value = null;
}
function onUnitRelease(): void {
  const slot = unitReleasing.value;
  unitReleasing.value = null;
  favoriteRank.value = null;
  if (slot !== null) savedUnits.value = removeUnit(savedUnits.value, slot);
}

/**
 * 「発動頻度のおすすめ」（ライブ最適化。ADR-007）の対象の編成。null = 閉。
 * 結果詳細・ユニット詳細のどちらからも同じシートを開く
 */
const frequencyCandidate = ref<CandidateView | null>(null);

/** Step 0「ユニット」の詳細シートの開閉 */
const unitSheetOpen = ref(false);
/** 現在のカードデータで評価できる登録(未知の ID を含む登録は出さないが、保存からは消さない) */
const shownUnits = computed(() =>
  savedUnits.value.filter((u) => [u.leaderId, ...u.memberIds].every((id) => cardById.has(id))),
);
/**
 * 登録ユニットの評価。6 枠すべて決まっているので組合せは 1 通りで、Worker を使わず同期で評価する。
 * いまの開花・ボード・アカウント補正・曲(探索と同じ入力)で計算し直すので、登録後に育てた分も反映される。
 * しぼりこみ(衣装スキル・パッシブ発動)は 6 枠固定では効かせない — 除いて何も出ないより不発の理由を見せる。
 * ページは番号 1〜10 の全部を並べる(番号 = ページ番号。未登録の番号は中身なしのページ)
 */
const unitPages = computed<UnitPage[]>(() => {
  if (!unitSheetOpen.value) return [];
  const base: Omit<OptimizeRunRequest, "leaderId" | "fixedMemberIds"> = {
    excludedCardIds: [],
    excludedLeaderCardIds: [],
    excludedMemberCardIds: [],
    leaderCandidateIds: null,
    requiredMemberHolomenIds: [],
    requireCostumeSkill: false,
    requireAllPassives: false,
    songId: songId.value,
    blooms: { ...currentBlooms.value },
    boards: plainBoardMap(currentBoards.value),
    greenBoards: plainBoardMap(currentGreenBoards.value),
    yellowBoards: plainBoardMap(currentYellowBoards.value),
    redBoards: plainBoardMap(currentRedBoards.value),
    account: normalizeAccount(account.value),
    topN: 1,
  };
  return Array.from({ length: UNIT_SLOT_COUNT }, (_, i) => i + 1).map((slot) => {
    const unit = shownUnits.value.find((u) => u.slot === slot);
    if (!unit) return { slot, unit: null };
    const [candidate] = runOptimize({
      ...base,
      leaderId: unit.leaderId,
      fixedMemberIds: [...unit.memberIds],
    }).candidates;
    if (!candidate) return { slot, unit: null };
    return {
      slot,
      unit: {
        leader: candidate.leader,
        candidate: {
          leaderId: candidate.leader.id,
          memberIds: candidate.members.map((m) => m.id),
          breakdown: candidate.breakdown,
          display: candidate.display,
          modifiers: candidate.modifiers,
        },
      },
    };
  });
});
</script>

<template>
  <div class="panel-group">
    <section class="panel" aria-labelledby="account-heading">
      <h2 id="account-heading"><span class="step-badge">0</span>アカウント</h2>
      <!-- 左から ホロメン(ボード) / メンバー(持っているカードと開花) / ユニット(お気に入り編成。登録が
           なくても開ける — 2026-09-09 ユーザー指示。中身は「未登録」の 10 ページ)。件数は出さない(2026-09-06 ユーザー指定) -->
      <div class="account-row">
        <button type="button" class="account-button" @click="picker = { mode: 'holomen' }">
          ホロメン
        </button>
        <button type="button" class="account-button" @click="picker = { mode: 'owned' }">
          メンバー
        </button>
        <button type="button" class="account-button" @click="unitSheetOpen = true">ユニット</button>
      </div>
      <!--
        アカウント共通の補正。ゲーム内の表示値(%)をそのまま入力する。メモリーは「ユニットパラメータ +X%」、
        強化ボーナスは「メンバー強化ボーナス +X%」。総合力の内訳に別枠で加算する(2026-09-08 実機内訳)
      -->
      <div class="account-bonus">
        <label class="bonus-field">
          <span class="bonus-label">メモリー</span>
          <span class="bonus-input">
            <input
              v-model.number="account.memoryPercent"
              type="number"
              inputmode="decimal"
              min="0"
              step="0.1"
              aria-label="メモリーのユニットパラメータ UP（%）"
            />
            <span class="bonus-unit">%</span>
          </span>
        </label>
        <label class="bonus-field">
          <span class="bonus-label">強化ボーナス</span>
          <span class="bonus-input">
            <input
              v-model.number="account.enhancementPercent"
              type="number"
              inputmode="decimal"
              min="0"
              step="0.01"
              aria-label="メンバー強化ボーナス（%）"
            />
            <span class="bonus-unit">%</span>
          </span>
        </label>
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
        オプション(既定で畳む — 2026-09-08 ユーザー指示。旧 Step 1「さがす対象」をここへ移した): 1〜2 行目は左に
        「所持カードから探す」を 2 行分(ON/OFF のチップ。既定 ON。旧セグメントの「持っているカード」)、右に
        「リーダーから除外 n枚」とその下に「メンバーから除外 n枚」(それぞれピッカーを開く、形の違う角丸矩形のボタン。
        件数は同じボタン内 — 2026-09-08 ユーザー指示「二つのタイルを用意しよう」)、
        その下に育成の反映 2 件 + スキル発動条件 2 件(複数選択可。既定はすべて ON)。
        育成の反映は全カードでは効かない(登録値を見ず最大の状態で試算する)ので、そのあいだは未選択(白)+disabled にする —
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
          class="chip tall"
          role="checkbox"
          :aria-checked="!searchAll"
          :class="{ active: !searchAll }"
          @click="searchAll = !searchAll"
        >
          所持カードから探す
        </button>
        <button
          type="button"
          class="exclude-button"
          aria-haspopup="dialog"
          @click="picker = { mode: 'excludeLeader' }"
        >
          <span>リーダーから除外</span>
          <span class="exclude-count">{{ excludedLeaderCount }}枚</span>
        </button>
        <button
          type="button"
          class="exclude-button"
          aria-haspopup="dialog"
          @click="picker = { mode: 'excludeMember' }"
        >
          <span>メンバーから除外</span>
          <span class="exclude-count">{{ excludedMemberCount }}枚</span>
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
        :unit-slots="resultUnitSlots"
        :fixed-ids="chosenFixedIds"
        :blooms="ranBlooms"
        :leader-fixed="ranLeaderFixed"
        :okayu-holomen-id="ranOkayu ? OKAYU_HOLOMEN_ID : null"
        :swipe-element="resultSection"
        @select="detailRank = $event"
        @favorite="onFavorite"
      />
    </section>

    <ResultDetail
      v-if="detailRank !== null && optimizer.candidates.value"
      :rank="detailRank"
      :candidates="optimizer.candidates.value"
      :blooms="ranBlooms"
      :boards="ranBoards"
      :green="ranGreen"
      :unit-slots="resultUnitSlots"
      @update:rank="detailRank = $event"
      @favorite="onFavorite"
      @frequency="frequencyCandidate = $event"
      @close="detailRank = null"
    />

    <UnitSaveModal
      v-if="unitSaveOpen"
      :units="savedUnits"
      @save="onUnitSave"
      @close="unitSaveOpen = false"
    />
    <ConfirmDialog
      v-if="unitReleasing !== null"
      :message="`ユニット${unitReleasing}を解除しますか？`"
      confirm-label="解除する"
      @confirm="onUnitRelease"
      @cancel="unitReleasing = null"
    />
    <UnitSheet
      v-if="unitSheetOpen"
      :pages="unitPages"
      :blooms="currentBlooms"
      :boards="currentBoards"
      :green="currentGreen"
      @release="unitReleasing = $event"
      @frequency="frequencyCandidate = $event"
      @close="unitSheetOpen = false"
    />

    <!--
      発動頻度のおすすめ（青ボードの頻度マスを何個開けるか）。表示ユニットスコアとは別モデルなので
      シートも別に開く。基準にするボードは「考慮する / しない」に関わらず**登録している状態**（boardMap）—
      いま自分のアカウントで何マス開けるべきかを答える機能のため
    -->
    <FrequencyPlanSheet
      v-if="frequencyCandidate"
      :candidate="frequencyCandidate"
      :blooms="currentBlooms"
      :boards="boardMap"
      :green="currentGreen"
      :song-id="songId"
      @close="frequencyCandidate = null"
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
      v-else-if="picker?.mode === 'excludeLeader'"
      title="リーダーから除外"
      mode="exclude"
      :pool="pool ?? undefined"
      skill-view="costume"
      :excluded-ids="excludedLeaderIds"
      :disabled="excludeLeaderDisabled"
      :blooms="currentBlooms"
      memory-key="exclude-leader"
      @toggle="onToggleExcludeLeader"
      @close="picker = null"
    />
    <CardPicker
      v-else-if="picker?.mode === 'excludeMember'"
      title="メンバーから除外"
      mode="exclude"
      :pool="pool ?? undefined"
      skill-view="member"
      :excluded-ids="excludedMemberIds"
      :disabled="excludeMemberDisabled"
      :blooms="currentBlooms"
      memory-key="exclude-member"
      @toggle="onToggleExcludeMember"
      @close="picker = null"
    />
    <CardPicker
      v-else-if="picker?.mode === 'owned'"
      title="メンバー"
      mode="multi"
      skill-view="member"
      :selected-ids="ownedIds"
      :blooms="registeredBlooms"
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
  background: var(--selected);
  border-radius: 50%;
  color: var(--selected-ink);
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
  color: var(--error);
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

/*
 * アカウント共通の補正(メモリー / 強化ボーナス)。ボタン行の下に 1 項目 1 行で、ラベルを左端・数値欄を右端に揃える。
 * ラベルの文字はボタン内(14px・600)と同じ(2026-09-08 ユーザー指示。2 列横並びは「ださい」)
 */
.account-bonus {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.bonus-field {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.bonus-label {
  color: var(--ink);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.bonus-input {
  align-items: center;
  display: flex;
  gap: 2px;
}

.bonus-input input {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink);
  font-size: 16px; /* iOS の自動ズーム防止のため 16px 未満にしない */
  font-variant-numeric: tabular-nums;
  height: 36px;
  padding: 0 8px;
  text-align: right;
  width: 72px;
}

.bonus-input input:focus {
  border-color: var(--link);
  outline: 2px solid var(--link);
  outline-offset: -1px;
}

.bonus-unit {
  color: var(--ink-2);
  font-size: 12px;
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

/* 1〜2 行目の左「所持カードから探す」は 2 行分(右の除外 2 ボタンと高さを揃える。ピルの形はそのまま) */
.option-chips .chip.tall {
  grid-row: span 2;
  height: auto;
}

/*
 * 1〜2 行目の右半分「リーダーから除外 n枚」「メンバーから除外 n枚」: ピッカーを開くボタンなので、ON/OFF のチップ(ピル)
 * とは形を変えた角丸矩形。高さ・文字はチップに揃え、ラベル左・件数右(設定行パターンの縮小形)
 */
.exclude-button {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-size: 12px;
  font-weight: 600;
  height: 32px;
  justify-content: space-between;
  padding: 0 10px;
  white-space: nowrap;
}

.exclude-count {
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
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
  background: var(--selected);
  border-color: var(--ink);
  color: var(--selected-ink);
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
  background: var(--selected);
  border: 2px solid var(--surface);
  border-radius: 50%;
  color: var(--selected-ink);
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
