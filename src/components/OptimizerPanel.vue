<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";

import BoardSheet from "./BoardSheet.vue";
import CardPicker from "./CardPicker.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import HolomenPicker from "./HolomenPicker.vue";
import NumberPad from "./NumberPad.vue";
import ResultDetail from "./ResultDetail.vue";
import ResultList from "./ResultList.vue";
import SongPicker from "./SongPicker.vue";
import SkillIcon from "./SkillIcon.vue";
import SongRow from "./SongRow.vue";
import UnitSaveModal from "./UnitSaveModal.vue";
import UnitSheet from "./UnitSheet.vue";
import FrequencyPlanSheet from "./FrequencyPlanSheet.vue";
import type { UnitPage } from "./UnitSheet.vue";
import UnitSlot from "./UnitSlot.vue";
import { OKAYU_HOLOMEN_ID, okayuCardIds, useOkayuMode } from "../composables/useOkayuMode";
import { useOptimizer } from "../composables/useOptimizer";
import type { CandidateView } from "../composables/useOptimizer";
import {
  placeConnect,
  setBoardNodes,
  useBoards,
  useConnectPlacements,
} from "../composables/useBoards";
import { useOwnedCards } from "../composables/useOwnedCards";
import { cardById, cards, holomen, songById } from "../data";
import { BLOOM_MAX, bloomOf } from "../data/bloom";
import { BLUE_BOARD_NODE_IDS } from "../data/blueBoard";
import { connectFactorMapOf, factorsForColor } from "../data/connect";
import type { ConnectAnchor, ConnectFactorMap, ConnectPlacements } from "../data/connect";
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
import { toBoardMap } from "../storage/boards";
import type { BoardColor, BoardEntry, BoardMap } from "../storage/boards";
import { toConnectPlacementMap } from "../storage/connect";
import type { ConnectPlacementMap } from "../storage/connect";
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

/**
 * カード詳細（App が重ねる）を開く。結果詳細・ユニット詳細のリーダー／メンバーのタイルから上がってくる
 * （2026-09-10 ユーザー指示「結果詳細画面でカードタップしたらカード詳細見れるように」）
 */
const emit = defineEmits<{
  card: [cardId: string];
}>();

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
 * 所持カードの登録(状態はアプリ全体で 1 つ — src/composables/useOwnedCards.ts。
 * サイドメニューの「データの取り込み」も同じ配列を触る)。UI で使うのは既知の ID のみ
 */
const ownedCards = useOwnedCards();
const ownedIds = computed(() => ownedCards.value.map((o) => o.id).filter((id) => cardById.has(id)));

/**
 * ホロメンボードの登録(ホロメン単位・色ごと。保存形式は src/storage/boards.ts。状態はアプリで 1 つ —
 * src/composables/useBoards.ts。サイドメニューの管理用「ホロメンボード」の取り込みも同じ配列を触る)。
 * Step 0 のホロメンピッカーから開く。ボードはカードでなくホロメンの状態。探索に効くのは
 * 持っているカードで「ボード状況を考慮する」が ON のときだけで、考慮しないときは全解放として試算する。
 * 青はそのホロメンのカードに、緑は全ホロメン分の合計が全カードに効く(2026-09-07)。
 * 黄(2026-09-08)は曲を指定したとき、その曲の楽曲スコアボーナスとして表示ユニットスコアの
 * ホロメンボード効果欄に入る(アカウント全体。2026-09-11 実機確定 — 後掛けの倍率ではない)。
 * 赤(2026-09-08)はそのホロメンをリーダーにした編成のメンバー 5 人に効く(リーダー依存なので Worker の探索へ渡す)
 */
const savedBoards = useBoards();
const redEntries = savedBoards.red;
const redMap = computed<BoardMap>(() => toBoardMap("red", redEntries.value));
const boardEntries = savedBoards.blue;
const boardMap = computed<BoardMap>(() => toBoardMap("blue", boardEntries.value));
const yellowEntries = savedBoards.yellow;
const yellowMap = computed<BoardMap>(() => toBoardMap("yellow", yellowEntries.value));
const greenEntries = savedBoards.green;
const greenMap = computed<BoardMap>(() => toBoardMap("green", greenEntries.value));
/**
 * コネクトマスに置いたカード(ホロメン ID → アンカー → カード ID。src/storage/connect.ts。暫定仕様 — src/data/connect.ts)。
 * 置いたカードのコネクト効果で範囲内の解放済みマスを増幅する。効果のデータがないカードは置いても増幅なし
 */
const connectEntries = useConnectPlacements();
const connectMap = computed<ConnectPlacementMap>(() => toConnectPlacementMap(connectEntries.value));
/** ボードを開いているホロメン ID(null = 閉) */
const boardEditing = ref<string | null>(null);
const entryOf = (entries: BoardEntry[], holomenId: string | null): string[] =>
  entries.find((e) => e.holomenId === holomenId)?.nodes ?? [];
const editingRedNodes = computed(() => entryOf(redEntries.value, boardEditing.value));
const editingBlueNodes = computed(() => entryOf(boardEntries.value, boardEditing.value));
const editingYellowNodes = computed(() => entryOf(yellowEntries.value, boardEditing.value));
const editingGreenNodes = computed(() => entryOf(greenEntries.value, boardEditing.value));
function onBoardUpdate(holomenId: string, color: BoardColor, nodes: string[]): void {
  setBoardNodes(color, holomenId, nodes);
}
/** 開いているホロメンのコネクトの配置と、登録した開花段階で計算した倍率(ボード画面の効果表・増幅マスの表示に使う) */
const editingPlacements = computed<ConnectPlacements>(
  () => connectMap.value[boardEditing.value ?? ""] ?? {},
);
const editingFactors = computed(() => {
  const id = boardEditing.value;
  if (id === null) return {};
  return connectFactorMapOf({ [id]: editingPlacements.value }, registeredBlooms.value)[id] ?? {};
});
/** コネクトマスに置くカードを選んでいるアンカー(null = 閉じている)。ボード画面の人物アイコンから開く */
const connectPicking = ref<ConnectAnchor | null>(null);
function onConnectPicked(cardId: string): void {
  if (boardEditing.value !== null && connectPicking.value !== null) {
    placeConnect(boardEditing.value, connectPicking.value, cardId);
  }
  connectPicking.value = null;
}
function onConnectClear(holomenId: string, anchor: ConnectAnchor): void {
  placeConnect(holomenId, anchor, null);
}

/**
 * アカウント共通の補正(メモリーの「ユニットパラメータ +X%」・メンバー強化ボーナス +X%。保存形式は src/storage/account.ts)。
 * Step 0 に数値欄で置く。総合力にメモリー効果・メンバー強化ボーナスとして別枠で加算する(src/engine/power.ts — 2026-09-08 実機内訳)
 */
const account = ref<AccountBonus>(loadAccount());
watch(account, (value) => saveAccount(normalizeAccount(value)), { deep: true });

/**
 * 開いているテンキーの対象(null = 閉じている)。`<input>` を置くとモバイルで OS のキーボードが
 * 出てしまうので、数字と小数点だけの自前ダイアログで入れる(2026-09-10 ユーザー指示)
 */
const padTarget = ref<"memory" | "enhancement" | null>(null);
const PAD_LABELS = { memory: "イベントメモリー", enhancement: "メンバー強化ボーナス" } as const;
/**
 * 項目ごとの小数の桁数(入力の上限と表示の桁を同じにする — 2026-09-11 ユーザー指示「イベントメモリーは小数点以下一桁まで。
 * 0 でも .0 と出す。メンバー強化ボーナスも .00 まで出したい」)。ゲーム画面の表記(メモリー +6.0%・強化 +3.00%)と同じ桁
 */
const PAD_DECIMALS = { memory: 1, enhancement: 2 } as const;

/** ボタンに出す % の値。項目の桁数まで常に出す(0 → 0.0 / 0.00) */
function percentLabel(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

function onPadSubmit(value: number): void {
  if (padTarget.value === "memory") account.value.memoryPercent = value;
  else if (padTarget.value === "enhancement") account.value.enhancementPercent = value;
  padTarget.value = null;
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
/** 直前の結果でしぼりこみが効いていたか(0 件のときの案内文に使う) */
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
 * 曲依存の補正(黄ボードの楽曲スコアボーナスをボード欄へ・イベントスコアボーナスの倍率)の対象。
 * null = 曲依存の補正を入れない。曲長・譜面は現在の表示ユニットスコアの探索では使わない(ADR-006)
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
  | { mode: "member" }
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
 * 「おかゆん」にする(最初から出さない。おかゆんを選んだ時点で出ない)
 */
function memberEmptyText(slot: number): string {
  const lastSlotForOkayu =
    okayuMode.value &&
    slot === MEMBER_SLOTS - 1 &&
    chosenFixedIds.value.length === MEMBER_SLOTS - 1 &&
    !fixedHasOkayu.value;
  return lastSlotForOkayu ? "おかゆん" : "おまかせ";
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
const plainPlacements = (map: ConnectPlacementMap): ConnectPlacementMap =>
  Object.fromEntries(Object.entries(map).map(([k, v]) => [k, { ...v }]));
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
/**
 * コネクトの配置は「考慮する」ときだけ登録値を使う。考慮しない(全解放)ときは置くカードを勝手に決めず**増幅なし**にする
 * (既存の結果を突然大きく変えない安全策。最適なコネクト配置の探索は未実装)
 */
const currentConnectPlacements = computed<ConnectPlacementMap>(() =>
  useBoard.value ? connectMap.value : {},
);
const currentConnect = computed<ConnectFactorMap>(() =>
  connectFactorMapOf(currentConnectPlacements.value, currentBlooms.value),
);
/** 発動頻度のおすすめは登録している状態(boardMap)が基準なので、コネクトも登録値で */
const registeredConnect = computed<ConnectFactorMap>(() =>
  connectFactorMapOf(connectMap.value, currentBlooms.value),
);
/** 緑ボードはアカウント全体の合計を 1 つの値にして全カードへ(コネクト増幅込み) */
const currentGreen = computed<GreenBoardEffects>(() =>
  accountGreenEffects(currentGreenBoards.value, factorsForColor(currentConnect.value, "green")),
);

/**
 * 直近の結果に使った開花段階・ボード(結果・詳細の表示用スナップショット)。
 * 実行開始時ではなく**結果が届いたとき**に差し替える — 再実行のあいだ前回の結果を表示したままにするので、
 * 開始時に差し替えると前回の候補が今回の開花・ボードで描かれてしまう(2026-09-11)
 */
const ranBlooms = ref<BloomMap>({});
const ranBoards = ref<BoardMap>({});
const ranGreen = ref<GreenBoardEffects | null>(null);
const ranConnect = ref<ConnectFactorMap>({});
/** 直近の結果でリーダーを指定していたか(結果のリーダー行のピン表示) */
const ranLeaderFixed = ref(false);
/** 直近の結果がおかゆモードだったか(結果のおかゆん行のおにぎり表示・位置の散らし) */
const ranOkayu = ref(false);
/** 実行中の依頼のスナップショット(結果が届いたら ran* へ写す) */
interface RanSnapshot {
  blooms: BloomMap;
  boards: BoardMap;
  green: GreenBoardEffects;
  connect: ConnectFactorMap;
  leaderFixed: boolean;
  okayu: boolean;
  filtered: boolean;
}
let pendingRan: RanSnapshot | null = null;
/** 結果が届いたら、その依頼のスナップショットを表示用の ran* へ写す(再実行中は前回の結果と前回の ran* のまま) */
watch(optimizer.candidates, (candidates) => {
  if (!candidates || !pendingRan) return;
  ranBlooms.value = pendingRan.blooms;
  ranBoards.value = pendingRan.boards;
  ranGreen.value = pendingRan.green;
  ranConnect.value = pendingRan.connect;
  ranLeaderFixed.value = pendingRan.leaderFixed;
  ranOkayu.value = pendingRan.okayu;
  ranFiltered.value = pendingRan.filtered;
  pendingRan = null;
});

const leader = computed(() => cardOf(leaderId.value));
const song = computed(() => (songId.value ? (songById.get(songId.value) ?? null) : null));
const chosenFixedIds = computed(() => fixedIds.value.filter((id): id is string => id !== null));
const openSlots = computed(() => MEMBER_SLOTS - chosenFixedIds.value.length);

/** スロット表示用: スキル文言を現在の開花段階・ボードに解決したカード */
function cardOf(id: string | null) {
  const card = id ? (cardById.get(id) ?? null) : null;
  return card
    ? resolveCard(
        card,
        currentBlooms.value,
        currentBoards.value,
        currentGreen.value,
        currentConnect.value,
      )
    : null;
}

/**
 * メンバーピッカーで選択不可のカード(固定中と同一ホロメン・除外中・枠が埋まっている)。
 * リーダーとの重複は可。固定中のカード自身は常に押せる(タップで外せる)
 */
const memberDisabled = computed(() => {
  const map = new Map<string, string>();
  const chosen = new Set(chosenFixedIds.value);
  const takenHolomen = new Map<string, string>();
  for (const id of chosen) {
    const card = cardById.get(id);
    if (card) takenHolomen.set(card.holomenId, holomenName(card.holomenId));
  }
  const full = chosen.size >= MEMBER_SLOTS;
  // おかゆモード: 最後の 1 枠までおかゆんがいなければ、その枠はおかゆんしか選べない
  const needOkayu =
    okayuMode.value && chosen.size === MEMBER_SLOTS - 1 && !takenHolomen.has(OKAYU_HOLOMEN_ID);
  for (const card of cardById.values()) {
    if (chosen.has(card.id)) continue;
    if (takenHolomen.has(card.holomenId)) {
      map.set(card.id, `${holomenName(card.holomenId)} は固定中です（メンバー同士は重複不可）`);
    } else if (excludedMemberIds.value.includes(card.id)) {
      map.set(card.id, "メンバーから除外中のカードです（除外を解除すると選べます）");
    } else if (full) {
      map.set(card.id, "メンバー枠が埋まっています（固定中のカードを外すと選べます）");
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

/** 固定したカードは上から順に詰めるので、次に入るのは常に先頭の空き枠(埋まっていれば -1) */
const firstEmptySlot = computed(() => fixedIds.value.indexOf(null));

/**
 * メンバー枠は仮想ガチャ・結果詳細と同じ 5 列のタイルで横並びにする(2026-09-10 ユーザー指示。
 * 1 枠ずつの横スクロールから変更)。どのタイルも同じピッカーの入口で、解除はピッカーで外す
 */
const memberTiles = computed(() =>
  chosenFixedIds.value.map((id) => ({
    id,
    card: cardOf(id),
    bloom: bloomOf(currentBlooms.value, id),
  })),
);
/** 空き枠はまとめて 1 つの「おまかせ」にする(中に残り枠数ぶんの点線の枡を敷く) */
const emptySlotCount = computed(() => MEMBER_SLOTS - chosenFixedIds.value.length);
const emptySlotLabel = computed(() => memberEmptyText(MEMBER_SLOTS - 1));
const resultSection = useTemplateRef<HTMLElement>("resultSection");

/** リーダー・曲のように 1 つだけ選ぶピッカーは、選んだら閉じる */
function onPick(cardId: string): void {
  if (picker.value?.mode !== "leader") return;
  leaderId.value = cardId;
  picker.value = null;
}

/**
 * メンバーの固定は所持登録と同じくタップでトグルし、シートは閉じない(2026-09-10 ユーザー指示)。
 * 固定は枠の順ではなく集合として探索へ渡るので、追加は先頭の空き枠・解除は詰め直しでよい
 */
function onToggleFixed(cardId: string): void {
  const index = fixedIds.value.indexOf(cardId);
  if (index >= 0) {
    clearSlot(index);
    return;
  }
  const empty = firstEmptySlot.value;
  if (empty < 0) return; // 枠が埋まっているカードは disabled なのでここには来ない
  fixedIds.value[empty] = cardId;
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
  const connectPlacements = plainPlacements(currentConnectPlacements.value);
  const accountBonus = normalizeAccount(account.value);
  const applyFilters = !fullyFixed.value;
  const requireCostumeSkill = applyFilters && searchOptions.value.costume;
  const requireAllPassives = applyFilters && searchOptions.value.passives;
  // 結果が届くまで前回の結果を表示したままにするので、表示用のスナップショットは届いたときに差し替える
  const connect = connectFactorMapOf(connectPlacements, blooms);
  pendingRan = {
    blooms,
    boards,
    green: accountGreenEffects(greenBoards, factorsForColor(connect, "green")),
    connect,
    leaderFixed: leaderId.value !== null,
    okayu: okayuMode.value,
    filtered: requireCostumeSkill || requireAllPassives,
  };
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
    connectPlacements,
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
 * いまの開花・ボード・アカウント補正で計算し直すので、登録後に育てた分も反映される。
 * **曲は渡さない**(`songId: null`) — この画面はゲームのユニット編成画面に相当し、曲を選ばない値を出す。メイン画面で
 * 曲を変えるたびに登録ユニットのユニットスコアが変わるのは「気持ち悪い」(2026-09-11 ユーザー指摘)。曲の反映(黄の
 * ボード欄・赤の歌唱者条件・イベント)は「さがす」の結果側だけで行う。
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
    songId: null,
    blooms: { ...currentBlooms.value },
    boards: plainBoardMap(currentBoards.value),
    greenBoards: plainBoardMap(currentGreenBoards.value),
    yellowBoards: plainBoardMap(currentYellowBoards.value),
    redBoards: plainBoardMap(currentRedBoards.value),
    connectPlacements: plainPlacements(currentConnectPlacements.value),
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
        強化ボーナスは「メンバー強化ボーナス +X%」。総合力の内訳に別枠で加算する(2026-09-08 実機内訳)。
        入力はホロメン / メンバー / ユニットと同じ形のボタン 2 つで、押すと自前のテンキー(NumberPad)を出す
        — OS のキーボードを出させない(2026-09-10 ユーザー指示)。左半分・右半分だと正式な名前と値が
        重なるので 1 行 1 つに縦積みし、名前も略さない(同日ユーザー指示「オーバーラップするならボタンは
        無理に 1 行にせず 2 行にする。そのときはイベントメモリー、メンバー強化ボーナスという文にする」)
      -->
      <div class="bonus-list">
        <button type="button" class="bonus-button" @click="padTarget = 'memory'">
          <span class="bonus-name">{{ PAD_LABELS.memory }}</span>
          <span class="bonus-value"
            >{{ percentLabel(account.memoryPercent, PAD_DECIMALS.memory) }}%</span
          >
        </button>
        <button type="button" class="bonus-button" @click="padTarget = 'enhancement'">
          <span class="bonus-name">{{ PAD_LABELS.enhancement }}</span>
          <span class="bonus-value">
            {{ percentLabel(account.enhancementPercent, PAD_DECIMALS.enhancement) }}%
          </span>
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

    <section class="panel" aria-labelledby="member-heading">
      <h2 id="member-heading"><span class="step-badge">2</span>メンバー</h2>
      <!-- 5 枠を横並び(仮想ガチャ・結果詳細と同じタイル)。どの枠も同じピッカーを開き、解除もその中で行う -->
      <div
        class="member-grid"
        :class="{ 'with-bloom': useBloom }"
        role="group"
        aria-label="メンバー枠"
      >
        <button
          v-for="tile in memberTiles"
          :key="tile.id"
          type="button"
          class="member-tile"
          :class="`type-${tile.card?.type ?? 'cute'}`"
          :disabled="okayuBlocked"
          :aria-label="`固定中: ${holomenName(tile.card?.holomenId ?? '')}`"
          @click="picker = { mode: 'member' }"
        >
          <span class="member-name">{{ holomenName(tile.card?.holomenId ?? "") }}</span>
          <span class="member-card-name">{{ tile.card?.name }}</span>
          <span v-if="useBloom" class="member-bloom">
            <SkillIcon kind="bloom" :count="tile.bloom" :label="`開花${tile.bloom}`" />
          </span>
        </button>
        <!-- 空き枠は 1 つの「おまかせ」にまとめ、中に残り枠数ぶんの点線の枡を敷いて枠数だけ見せる -->
        <button
          v-if="emptySlotCount > 0"
          type="button"
          class="member-tile member-empty"
          :class="{ narrow: emptySlotCount <= 2 }"
          :style="{ gridColumn: `span ${String(emptySlotCount)}`, '--cells': emptySlotCount }"
          :disabled="okayuBlocked"
          :aria-label="`空きのメンバー枠 ${emptySlotCount} つ`"
          @click="picker = { mode: 'member' }"
        >
          <span class="empty-cells" aria-hidden="true">
            <span v-for="n in emptySlotCount" :key="n" class="empty-cell"></span>
          </span>
          <span class="empty-msg">{{ emptySlotLabel }}</span>
        </button>
      </div>
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

    <!-- 再実行のあいだも前回の結果を残して薄くする(セクションを外すと下のフッタが繰り上がってチラつく — 2026-09-11) -->
    <section
      v-if="optimizer.candidates.value"
      ref="resultSection"
      class="panel"
      :class="{ stale: optimizer.running.value }"
      :aria-busy="optimizer.running.value"
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
      :connect="ranConnect"
      :unit-slots="resultUnitSlots"
      @update:rank="detailRank = $event"
      @favorite="onFavorite"
      @frequency="frequencyCandidate = $event"
      @card="emit('card', $event)"
      @close="detailRank = null"
    />

    <UnitSaveModal
      v-if="unitSaveOpen"
      :units="savedUnits"
      @save="onUnitSave"
      @close="unitSaveOpen = false"
    />
    <!-- 数値の入力は自前のテンキーで（OS のキーボードを出させない — 2026-09-10 ユーザー指示） -->
    <NumberPad
      v-if="padTarget !== null"
      :label="PAD_LABELS[padTarget]"
      :value="padTarget === 'memory' ? account.memoryPercent : account.enhancementPercent"
      :decimals="PAD_DECIMALS[padTarget]"
      unit="%"
      @submit="onPadSubmit"
      @cancel="padTarget = null"
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
      :connect="currentConnect"
      @release="unitReleasing = $event"
      @frequency="frequencyCandidate = $event"
      @card="emit('card', $event)"
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
      :connect="registeredConnect"
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
      title="メンバー"
      mode="multi"
      skill-view="member"
      :pool="pool ?? undefined"
      :selected-ids="chosenFixedIds"
      :disabled="memberDisabled"
      :blooms="currentBlooms"
      :bloom-badge="useBloom"
      selected-label="固定中"
      ordered
      memory-key="member"
      @toggle="onToggleFixed"
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
      :placements="editingPlacements"
      :factors="editingFactors"
      :blooms="registeredBlooms"
      @update="onBoardUpdate"
      @connect="(_holomenId: string, anchor: ConnectAnchor) => (connectPicking = anchor)"
      @clear-connect="onConnectClear"
      @close="boardEditing = null"
    />
    <!-- コネクトマスに置くカード(ボード画面の人物アイコンから。全カードから 1 枚選ぶ。同じホロメンのカードでなくてよい) -->
    <CardPicker
      v-if="boardEditing !== null && connectPicking !== null"
      title="コネクトに置くカード"
      mode="pick"
      skill-view="member"
      :selected-id="editingPlacements[connectPicking] ?? null"
      :blooms="registeredBlooms"
      @pick="onConnectPicked"
      @close="connectPicking = null"
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
 * アカウント共通の補正(イベントメモリー / メンバー強化ボーナス)。上のボタン行と同じ器で、
 * ボタンの中はラベルを左端・値(%)を右端に寄せる(2026-09-10 ユーザー指示)。
 * 左右半分ずつだと正式な名前と値が重なるので 1 行 1 つの縦積みにする(同日ユーザー指示)。
 * 押すと自前のテンキー(NumberPad)が開く — 数値欄をやめたのでキーボードは出ない
 */
.bonus-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.bonus-button {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  gap: 4px;
  height: 44px;
  justify-content: space-between;
  padding: 0 10px;
}

.bonus-name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.bonus-value {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  white-space: nowrap;
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

/*
 * メンバー枠: 仮想ガチャ・結果詳細と同じ 5 列のタイル(タイプ淡色の面・中央揃え・2 行クランプ)。
 * 空の枠は点線のプレースホルダで、寸法は空・充填で変えない
 */
.member-grid {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(5, 1fr);
  margin-top: 8px;
}

.member-tile {
  align-items: stretch;
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 69px;
  padding: 6px 4px;
  text-align: center;
}

/* 開花アイコンを出す(持っているカード)ときはその 1 行ぶん高い。空の枠も同じ高さにする */
.member-grid.with-bloom .member-tile {
  min-height: 101px;
}

.member-tile:disabled {
  cursor: default;
  opacity: 0.4;
}

/* 空き枠をまとめた「おまかせ」: 外は 1 つの点線の枠、内側に残り枠数ぶんの点線の枡(タップ判定は 1 つ) */
.member-empty {
  align-items: center;
  background: var(--bg);
  border-style: dashed;
  justify-content: center;
  padding: 5px;
  position: relative;
}

.empty-cells {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(var(--cells, 1), 1fr);
  inset: 5px;
  position: absolute;
}

.empty-cell {
  border: 1px dotted var(--line);
  border-radius: var(--r-s);
}

.empty-msg {
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 600;
  position: relative;
}

/* 残り 1〜2 枠のときは 14px が収まらないので 1 段小さくする */
.member-empty.narrow .empty-msg {
  font-size: 11px;
  word-break: break-all;
}

.member-tile.type-cute {
  background: var(--cute-tint);
  border-color: var(--cute-tint);
}

.member-tile.type-happy {
  background: var(--happy-tint);
  border-color: var(--happy-tint);
}

.member-tile.type-pure {
  background: var(--pure-tint);
  border-color: var(--pure-tint);
}

.member-name {
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

.member-card-name {
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

.member-bloom {
  display: flex;
  justify-content: center;
  margin-top: 2px;
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

/* 再実行中の前回の結果: 残したまま薄くして触れなくする(消すと下のフッタが繰り上がってチラつく — 2026-09-11) */
.panel.stale {
  opacity: 0.5;
  pointer-events: none;
}
</style>
