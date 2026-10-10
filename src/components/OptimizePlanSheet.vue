<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";

import CloseButton from "./CloseButton.vue";
import BoardSheet from "./BoardSheet.vue";
import ApplyPlanDialog from "./ApplyPlanDialog.vue";
import ConnectFigure from "./ConnectFigure.vue";
import FrequencyFixDialog from "./FrequencyFixDialog.vue";
import InfoButton from "./InfoButton.vue";
import InfoDialog from "./InfoDialog.vue";
import SongPicker from "./SongPicker.vue";
import SongRow from "./SongRow.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { useOptimizePlan } from "../composables/useOptimizePlan";
import { getPlan, planCacheKey, fingerprint, setPlan } from "../composables/usePlanCache";
import { useModalChrome } from "../composables/useModalChrome";
import { useTabScroll } from "../composables/useTabScroll";
import { cardById, medianSongDurationSeconds, songById } from "../data";
import type { BloomMap } from "../data/bloom";
import { formatBoardPercent } from "../data/boardGraph";
import { BOARD_MATERIAL_COLORS } from "../data/boardMaterials";
import {
  CONNECT_ANCHOR_LABELS,
  CONNECT_EXTENT_LABELS,
  CONNECT_EXTENTS,
  connectFactorMapOf,
} from "../data/connect";
import type { ConnectAnchor, ConnectPlacement } from "../data/connect";
import type { HolomenBoards } from "../data/boardState";
import type { BoardConnectMap } from "../storage/boardConnects";
import { BOARD_RESOURCE_KINDS, BOARD_RESOURCE_LABELS } from "../storage/boardResources";
import type { BoardResources } from "../storage/boardResources";
import type { BoardColor, BoardMap } from "../storage/boards";
import type { ConnectPlacementMap } from "../storage/connect";
import type { HolomenRankMap } from "../storage/holomenRank";
import type { BoardScope } from "../engine/boardOptimize";
import { planHolomenOrder, registeredBoardsOf, requestBoardMaps } from "../engine/boardPlan";
import type { ConnectItem } from "../engine/connectOptimize";
import type { FrequencyObjective } from "../engine/frequencyStage";
import type { PlanStep } from "../engine/boardConnectPlan";
import type { OptimizePlanResult } from "../engine/optimizePlan";
import type { AccountBonus } from "../engine/power";
import { teamEvaluator } from "../engine/request";
import type { OptimizeRunRequest } from "../engine/request";
import { connectPlanRows } from "../ui/connectPlan";
import { applyRows as planApplyRows, selectApply, toggleApply } from "../ui/planApply";
import type { ApplyPlan, ApplyRow } from "../ui/planApply";
import { PLAN_SECTIONS, planSectionOf, sortPlanHolomen } from "../ui/planSections";
import type { PlanSection } from "../ui/planSections";
import { FREQUENCY_OBJECTIVE_INFO, OPTIMIZE_TARGET_INFO } from "../ui/infoContent";
import { holomenName } from "../ui/labels";
import { CALC_FAILED } from "../ui/messages";
import { planEstimate } from "../ui/planProgress";
import { searchRemainingLabel } from "../ui/searchProgress";

/**
 * 「組み直しプラン」(2026-10-08 ユーザー指示で「最適化」→「育成プラン」→ 同日「組み直しプラン」へ改名。「育成」は、さがすの前提の
 * 「育てきったら」(全部開けた理想)と紛らわしかった — こちらは今のランクの Pt と持っているキューブの範囲で組み直す)の結果と条件のシート(結果詳細・ユニット詳細の下端の「組み直しプラン」から開く。
 * 2026-10-04 にホロメンボードの最適化として追加し、2026-10-07 にコネクトを、2026-10-08 に発動頻度を統合した)。
 *
 * **開いただけでは計算しない**(2026-10-08 ユーザー指示「最適化ボタンを押したら設定ページに飛ばすだけ。オプションを変えても即座に走らせない」)。
 * 上から 現在 / 推奨のユニットスコア → 資材の不足などの注意 → タブ(ボード / コネクト / 発動頻度。条件はその右に離したボタン)→ 区分のタブ(結果のときだけ)までを固定し、その下のタブの中身と
 * 脚注だけをスクロールする(2026-10-08 ユーザー指示)。開いた直後は「条件」(曲 → 最適化するもの → 発動頻度の選び方)。計算済みの結果
 * (結果の「組み直すと」)があれば最初の結果のタブ。結果のタブは実行するまで disabled で、結果が届くと最初の結果のタブへ移る。
 * 結果のタブは見るだけで、固定や再計算の操作は置かない。下端の固定エリアに「ボードに反映」(secondary)と「最適化を実行」(緑)。
 *
 * - 実行は `optimizePlan.ts` の `planOptimize`(Web Worker)。ボード(頻度マス OFF)→ コネクト → 頻度 の順に、選んだものだけ行う(ADR-014 / ADR-015)
 * - 頻度の固定は条件のタブの「頻度マスの数」(押すとダイアログ)で、メンバーごとに頻度マスの数(おまかせ / 0〜3)で選ぶ。実効 % ではないのは、コネクトも同じ実行で変わると
 *   実行する前には % が決まらないため。届かない数は固定しない
 * - 結果は (曲, 範囲, 対象, 頻度の選び方, 固定) ごとに覚える(閉じても結果詳細に戻るまで — `usePlanCache.ts`)。いまの設定の結果を覚えていれば
 *   そのまま出し、なければ前に実行した結果を薄くして残す(古い結果は反映できない)。何も実行していなければ現在のユニットスコアだけ出す
 * - 反映は確認を挟み、表示中の結果(ボードの解放マス・コネクトマスの解放・余りのリソース・コネクトの配置)をまとめて登録する。
 *   確認ではホロメンごとに反映から外せる(2026-10-09 ユーザー指示。`ApplyPlanDialog` / `planApply.ts`)
 * - ボード・コネクトのタブの中は「リーダー・メンバー / 所属グループ / その他」のタブで分ける(2026-10-09 ユーザー指示。`planSections.ts`)。
 *   発動頻度はメンバーだけなので、タブではなく見出し「メンバー」
 */
const props = defineProps<{
  /** 対象の編成(結果の 1 件、またはお気に入りユニット) */
  candidate: CandidateView;
  /** カード ID → 開花段階 */
  blooms: BloomMap;
  /** 登録している状態: ホロメン ID → 解放マス(4 色) */
  boards: BoardMap;
  greenBoards: BoardMap;
  yellowBoards: BoardMap;
  redBoards: BoardMap;
  /** いまボードに置いているコネクト */
  placements: ConnectPlacementMap;
  /** ホロメン ID → 解放済みのコネクトマス(赤 / 青 / 黄) */
  connects: BoardConnectMap;
  /** ホロメン ID → ホロメンランク(登録済みのホロメンだけ。載っていないホロメンはボードPt の制限なし) */
  ranks: HolomenRankMap;
  /** 「リソース」の登録値(いまのボードを開けた上で余っているキューブ・コアキューブ。未登録の項目は制限なし。負は不足) */
  resources: BoardResources;
  /** 持っているコネクト(形 × ％ × 枚数。コネクトの最適化が使う) */
  items: ConnectItem[];
  /** コネクトを最適化できない(所持カードのコネクトもボードに置いたコネクトもない)。チップを disabled にして OFF で始める */
  connectDisabled: boolean;
  /** ボードに置いているコネクトが所持カードのコネクトに収まっていない(コネクトを選んだままでは実行できず、所持カードの登録を促す) */
  connectShortage: boolean;
  /** メモリー・メンバー強化ボーナス */
  account: AccountBonus;
  /** このシートを開いた時点の曲(結果詳細からは探したときの曲、お気に入りからは指定なし)。指定なしは null */
  songId: string | null;
  /**
   * 裏で計算しておいた結果(結果の「組み直すと」— `OptimizerPanel` の `useTrueRanking`)。ボード・頻度(ユニットスコア重視)・
   * ユニットのみ・所持リソースは全色考慮・`connect` のとおりのコネクトで、この曲で計算したもの。渡されたらその設定で開き、結果を最初から出す
   */
  preset?: { connect: boolean; result: OptimizePlanResult } | null;
}>();

const emit = defineEmits<{
  close: [];
  /**
   * 推奨のボードと、それに組み替えたあとの余りのリソース(不足は負)、推奨のコネクトの配置(コネクトを選んだときだけ。null は配置を変えない)を
   * 反映の確定時に同じ推奨としてまとめて登録する
   */
  apply: [
    plan: {
      boards: Record<string, HolomenBoards>;
      remaining: BoardResources;
      placements: ConnectPlacementMap | null;
    },
  ];
}>();

useModalChrome(() => emit("close"));

const { result, running, error, progress, startedAt, run } = useOptimizePlan();

/** リアクティブ Proxy は postMessage で複製できないので、プレーンな値に写す */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** 評価に使う曲(開いた時点の曲で始まり、ここで変えられる。ここで変えても元の画面の曲は変わらない) */
const songId = ref<string | null>(props.songId);
const song = computed(() => (songId.value ? (songById.get(songId.value) ?? null) : null));
const pickerOpen = ref(false);
/** 頻度のライブ側の評価区間(秒)。曲の演奏時間、指定なしは全曲の中央値 */
const horizonSeconds = computed(() => {
  const duration = song.value?.durationSeconds ?? null;
  return duration !== null && duration > 0 ? duration : medianSongDurationSeconds;
});

type Target = "board" | "connect" | "frequency";
/** 最適化する対象(独立した ON/OFF。少なくとも 1 つは ON)。既定は全部 ON。コネクトを最適化できないときは OFF で始める */
const useBoard = ref(true);
const useConnect = ref(props.preset ? props.preset.connect : !props.connectDisabled);
const useFrequency = ref(true);
const targetRefs = { board: useBoard, connect: useConnect, frequency: useFrequency };
/** 最後の 1 つの ON は外せない(全部 OFF にできる道を作らない) */
const lastOnly = (which: Target): boolean =>
  targetRefs[which].value &&
  (Object.keys(targetRefs) as Target[]).every((t) => t === which || !targetRefs[t].value);
function toggleTarget(which: Target): void {
  if (which === "connect" && props.connectDisabled) return;
  if (!lastOnly(which)) targetRefs[which].value = !targetRefs[which].value;
}

/** ボードとコネクトの変えてよい範囲(既定は最小限) */
const scope = ref<BoardScope>("minimal");
/**
 * 「最小限で組み直す」(ON = この編成に効くところだけ(既定。ユニット外は緑の所属マス・曲に効く黄を足し、効かないマスを外すだけ) /
 * OFF = ユニット外にも効く緑ならどのマスでも足し、コネクトは全ホロメン。どちらも伸びの効率順・効かないマスだけ外す・新しく緑を変える人には手間 — ADR-026)。
 * 2026-10-09 ユーザー指示 — 「ユニットのみ変更」→「ほかのホロメンも変える」と来た名前を、意図(最低限組み直すもの / 理論上限を目指す)で付け直した)。
 * ボードとコネクトにかかり、どちらも選んでいないときは効かない
 */
const minimal = computed({
  get: () => scope.value === "minimal",
  set: (value: boolean) => {
    scope.value = value ? "minimal" : "all";
  },
});

/**
 * 頻度の選び方(排他なのでセグメント。既定は理論値重視)。
 * 期待値重視 / 理論値重視はライブ側のアクティブスキルの試算、ユニットスコア重視は表示ユニットスコアで選ぶ(モデルを混ぜない)。
 * 並びと名前は ⓘ の説明(`FREQUENCY_OBJECTIVE_INFO`)と 1 か所で持つ
 */
const OBJECTIVES: readonly { key: FrequencyObjective; label: string }[] =
  FREQUENCY_OBJECTIVE_INFO.terms;
const objective = ref<FrequencyObjective>(props.preset ? "unit" : "perfect");

/** メンバー(ホロメン。重複なし。頻度は青ボードなのでメンバーだけ)と、メンバーごとに固定する頻度マスの数(ない = おまかせ) */
const memberIds = computed(() =>
  props.candidate.memberIds
    .map((id) => cardById.get(id)?.holomenId ?? "")
    .filter((id, i, all) => id !== "" && all.indexOf(id) === i),
);
const fixedNodes = ref<Record<string, number>>({});
/** 「頻度マスの数」のダイアログ(`FrequencyFixDialog`) */
const fixOpen = ref(false);
/** 「発動頻度の選び方」の ⓘ(3 択の違い — `FREQUENCY_OBJECTIVE_INFO`) */
const objectiveInfoOpen = ref(false);
/** 「最適化するもの」の ⓘ(3 つのチップと、最小限で組み直す・所持リソースを考慮する — `OPTIMIZE_TARGET_INFO`) */
const targetInfoOpen = ref(false);
const fixMembers = computed(() => memberIds.value.map((id) => ({ id, name: holomenName(id) })));
/** 「頻度マスの数」の行の右に出す値(固定していなければ「おまかせ」) */
const fixSummary = computed(() => {
  const count = memberIds.value.filter((id) => fixedNodes.value[id] !== undefined).length;
  return count === 0 ? "おまかせ" : `${count}人を固定`;
});
function setFixed(holomenId: string, value: number | null): void {
  const next = { ...fixedNodes.value };
  if (value === null) delete next[holomenId];
  else next[holomenId] = value;
  fixedNodes.value = next;
}

/**
 * 所持リソースを考慮するか(2026-10-08 ユーザー指示。同日に入れた色ごとの ON / OFF は、同日のユーザー判断で外して 1 つにした)。
 * 外すと、「リソース」に登録している色をすべてボードと頻度の段で制限なしとして選び、反映すると足りないぶんは余りのマイナスになる。
 * 考慮するときは 余り + この編成に効かないマス(外して回す。外すマスは推奨の盤面に入る — `coverDeficits`)の範囲。ボードを選んでいないとき・登録している色がないときは効かないので disabled
 */
const MATERIAL_COLORS: readonly BoardColor[] = ["red", "blue", "yellow", "green"];
const useResources = ref(true);
const registeredColor = (color: BoardColor): boolean =>
  props.resources[color].cube !== null || props.resources[color].core !== null;
/** 効くか(ボードを選んでいて、登録している色が 1 つでもある) */
const resourcesUsable = computed(() => useBoard.value && MATERIAL_COLORS.some(registeredColor));
/** 資材を考慮しない色(外したときの、登録している色。ボードを選んでいなければ空) */
const relaxedColors = computed<BoardColor[]>(() =>
  resourcesUsable.value && !useResources.value ? MATERIAL_COLORS.filter(registeredColor) : [],
);

/** 1 回の実行の結果と、そのときの対象(タブの有効・無効と、反映する中身を決める) */
interface PlanEntry {
  result: OptimizePlanResult;
  board: boolean;
  connect: boolean;
  frequency: boolean;
  objective: FrequencyObjective;
}
/** (曲, 範囲, 対象, 選び方, 固定)ごとの結果(一度計算したら覚えておく) */
const entries = reactive<Record<string, PlanEntry>>({});
/** 表示している結果のキー(null = まだ何も実行していない) */
const shownKey = ref<string | null>(null);
let requested: { key: string; cache: string; entry: Omit<PlanEntry, "result"> } | null = null;
/** 対象の組合せ(ボード / コネクト / 頻度)。結果のキーと保存のキーに入れる */
const targetOf = (): string =>
  `${useBoard.value ? "b" : ""}${useConnect.value ? "c" : ""}${useFrequency.value ? "f" : ""}`;
/** ボードもコネクトも選ばないときは範囲が効かないので、キーにも入れない(同じ結果を範囲違いで計算し直さない)。頻度の選び方・固定も同じ */
const scopeUsed = computed(() => useBoard.value || useConnect.value);
const scopeOf = (): BoardScope => (scopeUsed.value ? scope.value : "minimal");
const frequencyKeyOf = (): string =>
  useFrequency.value ? `${objective.value}/${JSON.stringify(fixedNodes.value)}` : "";
const keyOf = (): string =>
  `${songId.value ?? ""}|${scopeOf()}|${targetOf()}|${frequencyKeyOf()}|${relaxedColors.value.join(",")}`;
/**
 * 閉じて開き直しても残るキャッシュのキー(サイトを更新するまで、ほかの編成・入口のシートとも共有する — usePlanCache.ts)。
 * 登録(ボード・コネクト・ランク・リソース・持っているコネクト・アカウント補正)も鍵に入れるので、反映などで登録が変われば古い結果は出ない
 */
const registration = computed(() =>
  fingerprint([
    props.boards,
    props.greenBoards,
    props.yellowBoards,
    props.redBoards,
    props.placements,
    props.connects,
    props.ranks,
    props.resources,
    props.items,
    props.account,
  ]),
);
const cacheKeyOf = (): string =>
  planCacheKey(
    "optimize",
    { leaderId: props.candidate.leaderId, memberIds: props.candidate.memberIds },
    props.blooms,
    songId.value,
    // 対象・範囲・頻度の選び方と固定・資材の考慮・登録が違えば結果も違うので、キーに含める(古い結果を返さない)
    [scopeOf(), targetOf(), frequencyKeyOf(), relaxedColors.value, registration.value],
  );

/** いまの設定の結果を覚えていれば、計算せずにそれを出す(覚えていなければ前の結果を薄くして残す) */
function showRemembered(): void {
  const key = keyOf();
  if (!entries[key]) {
    const cached = getPlan<PlanEntry>(cacheKeyOf());
    if (cached) entries[key] = cached;
  }
  if (entries[key]) shownKey.value = key;
}
watch(
  [scope, songId, useBoard, useConnect, useFrequency, objective, fixedNodes, relaxedColors],
  showRemembered,
);
onMounted(() => {
  // 裏で計算しておいた結果があれば、いまの設定(その結果の設定で開いている)の結果として覚える
  if (props.preset) {
    const next: PlanEntry = {
      result: plain(props.preset.result),
      board: true,
      connect: props.preset.connect,
      frequency: true,
      objective: "unit",
    };
    entries[keyOf()] = next;
    setPlan(cacheKeyOf(), next);
  }
  showRemembered();
});

/**
 * コネクトを選んだまま、ボードに置いているコネクトが所持(所持カードから導く)に収まっていないとき: 実行せず登録を促す
 */
/** どこが超えているかはアカウントの「コネクト」の赤い使用 / 所持で分かるので、文は事実だけ(2026-10-10) */
const SHORTAGE_MESSAGE = "所持より多くコネクトを置いています";
const blockedMessage = computed(() => {
  if (!useConnect.value || !props.connectShortage) return null;
  return SHORTAGE_MESSAGE;
});

/** 表示している結果がいまの設定のものか(違えば薄くして、反映できない) */
const fresh = computed(() => shownKey.value !== null && shownKey.value === keyOf());
const entry = computed(() => (shownKey.value === null ? null : (entries[shownKey.value] ?? null)));
const shown = computed(() => entry.value?.result ?? null);
/** 「最適化を実行」を押せるか: 計算中・コネクトの登録が足りない・いまの設定の結果がすでにある、のどれでもないとき */
const canRun = computed(() => !running.value && blockedMessage.value === null && !fresh.value);

/**
 * 「最適化を実行」の進み具合(2026-10-09 ユーザー指示 — モック 3 案から 2: ボタンをゲージにして中央に残り時間だけ)。
 * 段の報告が届くたびに見積もりを直し、そのあいだは 1 秒ごとに減らす(ゲージは段の目安の時間ぶん進める — `src/ui/planProgress.ts`)
 */
const runningSteps = ref<PlanStep[]>([]);
const planNow = ref(0);
let planTicker: ReturnType<typeof setInterval> | null = null;
watch(running, (on) => {
  if (planTicker !== null) clearInterval(planTicker);
  planTicker = null;
  if (!on) return;
  planNow.value = performance.now();
  planTicker = setInterval(() => {
    planNow.value = performance.now();
  }, 250);
});
onUnmounted(() => {
  if (planTicker !== null) clearInterval(planTicker);
});
const planProgress = computed(() => {
  const start = startedAt.value;
  if (!running.value || start === null) return null;
  return planEstimate(progress.value, Math.max(0, planNow.value - start), runningSteps.value);
});

function execute(): void {
  if (!canRun.value) return;
  // 回るかもしれない段(ボード・コネクトは最大 3 周。片方だけなら 1 周)。報告が届くまでの見積もりに使う
  const roundSteps: PlanStep[] = [
    ...(useBoard.value ? (["board"] as const) : []),
    ...(useConnect.value ? (["connect"] as const) : []),
  ];
  runningSteps.value = [
    ...Array.from({ length: useBoard.value && useConnect.value ? 3 : 1 }, () => roundSteps).flat(),
    ...(useFrequency.value ? (["frequency"] as const) : []),
  ];
  requested = {
    key: keyOf(),
    cache: cacheKeyOf(),
    entry: {
      board: useBoard.value,
      connect: useConnect.value,
      frequency: useFrequency.value,
      objective: objective.value,
    },
  };
  const request: OptimizeRunRequest = {
    leaderId: props.candidate.leaderId,
    fixedMemberIds: [...props.candidate.memberIds],
    excludedCardIds: [],
    excludedLeaderCardIds: [],
    excludedMemberCardIds: [],
    leaderCandidateIds: null,
    requiredMemberHolomenIds: [],
    songId: songId.value,
    blooms: plain(props.blooms),
    boards: plain(props.boards),
    greenBoards: plain(props.greenBoards),
    yellowBoards: plain(props.yellowBoards),
    redBoards: plain(props.redBoards),
    connectPlacements: plain(props.placements),
    account: plain(props.account),
    topN: 1,
  };
  run({
    request,
    team: { leaderId: props.candidate.leaderId, memberIds: [...props.candidate.memberIds] },
    connects: plain(props.connects),
    ranks: plain(props.ranks),
    resources: plain(props.resources),
    scope: scopeOf(),
    board: useBoard.value,
    connect: useConnect.value,
    frequency: useFrequency.value,
    objective: objective.value,
    fixedFrequencyNodes: plain(fixedNodes.value),
    horizonSeconds: horizonSeconds.value,
    items: plain(props.items),
    relaxedMaterialColors: [...relaxedColors.value],
  });
}
watch(result, (value) => {
  if (value === null || requested === null) return;
  const next: PlanEntry = { ...requested.entry, result: plain(value) as OptimizePlanResult };
  entries[requested.key] = next;
  setPlan(requested.cache, next);
  shownKey.value = requested.key;
  requested = null;
  // 結果が届いたら最初の結果のタブを開く
  activeTab.value = firstResultTab();
});

const number = (value: number): string => value.toLocaleString("ja-JP");

/**
 * 実行する前の「現在」(登録そのまま。結果の「現在」と同じで、設定によって変わらない — 2026-10-08 ユーザー指示)。
 * 編成 1 つの評価なので UI スレッドで出す
 */
const liveCurrent = computed(() => {
  const team = { leaderId: props.candidate.leaderId, memberIds: [...props.candidate.memberIds] };
  const request: OptimizeRunRequest = {
    leaderId: team.leaderId,
    fixedMemberIds: team.memberIds,
    excludedCardIds: [],
    excludedLeaderCardIds: [],
    excludedMemberCardIds: [],
    leaderCandidateIds: null,
    requiredMemberHolomenIds: [],
    songId: songId.value,
    blooms: props.blooms,
    boards: props.boards,
    greenBoards: props.greenBoards,
    yellowBoards: props.yellowBoards,
    redBoards: props.redBoards,
    connectPlacements: props.placements,
    account: props.account,
    topN: 1,
  };
  const registered = registeredBoardsOf(request, props.connects, planHolomenOrder(team).holomenIds);
  return (
    teamEvaluator({ ...request, ...requestBoardMaps(registered, false) }, team)(props.placements)
      ?.modifiers.adjustedUnitScore ?? 0
  );
});
const currentScore = computed(() => (shown.value ? shown.value.current : liveCurrent.value));

/**
 * タブ(結果の 3 つ + 条件。2026-10-08 ユーザー指示で、結果を先・条件を最後にし、「設定」を「条件」、「頻度」を「発動頻度」に改めた)。
 * 結果のタブは実行するまで disabled、実行したあとは表示中の結果で対象にしなかったものが disabled。
 * 開いた直後は条件(いまの条件の結果を覚えていれば、最初の結果のタブ)
 */
type Tab = "settings" | Target;
const TABS: { key: Tab; label: string }[] = [
  { key: "board", label: "ボード" },
  { key: "connect", label: "コネクト" },
  { key: "frequency", label: "発動頻度" },
  { key: "settings", label: "条件" },
];
/** 結果のタブ(条件は別のボタン) */
const RESULT_TABS = TABS.filter((t) => t.key !== "settings");
const tabEnabled = (tab: Tab): boolean => tab === "settings" || (entry.value?.[tab] ?? false);
const firstResultTab = (): Tab =>
  TABS.find((t) => t.key !== "settings" && tabEnabled(t.key))?.key ?? "settings";
const activeTab = ref<Tab>("settings");
onMounted(() => {
  if (fresh.value) activeTab.value = firstResultTab();
});
watch(
  () => TABS.map((t) => tabEnabled(t.key)),
  () => {
    if (!tabEnabled(activeTab.value)) activeTab.value = firstResultTab();
  },
);
const bodyEl = ref<HTMLElement | null>(null);

/** 表の並びの基準(リーダー → メンバー(結果のメンバーの順)→ 所属グループ → その他。どちらもホロメン順 — `planSections.ts`) */
const unit = computed(() => ({
  leaderHolomenId: cardById.get(props.candidate.leaderId)?.holomenId ?? "",
  memberHolomenIds: props.candidate.memberIds.map((id) => cardById.get(id)?.holomenId ?? ""),
}));
/** コネクトの表の行(違う置き場所だけ) */
const connectRows = computed(() =>
  shown.value === null || !entry.value?.connect
    ? []
    : connectPlanRows(props.placements, shown.value.placements, unit.value),
);
/** ボードの表の行(変更のあるホロメン。区分の順) */
const boardRows = computed(() =>
  sortPlanHolomen(shown.value?.changed ?? [], unit.value).map((id) => ({
    id,
    section: planSectionOf(id, unit.value),
  })),
);
/** ボード(頻度マスも含む)に変更があるか。頻度だけを選んだときも、頻度マスとその経路を開けるのはボードの変更 */
const boardChanged = computed(
  () =>
    !!entry.value &&
    (entry.value.board || entry.value.frequency) &&
    (shown.value?.changed.length ?? 0) > 0,
);
/** 変更があるか(スコアが同じでも、予算の超過や頻度マスを外すなど変更があれば反映できる) */
const hasChange = computed(() => boardChanged.value || connectRows.value.length > 0);
/** 「ボードに反映」を押せるか: いまの設定の結果で、変更があって、計算中でない */
const canApply = computed(() => fresh.value && hasChange.value && !running.value);
/** 頻度の表 */
const frequencyRows = computed(() =>
  entry.value?.frequency && shown.value?.frequency
    ? shown.value.frequency.rows.map((row) => ({
        ...row,
        name: holomenName(row.holomenId),
        section: planSectionOf(row.holomenId, unit.value),
        // 頻度マスに 1 つも届かない(Pt が足りず、空けることもできない)
        unreachable: Math.max(...row.reachableNodeCounts) === 0,
      }))
    : [],
);
/**
 * 結果のタブの中の区分のタブ(リーダー・メンバー / 所属グループ / その他。2026-10-09 ユーザー指示 — ボード・コネクト・発動頻度の 3 つ)。
 * タブごとに選んでいる区分を覚え、行のない区分は disabled。選んでいる区分に行がなくなったら、行のある最初の区分へ移る。
 * 発動頻度はメンバーだけなので、いつもリーダー・メンバー
 */
type ResultTab = "board" | "connect" | "frequency";
const sectionOf = reactive<Record<ResultTab, PlanSection>>({
  board: "unit",
  connect: "unit",
  frequency: "unit",
});
const sectionCount = (tab: ResultTab, section: PlanSection): number =>
  tab === "board"
    ? boardRows.value.filter((r) => r.section === section).length
    : tab === "connect"
      ? connectRows.value.filter((r) => r.section === section).length
      : frequencyRows.value.filter((r) => r.section === section).length;
watch(
  () => [boardRows.value, connectRows.value, frequencyRows.value],
  () => {
    for (const tab of ["board", "connect", "frequency"] as const)
      if (sectionCount(tab, sectionOf[tab]) === 0)
        sectionOf[tab] = PLAN_SECTIONS.find((s) => sectionCount(tab, s.key) > 0)?.key ?? "unit";
  },
  { immediate: true },
);
/** いま開いている結果のタブ(条件のタブでは null — 区分のタブを出さない) */
const resultTab = computed<ResultTab | null>(() =>
  activeTab.value === "settings" || shown.value === null ? null : activeTab.value,
);
/**
 * 本文のスクロール位置はタブと区分の組ごとに別々に覚える(切り替えて同じ位置から始まらない。区分を切り替えても前の区分の位置を引き継がない —
 * 2026-10-09 ユーザー指摘「リーダー・メンバーなどのタブごとにスクロール位置が共有されてしまっている」)
 */
useTabScroll(bodyEl, () =>
  activeTab.value === "settings" ? "settings" : `${activeTab.value}/${sectionOf[activeTab.value]}`,
);
const percent = (value: number): string => `${value.toFixed(2)}%`;
const ratio = (value: number): string => `${(value * 100).toFixed(2)}%`;
const seconds = (value: number): string => `${value.toFixed(1)} 秒`;
/** 頻度の見込み(選んだ案のライブ側の指標)。スコアUP は理論値重視なら理論値、ほかは期待値 */
const frequencyMetrics = computed(() => {
  const m = entry.value?.frequency ? shown.value?.frequency?.metrics : undefined;
  if (!m || !entry.value) return null;
  return {
    score: percent(
      entry.value.objective === "perfect"
        ? m.averagePerfectActivationScorePercent
        : m.averageExpectedActiveScorePercent,
    ),
    coverage: ratio(m.expectedCoverage),
    gap: seconds(m.maximumGapSeconds),
  };
});

const COLOR_LABELS: Record<string, string> = { red: "赤", blue: "青", yellow: "黄", green: "緑" };
/**
 * 推奨を反映すると余りが負になる資材(例「青のキューブが 74」)。画面には出さず、反映の確認に添える(2026-10-08 ユーザー指示)。
 * この編成に効かないマスで埋められるぶんは推奨の盤面で外してあるので(`coverDeficits`)、負は本当の不足だけ: 所持リソースを考慮しなかった色、
 * 外せるマスが足りないとき、反映の確認で効かないマスを外すホロメンの行を外したとき(2026-10-10 — それまでは「外して回す」ぶんも負だった)
 */
function deficitsOf(r: BoardResources | undefined): string[] {
  const out: string[] = [];
  if (!r) return out;
  for (const color of BOARD_MATERIAL_COLORS)
    for (const kind of BOARD_RESOURCE_KINDS) {
      const left = r[color][kind];
      if (left === null || left >= 0) continue;
      out.push(`${COLOR_LABELS[color] ?? color}の${BOARD_RESOURCE_LABELS[kind]} ${number(-left)}`);
    }
  return out;
}

/** コネクトマスの色(図形の塗り。中心は濃色) */
const ANCHOR_COLOR: Record<ConnectAnchor, string> = {
  center: "var(--ink)",
  leader: "var(--board-red)",
  card: "var(--board-blue)",
  content: "var(--board-yellow)",
};
/** 表の「どのコネクトマスか」の短い名前(「赤」など。ボードの色の呼び方と同じ) */
const ANCHOR_SHORT: Record<ConnectAnchor, string> = {
  center: "中心",
  leader: "赤",
  card: "青",
  content: "黄",
};
const labelOf = (p: ConnectPlacement): string =>
  `${CONNECT_EXTENT_LABELS[p.extent]} +${String(p.permil / 10)}%`;

/**
 * 推奨のボードの図(2026-10-04 ユーザー指示「どこのマスをどういうふうに開けたボードの図で見れるようにしたい。それをもって承認するか決める」)。
 * 表の行を押すと、そのホロメンの推奨のボードを見るだけの表示(`BoardSheet` の preview)で開く。追加するマスはそのマスの色が点滅、解除するマスは丸の右上から左下への斜線。
 */
const previewId = ref<string | null>(null);
const preview = computed(() => {
  const id = previewId.value;
  const r = shown.value;
  if (id === null || r === null) return null;
  const after = r.boards[id];
  const before = r.before[id];
  if (!after || !before) return null;
  const placements = r.placements[id] ?? props.placements[id] ?? {};
  return {
    id,
    after,
    before,
    placements,
    factors: connectFactorMapOf({ [id]: placements })[id] ?? {},
  };
});

/** 必須のコネクトが予算に収まらず変更できなかったホロメンの名前 */
const infeasibleNames = computed(() =>
  (entry.value?.board ? (shown.value?.infeasible ?? []) : [])
    .map((id) => holomenName(id))
    .join("・"),
);

/** 脚注の番号(上から出てくる順。※1 は推奨の欄。※2 からはいま開いているタブの中身の順 — 脚注もそのタブのぶんだけ出す) */
const noteNo = { tab: 2, score: 3, coverage: 4, gap: 5 } as const;

/**
 * 反映の確認(開いている間は null 以外)。確認した時点の推奨を渡す — 開いたあとに設定を変えても別の結果を登録しない。
 * ホロメンのボード・コネクトごとに外せる(`excluded` は行の key。外したものは登録のまま、外したボードのぶん余りが戻る。
 * 基本は行ごとに独立で、片方だけでは成り立たない行だけ連動する — `planApply.ts`)
 */
const applying = ref<{
  plan: ApplyPlan;
  rows: ApplyRow[];
  withBoards: boolean;
  withConnect: boolean;
} | null>(null);
const excluded = ref<ReadonlySet<string>>(new Set());
function askApply(): void {
  const e = entry.value;
  if (!canApply.value || e === null) return;
  const withBoards = e.board || e.frequency;
  const plan: ApplyPlan = {
    // ボードも頻度も選ばなかったときは、ボードの変更を含めない(コネクトだけを反映する)
    boards: withBoards ? plain(e.result.boards) : {},
    before: withBoards ? plain(e.result.before) : {},
    remaining: withBoards ? plain(e.result.remainingAfter) : plain(props.resources),
    currentPlacements: plain(props.placements),
    placements: e.connect ? plain(e.result.placements) : null,
    items: plain(props.items),
  };
  excluded.value = new Set();
  applying.value = {
    plan,
    rows: planApplyRows(plan, unit.value),
    withBoards,
    withConnect: e.connect,
  };
}
/** 確認の行(ホロメン × ボード / コネクト)。連動する行はトグルが連動するだけで、文字では示さない(2026-10-09 ユーザー指示) */
const applyRows = computed(() =>
  (applying.value?.rows ?? []).map((r) => ({
    key: r.key,
    kind: r.kind,
    section: r.section,
    name: holomenName(r.holomenId),
    on: !excluded.value.has(r.key),
  })),
);
/** 行を押す: 基本はその行だけを切り替え、片方だけでは成り立たない行は連動する(`planApply.ts` の `toggleApply`) */
function toggleApplyRow(key: string): void {
  const rows = applying.value?.rows;
  if (!rows) return;
  excluded.value = toggleApply(rows, excluded.value, key);
}
/** 外した行を除いた、反映する中身 */
const selected = computed(() =>
  applying.value === null ? null : selectApply(applying.value.plan, excluded.value),
);
/** 確認ダイアログの文言(反映する内容に合わせる) */
const confirmMessage = computed(() => {
  const a = applying.value;
  if (a === null) return "";
  if (a.withBoards && a.withConnect) return "推奨のホロメンボードとコネクトの配置を反映しますか？";
  if (a.withBoards) return "推奨のホロメンボードを反映しますか？";
  return "推奨のコネクトの配置を反映しますか？";
});
/**
 * 反映の確認に添える一言(2026-10-08 ユーザー指示): 足りない資材を書く(赤い文)。足りなければ何も添えない。
 * 外したホロメンがあれば、そのぶん戻した余りで数え直す。「余りはマイナスで登録されます」は 2026-10-10 に外した
 * (リソースの画面にマイナスが赤で出る — 「不要な文は書かない」)。
 * 頻度を選ばないときは登録の頻度マスを残すので、「発動頻度マスはすべて外れます。」は 2026-10-08 に外した
 */
const confirmNote = computed(() => {
  const a = applying.value;
  if (!a) return undefined;
  const parts: string[] = [];
  // コネクトマスが開いていないので外れる配置(連動があるので画面の操作では起きない。保険)
  const dropped = selected.value?.dropped ?? [];
  if (dropped.length > 0)
    parts.push(
      `${dropped.map((d) => `${holomenName(d.holomenId)}の${ANCHOR_SHORT[d.anchor]}`).join("、")}のコネクトが外れます`,
    );
  const short = a.withBoards ? deficitsOf(selected.value?.remaining) : [];
  if (short.length > 0) parts.push(`${short.join("・")} が不足します`);
  return parts.length > 0 ? parts.join("。") : undefined;
});
function onApply(): void {
  const next = selected.value;
  applying.value = null;
  if (next !== null && (Object.keys(next.boards).length > 0 || next.placements !== null))
    emit("apply", { boards: next.boards, remaining: next.remaining, placements: next.placements });
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="組み直しプラン">
      <header class="sheet-head">
        <h3>組み直しプラン</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <!--
        スクロールしない上部(スコア → 注意 → タブ。2026-10-08 ユーザー指示「タブの位置までは固定していい」)。高さは中身で決まり、
        スクロールするのは下の本文だけ(上部もスクロールさせると、2 か所の境目で下側が白く見切れる)
      -->
      <div class="fixed-top">
        <!-- 現在 / 推奨のユニットスコア(タブより上。実行するまでは現在だけ。設定を変えて結果が古くなったら薄くする) -->
        <div class="summary" :class="{ stale: shown !== null && !fresh }">
          <div class="score">
            <span class="score-label">現在</span>
            <span class="score-value">{{ number(currentScore) }}</span>
          </div>
          <div class="score">
            <span class="score-label">推奨<sup class="fn">※1</sup></span>
            <span class="score-value">{{ shown === null ? "" : number(shown.recommended) }}</span>
          </div>
        </div>

        <!-- エラー(コネクトが所持を超えている / 実行に失敗した)。タブより上に出す(共通の赤い文 — 2026-10-10 に灰色の箱から替えた)。資材の不足は反映の確認で出す -->
        <p v-if="blockedMessage !== null" class="error-text" role="alert">{{ blockedMessage }}</p>
        <p v-else-if="error !== null" class="error-text" role="alert">{{ CALC_FAILED }}</p>

        <!-- タブ(排他なのでセグメント。上部の一番下)。結果のタブは実行するまで、また対象にしなかったものは disabled -->
        <!--
          結果の 3 つのタブはセグメント、条件はその右に離した別形のボタン(2026-10-09 ユーザー指示 — 条件は入力で、ほかの 3 つは 1 回の結果の見方なので
          同じ列の 4 択にしない。モック 3 案から「タブの横に条件を離して置く」を選んだ)
        -->
        <div class="tabs" role="tablist" aria-label="結果と条件">
          <div class="segment">
            <button
              v-for="t in RESULT_TABS"
              :key="t.key"
              type="button"
              class="seg"
              role="tab"
              :aria-selected="activeTab === t.key"
              :class="{ 'seg-active': activeTab === t.key }"
              :disabled="!tabEnabled(t.key)"
              @click="activeTab = t.key"
            >
              {{ t.label }}
            </button>
          </div>
          <button
            type="button"
            class="cond-tab"
            role="tab"
            :aria-selected="activeTab === 'settings'"
            :class="{ active: activeTab === 'settings' }"
            @click="activeTab = 'settings'"
          >
            条件
          </button>
        </div>
        <!--
          結果のタブの中の区分のタブ(リーダー・メンバー / 所属グループ / その他。2026-10-09 ユーザー指示 — スクロールせず固定)。
          排他なのでセグメント。行のない区分は disabled。条件のタブには出さない(2026-10-09 ユーザー指示「条件タブにはいらんだろう」)
        -->
        <div v-if="resultTab !== null" class="segment subtabs" role="tablist" aria-label="区分">
          <button
            v-for="sec in PLAN_SECTIONS"
            :key="sec.key"
            type="button"
            class="seg"
            role="tab"
            :aria-selected="sectionOf[resultTab] === sec.key"
            :class="{ 'seg-active': sectionOf[resultTab] === sec.key }"
            :disabled="sectionCount(resultTab, sec.key) === 0"
            @click="sectionOf[resultTab] = sec.key"
          >
            {{ sec.label }}
          </button>
        </div>
      </div>

      <!-- スクロールするのはタブの中身と脚注だけ。脚注の区切り線が下端の固定エリアにちょうど来る高さを最低限確保する -->
      <div ref="bodyEl" class="body">
        <div class="sheet-main">
          <!--
            条件(2026-10-08 ユーザー指示で組み替えた): 曲 → 最適化するもの(ボード・コネクト・発動頻度のチップと、「最小限で組み直す」
            「所持リソースを考慮する」)→ 発動頻度の選び方(3 択と「頻度マスの数」の 1 行。押すとメンバーごとのダイアログ)。
            効かないあいだは白 + disabled(効いていないものを効いているように見せない)。最適化するものは最後の 1 つを外せない
          -->
          <div
            v-if="activeTab === 'settings'"
            id="optimize-settings"
            class="settings"
            role="group"
            aria-label="条件"
          >
            <!-- 評価に使う曲(部品はメイン画面の Step 3 と同じ。選択中は右上に解除ボタン) -->
            <section class="cond-block">
              <h4>曲</h4>
              <div class="song-slot">
                <SongRow
                  :song="song"
                  :clearable="song !== null"
                  aria-label="評価に使う曲"
                  @activate="pickerOpen = true"
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
            <section class="cond-block" aria-label="最適化するもの">
              <!-- 見出しの行の右端の ⓘ はチップの意味を開く(2026-10-08 ユーザー指示。「最小限で組み直す」の範囲はボード・コネクトのタブの脚注から移した) -->
              <div class="cond-head">
                <h4>最適化するもの</h4>
                <InfoButton label="最適化するものの説明" @click="targetInfoOpen = true" />
              </div>
              <div class="target-row">
                <button
                  type="button"
                  class="chip target"
                  role="checkbox"
                  :aria-checked="useBoard"
                  :class="{ active: useBoard }"
                  :disabled="lastOnly('board')"
                  @click="toggleTarget('board')"
                >
                  ボード
                </button>
                <button
                  type="button"
                  class="chip target"
                  role="checkbox"
                  :aria-checked="useConnect"
                  :class="{ active: useConnect }"
                  :disabled="props.connectDisabled || lastOnly('connect')"
                  @click="toggleTarget('connect')"
                >
                  コネクト
                </button>
                <button
                  type="button"
                  class="chip target"
                  role="checkbox"
                  :aria-checked="useFrequency"
                  :class="{ active: useFrequency }"
                  :disabled="lastOnly('frequency')"
                  @click="toggleTarget('frequency')"
                >
                  発動頻度
                </button>
              </div>
              <div class="option-subs">
                <button
                  type="button"
                  class="chip scope"
                  role="checkbox"
                  :aria-checked="scopeUsed && minimal"
                  :class="{ active: scopeUsed && minimal }"
                  :disabled="!scopeUsed"
                  @click="minimal = !minimal"
                >
                  最小限で組み直す
                </button>
                <button
                  type="button"
                  class="chip resource"
                  role="checkbox"
                  :aria-checked="resourcesUsable && useResources"
                  :class="{ active: resourcesUsable && useResources }"
                  :disabled="!resourcesUsable"
                  @click="useResources = !useResources"
                >
                  所持リソースを考慮する
                </button>
              </div>
            </section>
            <section class="cond-block" aria-label="発動頻度の選び方">
              <!-- 見出しの行の右端の ⓘ は 3 択の違いを開く(2026-10-08 ユーザー指示。ユニットスコアが下がることがある注意は発動頻度のタブの脚注から移した) -->
              <div class="cond-head">
                <h4>発動頻度の選び方</h4>
                <InfoButton label="発動頻度の選び方の説明" @click="objectiveInfoOpen = true" />
              </div>
              <div class="segment objective" role="radiogroup" aria-label="発動頻度の選び方">
                <button
                  v-for="o in OBJECTIVES"
                  :key="o.key"
                  type="button"
                  class="seg"
                  role="radio"
                  :aria-checked="useFrequency && objective === o.key"
                  :class="{ 'seg-active': useFrequency && objective === o.key }"
                  :disabled="!useFrequency"
                  @click="objective = o.key"
                >
                  {{ o.label }}
                </button>
              </div>
              <button
                type="button"
                class="fix-button"
                aria-haspopup="dialog"
                :disabled="!useFrequency"
                @click="fixOpen = true"
              >
                <span>頻度マスの数</span>
                <span class="fix-value">{{ useFrequency ? fixSummary : "" }}</span>
              </button>
            </section>
          </div>
          <!-- 結果のタブの中身(見るだけ。固定や再計算の操作は置かない) -->
          <div v-else class="tab-body" :class="{ stale: shown !== null && !fresh }">
            <template v-if="shown !== null && entry !== null">
              <!-- ボード: 変更のあるホロメンだけ「ホロメン / 推奨」。推奨の欄の「ボードを開く」で推奨の盤面を図で見る -->
              <template v-if="activeTab === 'board'">
                <table v-if="boardChanged" class="plan-table">
                  <thead>
                    <tr>
                      <th class="col-name">ホロメン</th>
                      <th class="col-cell wide">
                        推奨<sup class="fn">※{{ noteNo.tab }}</sup>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in boardRows.filter((r) => r.section === sectionOf.board)"
                      :key="row.id"
                    >
                      <td class="col-name">
                        <span class="name">{{ holomenName(row.id) }}</span>
                      </td>
                      <td class="col-cell wide">
                        <button type="button" class="open-board" @click="previewId = row.id">
                          ボードを開く
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p v-if="infeasibleNames" class="error-text">
                  {{ infeasibleNames }}はボードPt が足りず変更していません
                </p>
              </template>
              <!-- コネクト: 違う置き場所だけ「ホロメン / 現在 / 推奨」 -->
              <table
                v-else-if="activeTab === 'connect' && connectRows.length > 0"
                class="plan-table"
              >
                <thead>
                  <tr>
                    <th class="col-name">ホロメン</th>
                    <th class="col-cell">現在</th>
                    <th class="col-cell">
                      推奨<sup class="fn">※{{ noteNo.tab }}</sup>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in connectRows.filter((r) => r.section === sectionOf.connect)"
                    :key="`${row.holomenId}/${row.anchor}`"
                  >
                    <td class="col-name">
                      <span class="name">{{ holomenName(row.holomenId) }}</span>
                      <span class="anchor" :aria-label="CONNECT_ANCHOR_LABELS[row.anchor]">
                        {{ ANCHOR_SHORT[row.anchor] }}
                      </span>
                    </td>
                    <td
                      v-for="which in ['current', 'recommended'] as const"
                      :key="which"
                      class="col-cell"
                    >
                      <span
                        v-if="row[which]"
                        class="placed"
                        :style="{ '--board': ANCHOR_COLOR[row.anchor] }"
                        :aria-label="labelOf(row[which])"
                      >
                        <span class="figure">
                          <ConnectFigure :cells="CONNECT_EXTENTS[row[which].extent]" />
                        </span>
                        <span class="percent">+{{ row[which].permil / 10 }}%</span>
                      </span>
                      <span v-else class="none">なし</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <!-- 頻度: メンバーごとの「ホロメン / 現在 / 推奨」と、選んだ案の見込み 3 つ -->
              <template v-else-if="activeTab === 'frequency' && frequencyRows.length > 0">
                <table class="plan-table">
                  <thead>
                    <tr>
                      <th class="col-name">ホロメン</th>
                      <th class="col-cell">現在</th>
                      <th class="col-cell">
                        推奨<sup class="fn">※{{ noteNo.tab }}</sup>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in frequencyRows.filter((r) => r.section === sectionOf.frequency)"
                      :key="row.holomenId"
                    >
                      <td class="col-name">
                        <span class="name">{{ row.name }}</span>
                      </td>
                      <td class="col-cell">
                        <span class="current">{{ formatBoardPercent(row.currentPercent) }}</span>
                      </td>
                      <td class="col-cell">
                        <span v-if="row.unreachable" class="none">届かない</span>
                        <span v-else class="recommended">{{
                          formatBoardPercent(row.recommendedPercent)
                        }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <dl v-if="frequencyMetrics" class="param-grid">
                  <div class="param-cell">
                    <dt>
                      スコアUP<sup class="fn">※{{ noteNo.score }}</sup>
                    </dt>
                    <dd>{{ frequencyMetrics.score }}</dd>
                  </div>
                  <div class="param-cell">
                    <dt>
                      期待カバレッジ<sup class="fn">※{{ noteNo.coverage }}</sup>
                    </dt>
                    <dd>{{ frequencyMetrics.coverage }}</dd>
                  </div>
                  <div class="param-cell">
                    <dt>
                      最大空白<sup class="fn">※{{ noteNo.gap }}</sup>
                    </dt>
                    <dd>{{ frequencyMetrics.gap }}</dd>
                  </div>
                </dl>
              </template>
            </template>
          </div>
        </div>

        <div class="footnotes">
          <p>
            <span class="fn-num">※1</span>
            <span
              >この編成のまま、ユニットスコアが高くなるように選んだ値です（選び方は近似で、最大を保証しません）。使えるボードPt・キューブ・コアキューブ・コネクトの範囲は、「条件」のタブの「最適化するもの」の
              ⓘ のとおりです。配置のあるコネクトマスは必ず解放済みにします（1
              Pt）。ボード・コネクト・ランク・リソースはいまの登録、開花は結果と同じ段階、曲は条件の曲で計算します。マスは、ボードPt
              とキューブあたりのスコアの伸びが大きいものから開けます。ほかのホロメンのマスを外すのは、この編成に効かないマス（リーダー以外の赤、メンバー以外の青、曲に効かない黄、報酬のマス、ほかの所属の所属のマス、上限
              — 所属向けの +900・楽曲スコアボーナスの 10% —
              を超えて効いていないマス）だけで、全員・パラメータの緑は誰が持っていても効くので外しません（効かないマスの先にあって中心から切れるマスは一緒に外れます。その分の損も比べて決めます）。まだ緑を変えていないホロメンの緑は、スコアがいまの
              0.05%
              以上伸びるときだけ変えます（赤・青・黄だけを変えるときはこの決まりはありません）。「最小限で組み直す」がオンのとき、ほかのホロメンに足すのはメンバーと同じ所属の所属のマス（とそこまでのマス）と曲に効く黄のマス（歌っているホロメンが編成にいなくても）だけで、リーダーとメンバーの緑は、赤・青・黄のあとに残ったボードPt
              で開けます。オフのときは、ほかのホロメンにも効く緑ならどのマスでも足します。キューブ・コアキューブが足りなくなるときは、ほかのホロメンのこの編成に効かないマスを外して回し、その変更も推奨に入れます（なるべくボードを変えるホロメンから外します）。足りないコネクトは外して回し、曲に効く黄のマスに掛かるコネクトも置きます。ボードPt
              とキューブ・コアキューブの値は実機で確認できていません。</span
            >
          </p>
          <p v-if="activeTab === 'board'">
            <span class="fn-num">※{{ noteNo.tab }}</span>
            <span
              >変更のあるホロメンです。反映すると、解放マスとコネクトマスの解放が置き換わります。</span
            >
          </p>
          <p v-if="activeTab === 'connect'">
            <span class="fn-num">※{{ noteNo.tab }}</span>
            <span>置き場所が変わるところです。</span>
          </p>
          <template v-if="activeTab === 'frequency'">
            <p>
              <span class="fn-num">※{{ noteNo.tab }}</span>
              <span
                >「現在」はいまのボード、「推奨」は最適化したボードでの発動頻度です。発動頻度マスまでは、追加のボードPt
                が最も少ない経路を開けます。ボードPt
                が足りないときは、ユニットスコアへの影響が小さいマスから外して空けます（空けられない数は選ばず、固定した数も届かなければ固定しません）。キューブ・コアキューブはボードと同じ範囲で選びます。</span
              >
            </p>
            <p>
              <span class="fn-num">※{{ noteNo.score }}</span>
              <span
                >評価区間（条件の曲の演奏時間。指定なしは全曲の中央値
                {{ medianSongDurationSeconds }}
                秒）のアクティブスキルのスコアUPの時間平均の試算です。「理論値重視」は発動抽選がすべて成功した前提、ほかは発動確率を考慮した期待値です。発動頻度
                +f% は 周期 ÷（1 + f/100）、発動率 +r% は 発動確率 ×（1 + r/100、上限
                1）とする仮定のモデルで、譜面・コンボ・スペシャルスキル・スコアサポートは含みません。リーダー枠のアクティブは発動しないものとして扱います。</span
              >
            </p>
            <p>
              <span class="fn-num">※{{ noteNo.coverage }}</span>
              <span
                >評価区間のうち、少なくとも 1
                つのアクティブスキルが発動している時間の割合（期待値）です。</span
              >
            </p>
            <p>
              <span class="fn-num">※{{ noteNo.gap }}</span>
              <span
                >どのアクティブスキルも発動候補になっていない時間のうち、最も長いものです。</span
              >
            </p>
          </template>
        </div>
      </div>

      <!-- 下端の固定エリア(結果詳細と同じ地・罫線)。左 = ボードに反映(secondary)、右 = 最適化を実行(実行専用の緑。
           計算中はボタン全体がゲージになり、中央に残り時間だけ — 2026-10-09 ユーザー指示、モック案 2) -->
      <div class="sheet-foot">
        <button type="button" class="foot-secondary" :disabled="!canApply" @click="askApply">
          ボードに反映
        </button>
        <button
          type="button"
          class="foot-primary"
          :class="{ busy: running }"
          :style="
            planProgress ? { '--gauge': `${String(planProgress.fraction * 100)}%` } : undefined
          "
          :disabled="!canRun"
          :aria-busy="running"
          :aria-label="
            planProgress ? `計算中 ${searchRemainingLabel(planProgress.remainingMs)}` : undefined
          "
          @click="execute"
        >
          <span class="label">最適化を実行</span>
          <span v-if="planProgress" class="plan-remaining" aria-hidden="true">{{
            searchRemainingLabel(planProgress.remainingMs)
          }}</span>
        </button>
      </div>
    </div>

    <!-- 推奨のボードの図(見るだけ。追加 = 点滅、解除 = 斜線) -->
    <BoardSheet
      v-if="preview"
      :holomen-id="preview.id"
      :red-nodes="[...preview.after.red]"
      :nodes="[...preview.after.blue]"
      :yellow-nodes="[...preview.after.yellow]"
      :green-nodes="[...preview.after.green]"
      :connects="[...preview.after.connects]"
      :placements="preview.placements"
      :factors="preview.factors"
      :baseline="preview.before"
      preview
      @close="previewId = null"
    />
    <!-- 評価に使う曲を選ぶピッカー(このシートの上に重ねる。z-index はこのオーバーレイの中で解決される) -->
    <SongPicker
      v-if="pickerOpen"
      :selected-id="songId"
      @pick="
        songId = $event;
        pickerOpen = false;
      "
      @close="pickerOpen = false"
    />

    <!-- 条件の「頻度マスの数」(このオーバーレイの子として出し、シートの上に重ねる) -->
    <InfoDialog
      v-if="targetInfoOpen"
      :terms="OPTIMIZE_TARGET_INFO"
      @close="targetInfoOpen = false"
    />
    <InfoDialog
      v-if="objectiveInfoOpen"
      :terms="FREQUENCY_OBJECTIVE_INFO"
      @close="objectiveInfoOpen = false"
    />
    <FrequencyFixDialog
      v-if="fixOpen"
      :members="fixMembers"
      :fixed="fixedNodes"
      @set="setFixed"
      @close="fixOpen = false"
    />
    <!-- シートの上に重ねる。このオーバーレイ(z-index: 12)の子として出すので、ダイアログ自身の z-index が上に載る -->
    <ApplyPlanDialog
      v-if="applying !== null"
      :message="confirmMessage"
      :rows="applyRows"
      :note="confirmNote"
      @toggle="toggleApplyRow"
      @confirm="onApply"
      @cancel="applying = null"
    />
  </div>
</template>

<style scoped>
/* 結果詳細（ResultDetail）と同じシート。結果詳細の上に重ねるので z-index を 1 段上げる */
.overlay {
  background: rgba(35, 48, 61, 0.4);
  inset: 0;
  position: fixed;
  z-index: 12;
}

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

/* ページヘッダ・ピッカーと同寸法(77px)・同文字サイズ(24px/900) */
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

/* スクロールしない上部(スコア → 注意 → タブ)。高さは中身で決まる */
.fixed-top {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 16px;
  padding: 16px 16px 12px;
}

/* スクロールするのはタブの中身と脚注だけ */
.body {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 16px 16px;
}

/* タブの中身(脚注より上)は本文の見える高さを最低限埋める: 脚注の区切り線が下端の固定エリアの上端に来て、スクロールして初めて脚注が出る */
.sheet-main {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: 100%;
}

.footnotes {
  flex-shrink: 0;
}

/* 下端の固定エリア(結果詳細の固定エリアと同じ地・罫線・寸法)。左右半分ずつ: 反映 = secondary 14px/600、実行 = 緑 15px/700 */
.sheet-foot {
  background: var(--chrome-foot);
  border-top: 1px solid var(--line);
  display: grid;
  flex-shrink: 0;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
}

.sheet-foot button {
  border-radius: var(--r-m);
  cursor: pointer;
  height: 48px;
  padding: 0 8px;
  white-space: nowrap;
}

.sheet-foot button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.foot-secondary {
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink);
  font-size: 14px;
  font-weight: 600;
}

.foot-primary {
  align-items: center;
  background: var(--action);
  border: none;
  color: #fff;
  display: grid;
  font-size: 15px;
  font-weight: 700;
  justify-items: center;
}

/*
 * 計算中はラベルを隠して(幅と高さは保つ)、ボタン全体をゲージにして残り時間を同じ場所に重ねる(メイン画面の「ベスト編成をさがす」と同じ)。
 * ゲージはボタン自身の背景のグラデーションで描く(子に % の幅で重ねると、iOS Safari はボタンの余白を除いた幅を基準にする)
 */
.foot-primary > * {
  grid-area: 1 / 1;
}

.foot-primary.busy {
  background: linear-gradient(
    to right,
    var(--action) var(--gauge, 0%),
    color-mix(in srgb, var(--action) 70%, var(--surface)) var(--gauge, 0%)
  );
}

.foot-primary.busy .label {
  visibility: hidden;
}

.foot-primary.busy:disabled {
  opacity: 1;
}

.plan-remaining {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.fn {
  font-size: 10px;
  font-weight: 600;
  line-height: 0;
  margin-left: 1px;
}

/* 条件のタブ: 上から 曲 / 最適化するもの / 発動頻度の選び方 を 1 列に積み、区分は小見出しで分ける(枠では囲まない) */
.settings {
  display: grid;
  gap: 16px;
  padding-top: 4px;
}

.cond-block {
  display: grid;
  gap: 8px;
}

.cond-block h4 {
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  margin: 0;
}

/* 小見出しの左・ⓘ の右端の 1 行(発動頻度の選び方)。ⓘ は見出しの行の高さをほぼ変えない(`InfoButton`) */
.cond-head {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.song-slot {
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

.chip {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  height: 32px;
  padding: 0 6px;
  white-space: nowrap;
}

/* 最適化するもの: 対象の 3 つは 3 等分、範囲と資材の 2 つは左右半分ずつ */
.target-row {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(3, 1fr);
}

.option-subs {
  display: grid;
  gap: 6px;
  grid-template-columns: 1fr 1fr;
}

/* 最後の 1 つの ON・コネクトを使えないとき・効かないとき: 状態は保ったまま薄くする */
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

/* 排他の選択(頻度の選び方・頻度マスの数・結果のタブ): 境界線でつながったセグメント(ピッカーのセグメントと同形) */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-auto-columns: 1fr;
  grid-auto-flow: column;
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
  padding: 0 2px;
  white-space: nowrap;
}

.seg:first-child {
  border-left: none;
}

.seg:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.seg-active {
  background: var(--selected);
  color: var(--selected-ink);
  font-weight: 700;
}

.segment.objective .seg {
  font-size: 11px;
}

/* 「頻度マスの数」: ダイアログを開く設定行(ラベル左・固定の状態を右) */
.fix-button {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-size: 13px;
  font-weight: 600;
  height: 40px;
  justify-content: space-between;
  padding: 0 12px;
}

.fix-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.fix-value {
  color: var(--ink-2);
  font-size: 12px;
}

/* 現在 / 推奨のユニットスコア: 淡色の地に 2 列(伸びの % は出さない — 2026-10-02 ユーザー指示) */
.summary {
  background: var(--bg);
  border-radius: var(--r-m);
  display: grid;
  flex-shrink: 0;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
  height: 78px;
  padding: 14px 16px;
}

.score {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.score-label {
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
}

.score-value {
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  min-height: 29px;
}

/* 設定を変えて古くなった結果: 消さずに薄くして残す(「最適化を実行」で置き換わる。反映はできない) */
.stale .score-value,
.tab-body.stale {
  opacity: 0.45;
}

.stale .score-label {
  opacity: 1;
}

/* タブ: 上部の一番下(スクロールしない) */
.tabs {
  align-items: center;
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

.tabs .segment {
  flex: 1;
}

/* 条件: 結果のタブから離した別形(ピル形)のボタン。開いているときは選択の色 */
.cond-tab {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  color: var(--ink-2);
  cursor: pointer;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  height: 32px;
  padding: 0 16px;
}

.cond-tab.active {
  background: var(--selected);
  border-color: var(--selected);
  color: var(--selected-ink);
}

.tab-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 結果のタブの中の区分のタブ: 上部の一番下(スクロールしない)。タブとの間は 8px(上部の行間 16px を詰める) */
.subtabs {
  flex-shrink: 0;
  margin-top: -8px;
}

/* 表: 列見出しはこの語だけ。値の枠は同じ幅にそろえて左揃え */
.plan-table {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
}

/* 列見出しは本文のスクロールの上端に貼り付く(脚注が出てくるまで)。行が下を通るので地を持たせる */
.plan-table th {
  background: var(--surface);
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
  padding: 8px 0;
  position: sticky;
  text-align: left;
  top: 0;
  z-index: 1;
}

.plan-table td {
  border-top: 1px solid var(--line);
  padding: 8px 0;
  vertical-align: middle;
}

.col-name {
  padding-right: 8px;
}

.col-cell {
  width: 108px;
}

/* ボードの表(推奨の 1 列だけ)は「ボードを開く」ボタンの幅 */
.col-cell.wide {
  width: 130px;
}

.col-name .name {
  display: block;
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 各行の「ボードを開く」ボタン(推奨のボードの図を開く) */
.open-board {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  height: 36px;
  padding: 0 12px;
  white-space: nowrap;
  width: 100%;
}

/* どのコネクトマスか(中心 / 赤 / 青 / 黄): 名前の下に小さく淡色 */
.anchor {
  color: var(--ink-2);
  display: block;
  font-size: 12px;
  font-weight: 600;
}

.placed {
  align-items: center;
  display: flex;
  gap: 6px;
}

.placed .figure {
  flex-shrink: 0;
  width: 34px;
}

.percent {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  white-space: nowrap;
}

.none {
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 600;
}

/* 頻度の表: 現在は比較の対象なので淡色、推奨は通常の文字(見るだけ) */
.current,
.recommended {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.current {
  color: var(--ink-2);
  font-weight: 600;
}

/* 選んだ案の見込み 3 つ(表の下に等幅で横並び。結果詳細の内訳と同じ「項目名の下に数値」) */
.param-grid {
  display: grid;
  gap: 0 8px;
  grid-template-columns: repeat(3, 1fr);
  margin: 0;
}

.param-cell {
  border-bottom: 1px solid var(--line);
  padding: 6px 4px;
}

.param-cell dt {
  color: var(--ink-2);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.param-cell dd {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  margin: 2px 0 0;
}
</style>
