<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, useTemplateRef, watch } from "vue";

import BoardSheet from "./BoardSheet.vue";
import CardPicker from "./CardPicker.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import ConnectInventorySheet from "./ConnectInventorySheet.vue";
import ConnectSheet from "./ConnectSheet.vue";
import HolomenPicker from "./HolomenPicker.vue";
import InfoButton from "./InfoButton.vue";
import InfoDialog from "./InfoDialog.vue";
import OptimizePlanSheet from "./OptimizePlanSheet.vue";
import StepperDialog from "./StepperDialog.vue";
import PoolFilterDialog from "./PoolFilterDialog.vue";
import ResourceSheet from "./ResourceSheet.vue";
import ResultDetail from "./ResultDetail.vue";
import ResultList from "./ResultList.vue";
import SongPicker from "./SongPicker.vue";
import SkillIcon from "./SkillIcon.vue";
import SongRow from "./SongRow.vue";
import UnitSaveModal from "./UnitSaveModal.vue";
import UnitSheet from "./UnitSheet.vue";
import type { UnitPage } from "./UnitSheet.vue";
import UnitSlot from "./UnitSlot.vue";
import { OKAYU_HOLOMEN_ID, okayuCardIds, useOkayuMode } from "../composables/useOkayuMode";
import { useOptimizer } from "../composables/useOptimizer";
import type { CandidateView } from "../composables/useOptimizer";
import { useTrueRanking } from "../composables/useTrueRanking";
import TrueRankingProgress from "./TrueRankingProgress.vue";
import { rankByOptimized, rankingEstimate } from "../ui/trueRanking";
import {
  applyConnectPlacements,
  placeConnect,
  setHolomenBoards,
  setRank,
  useBoardConnects,
  useBoards,
  useConnectPlacements,
  useHolomenRanks,
} from "../composables/useBoards";
import { useConnectInventory } from "../composables/useConnectInventory";
import { useKeepOptions } from "../composables/useKeepOptions";
import { useOwnedCards } from "../composables/useOwnedCards";
import { cardById, cards, holomen, medianSongDurationSeconds, songById } from "../data";
import { BLOOM_MAX, bloomOf } from "../data/bloom";
import { BLUE_BOARD_NODE_IDS } from "../data/blueBoard";
import {
  boardBudgetOf,
  connectUnlockStatus,
  lockConnector,
  lockConnectImpact,
  spentBoardPoints,
  unlockConnector,
} from "../data/boardState";
import type { HolomenBoards } from "../data/boardState";
import { replaceBoardResources, useBoardResources } from "../composables/useBoardResources";
import type { BoardResources } from "../storage/boardResources";
import { connectFactorMapOf, factorsForColor } from "../data/connect";
import type {
  ConnectAnchor,
  ConnectFactorMap,
  ConnectPlacement,
  ConnectPlacements,
} from "../data/connect";
import { accountGreenEffects, GREEN_BOARD_NODE_IDS } from "../data/greenBoard";
import type { GreenBoardEffects } from "../data/greenBoard";
import type { BloomMap } from "../data/bloom";
import { RED_BOARD_NODE_IDS } from "../data/redBoard";
import { resolveCard } from "../data/resolve";
import { YELLOW_BOARD_NODE_IDS } from "../data/yellowBoard";
import type { Card } from "../data/types";
import type { OptimizePlanResult } from "../engine/optimizePlan";
import type { TrueRankingInput } from "../engine/trueRanking";
import type { AccountBonus } from "../engine/power";
import { runOptimize } from "../engine/request";
import type { OptimizeRunRequest } from "../engine/request";
import {
  DEFAULT_ACCOUNT_BONUS,
  loadAccount,
  normalizeAccount,
  saveAccount,
} from "../storage/account";
import { toBoardMap } from "../storage/boards";
import type { BoardColor, BoardEntry, BoardMap } from "../storage/boards";
import { toBoardConnectMap } from "../storage/boardConnects";
import { toHolomenRankMap } from "../storage/holomenRank";
import { toConnectPlacementMap } from "../storage/connect";
import type { ConnectPlacementMap } from "../storage/connect";
import { hasInventory, inventoryItems, placementShortage } from "../storage/connectInventory";
import type { ConnectSlot } from "../storage/connectInventory";
import { loadSearchAll, resolveSearchAll, saveSearchAll } from "../storage/searchAll";
import {
  defaultSearchOptions,
  loadSearchOptions,
  saveSearchOptions,
} from "../storage/searchOptions";
import type { SearchOptions } from "../storage/searchOptions";
import { emptySelection, loadSelection, packSlots, saveSelection } from "../storage/selection";
import type { PoolMode } from "../storage/selection";
import {
  loadUnits,
  putUnit,
  removeUnit,
  renameUnit,
  saveUnits,
  unitDisplayName,
  unitSlotOf,
} from "../storage/units";
import type { SavedUnit, UnitComposition } from "../storage/units";
import { holomenName } from "../ui/labels";
import { effectiveSelectedIds, roleExclusions } from "../ui/poolRestriction";
import {
  ACCOUNT_INFO,
  LEADER_INFO,
  MEMBER_INFO,
  PREMISE_INFO,
  RESULT_TAB_INFO,
  SONG_INFO,
} from "../ui/infoContent";
import type { ResultTab } from "../ui/infoContent";
import { SEARCH_PREMISES, searchOptionsOf, searchPremiseOf } from "../ui/searchPremise";
import type { SearchPremise } from "../ui/searchPremise";
import {
  formatCombinationCount,
  searchRemainingLabel,
  searchRemainingMs,
} from "../ui/searchProgress";

/**
 * カード詳細（App が重ねる）を開く。結果詳細・ユニット詳細のリーダー／メンバーのタイルから上がってくる
 * （2026-09-10 ユーザー指示「結果詳細画面でカードタップしたらカード詳細見れるように」）
 */
const emit = defineEmits<{
  /** カード ID と、詳細を開くときの開花段階(結果の内訳が使っていた段階。リーダーは最大 — `.claude/rules/ui-parts.md`) */
  card: [cardId: string, bloom: number];
}>();

const MEMBER_SLOTS = 5;

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
 * コネクトマスの入力(ホロメン ID → アンカー → 範囲の形と増幅 ‰。src/storage/connect.ts。暫定仕様 — src/data/connect.ts)。
 * 範囲内の解放済みマスを増幅する
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
/**
 * ホロメンランク(ホロメン ID → 1〜50。未登録は含めない = ボードPt の制限なし)と、解放済みのコネクトマス
 * (ホロメン ID → 赤 / 青 / 黄。コネクトの配置とは別の状態 — src/storage/boardConnects.ts)。2026-10-04 ユーザー指示
 */
/** 「リソース」の登録値(いまのボードを開けた上での余り)。組み直しプラン・結果の「組み直すと」がボードの段の共有の資材予算に使う */
const boardResources = useBoardResources();
const rankEntries = useHolomenRanks();
const rankMap = computed(() => toHolomenRankMap(rankEntries.value));
const boardConnectEntries = useBoardConnects();
const boardConnectMap = computed(() => toBoardConnectMap(boardConnectEntries.value));
const editingConnects = computed(() => boardConnectMap.value[boardEditing.value ?? ""] ?? []);
/** 開いているホロメンのボード全体の状態と、ホロメンランクからの予算 */
const editingBoards = computed<HolomenBoards>(() => ({
  red: editingRedNodes.value,
  blue: editingBlueNodes.value,
  yellow: editingYellowNodes.value,
  green: editingGreenNodes.value,
  connects: editingConnects.value,
}));
const editingRank = computed(() => rankMap.value[boardEditing.value ?? ""] ?? null);
const editingBudget = computed(() =>
  boardBudgetOf(editingRank.value, spentBoardPoints(editingBoards.value)),
);
/** ボード画面の解放・解除(4 色の解放マスと解放済みのコネクトをまとめて置き換える。外れたコネクトの配置の整理は useBoards 側) */
function onBoardChange(holomenId: string, boards: HolomenBoards): void {
  setHolomenBoards(holomenId, boards);
}
/** 開いているホロメンのコネクトの入力と、その倍率(ボード画面の効果表・増幅マスの表示に使う) */
const editingPlacements = computed<ConnectPlacements>(
  () => connectMap.value[boardEditing.value ?? ""] ?? {},
);
const editingFactors = computed(() => {
  const id = boardEditing.value;
  if (id === null) return {};
  return connectFactorMapOf({ [id]: editingPlacements.value })[id] ?? {};
});
/** 範囲の形と倍率を入れているコネクト(アンカーと、開いている盤面の色。null = 閉じている)。ボード画面の人物アイコンから開く */
const connectEditing = ref<{ anchor: ConnectAnchor; color: BoardColor } | null>(null);
/** 持っている枚数を超えるときに、ほかの場所(`from`)のコネクトを外してここへ置く(2026-10-10 ユーザー指示) */
function onConnectMove(placement: ConnectPlacement, from: ConnectSlot): void {
  if (boardEditing.value !== null && connectEditing.value !== null) {
    placeConnect(from.holomenId, from.anchor, null);
    placeConnect(boardEditing.value, connectEditing.value.anchor, placement);
  }
  connectEditing.value = null;
}
function onConnectSubmit(placement: ConnectPlacement): void {
  if (boardEditing.value !== null && connectEditing.value !== null) {
    placeConnect(boardEditing.value, connectEditing.value.anchor, placement);
  }
  connectEditing.value = null;
}
function onConnectClear(): void {
  if (boardEditing.value !== null && connectEditing.value !== null) {
    placeConnect(boardEditing.value, connectEditing.value.anchor, null);
  }
  connectEditing.value = null;
}
/** 開いているコネクトマスの解放状態(中心は常に解放済み。赤 / 青 / 黄は直前まで解放していて予算が足りるときだけ解放できる) */
const connectStatus = computed(() => {
  const anchor = connectEditing.value?.anchor;
  if (anchor === undefined || anchor === "center")
    return { unlocked: true, canUnlock: false, reason: null, points: 1 } as const;
  return connectUnlockStatus(editingBoards.value, anchor, editingBudget.value.remaining);
});
/** 解除すると一緒に外れる先の通常マスの数(確認の文言用) */
const connectLockImpact = computed(() => {
  const anchor = connectEditing.value?.anchor;
  if (anchor === undefined || anchor === "center") return 0;
  return lockConnectImpact(editingBoards.value, anchor).nodes;
});
function onConnectUnlock(): void {
  const anchor = connectEditing.value?.anchor;
  const id = boardEditing.value;
  if (id === null || anchor === undefined || anchor === "center") return;
  const result = unlockConnector(editingBoards.value, anchor, editingBudget.value.remaining);
  if (result.ok) setHolomenBoards(id, result.boards);
}
/** コネクトマスの解放を外す(先の通常マスも外れ、置いていた効果も外れる)。外したらシートを閉じる */
function onConnectLock(): void {
  const anchor = connectEditing.value?.anchor;
  const id = boardEditing.value;
  if (id === null || anchor === undefined || anchor === "center") return;
  setHolomenBoards(id, lockConnector(editingBoards.value, anchor));
  connectEditing.value = null;
}

/**
 * アカウント共通の補正(メモリーの「ユニットパラメータ +X%」・メンバー強化ボーナス +X%。保存形式は src/storage/account.ts)。
 * Step 0 に数値欄で置く。総合力にメモリー効果・メンバー強化ボーナスとして別枠で加算する(src/engine/power.ts — 2026-09-08 実機内訳)
 */
const account = ref<AccountBonus>(loadAccount());
watch(account, (value) => saveAccount(normalizeAccount(value)), { deep: true });

/**
 * 開いている +/- ダイアログの対象(null = 閉じている。2026-10-06 ユーザー指示でテンキーから置き換えた)。`<input>` を置くとモバイルで
 * OS のキーボードが出てしまうので、+/- ボタンだけの自前ダイアログで入れる(2026-09-10 ユーザー指示の流れ)
 */
const padTarget = ref<"memory" | "enhancement" | null>(null);
const PAD_LABELS = { memory: "イベントメモリー", enhancement: "メンバー強化ボーナス" } as const;
/**
 * 項目ごとの小数の桁数・刻み・既定値(2026-10-06 ユーザー指示。メモリーは既定 3.0 で 0.1 と 1.0 刻み、強化ボーナスは既定 2.00 で 0.01 と 0.1 刻み。
 * 桁数は表示と刻みの桁 — 2026-09-11 ユーザー指示「イベントメモリーは小数点以下一桁まで。0 でも .0 と出す。メンバー強化ボーナスも .00 まで出したい」)。
 * ゲーム画面の表記(メモリー +6.0%・強化 +3.00%)と同じ桁。既定値は `src/storage/account.ts` の `DEFAULT_ACCOUNT_BONUS`(未登録のときの値)
 */
const PAD_DECIMALS = { memory: 1, enhancement: 2 } as const;
const PAD_STEPS = {
  memory: { fine: 0.1, coarse: 1 },
  enhancement: { fine: 0.01, coarse: 0.1 },
} as const;
/** 入れられる上限(%) */
const PAD_MAX = 50;

/** ボタンに出す % の値。項目の桁数まで常に出す(0 → 0.0 / 0.00) */
function percentLabel(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

function onPadSubmit(value: number): void {
  if (padTarget.value === "memory") account.value.memoryPercent = value;
  else if (padTarget.value === "enhancement") account.value.enhancementPercent = value;
  padTarget.value = null;
}

/**
 * 「オプションの保持」(サイドメニューの折り畳み「設定」のトグル。既定 ON)。
 * ON のあいだだけ、さがすのオプション(所持カードから探す / 育成の反映 / 発動条件 / 除外)を保存する。
 * OFF にした時点で保存済みのキーは消えるので、読み込み側は素直に読むだけでよい(src/composables/useKeepOptions.ts)
 */
const keepOptions = useKeepOptions();

/** ユーザーが自分で切り替えた値。null のあいだは所持カードの有無に追従する(src/storage/searchAll.ts) */
const searchAllChoice = ref<boolean | null>(loadSearchAll());
/**
 * true = 所持リストを使わず全カードからさがす(リストは保持したまま)。UI ではオプション「所持カードから探す」の反転。
 * 切り替えたときだけ保存し、以後はその値を使う。切り替えるまでは所持カードが 1 枚でもあれば所持カードから探す
 */
const searchAll = computed<boolean>({
  get: () => resolveSearchAll(searchAllChoice.value, ownedIds.value.length),
  set: (value) => {
    searchAllChoice.value = value;
    if (keepOptions.active.value) saveSearchAll(value);
  },
});

/** 探索のオプション(既定はすべて ON = 登録している育成状態そのままで試算する) */
const searchOptions = ref<SearchOptions>(
  keepOptions.active.value ? loadSearchOptions() : defaultSearchOptions(),
);
watch(
  searchOptions,
  (value) => {
    if (keepOptions.active.value) saveSearchOptions(value);
  },
  { deep: true },
);
/** さがすの前提の 3 択(`src/ui/searchPremise.ts`。保存の形は変えず、開花はボードに従う) */
const premise = computed<SearchPremise>({
  get: () => searchPremiseOf(searchAll.value, searchOptions.value),
  set: (next) => {
    if (next === "all") {
      searchAll.value = true;
      return;
    }
    searchAll.value = false;
    searchOptions.value = searchOptionsOf(next);
  },
});
/** 「絞り込み」のダイアログ(除外 / 選択 とリーダー・メンバーのピッカーの入口。2026-10-08 ユーザー指示でオプションの枠から移した) */
const filterOpen = ref(false);
/** ⓘ から開く中身(アカウントの登録 / リーダー / 曲 / さがすの 3 択の表 / 結果のタブの意味。2026-10-08 ユーザー指示 — `InfoDialog`) */
const infoOpen = ref<"account" | "leader" | "member" | "song" | "premise" | "result" | null>(null);
const allCardIds = cards.map((c) => c.id);
/** 所持カードから探すときの所持 ID の集合(全カードなら null) */
const poolIdSet = computed<ReadonlySet<string> | null>(() =>
  pool.value === null ? null : new Set(pool.value.map((c) => c.id)),
);
/** いま探索に効いている除外の枚数(既知のカードで、所持カードから探すときは所持カードの中のもの) */
function effectiveExcludedCount(ids: readonly string[]): number {
  const poolIds = poolIdSet.value;
  return ids.filter((id) => cardById.has(id) && (poolIds === null || poolIds.has(id))).length;
}
/**
 * 「リーダー n枚」「メンバー n枚」に出す値。除外のときは除外の枚数、選択のときは選択の枚数
 * (選択が 0 枚のときは絞らないので「すべて」)
 */
function poolCountLabel(excludedIds: readonly string[], selectedIds: readonly string[]): string {
  if (poolMode.value === "exclude") return `${effectiveExcludedCount(excludedIds)}枚`;
  const count = effectiveSelectedIds(selectedIds, allCardIds, poolIdSet.value).length;
  return count === 0 ? "すべて" : `${count}枚`;
}
const leaderPoolCount = computed(() =>
  poolCountLabel(excludedLeaderIds.value, selectedLeaderIds.value),
);
const memberPoolCount = computed(() =>
  poolCountLabel(excludedMemberIds.value, selectedMemberIds.value),
);
/** 「絞り込み」の行の右に出す値(除外は合計の枚数か「なし」、選択は合計の枚数か「すべて」) */
const poolSummary = computed(() => {
  if (poolMode.value === "exclude") {
    const count =
      effectiveExcludedCount(excludedLeaderIds.value) +
      effectiveExcludedCount(excludedMemberIds.value);
    return count === 0 ? "なし" : `除外 ${count}枚`;
  }
  const count = [selectedLeaderIds.value, selectedMemberIds.value].reduce(
    (sum, ids) => sum + effectiveSelectedIds(ids, allCardIds, poolIdSet.value).length,
    0,
  );
  return count === 0 ? "すべて" : `選択 ${count}枚`;
});

/** 探索・選択の対象プール。null = 全カード */
const pool = computed<Card[] | null>(() => {
  if (searchAll.value) return null;
  return ownedIds.value
    .map((id) => cardById.get(id))
    .filter((card): card is Card => card !== undefined);
});
/**
 * 枠の選択(リーダー・固定メンバー・曲)は**保存しない** — 再読み込みは毎回まっさらから始める
 * (2026-09-16 ユーザー指示。2026-09-14 に入れた `selection` への保存はここで撤回した)
 */
const leaderId = ref<string | null>(null);
/**
 * リーダーを**ホロメンで**指定したときのホロメン ID(カードは決めない = そのホロメンの全カードからおまかせ。
 * 2026-09-30 ユーザー指示)。カード指定の `leaderId` とは同時に持たない(どちらかを選ぶともう片方は外す)
 */
const leaderHolomenId = ref<string | null>(null);
const fixedIds = ref<(string | null)[]>(packSlots([], MEMBER_SLOTS));
/**
 * 除外するカード(役割別 — 2026-09-08 ユーザー指示「リーダーから除外、メンバーから除外の二つのタイルを用意しよう」)。
 * リーダーの除外はリーダーおまかせの候補から、メンバーの除外はメンバーおまかせの候補から外す。
 * 自分で指定したリーダー・固定したメンバーには効かない(エンジンが適用しない。枠での指定が優先 — 2026-09-30)。
 * さがすのオプションの一部なので「オプションの保持」が ON のあいだは保存する。
 * 現在のデータにない ID も捨てずに持ち回る(登録を消さない)
 */
const savedSelection = keepOptions.active.value ? loadSelection() : emptySelection();
const excludedLeaderIds = ref<string[]>([...savedSelection.excludedLeaderIds]);
const excludedMemberIds = ref<string[]>([...savedSelection.excludedMemberIds]);
/**
 * 「除外 / 選択」(2026-09-30 ユーザー指示)。除外 = 選んだカードを候補から外す(従来どおり)、
 * 選択 = 選んだカードの中だけからおまかせで探す。リストは種類ごとに別々に持ち、効くのは現在の種類のほう
 */
const poolMode = ref<PoolMode>(savedSelection.poolMode);
const selectedLeaderIds = ref<string[]>([...savedSelection.selectedLeaderIds]);
const selectedMemberIds = ref<string[]>([...savedSelection.selectedMemberIds]);
/**
 * 曲依存の補正(黄ボードの楽曲スコアボーナスをボード欄へ・赤の歌唱者条件)の対象。イベントスコアボーナスは探索に未接続(src/engine/event.ts にロジックだけある)。
 * null = 曲依存の補正を入れない。曲長・譜面は現在の表示ユニットスコアの探索では使わない(ADR-006)
 */
const songId = ref<string | null>(null);
/**
 * 結果の件数(上位 n 件)。実行前の件数入力は置かず、結果側で 1 件ずつ送る。100 → 10(2026-09-08 ユーザー「10件をデフォにしていい」)→
 * 30(2026-10-08 ユーザー指示「表示10件しかないけど今回対応したので30件に増やそう」— 「最適化順」(いまの「組み直すと」)で 30 件を最適化するようになったため)。
 * 「組み直すと」はこの全件と、見込みで選んだ編成を裏で最適化して並べる(並べた一覧も上位 n 件)
 */
const TOP_N = 30;
/** 詳細モーダルを開いている結果の順位(0 始まり)。null = 閉 */
const detailRank = ref<number | null>(null);
/** 結果一覧(カルーセル)の現在位置。結果詳細で順位を送ったらこちらも動かす(閉じたときに一覧が追いつく) */
const resultIndex = ref(0);
function onDetailRank(rank: number): void {
  detailRank.value = rank;
  resultIndex.value = rank;
}

// プールが所持カードに絞られたら、プール外のカードのリーダー・固定枠は外す(枠は上詰めを保つ)
watch(
  pool,
  (nextPool) => {
    if (nextPool === null) return;
    const ids = new Set(nextPool.map((c) => c.id));
    if (leaderId.value !== null && !ids.has(leaderId.value)) leaderId.value = null;
    if (
      leaderHolomenId.value !== null &&
      !nextPool.some((c) => c.holomenId === leaderHolomenId.value)
    )
      leaderHolomenId.value = null;
    const kept = fixedIds.value.filter((id): id is string => id !== null && ids.has(id));
    fixedIds.value = packSlots(kept, MEMBER_SLOTS);
  },
  { immediate: true },
);

// 除外(さがすのオプション)を保存する。「オプションの保持」が OFF のあいだは書かない
watch(
  [poolMode, excludedLeaderIds, excludedMemberIds, selectedLeaderIds, selectedMemberIds],
  () => {
    if (!keepOptions.active.value) return;
    saveSelection({
      poolMode: poolMode.value,
      excludedLeaderIds: [...excludedLeaderIds.value],
      excludedMemberIds: [...excludedMemberIds.value],
      selectedLeaderIds: [...selectedLeaderIds.value],
      selectedMemberIds: [...selectedMemberIds.value],
    });
  },
  { deep: true },
);

type PickerState =
  | { mode: "leader" }
  | { mode: "member" }
  | { mode: "excludeLeader" }
  | { mode: "excludeMember" }
  | { mode: "selectLeader" }
  | { mode: "selectMember" }
  | { mode: "owned" }
  | { mode: "holomen" }
  | { mode: "song" }
  | null;
const picker = ref<PickerState>(null);

const optimizer = useOptimizer();

/**
 * 結果の「いまのまま / 組み直すと」のタブ(2026-10-08 ユーザー指示。初めは見出しの右端の「最適化順」のチップだったが、同日にタブへ替えた。
 * タブの名前は「育成すると」から同日「組み直すと」へ — さがすの前提の「育てきったら」(全部開けた理想)と紛らわしかったため)。
 * 「組み直すと」は**ボードを開け直したら強くなる編成**を拾って最適化し、組み直した後(最適化後)のユニットスコアの順に並べる
 * (`trueRanking.ts`。見込みのボード → 見込みでの探索 → 見込みの上位 `RANKING_LIMIT` 件と探索の上位の最適化)。
 * **結果が出たら自動で始め、止めて始め直すのは探し直したときだけ**(2026-10-08 ユーザー指示 — 計算中にボードなどの登録が変わっても、
 * 始めたときの登録のまま続ける。登録が変わっても計算し直さない)。計算中・失敗はタブの中に進み具合を出し、そろったら一覧にする。
 * 並べた一覧には探索の結果にない編成も出る(行の数字は組み直した後の値で、下に「いま n」。結果詳細の内訳は登録の盤面のまま)
 */
const ranking = useTrueRanking();
const resultTab = ref<ResultTab>("now");
/** タブの小さなリングの円周(半径 7) */
const TAB_RING = 2 * Math.PI * 7;
/**
 * 見込みで選んで最適化にかける件数・見込みでの探索でリーダーのホロメン × 役割ごとに受け取る件数(2026-10-08 の計測で決めた — `pending.md` 8)。
 * 探索の上位 `TOP_N` 件も見込みに関係なく最適化にかける
 */
const RANKING_LIMIT = 100;
const RANKING_PER_LEADER = 40;
/**
 * 探したときの曲(結果の一覧・詳細と「組み直すと」はこの曲で計算している)。結果詳細から開く組み直しプランは、メイン画面の曲を
 * あとで変えても、この曲で始める(2026-10-10 ユーザー指示)
 */
const rankingSongId = ref<string | null>(null);
/** 並べ替えたときの並び(`ranking.items` の添字) */
const rankingOrder = computed(() =>
  rankByOptimized(
    ranking.items.value.map((item) => item?.result.recommended ?? null),
    TOP_N,
  ),
);
const rankingActive = computed(
  () => resultTab.value === "grown" && ranking.status.value === "done",
);
/** 結果一覧・結果詳細に出す候補(探索の上位 `TOP_N` 件、または「組み直すと」の順) */
const shownCandidates = computed<CandidateView[] | null>(() => {
  const all = optimizer.candidates.value;
  if (!all) return null;
  if (!rankingActive.value) return all.slice(0, TOP_N);
  return rankingOrder.value
    .map((i) => ranking.items.value[i]?.candidate)
    .filter((c): c is CandidateView => !!c);
});
/** 「組み直すと」のときの行の数字(組み直した後のユニットスコア)と、その下の「いま n」(いま登録している状態のユニットスコア) */
const shownScores = computed<number[] | undefined>(() =>
  rankingActive.value
    ? rankingOrder.value.map((i) => ranking.items.value[i]?.result.recommended ?? 0)
    : undefined,
);
/** 「組み直すと」を開いていて、まだそろっていない(一覧の代わりに進み具合を出す) */
const rankingPending = computed(
  () => resultTab.value === "grown" && ranking.status.value !== "done",
);
const shownBaseScores = computed<number[] | undefined>(() =>
  rankingActive.value
    ? rankingOrder.value.map((i) => ranking.items.value[i]?.result.current ?? 0)
    : undefined,
);
const sameTeam = (a: CandidateView, b: CandidateView): boolean =>
  a.leaderId === b.leaderId &&
  [...a.memberIds].sort().join(",") === [...b.memberIds].sort().join(",");
/**
 * タブを切り替える。開いている結果詳細は同じ編成を出し続ける(並びに残らなければ閉じる)。一覧は先頭へ戻す
 */
function setResultTab(next: ResultTab): void {
  const before = shownCandidates.value ?? [];
  const opened = detailRank.value === null ? null : (before[detailRank.value] ?? null);
  resultTab.value = next;
  const after = shownCandidates.value ?? [];
  if (opened !== null) {
    const rank = after.findIndex((c) => sameTeam(c, opened));
    detailRank.value = rank < 0 ? null : rank;
  }
  void nextTick(() => {
    resultIndex.value = detailRank.value ?? 0;
  });
}

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
const useBoard = computed(() => premise.value === "current");
/** 開花はボードに従う(3 択 — `premise`) */
const useBloom = useBoard;
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
 * コネクトの配置は、ボード状況を考慮するかどうかに関わらず**登録している(ボードで置いた)ものを常に使う**
 * (2026-10-02 ユーザー指示「探すオプションからコネクトを削除しよう」。ボードを全解放にして試算するときも、
 * そのコネクトの範囲が全解放のマスに掛かる)。コネクトの最適化(所持から置き方を探す)は結果詳細の下端の「組み直しプラン」の中で選ぶ
 */
const currentConnectPlacements = computed<ConnectPlacementMap>(() => connectMap.value);
const currentConnect = computed<ConnectFactorMap>(() =>
  connectFactorMapOf(currentConnectPlacements.value),
);
/** 最適化とお気に入りは登録している状態(boardMap)が基準なので、コネクトも登録値で */
const registeredConnect = computed<ConnectFactorMap>(() => connectFactorMapOf(connectMap.value));
/** 登録している緑ボード + コネクトの合計(お気に入りの表示用。探索用の currentGreen とは別) */
const registeredGreen = computed<GreenBoardEffects>(() =>
  accountGreenEffects(greenMap.value, factorsForColor(registeredConnect.value, "green")),
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
/**
 * 直近の結果が全カードから探したものか。お気に入りに登録できるのは所持カードだけなので、
 * 全カードの結果では登録の星を出さない(2026-09-16 ユーザー指示)。オプションを切り替えただけで、
 * 表示したままの前回の結果のアイコンが入れ替わらないよう、実行時の値を持つ
 */
const ranSearchAll = ref(false);
/**
 * 直近の結果が「いまの育成で」探した結果(登録しているボード。育てきったら・全カードではない)か。全解放(育てきった目標)で選んだ編成を
 * 今の Pt と資材で最適化すると前提が食い違うので、そうでない結果では「組み直すと」を計算せず、結果詳細の「組み直しプラン」も押せない
 * (2026-10-08 ユーザー指示「押せなくしよう」)
 */
const ranUseBoard = ref(false);
/** 実行中の依頼のスナップショット(結果が届いたら ran* へ写す) */
interface RanSnapshot {
  blooms: BloomMap;
  boards: BoardMap;
  green: GreenBoardEffects;
  connect: ConnectFactorMap;
  leaderFixed: boolean;
  okayu: boolean;
  searchAll: boolean;
  useBoard: boolean;
}
let pendingRan: RanSnapshot | null = null;
/** 実行中の探索の依頼(結果が届いたら `ranRequest` へ写す)。「組み直すと」は同じ条件(固定・除外・選択・曲)で見込みの探索をする */
let pendingRequest: OptimizeRunRequest | null = null;
let ranRequest: OptimizeRunRequest | null = null;
/** 実行中の探索の曲(結果が届いたら `rankingSongId` へ写す) */
let pendingSongId: string | null = null;
/** 結果が届いたら、その依頼のスナップショットを表示用の ran* へ写す(再実行中は前回の結果と前回の ran* のまま) */
watch(optimizer.candidates, (candidates) => {
  if (!candidates || !pendingRan) return;
  ranRequest = pendingRequest;
  pendingRequest = null;
  rankingSongId.value = pendingSongId;
  ranBlooms.value = pendingRan.blooms;
  ranBoards.value = pendingRan.boards;
  ranGreen.value = pendingRan.green;
  ranConnect.value = pendingRan.connect;
  ranLeaderFixed.value = pendingRan.leaderFixed;
  ranOkayu.value = pendingRan.okayu;
  ranSearchAll.value = pendingRan.searchAll;
  ranUseBoard.value = pendingRan.useBoard;
  pendingRan = null;
});

const leader = computed(() => cardOf(leaderId.value));
/** リーダー枠が空のときの文言。ホロメンで指定しているときはそのホロメン名（そのホロメンの全カードからおまかせ） */
const leaderEmptyText = computed(() => {
  if (leaderHolomenId.value !== null) return `${holomenName(leaderHolomenId.value)}（おまかせ）`;
  return okayuMode.value ? "おかゆん（おまかせ）" : "おまかせ";
});
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
    } else if (full) {
      map.set(card.id, "メンバー枠が埋まっています（固定中のカードを外すと選べます）");
    } else if (needOkayu && card.holomenId !== OKAYU_HOLOMEN_ID) {
      map.set(card.id, "最後の 1 枠はおかゆんです（おかゆモード）");
    }
  }
  return map;
});

/**
 * 除外のピッカー(リーダー・メンバー)で選択不可のカード。指定中のリーダー・固定中のメンバーも、除外の対象にも
 * 解除の対象にもできる — 枠での指定は除外より優先され(エンジンは指定したカードに除外を適用しない)、
 * 指定したあとで除外を外せなくなるのは困る(2026-09-30 ユーザー報告)。例外はおかゆモードのおかゆんで、
 * 常に候補なので新たには除外できない(すでに除外に入っているものは外せる)
 */
function excludeDisabledOf(excludedIds: readonly string[]): Map<string, string> {
  const map = new Map<string, string>();
  if (okayuMode.value) {
    for (const id of okayuCardIds) {
      if (!excludedIds.includes(id)) map.set(id, "おかゆモードではおかゆんを除外できません");
    }
  }
  return map;
}
const excludeLeaderDisabled = computed(() => excludeDisabledOf(excludedLeaderIds.value));
const excludeMemberDisabled = computed(() => excludeDisabledOf(excludedMemberIds.value));

/**
 * 「選択」のピッカー(リーダー・メンバーの候補)で選択不可のカード。おかゆモードではおかゆんは常に候補に入るので、
 * 選ぶ対象にしない(除外のピッカーと同じ扱い)
 */
const selectCandidateDisabled = computed(() => {
  const map = new Map<string, string>();
  if (okayuMode.value) {
    for (const id of okayuCardIds) map.set(id, "おかゆモードではおかゆんは常に候補です");
  }
  return map;
});

/**
 * リーダーピッカーで選択不可のカード(おかゆモードではおかゆん以外)。
 * 除外中のカードも、「選択」で候補に選んでいないカードも選べる — 枠での指定は除外・選択より優先する
 * (2026-09-30 ユーザー指示)
 */
const leaderDisabled = computed(() => {
  const map = new Map<string, string>();
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
  leaderHolomenId.value = null;
  picker.value = null;
}

/** リーダーをホロメンで選んだ(そのホロメンの全カードからおまかせ) */
function onPickLeaderHolomen(holomenId: string): void {
  if (picker.value?.mode !== "leader") return;
  leaderHolomenId.value = holomenId;
  leaderId.value = null;
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
function onToggleSelectLeader(cardId: string): void {
  toggleIn(selectedLeaderIds.value, cardId);
}
function onToggleSelectMember(cardId: string): void {
  toggleIn(selectedMemberIds.value, cardId);
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

/**
 * リーダーおまかせの候補を限るカード ID(null = 限らない)。おかゆモードはおかゆんのカード、
 * リーダーをホロメンで指定したときはそのホロメンの全カード(両方なら重なるカード)
 */
function leaderCandidateIds(): string[] | null {
  const byHolomen =
    leaderHolomenId.value === null
      ? null
      : cards.filter((c) => c.holomenId === leaderHolomenId.value).map((c) => c.id);
  const byOkayu = okayuMode.value ? [...okayuCardIds] : null;
  if (byHolomen === null) return byOkayu;
  return byOkayu === null ? byHolomen : byHolomen.filter((id) => byOkayu.includes(id));
}

/** リーダーの選択の外でも候補に残すカード(おかゆモードのおかゆん・ホロメンで指定したときのそのホロメン) */
function leaderAlwaysAllowed(): ReadonlySet<string> {
  const ids = new Set<string>(okayuMode.value ? okayuCardIds : []);
  if (leaderHolomenId.value !== null) {
    for (const c of cards) if (c.holomenId === leaderHolomenId.value) ids.add(c.id);
  }
  return ids;
}

/**
 * さがすの進み具合(ボタンのゲージ・済んだ数 / 全体・残り時間 — `src/ui/searchProgress.ts`)。
 * 残り時間は進み具合が届くたびに直し、そのあいだは 1 秒ごとに減らして見せる
 */
const searchNow = ref(0);
let searchTicker: ReturnType<typeof setInterval> | null = null;
watch(
  () => optimizer.running.value,
  (running) => {
    if (searchTicker !== null) clearInterval(searchTicker);
    searchTicker = null;
    if (!running) return;
    searchNow.value = performance.now();
    searchTicker = setInterval(() => {
      searchNow.value = performance.now();
    }, 1000);
  },
);
onUnmounted(() => {
  if (searchTicker !== null) clearInterval(searchTicker);
});
const searchFraction = computed(() => {
  const p = optimizer.progress.value;
  return p && p.total > 0 ? Math.min(1, p.done / p.total) : 0;
});
const searchCountText = computed(() => {
  const p = optimizer.progress.value;
  return p ? `${formatCombinationCount(p.done)} / ${formatCombinationCount(p.total)}` : "";
});
const searchRemainingText = computed(() => {
  const p = optimizer.progress.value;
  const start = optimizer.startedAt.value;
  if (!p || start === null) return "";
  if (p.total > 0 && p.done >= p.total) return "仕上げ中";
  const ms = searchRemainingMs(p, Math.max(p.elapsedMs, searchNow.value - start));
  return ms === null ? "" : searchRemainingLabel(ms);
});
const searchProgressAria = computed(
  () => `計算中 ${String(Math.floor(searchFraction.value * 100))}%`,
);

function run(): void {
  if (!canRun.value) return;
  detailRank.value = null;
  // 前の結果の「組み直すと」は捨てる(新しい結果が届いたら始め直す)
  resultTab.value = "now";
  ranking.cancel();
  pendingSongId = songId.value;
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
  // 結果が届くまで前回の結果を表示したままにするので、表示用のスナップショットは届いたときに差し替える
  const connect = connectFactorMapOf(connectPlacements);
  pendingRan = {
    blooms,
    boards,
    green: accountGreenEffects(greenBoards, factorsForColor(connect, "green")),
    connect,
    leaderFixed: leaderId.value !== null,
    okayu: okayuMode.value,
    searchAll: searchAll.value,
    useBoard: useBoard.value,
  };
  const request: OptimizeRunRequest = {
    leaderId: leaderId.value,
    fixedMemberIds: [...chosenFixedIds.value],
    excludedCardIds: [...excluded],
    excludedLeaderCardIds: roleExclusions({
      mode: poolMode.value,
      excludedIds: excludedLeaderIds.value,
      selectedIds: selectedLeaderIds.value,
      allCardIds,
      poolIds: poolIdSet.value,
      alwaysAllowed: leaderAlwaysAllowed(),
    }),
    excludedMemberCardIds: roleExclusions({
      mode: poolMode.value,
      excludedIds: excludedMemberIds.value,
      selectedIds: selectedMemberIds.value,
      allCardIds,
      poolIds: poolIdSet.value,
      alwaysAllowed: new Set(okayuMode.value ? okayuCardIds : []),
    }),
    // おかゆモード: リーダーおまかせはおかゆんのカードから、メンバーにもおかゆんを必ず入れる
    leaderCandidateIds: leaderCandidateIds(),
    requiredMemberHolomenIds: okayuMode.value ? [OKAYU_HOLOMEN_ID] : [],
    songId: songId.value,
    blooms,
    boards,
    greenBoards,
    yellowBoards,
    redBoards,
    connectPlacements,
    account: accountBonus,
    topN: TOP_N,
  };
  pendingRequest = request;
  optimizer.run(request);
}

/*
 * お気に入りユニット(2026-09-09 ユーザー指定)。
 * 結果の 1 件(スコアの数字があるパネル)の右上の星で、その編成を 1〜10 の番号へ登録する。
 * 登録済みならもう一度押して解除する。
 * 保存するのはカード ID だけ(src/storage/units.ts)で、サイドメニューの「お気に入り」で開くときに計算し直す —
 * 「数値は登録した時点ではなく表示した時点で最新の情報で計算した値にする」
 */
const savedUnits = ref<SavedUnit[]>(loadUnits());
watch(savedUnits, (units) => saveUnits(units), { deep: true });

/** 各候補が登録されている番号(未登録は null)。並びは結果の順位と同じ */
const resultUnitSlots = computed<(number | null)[]>(() =>
  (shownCandidates.value ?? []).map((c) =>
    unitSlotOf(savedUnits.value, { leaderId: c.leaderId, memberIds: c.memberIds }),
  ),
);

/**
 * 各候補を**いまお気に入りに登録できるか**(並びは結果の順位と同じ)。
 * 登録できるのは所持カードだけで組んだ編成に限る(2026-09-16 ユーザー指示「自分の所持カードしか
 * お気に入りにできない仕様にしたい」)。全カードから探した結果は 6 枚とも所持していても出さず、
 * 所持カードから探した結果でも、そのあとに所持から外したカードが入っていれば出さない。
 * 既に登録してあるユニットは所持から外れても解除できる(金の星は別の条件で出す)
 */
const resultFavoritable = computed<boolean[]>(() => {
  const candidates = shownCandidates.value ?? [];
  if (ranSearchAll.value) return candidates.map(() => false);
  const owned = new Set(ownedIds.value);
  return candidates.map((c) => [c.leaderId, ...c.memberIds].every((id) => owned.has(id)));
});

/** 星を押した順位(0 始まり)。番号選び・解除の対象になる編成 */
const favoriteRank = ref<number | null>(null);
const favoriteUnit = computed<UnitComposition | null>(() => {
  const candidate =
    favoriteRank.value === null ? null : (shownCandidates.value?.[favoriteRank.value] ?? null);
  return candidate === null
    ? null
    : { leaderId: candidate.leaderId, memberIds: [...candidate.memberIds] };
});

/** 番号選びのモーダルの開閉と、解除の確認中の番号 */
const unitSaveOpen = ref(false);
const unitReleasing = ref<number | null>(null);
/** 解除の確認に出す名前(付けていなければ「ユニット{番号}」)。番号は画面に出さないので名前で聞く */
const unitReleasingName = computed(() => {
  const slot = unitReleasing.value;
  if (slot === null) return "";
  return unitDisplayName(slot, savedUnits.value.find((u) => u.slot === slot)?.name);
});

function onFavorite(rank: number): void {
  // 登録済みなら解除の確認、未登録なら番号選び(星が金か輪郭かと同じ分かれ方)
  favoriteRank.value = rank;
  const slot = resultUnitSlots.value[rank] ?? null;
  if (slot !== null) unitReleasing.value = slot;
  else if (resultFavoritable.value[rank] === true) unitSaveOpen.value = true;
}
/** お気に入りのユニット名を付け直す（空にすると「ユニット{番号}」へ戻る — 2026-09-15 ユーザー指示） */
function onUnitRename(slot: number, name: string): void {
  savedUnits.value = renameUnit(savedUnits.value, slot, name);
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
 * 「組み直しプラン」(当初の名前は「最適化」。ボード → コネクト → 発動頻度。選んだものだけ)の対象の編成。null = 閉。結果詳細・ユニット詳細の下端の 1 つのボタンから開く
 * (2026-10-04 にボードの最適化として追加し、2026-10-07 にコネクト、2026-10-08 に発動頻度を統合した)。基準は**登録している状態**
 * (ボード 4 色・コネクトの解放と配置・ホロメンランク・開花・アカウント補正)と、シートの曲
 */
const optimizeCandidate = ref<CandidateView | null>(null);
/** 「組み直すと」で並べているときに結果詳細から開いたら、裏で計算しておいた結果(始めたときから登録が変わっていないとき) */
const optimizePreset = ref<{ connect: boolean; result: OptimizePlanResult } | null>(null);
/**
 * 組み直しプランを開いたときの曲(2026-10-10 ユーザー指示): 結果詳細からは探したときの曲、お気に入りからは毎回「指定なし」
 * (メイン画面の曲には合わせない — お気に入りの値も曲なしで出している)。シートで選び直した曲は覚えず、次に開くとまたこの曲で始める
 * (選び直して計算した結果はキャッシュに残るので、曲と条件を合わせれば計算し直さずに出る — `usePlanCache.ts`)
 */
const optimizeSongId = ref<string | null>(null);
function openOptimize(candidate: CandidateView, fromFavorites: boolean): void {
  optimizePreset.value = null;
  optimizeSongId.value = fromFavorites ? null : rankingSongId.value;
  if (!fromFavorites && rankingActive.value && rankingStartedKey.value === rankingStateKey.value) {
    const item = ranking.items.value.find((i) => i !== null && sameTeam(i.candidate, candidate));
    if (item) optimizePreset.value = { connect: rankingConnect.value, result: item.result };
  }
  optimizeCandidate.value = candidate;
}
/**
 * 推奨を登録に反映し(解放マスとコネクトの解放・コネクトを選んだときはコネクトの配置)、シートを閉じる(確認はシートの中で済んでいる)。
 * ボードも頻度も選ばなかったときは `boards` が空なので、ボードと余りのリソースは変わらない。余りは不足すると負になる
 */
function onOptimizeApply(plan: {
  boards: Record<string, HolomenBoards>;
  remaining: BoardResources;
  placements: ConnectPlacementMap | null;
}): void {
  // 配置より先に解放を置き換える(解放が外れるマスの配置は `setHolomenBoards` が外す。そのあと推奨の配置で置き換える)
  for (const [holomenId, next] of Object.entries(plan.boards)) setHolomenBoards(holomenId, next);
  // 余りのリソースも、推奨のボードに合わせて同じ推奨としてまとめて登録する(総量 = 投入済み + 余り を増減させない)
  replaceBoardResources(plan.remaining);
  if (plan.placements !== null) applyConnectPlacements(plan.placements);
  optimizeCandidate.value = null;
}
/** 持っているコネクト(所持カードと開花段階から導く。最適化だけが使う — ADR-022) */
const connectInventory = useConnectInventory();
const connectItems = computed(() => inventoryItems(connectInventory.value));
/** ボードに置いているコネクトが所持カードのコネクトに収まっていない(ボードの最適化でコネクトを選んだままでは最適化できない — 2026-10-02 ユーザー指示のエラー) */
const connectShortage = computed(
  () => placementShortage(connectMap.value, connectInventory.value).length > 0,
);
/** 所持カードから導いたコネクトもボードに置いたコネクトもないときは、ボードの最適化のコネクトのチップを使えない */
const connectPlanDisabled = computed(
  () => !hasInventory(connectInventory.value) && Object.keys(connectMap.value).length === 0,
);

/** 「組み直すと」の計算でコネクトも最適化するか(組み直しプランのシートで実行できる状態のときだけ) */
const rankingConnect = computed(() => !connectPlanDisabled.value && !connectShortage.value);
/**
 * 「組み直すと」の依頼。条件は直近の探索と同じで、盤面・配置・開花は**いま**登録している状態(組み直しプランのシートと同じ基準)。
 * 見込みを測る仮の編成は探索の 1 位
 */
function rankingInput(): TrueRankingInput | null {
  const top = optimizer.candidates.value?.[0];
  if (!ranUseBoard.value || !ranRequest || !top) return null;
  const song = rankingSongId.value ? (songById.get(rankingSongId.value) ?? null) : null;
  const duration = song?.durationSeconds ?? null;
  const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  return {
    request: {
      ...plain(ranRequest),
      blooms: plain(registeredBlooms.value),
      boards: plainBoardMap(boardMap.value),
      greenBoards: plainBoardMap(greenMap.value),
      yellowBoards: plainBoardMap(yellowMap.value),
      redBoards: plainBoardMap(redMap.value),
      connectPlacements: plainPlacements(connectMap.value),
      account: plain(normalizeAccount(account.value)),
    },
    reference: { leaderId: top.leaderId, memberIds: [...top.memberIds] },
    connects: plain(boardConnectMap.value),
    ranks: plain(rankMap.value),
    resources: plain(boardResources.value),
    items: plain(connectItems.value),
    connect: rankingConnect.value,
    horizonSeconds: duration !== null && duration > 0 ? duration : medianSongDurationSeconds,
    limit: RANKING_LIMIT,
    perLeader: RANKING_PER_LEADER,
    includeTeams: (optimizer.candidates.value ?? [])
      .slice(0, TOP_N)
      .map((c) => ({ leaderId: c.leaderId, memberIds: [...c.memberIds] })),
  };
}
/** 見込みのボードを使い回してよいかの鍵(件数以外の依頼がすべて同じとき) */
const rankingProxyKey = (input: TrueRankingInput): string =>
  JSON.stringify({ ...input, limit: 0, perLeader: 0 });
/**
 * 「組み直すと」を計算できるか: いまの育成で探した結果があり、ボードを登録しているとき(未登録なら盤面がないので計算しない —
 * タブは disabled で「ボード未登録」。育てきったら・全カードの結果では、育てきった目標で選んだ編成を今の Pt と資材で並べ直すと
 * 前提が食い違うので計算しない)
 */
const rankingAvailable = computed(
  () =>
    ranUseBoard.value && registered.value.board && (optimizer.candidates.value?.length ?? 0) > 0,
);
/** タブの中の小さなリングと %(全体の進み具合。経過時間には依らない) */
const rankingPercent = computed(() =>
  Math.floor(
    rankingEstimate({
      workload: ranking.workload.value,
      phase: ranking.progress.value?.phase ?? null,
      done: ranking.progress.value?.done ?? 0,
      elapsedMs: 0,
    }).fraction * 100,
  ),
);
/** 始める前に出す仕事の数(見積もり用。探したあとでボードを登録したときなど) */
const rankingPlanned = computed(() => {
  if (resultTab.value !== "grown" || ranking.status.value !== "idle") return null;
  const input = rankingInput();
  return input ? ranking.plannedWorkload(input, rankingProxyKey(input)) : null;
});
/** 最適化の基準(登録している状態)。始めたときの値と違えば、計算済みの結果を組み直しプランのシートへ渡さない(シートの「現在」と食い違う) */
const rankingStateKey = computed(() =>
  JSON.stringify([
    registeredBlooms.value,
    boardMap.value,
    greenMap.value,
    yellowMap.value,
    redMap.value,
    connectMap.value,
    boardConnectMap.value,
    rankMap.value,
    boardResources.value,
    connectItems.value,
    account.value,
    rankingConnect.value,
  ]),
);
/** 計算を始めたときの登録の鍵 */
const rankingStartedKey = ref<string | null>(null);
function startRanking(): void {
  const input = rankingInput();
  if (!input) return;
  rankingStartedKey.value = rankingStateKey.value;
  ranking.run(input, rankingProxyKey(input));
}
// 計算できなくなったら(ボードの登録を全部消したときなど)「いまのまま」へ戻す
watch(rankingAvailable, (available) => {
  if (!available && resultTab.value === "grown") setResultTab("now");
});
// 探し直して新しい結果が届いたら、前の「組み直すと」を捨てて始め直す(いまの育成で探した結果で、ボードを登録しているときだけ)
watch(optimizer.candidates, () => {
  if (resultTab.value !== "now") setResultTab("now");
  ranking.cancel();
  if (rankingAvailable.value) startRanking();
});
/** アカウントの「コネクト」(持っているコネクトを見るだけ — ADR-023)の開閉 */
const connectInventoryOpen = ref(false);
/**
 * アカウントの 4 つの入口に登録があるか(ない入口にだけ「未登録」を出す)。ボードは 4 色のどれかのマスかホロメンランク、
 * コネクトは所持カードから導いた所持が 1 枚でもあること(登録の画面はなく、見るだけ)、リソースはどれか 1 つでも個数を入れていること
 */
const registered = computed(() => ({
  board:
    [boardMap.value, greenMap.value, yellowMap.value, redMap.value].some((m) =>
      Object.values(m).some((nodes) => nodes.length > 0),
    ) || Object.keys(rankMap.value).length > 0,
  card: ownedIds.value.length > 0,
  connect: hasInventory(connectInventory.value),
  resource: Object.values(boardResources.value).some((r) => r.cube !== null || r.core !== null),
}));
/** アカウントの「リソース」(色ごとの余っているキューブ・コアキューブ。2026-10-04 追加。使うのは組み直しプランと結果の「組み直すと」だけ) */
const resourceOpen = ref(false);

/** お気に入り(登録ユニット)の詳細シートの開閉。入口はサイドメニューの「お気に入り」で、App が openFavorites() で開く */
const unitSheetOpen = ref(false);
function openFavorites(): void {
  unitSheetOpen.value = true;
}
defineExpose({ openFavorites });
/**
 * お気に入りの「検索画面に入力」: その編成をメイン画面のリーダー・メンバー欄へそのまま入れる(2026-09-12 ユーザー指示)。
 * さがすのオプション(所持カードから探す・ボード・開花)・曲・除外は触らない。シートを閉じて先頭へ戻し、
 * 入った枠が見えるようにする
 */
function loadIntoSearch(candidate: CandidateView): void {
  leaderId.value = candidate.leaderId;
  leaderHolomenId.value = null;
  fixedIds.value = Array.from({ length: MEMBER_SLOTS }, (_, i) => candidate.memberIds[i] ?? null);
  // 開いていたシート（お気に入り / 結果詳細）を閉じて先頭へ戻す
  unitSheetOpen.value = false;
  detailRank.value = null;
  window.scrollTo({ top: 0 });
}
/** 現在のカードデータで評価できる登録(未知の ID を含む登録は出さないが、保存からは消さない) */
const shownUnits = computed(() =>
  savedUnits.value.filter((u) => [u.leaderId, ...u.memberIds].every((id) => cardById.has(id))),
);
/**
 * 登録ユニットの評価。6 枠すべて決まっているので組合せは 1 通りで、Worker を使わず同期で評価する。
 * **登録している**開花・4 色ボード・コネクト・アカウント補正そのもので計算し直すので、登録後に育てた分も反映される。
 * **曲も「さがす」のオプションも渡さない** — この画面はゲームのユニット編成画面に相当し、その画面と同じ入力だけで出す。
 * メイン画面で曲を変えるたびに登録ユニットのユニットスコアが変わるのは「気持ち悪い」(2026-09-11)、所持カードから探す /
 * ボード状況・開花状況を考慮するのオプションで変わるのも「きもい。実ゲームのユニットと同じように自分のボードやカード状況を
 * 加味された値であるべき。オプションとは独立に」(2026-09-12)。探索用の current*(オプション OFF や全カードで最大状態に
 * 切り替わる)ではなく registeredBlooms / boardMap などの登録値を直接使う。曲の反映(黄のボード欄・赤の歌唱者条件)は
 * 「さがす」の結果側だけで行う。
 * **ページは登録しているぶんだけ**で、空のページは出さない(2026-09-16 ユーザー指示)。番号は 1 から連続なので
 * ページ番号 = ユニットの番号のままになる
 */
const unitPages = computed<UnitPage[]>(() => {
  if (!unitSheetOpen.value) return [];
  const base: Omit<OptimizeRunRequest, "leaderId" | "fixedMemberIds"> = {
    excludedCardIds: [],
    excludedLeaderCardIds: [],
    excludedMemberCardIds: [],
    leaderCandidateIds: null,
    requiredMemberHolomenIds: [],
    songId: null,
    blooms: { ...registeredBlooms.value },
    boards: plainBoardMap(boardMap.value),
    greenBoards: plainBoardMap(greenMap.value),
    yellowBoards: plainBoardMap(yellowMap.value),
    redBoards: plainBoardMap(redMap.value),
    connectPlacements: plainPlacements(connectMap.value),
    account: normalizeAccount(account.value),
    topN: 1,
  };
  return shownUnits.value.map((unit) => {
    const slot = unit.slot;
    const [candidate] = runOptimize({
      ...base,
      leaderId: unit.leaderId,
      fixedMemberIds: [...unit.memberIds],
    }).candidates;
    const name = unit.name ?? null;
    if (!candidate) return { slot, name, unit: null };
    return {
      slot,
      name,
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
      <!-- 見出しの行の右端の ⓘ は 4 つの登録が何で、どこに効くかを開く(2026-10-08 ユーザー指示) -->
      <div class="panel-head">
        <h2 id="account-heading"><span class="step-badge">0</span>アカウント</h2>
        <InfoButton label="アカウントの登録の説明" @click="infoOpen = 'account'" />
      </div>
      <!-- 1 段目: ボード(ホロメン一覧 → ボード)/ カード(持っているカードと開花)。2 段目: コネクト(持っているコネクトの形と ％ と枚数。
           2026-10-02 ユーザー指示で追加。ボードの最適化のコネクトだけが使う)/ リソース(色ごとの余っているキューブ・コアキューブ。
           2026-10-04 ユーザー指示で追加。ボードの最適化だけが使う)。3 つ横並びから 2 × 2 に組み替えた。件数は出さない(2026-09-06 ユーザー指定)。
           お気に入り(登録ユニット)の入口はサイドメニューへ移した(2026-09-11 ユーザー指示「ユニットはお気に入りとリネームして
           サイドバーに移す。ホロメンはホロメンボード、メンバーは所持カードと名前を変更」) -->
      <!-- 登録がまだのものだけ、ボタンの右端に「未登録」(2026-10-08 ユーザー指示。件数は出さない) -->
      <div class="account-row">
        <button type="button" class="account-button" @click="picker = { mode: 'holomen' }">
          ボード<span v-if="!registered.board" class="unregistered">未登録</span>
        </button>
        <button type="button" class="account-button" @click="picker = { mode: 'owned' }">
          カード<span v-if="!registered.card" class="unregistered">未登録</span>
        </button>
        <button type="button" class="account-button" @click="connectInventoryOpen = true">
          コネクト<span v-if="!registered.connect" class="unregistered">未登録</span>
        </button>
        <button type="button" class="account-button" @click="resourceOpen = true">
          リソース<span v-if="!registered.resource" class="unregistered">未登録</span>
        </button>
      </div>
      <!--
        アカウント共通の補正。ゲーム内の表示値(%)をそのまま入力する。メモリーは「ユニットパラメータ +X%」、
        強化ボーナスは「メンバー強化ボーナス +X%」。総合力の内訳に別枠で加算する(2026-09-08 実機内訳)。
        入力はホロメンボード / 所持カードと同じ形のボタン 2 つで、押すと自前の +/- ダイアログ(StepperDialog)を出す
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
      <div class="panel-head">
        <h2 id="leader-heading"><span class="step-badge">1</span>リーダー</h2>
        <InfoButton label="リーダーの説明" @click="infoOpen = 'leader'" />
      </div>
      <div class="slot-list">
        <UnitSlot
          label="リーダー枠"
          variant="leader"
          :card="leader"
          :empty-text="leaderEmptyText"
          clearable
          :selected-empty="leaderHolomenId !== null"
          :disabled="okayuBlocked"
          @activate="picker = { mode: 'leader' }"
          @clear="
            leaderId = null;
            leaderHolomenId = null;
          "
        />
      </div>
    </section>

    <section class="panel" aria-labelledby="member-heading">
      <div class="panel-head">
        <h2 id="member-heading"><span class="step-badge">2</span>メンバー</h2>
        <InfoButton label="メンバーの説明" @click="infoOpen = 'member'" />
      </div>
      <!--
        5 枠を横並び(仮想ガチャ・結果詳細と同じタイル)。どの枠も同じピッカーを開き、解除もその中で行う。
        開花アイコンは常に出す — 探索に効いている段階(全カード・開花 OFF では最大の 5)をそのまま見せ、
        オプションでタイルの高さを変えない(2026-09-14 ユーザー指示)
      -->
      <div class="member-grid" role="group" aria-label="メンバー枠">
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
          <!-- 下の行は 左に開花・右にレアリティの星(2026-10-09 ユーザー指示。星は常に右端) -->
          <span class="member-icons">
            <SkillIcon kind="bloom" :count="tile.bloom" :label="`開花${tile.bloom}`" />
            <SkillIcon
              kind="rarity"
              :count="tile.card?.rarity ?? 5"
              :label="`★${tile.card?.rarity ?? 5}`"
            />
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
      <div class="panel-head">
        <h2 id="song-heading"><span class="step-badge">3</span>曲</h2>
        <InfoButton label="曲の説明" @click="infoOpen = 'song'" />
      </div>
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
      <!-- 見出しの行の右端の ⓘ は 3 択の違いの表を開く(2026-10-08 ユーザー指示。3 択の横に置くとセグメントが中央からずれるので見出しの行へ) -->
      <div class="panel-head">
        <h2 id="run-heading"><span class="step-badge">4</span>さがす</h2>
        <InfoButton label="育成の前提の違い" @click="infoOpen = 'premise'" />
      </div>
      <!--
        さがすの前提の 3 択(2026-10-08 ユーザー指示。「所持カードから探す」「ボード状況を考慮する」「開花状況を考慮する」のチップと
        「オプション ▼」の開閉をやめた — `premise`)と、「絞り込み」の 1 行(押すと除外 / 選択とピッカーの入口のダイアログ。右に今の状態)。
        しぼりこみ(衣装スキル発動・パッシブ全員発動)は 2026-09-16 に撤去した — 常に全探索する
      -->
      <div class="segment premise" role="radiogroup" aria-label="育成の前提（1つ選択）">
        <button
          v-for="p in SEARCH_PREMISES"
          :key="p.key"
          type="button"
          class="seg"
          role="radio"
          :aria-checked="premise === p.key"
          :class="{ 'seg-active': premise === p.key }"
          @click="premise = p.key"
        >
          {{ p.label }}
        </button>
      </div>
      <button type="button" class="filter-row" aria-haspopup="dialog" @click="filterOpen = true">
        <span>絞り込み</span>
        <span class="filter-value">{{ poolSummary }}</span>
      </button>
      <!-- 実行中はボタン全体をゲージにして、左から満たしつつ 左に 済んだ数 / 全体・右に残り時間を出す(2026-10-09 ユーザー指示 — モック A。
           残り時間は見積もれるようになってから出し、届くたびに直す。数え終えたら「仕上げ中」)。ラベルは visibility で隠して幅と高さを保つ -->
      <button
        type="button"
        class="primary-button"
        :class="{ busy: optimizer.running.value }"
        :style="
          optimizer.running.value ? { '--gauge': `${String(searchFraction * 100)}%` } : undefined
        "
        :disabled="!canRun"
        :aria-busy="optimizer.running.value"
        :aria-label="optimizer.running.value ? searchProgressAria : undefined"
        @click="run"
      >
        <span class="label">
          {{ leader && openSlots === 0 ? "この編成のスコアを試算" : "ベスト編成をさがす" }}
        </span>
        <span v-if="optimizer.running.value" class="search-progress" aria-hidden="true">
          <span>{{ searchCountText }}</span>
          <span class="search-remaining">{{ searchRemainingText }}</span>
        </span>
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
      <div class="panel-head">
        <h2 id="results-heading">結果</h2>
        <InfoButton
          v-if="optimizer.candidates.value.length > 0"
          label="結果の並びの違い"
          @click="infoOpen = 'result'"
        />
      </div>
      <!--
        「いまのまま / 組み直すと」のタブ(排他なのでセグメント)。「組み直すと」は結果が届くと裏で自動で計算し、計算中はタブに小さなリングと %、
        中身は進み具合(リング・3 段)。そろったら組み直した後の順の一覧。計算できない結果では disabled で、ボードが未登録ならタブに「ボード未登録」
      -->
      <div
        v-if="optimizer.candidates.value.length > 0"
        class="segment result-tabs"
        role="tablist"
        aria-label="結果の並び"
      >
        <button
          type="button"
          class="seg"
          role="tab"
          :aria-selected="resultTab === 'now'"
          :class="{ 'seg-active': resultTab === 'now' }"
          @click="setResultTab('now')"
        >
          いまのまま
        </button>
        <button
          type="button"
          class="seg grown-tab"
          role="tab"
          :aria-selected="resultTab === 'grown'"
          :class="{ 'seg-active': resultTab === 'grown' }"
          :disabled="!rankingAvailable"
          @click="setResultTab('grown')"
        >
          <span class="tab-main">
            <span>組み直すと</span>
            <template v-if="rankingAvailable && ranking.status.value === 'running'">
              <svg class="tab-ring" viewBox="0 0 18 18" aria-hidden="true">
                <circle class="track" cx="9" cy="9" r="7" />
                <circle
                  class="bar"
                  cx="9"
                  cy="9"
                  r="7"
                  :stroke-dasharray="TAB_RING"
                  :stroke-dashoffset="TAB_RING * (1 - rankingPercent / 100)"
                />
              </svg>
              <span class="tab-pct">{{ rankingPercent }}%</span>
            </template>
          </span>
          <span v-if="ranUseBoard && !registered.board" class="tab-sub">ボード未登録</span>
        </button>
      </div>
      <p v-if="optimizer.candidates.value.length === 0" class="hint">
        条件を満たす編成がありません。カードの登録・固定・除外・選択の条件を見直してください。
      </p>
      <!--
        タブを切り替えても結果の高さを変えない(2026-10-08 ユーザー指示「結果の二つのタブ選択すると結果エリアの高さかわるのいや」):
        一覧と進み具合を同じ枠に重ね、進み具合を出しているあいだも一覧は見えないまま高さを決める
      -->
      <div v-else class="result-body">
        <ResultList
          :class="{ 'is-hidden': rankingPending }"
          :aria-hidden="rankingPending"
          v-model:index="resultIndex"
          :candidates="shownCandidates ?? []"
          :scores="shownScores"
          :base-scores="shownBaseScores"
          :unit-slots="resultUnitSlots"
          :favoritable="resultFavoritable"
          :fixed-ids="chosenFixedIds"
          :blooms="ranBlooms"
          :leader-fixed="ranLeaderFixed"
          :okayu-holomen-id="ranOkayu ? OKAYU_HOLOMEN_ID : null"
          :swipe-element="rankingPending ? null : resultSection"
          @select="detailRank = $event"
          @favorite="onFavorite"
        />
        <TrueRankingProgress
          v-if="rankingPending"
          class="result-overlay"
          :status="ranking.status.value"
          :progress="ranking.progress.value"
          :workload="ranking.workload.value"
          :planned="rankingPlanned"
          :started-at="ranking.startedAt.value"
          :finished-at="ranking.finishedAt.value"
          :paused-ms="ranking.pausedMs.value"
          :error="ranking.error.value"
          @start="startRanking"
        />
      </div>
    </section>

    <ResultDetail
      v-if="detailRank !== null && shownCandidates"
      :rank="detailRank"
      :candidates="shownCandidates"
      :blooms="ranBlooms"
      :boards="ranBoards"
      :green="ranGreen"
      :connect="ranConnect"
      :unit-slots="resultUnitSlots"
      :favoritable="resultFavoritable"
      @update:rank="onDetailRank"
      @favorite="onFavorite"
      :optimize-disabled="!ranUseBoard"
      @optimize="openOptimize($event, false)"
      @load="loadIntoSearch"
      @card="(id, b) => emit('card', id, b)"
      @close="detailRank = null"
    />

    <UnitSaveModal
      v-if="unitSaveOpen"
      :units="savedUnits"
      @save="onUnitSave"
      @close="unitSaveOpen = false"
    />
    <!-- さがすの「絞り込み」。ピッカーを開いているあいだは隠し、閉じると戻る -->
    <PoolFilterDialog
      v-if="filterOpen && picker === null"
      :mode="poolMode"
      :leader-count="leaderPoolCount"
      :member-count="memberPoolCount"
      @mode="poolMode = $event"
      @leader="picker = { mode: poolMode === 'exclude' ? 'excludeLeader' : 'selectLeader' }"
      @member="picker = { mode: poolMode === 'exclude' ? 'excludeMember' : 'selectMember' }"
      @close="filterOpen = false"
    />
    <InfoDialog v-if="infoOpen === 'account'" :terms="ACCOUNT_INFO" @close="infoOpen = null" />
    <InfoDialog v-if="infoOpen === 'leader'" :text="LEADER_INFO" @close="infoOpen = null" />
    <InfoDialog v-if="infoOpen === 'member'" :text="MEMBER_INFO" @close="infoOpen = null" />
    <InfoDialog v-if="infoOpen === 'song'" :text="SONG_INFO" @close="infoOpen = null" />
    <InfoDialog
      v-if="infoOpen === 'premise'"
      :table="PREMISE_INFO"
      :current="premise"
      @close="infoOpen = null"
    />
    <InfoDialog v-if="infoOpen === 'result'" :terms="RESULT_TAB_INFO" @close="infoOpen = null" />
    <!-- 数値の入力は自前のテンキーで（OS のキーボードを出させない — 2026-09-10 ユーザー指示） -->
    <StepperDialog
      v-if="padTarget !== null"
      :label="PAD_LABELS[padTarget]"
      :value="padTarget === 'memory' ? account.memoryPercent : account.enhancementPercent"
      :initial="
        padTarget === 'memory'
          ? DEFAULT_ACCOUNT_BONUS.memoryPercent
          : DEFAULT_ACCOUNT_BONUS.enhancementPercent
      "
      :decimals="PAD_DECIMALS[padTarget]"
      :min="0"
      :max="PAD_MAX"
      :fine="PAD_STEPS[padTarget].fine"
      :coarse="PAD_STEPS[padTarget].coarse"
      unit="%"
      @submit="onPadSubmit"
      @cancel="padTarget = null"
    />

    <ConfirmDialog
      v-if="unitReleasing !== null"
      :message="`${unitReleasingName}を解除しますか？`"
      confirm-label="解除する"
      @confirm="onUnitRelease"
      @cancel="unitReleasing = null"
    />
    <UnitSheet
      v-if="unitSheetOpen"
      :pages="unitPages"
      :blooms="registeredBlooms"
      :boards="boardMap"
      :green="registeredGreen"
      :connect="registeredConnect"
      @release="unitReleasing = $event"
      @optimize="openOptimize($event, true)"
      @load="loadIntoSearch"
      @rename="onUnitRename"
      @card="(id, b) => emit('card', id, b)"
      @close="unitSheetOpen = false"
    />

    <!--
      組み直しプラン(この編成のまま、ボード → コネクト → 発動頻度 のうち選んだものを最適化する。反映すれば登録になる)。
      基準は**登録している状態**(開花も登録の段階 — さがすの前提を「育てきったら」へ切り替えたあとに開いても最大の開花にしない。
      2026-10-08 ユーザー報告「育てきったらの状態で組み直しプランやるとなんか数字高い」)と、シートの曲(開いた時点は、結果詳細からは
      探したときの曲・お気に入りからは指定なし — `optimizeSongId`)
    -->
    <OptimizePlanSheet
      v-if="optimizeCandidate"
      :candidate="optimizeCandidate"
      :blooms="registeredBlooms"
      :boards="boardMap"
      :green-boards="greenMap"
      :yellow-boards="yellowMap"
      :red-boards="redMap"
      :placements="connectMap"
      :connects="boardConnectMap"
      :ranks="rankMap"
      :resources="boardResources"
      :items="connectItems"
      :connect-disabled="connectPlanDisabled"
      :connect-shortage="connectShortage"
      :cards-unregistered="!registered.card"
      :account="account"
      :song-id="optimizeSongId"
      :preset="optimizePreset"
      @apply="onOptimizeApply"
      @close="optimizeCandidate = null"
    />
    <ConnectInventorySheet v-if="connectInventoryOpen" @close="connectInventoryOpen = false" />
    <ResourceSheet v-if="resourceOpen" @close="resourceOpen = false" />

    <CardPicker
      v-if="picker?.mode === 'leader'"
      title="リーダー"
      mode="pick"
      skill-view="costume"
      :pool="pool ?? undefined"
      :selected-id="leaderId"
      rarities
      holomen-option
      :selected-holomen-id="leaderHolomenId"
      :disabled="leaderDisabled"
      :blooms="currentBlooms"
      @pick="onPick"
      @pick-holomen="onPickLeaderHolomen"
      @close="picker = null"
    />
    <CardPicker
      v-else-if="picker?.mode === 'member'"
      title="メンバー"
      mode="multi"
      skill-view="member"
      :pool="pool ?? undefined"
      :selected-ids="chosenFixedIds"
      rarities
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
      v-else-if="picker?.mode === 'selectLeader'"
      title="リーダー候補"
      mode="multi"
      :pool="pool ?? undefined"
      skill-view="costume"
      :selected-ids="selectedLeaderIds"
      selected-label="選択中"
      :disabled="selectCandidateDisabled"
      :blooms="currentBlooms"
      memory-key="select-leader"
      @toggle="onToggleSelectLeader"
      @close="picker = null"
    />
    <CardPicker
      v-else-if="picker?.mode === 'selectMember'"
      title="メンバー候補"
      mode="multi"
      :pool="pool ?? undefined"
      skill-view="member"
      :selected-ids="selectedMemberIds"
      selected-label="選択中"
      :disabled="selectCandidateDisabled"
      :blooms="currentBlooms"
      memory-key="select-member"
      @toggle="onToggleSelectMember"
      @close="picker = null"
    />
    <CardPicker
      v-else-if="picker?.mode === 'owned'"
      title="メンバー"
      mode="multi"
      skill-view="member"
      :selected-ids="ownedIds"
      rarities
      :blooms="registeredBlooms"
      selected-label="登録中"
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
      :connects="boardConnectMap"
      :ranks="rankMap"
      @pick="boardEditing = $event"
      @rank="setRank"
      @close="picker = null"
    />
    <BoardSheet
      v-if="boardEditing !== null"
      :holomen-id="boardEditing"
      :red-nodes="editingRedNodes"
      :nodes="editingBlueNodes"
      :yellow-nodes="editingYellowNodes"
      :green-nodes="editingGreenNodes"
      :connects="editingConnects"
      :rank="editingRank"
      :placements="editingPlacements"
      :factors="editingFactors"
      @change="onBoardChange"
      @connect="
        (_holomenId: string, anchor: ConnectAnchor, color: BoardColor) =>
          (connectEditing = { anchor, color })
      "
      @close="boardEditing = null"
    />
    <!-- コネクトの入力(ボード画面の人物アイコンから): 範囲の形の一覧 → テンキーで倍率 -->
    <ConnectSheet
      v-if="boardEditing !== null && connectEditing !== null"
      :holomen-id="boardEditing"
      :anchor="connectEditing.anchor"
      :color="connectEditing.color"
      :placement="editingPlacements[connectEditing.anchor] ?? null"
      :all-placements="connectMap"
      :inventory="connectInventory"
      :cards-unregistered="!registered.card"
      :unlocked="connectStatus.unlocked"
      :can-unlock="connectStatus.canUnlock"
      :lock-impact="connectLockImpact"
      @submit="onConnectSubmit"
      @move="onConnectMove"
      @clear="onConnectClear"
      @unlock="onConnectUnlock"
      @lock="onConnectLock"
      @close="connectEditing = null"
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

/* 見出しの左・ⓘ の右端の 1 行(さがす・結果)。ⓘ は見出しの行の高さを変えない(`InfoButton`) */
.panel-head {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin: 0 0 8px;
}

.panel-head > h2 {
  margin: 0;
}

/*
 * 結果の「いまのまま / 組み直すと」のタブ(排他なのでセグメント。44px — `.segment.result-tabs`)。
 * 「組み直すと」は計算中にラベルの右へ小さなリング(北を始点に時計回り)と % を添え、ボードが未登録なら下の行に「ボード未登録」
 */
/* 一覧と進み具合を同じ枠に重ねる(高さは一覧で決まり、タブを切り替えても変わらない) */
.result-body {
  display: grid;
}

.result-body > * {
  grid-area: 1 / 1;
  min-width: 0;
}

.result-body .is-hidden {
  visibility: hidden;
}

.result-overlay {
  align-self: center;
}

/* 「組み直すと」は 2 行目に「ボード未登録」が入るので 44px(`.segment` の 32px より強く当てる) */
.segment.result-tabs {
  height: 44px;
  margin-bottom: 12px;
}

.result-tabs .seg {
  font-size: 14px;
}

.result-tabs .seg:disabled {
  color: var(--ink-2);
  cursor: not-allowed;
  opacity: 0.45;
}

.grown-tab {
  align-items: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  line-height: 1.2;
}

.tab-main {
  align-items: center;
  display: flex;
  gap: 6px;
}

.tab-ring {
  height: 16px;
  transform: rotate(-90deg);
  width: 16px;
}

.tab-ring circle {
  fill: none;
  stroke-width: 2.5;
}

.tab-ring .track {
  stroke: var(--line);
}

.tab-ring .bar {
  stroke: var(--action);
  transition: stroke-dashoffset 0.6s ease;
}

.seg-active .tab-ring .track {
  stroke: rgba(255, 255, 255, 0.3);
}

.seg-active .tab-ring .bar {
  stroke: currentColor;
}

.tab-pct {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.tab-sub {
  font-size: 11px;
  font-weight: 600;
  margin-top: 2px;
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

/*
 * 実行中: ボタン全体がゲージ。地は淡い緑、済んだぶんを左からいつもの緑で満たす(ボタンの寸法は変えない)。
 * ゲージはボタン自身の背景のグラデーションで描く — ボタンの子に % の幅で重ねると、iOS Safari はボタンの左右の余白を除いた幅を
 * 基準にするので、件数の割合より短く、満ちても右端が残った(2026-10-09 ユーザー指摘「ボタンの横幅に対して割合が合ってない」)
 */
.primary-button.busy {
  background: linear-gradient(
    to right,
    var(--action) var(--gauge, 0%),
    color-mix(in srgb, var(--action) 70%, var(--surface)) var(--gauge, 0%)
  );
  cursor: progress;
}

.primary-button.busy .label {
  visibility: hidden;
}

/* 左に 済んだ数 / 全体、右に残り時間(数字は等幅で揺らさない)。隠したラベルと同じ枡に重ねる(絶対配置にしない — 上と同じ理由) */
.primary-button.busy {
  display: grid;
  padding: 0 14px;
}

.primary-button.busy > * {
  grid-area: 1 / 1;
}

.search-progress {
  align-items: center;
  display: flex;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  gap: 8px;
  justify-content: space-between;
  white-space: nowrap;
}

.search-remaining {
  font-size: 13px;
  font-weight: 600;
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

/* Step 0: 入口を 2 列 × 2 段に(1 段目 ボード / カード、2 段目 コネクト / リソース。コネクトは見るだけ)。値は持たない */
.account-row {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, 1fr);
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

/* 「未登録」はラベルを中央に保ったまま右上の角に重ねる(登録の有無でラベルの位置を動かさない。3 列になって右端の中央ではラベルと重なる) */
.account-button {
  position: relative;
}

.unregistered {
  color: var(--error);
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  position: absolute;
  right: 6px;
  top: 5px;
}

.account-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

/*
 * アカウント共通の補正(イベントメモリー / メンバー強化ボーナス)。上のボタン行と同じ器で、
 * ボタンの中はラベルを左端・値(%)を右端に寄せる(2026-09-10 ユーザー指示)。
 * 左右半分ずつだと正式な名前と値が重なるので 1 行 1 つの縦積みにする(同日ユーザー指示)。
 * 押すと自前の +/- ダイアログ(StepperDialog)が開く — 数値欄をやめたのでキーボードは出ない
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

/*
 * 排他の選択(さがすの前提の 3 択)は境界線でつながったセグメント(ピッカーのセグメントと同形)。
 * 選択スタイルは全画面共通の `--selected`
 */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-template-columns: 1fr 1fr;
  height: 32px;
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
}

.seg:first-child {
  border-left: none;
}

.seg-active {
  background: var(--selected);
  color: var(--selected-ink);
  font-weight: 700;
}

/* さがすの前提の 3 択: 実行ボタンの上の主の選択なので、ほかのセグメントより一回り大きく(40px・13px) */
.segment.premise {
  grid-template-columns: repeat(3, 1fr);
  height: 40px;
  margin-bottom: 8px;
}

.segment.premise .seg {
  font-size: 13px;
}

/* 「絞り込み」: ダイアログを開く設定行(ラベル左・今の状態を右。イベントメモリーと同じ器を 40px に) */
.filter-row {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-size: 14px;
  font-weight: 600;
  height: 40px;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 0 12px;
  width: 100%;
}

.filter-value {
  color: var(--ink-2);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
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
 * 空の枠は点線のプレースホルダで、寸法は空・充填で変えない。開花アイコンは常に 1 行ぶん取る —
 * オプション(所持カードから探す・開花状況を考慮する)で高さが変わらないようにする(2026-09-14 ユーザー指示)
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
  min-height: 101px;
  padding: 6px 2px; /* 下の行の 26px のアイコン 2 つが 390px でも収まる幅 */
  text-align: center;
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

/* 開花(左)と星(右)は両端に離さず、中央に寄せて 2px の間隔で並べる(両端だと真ん中の隙間が目立つ — 2026-10-09 ユーザー指摘) */
.member-icons {
  display: flex;
  gap: 2px;
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
