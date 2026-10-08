<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";

import CloseButton from "./CloseButton.vue";
import BoardSheet from "./BoardSheet.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import ConnectFigure from "./ConnectFigure.vue";
import SongPicker from "./SongPicker.vue";
import SongRow from "./SongRow.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { useOptimizePlan } from "../composables/useOptimizePlan";
import { getPlan, planCacheKey, setPlan } from "../composables/usePlanCache";
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
import type { BoardMap } from "../storage/boards";
import type { ConnectPlacementMap } from "../storage/connect";
import type { HolomenRankMap } from "../storage/holomenRank";
import type { BoardScope } from "../engine/boardOptimize";
import { planHolomenOrder, registeredBoardsOf, requestBoardMaps } from "../engine/boardPlan";
import type { ConnectItem } from "../engine/connectOptimize";
import type { FrequencyObjective } from "../engine/frequencyStage";
import type { OptimizePlanResult } from "../engine/optimizePlan";
import type { AccountBonus } from "../engine/power";
import { teamEvaluator } from "../engine/request";
import type { OptimizeRunRequest } from "../engine/request";
import { connectPlanRows } from "../ui/connectPlan";
import { holomenName } from "../ui/labels";

/**
 * 「最適化」の設定と結果のシート(結果詳細・ユニット詳細の下端の「最適化」から開く。2026-10-04 にホロメンボードの最適化として追加し、
 * 2026-10-07 にコネクトを、2026-10-08 に発動頻度を統合した)。
 *
 * **開いただけでは計算しない**(2026-10-08 ユーザー指示「最適化ボタンを押したら設定ページに飛ばすだけ。オプションを変えても即座に走らせない」)。
 * 上から 現在 / 推奨のユニットスコア → 資材の不足などの注意 → タブ(設定 / ボード / コネクト / 頻度)までを固定し、その下のタブの中身と脚注だけを
 * スクロールする(2026-10-08 ユーザー指示。オプションを畳む形は、開くと上部と本文の 2 か所がスクロールして下側が白く見切れていたのでやめた)。
 * 開いた直後は「設定」(曲 → ボードとコネクトの枠 → 頻度の枠)。結果のタブは実行するまで disabled で、結果が届くと最初の結果のタブへ移る。
 * 結果のタブは見るだけで、固定や再計算の操作は置かない。下端の固定エリアに「ボードに反映」(secondary)と「最適化を実行」(緑)。
 *
 * - 実行は `optimizePlan.ts` の `planOptimize`(Web Worker)。ボード(頻度マス OFF)→ コネクト → 頻度 の順に、選んだものだけ行う(ADR-014 / ADR-015)
 * - 頻度の固定は設定のタブで、メンバーごとに頻度マスの数(おまかせ / 0〜3)で選ぶ。実効 % ではないのは、コネクトも同じ実行で変わると
 *   実行する前には % が決まらないため。届かない数は固定しない
 * - 結果は (曲, 範囲, 対象, 頻度の選び方, 固定) ごとに覚える(閉じても結果詳細に戻るまで — `usePlanCache.ts`)。いまの設定の結果を覚えていれば
 *   そのまま出し、なければ前に実行した結果を薄くして残す(古い結果は反映できない)。何も実行していなければ現在のユニットスコアだけ出す
 * - 反映は確認を挟み、表示中の結果(ボードの解放マス・コネクトマスの解放・余りのリソース・コネクトの配置)をまとめて登録する
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
  /** コネクトを最適化できない(所持の登録もボードに置いたコネクトもない)。チップを disabled にして OFF で始める */
  connectDisabled: boolean;
  /** ボードに置いているコネクトが所持の登録に収まっていない(コネクトを選んだままでは実行できず、収まるよう登録を促す) */
  connectShortage: boolean;
  /** メモリー・メンバー強化ボーナス */
  account: AccountBonus;
  /** このシートを開いた時点の曲(メイン画面の曲か、前に選び直した曲)。指定なしは null */
  songId: string | null;
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
  songChange: [songId: string | null];
}>();

useModalChrome(() => emit("close"));

const { result, running, error, run } = useOptimizePlan();

/** リアクティブ Proxy は postMessage で複製できないので、プレーンな値に写す */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** 評価に使う曲(開いた時点の曲で始まり、ここで変えられる。ここで変えても元の画面の曲は変わらない) */
const songId = ref<string | null>(props.songId);
const song = computed(() => (songId.value ? (songById.get(songId.value) ?? null) : null));
const pickerOpen = ref(false);
watch(songId, (value) => emit("songChange", value));
/** 頻度のライブ側の評価区間(秒)。曲の演奏時間、指定なしは全曲の中央値 */
const horizonSeconds = computed(() => {
  const duration = song.value?.durationSeconds ?? null;
  return duration !== null && duration > 0 ? duration : medianSongDurationSeconds;
});

type Target = "board" | "connect" | "frequency";
/** 最適化する対象(独立した ON/OFF。少なくとも 1 つは ON)。既定は全部 ON。コネクトを最適化できないときは OFF で始める */
const useBoard = ref(true);
const useConnect = ref(!props.connectDisabled);
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

/** ボードの変えてよい範囲(既定はユニットのみ) */
const scope = ref<BoardScope>("unit");
/** 「ユニットのみ変更する」(ON = リーダーとメンバーのホロメンだけ / OFF = 全ホロメン)。ボードとコネクトにかかり、どちらも選んでいないときは効かない */
const unitOnly = computed({
  get: () => scope.value === "unit",
  set: (value: boolean) => {
    scope.value = value ? "unit" : "all";
  },
});

/**
 * 頻度の選び方(排他なのでセグメント。既定は理論値重視)。
 * 期待値重視 / 理論値重視はライブ側のアクティブスキルの試算、ユニットスコア重視は表示ユニットスコアで選ぶ(モデルを混ぜない)
 */
const OBJECTIVES: { key: FrequencyObjective; label: string }[] = [
  { key: "expected", label: "期待値重視" },
  { key: "perfect", label: "理論値重視" },
  { key: "unit", label: "ユニットスコア重視" },
];
const objective = ref<FrequencyObjective>("perfect");

/** メンバー(ホロメン。重複なし。頻度は青ボードなのでメンバーだけ)と、メンバーごとに固定する頻度マスの数(ない = おまかせ) */
const memberIds = computed(() =>
  props.candidate.memberIds
    .map((id) => cardById.get(id)?.holomenId ?? "")
    .filter((id, i, all) => id !== "" && all.indexOf(id) === i),
);
const fixedNodes = ref<Record<string, number>>({});
/** 固定の選択肢(おまかせ = null / 頻度マスの数) */
const FIX_CHOICES: { value: number | null; label: string }[] = [
  { value: null, label: "おまかせ" },
  { value: 0, label: "0マス" },
  { value: 1, label: "1マス" },
  { value: 2, label: "2マス" },
  { value: 3, label: "3マス" },
];
function setFixed(holomenId: string, value: number | null): void {
  const next = { ...fixedNodes.value };
  if (value === null) delete next[holomenId];
  else next[holomenId] = value;
  fixedNodes.value = next;
}

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
const scopeOf = (): BoardScope => (scopeUsed.value ? scope.value : "unit");
const frequencyKeyOf = (): string =>
  useFrequency.value ? `${objective.value}/${JSON.stringify(fixedNodes.value)}` : "";
const keyOf = (): string => `${songId.value ?? ""}|${scopeOf()}|${targetOf()}|${frequencyKeyOf()}`;
/** 閉じて開き直しても残るキャッシュのキー(結果詳細に戻るまで再計算しない — usePlanCache.ts) */
const cacheKeyOf = (): string =>
  planCacheKey(
    "optimize",
    { leaderId: props.candidate.leaderId, memberIds: props.candidate.memberIds },
    props.blooms,
    songId.value,
    // 資材の登録・対象・範囲・頻度の選び方と固定が違えば結果も違うので、キーに含める(古い結果を返さない)
    [scopeOf(), targetOf(), frequencyKeyOf(), plain(props.resources)],
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
watch([scope, songId, useBoard, useConnect, useFrequency, objective, fixedNodes], showRemembered);
onMounted(showRemembered);

/** コネクトを選んだまま、ボードに置いているコネクトが所持に収まっていないとき: 実行せず登録を促す(2026-10-02 ユーザー指示の文言) */
const SHORTAGE_MESSAGE =
  "所持しているコネクトにないものがボードに置かれています。所持コネクトを正しく登録してください。";
const blockedMessage = computed(() =>
  useConnect.value && props.connectShortage ? SHORTAGE_MESSAGE : null,
);

/** 表示している結果がいまの設定のものか(違えば薄くして、反映できない) */
const fresh = computed(() => shownKey.value !== null && shownKey.value === keyOf());
const entry = computed(() => (shownKey.value === null ? null : (entries[shownKey.value] ?? null)));
const shown = computed(() => entry.value?.result ?? null);
/** 「最適化を実行」を押せるか: 計算中・コネクトの登録が足りない・いまの設定の結果がすでにある、のどれでもないとき */
const canRun = computed(() => !running.value && blockedMessage.value === null && !fresh.value);

function execute(): void {
  if (!canRun.value) return;
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
 * 実行する前の「現在」(いまの設定の基準。頻度を選んでいれば登録そのまま、選んでいなければ頻度マスを外した登録 — 結果の「現在」と同じ規則)。
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
    teamEvaluator(
      { ...request, ...requestBoardMaps(registered, !useFrequency.value) },
      team,
    )(props.placements)?.modifiers.adjustedUnitScore ?? 0
  );
});
const currentScore = computed(() => (shown.value ? shown.value.current : liveCurrent.value));

/**
 * タブ(設定 + 結果の 3 つ)。結果のタブは実行するまで disabled、実行したあとは表示中の結果で対象にしなかったものが disabled。
 * 開いた直後は設定(いまの設定の結果を覚えていれば、最初の結果のタブ)
 */
type Tab = "settings" | Target;
const TABS: { key: Tab; label: string }[] = [
  { key: "settings", label: "設定" },
  { key: "board", label: "ボード" },
  { key: "connect", label: "コネクト" },
  { key: "frequency", label: "頻度" },
];
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
/** 本文のスクロール位置はタブごとに別々に覚える(切り替えて同じ位置から始まらない) */
const bodyEl = ref<HTMLElement | null>(null);
useTabScroll(bodyEl, () => activeTab.value);

/** 表の並びの基準(リーダー → メンバー(結果のメンバーの順)→ それ以外は五十音順) */
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
        // 頻度マスに 1 つも届かない(Pt が足りず、空けることもできない)
        unreachable: Math.max(...row.reachableNodeCounts) === 0,
      }))
    : [],
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
/** 推奨を反映すると不足する資材(余りが負になる項目)。例「青のキューブが 74 不足します」 */
const deficits = computed(() => {
  const r = shown.value?.remainingAfter;
  if (!r || !entry.value || !(entry.value.board || entry.value.frequency)) return [];
  const out: string[] = [];
  for (const color of BOARD_MATERIAL_COLORS)
    for (const kind of BOARD_RESOURCE_KINDS) {
      const left = r[color][kind];
      if (left !== null && left < 0)
        out.push(
          `${COLOR_LABELS[color] ?? color}の${BOARD_RESOURCE_LABELS[kind]}が ${number(-left)}`,
        );
    }
  return out;
});

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

/** 反映の確認(開いている間は null 以外)。確認した時点の推奨を渡す — 開いたあとに設定を変えても別の結果を登録しない */
const applying = ref<{
  boards: Record<string, HolomenBoards>;
  remaining: BoardResources;
  placements: ConnectPlacementMap | null;
  withBoards: boolean;
  withConnect: boolean;
  frequencyOff: boolean;
  deficit: boolean;
} | null>(null);
function askApply(): void {
  const e = entry.value;
  if (!canApply.value || e === null) return;
  const withBoards = e.board || e.frequency;
  applying.value = {
    // ボードも頻度も選ばなかったときは、ボードの変更を含めない(コネクトだけを反映する)
    boards: withBoards ? plain(e.result.boards) : {},
    remaining: withBoards ? plain(e.result.remainingAfter) : plain(props.resources),
    placements: e.connect ? plain(e.result.placements) : null,
    withBoards,
    withConnect: e.connect,
    frequencyOff: e.board && !e.frequency,
    deficit: deficits.value.length > 0,
  };
}
/** 確認ダイアログの文言(反映する内容に合わせる) */
const confirmMessage = computed(() => {
  const a = applying.value;
  if (a === null) return "";
  if (a.withBoards && a.withConnect) return "推奨のホロメンボードとコネクトの配置を反映しますか？";
  if (a.withBoards) return "推奨のホロメンボードを反映しますか？（コネクトの配置は変わりません）";
  return "推奨のコネクトの配置を反映しますか？";
});
/**
 * 反映の確認に添える一言: 頻度を選ばずにボードを反映すると登録している頻度マスは外れる(2026-10-07 ユーザー指示)/
 * 資材が足りない推奨は、不足を余りのマイナスとして登録する(2026-10-08 ユーザー指示)
 */
const FREQUENCY_NOTE = "発動頻度マスはすべて外れます。";
const DEFICIT_NOTE = "足りないリソースはマイナスで登録されます。";
const confirmNote = computed(() => {
  const a = applying.value;
  if (a === null) return undefined;
  const notes = [a.frequencyOff ? FREQUENCY_NOTE : "", a.deficit ? DEFICIT_NOTE : ""].filter(
    Boolean,
  );
  return notes.length > 0 ? notes.join("") : undefined;
});
function onApply(): void {
  const next = applying.value;
  applying.value = null;
  if (next !== null)
    emit("apply", { boards: next.boards, remaining: next.remaining, placements: next.placements });
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="最適化">
      <header class="sheet-head">
        <h3>最適化</h3>
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

        <!-- 注意(コネクトの登録が足りない / 実行に失敗した / 反映すると資材が足りなくなる)。タブより上に出す -->
        <p v-if="blockedMessage !== null" class="message">{{ blockedMessage }}</p>
        <p v-else-if="error !== null" class="message">{{ error }}</p>
        <p v-if="deficits.length > 0" class="warning" :class="{ stale: !fresh }">
          {{ deficits.join("、") }} 不足します。
        </p>

        <!-- タブ(排他なのでセグメント。上部の一番下)。結果のタブは実行するまで、また対象にしなかったものは disabled -->
        <div class="tabs">
          <div class="segment" role="tablist" aria-label="設定と結果">
            <button
              v-for="t in TABS"
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
        </div>
      </div>

      <!-- スクロールするのはタブの中身と脚注だけ。脚注の区切り線が下端の固定エリアにちょうど来る高さを最低限確保する -->
      <div ref="bodyEl" class="body">
        <div class="sheet-main">
          <!--
            設定: 曲 → ボードとコネクトの枠 → 頻度の枠。枠はさがすのオプションの `.option-group` と同形(上の行に 1 つ、下の行に左右半分ずつ / ぶら下がり)。
            主が OFF のあいだ、ぶら下がりは白 + disabled(効いていないものを効いているように見せない)。最適化する対象の 3 つは最後の 1 つを外せない
          -->
          <div
            v-if="activeTab === 'settings'"
            id="optimize-settings"
            class="settings"
            role="group"
            aria-label="設定"
          >
            <!-- 評価に使う曲(部品はメイン画面の Step 3 と同じ。選択中は右上に解除ボタン) -->
            <section class="song-block">
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
            <!--
              ボードとコネクト: 上の行 = 「ユニットのみ変更する」(1 行まるごと。OFF で全ホロメン。ボードとコネクトの両方にかかり、どちらも選んでいないときは disabled)、
              下の行 = 左「ボードを最適化する」・右「コネクトを最適化する」(2026-10-08 ユーザー指示)
            -->
            <div class="option-group" role="group" aria-label="ボードとコネクト">
              <button
                type="button"
                class="chip scope"
                role="checkbox"
                :aria-checked="scopeUsed && unitOnly"
                :class="{ active: scopeUsed && unitOnly }"
                :disabled="!scopeUsed"
                @click="unitOnly = !unitOnly"
              >
                ユニットのみ変更する
              </button>
              <div class="option-subs">
                <button
                  type="button"
                  class="chip"
                  role="checkbox"
                  :aria-checked="useBoard"
                  :class="{ active: useBoard }"
                  :disabled="lastOnly('board')"
                  @click="toggleTarget('board')"
                >
                  ボードを最適化する
                </button>
                <button
                  type="button"
                  class="chip"
                  role="checkbox"
                  :aria-checked="useConnect"
                  :class="{ active: useConnect }"
                  :disabled="props.connectDisabled || lastOnly('connect')"
                  @click="toggleTarget('connect')"
                >
                  コネクトを最適化する
                </button>
              </div>
            </div>
            <!-- 頻度: 主 = 頻度を最適化する / ぶら下がり = 選び方の 3 択 と、メンバーごとの頻度マスの数の固定(おまかせ / 0〜3) -->
            <div class="option-group" role="group" aria-label="頻度">
              <button
                type="button"
                class="chip"
                role="checkbox"
                :aria-checked="useFrequency"
                :class="{ active: useFrequency }"
                :disabled="lastOnly('frequency')"
                @click="toggleTarget('frequency')"
              >
                頻度を最適化する
              </button>
              <div class="segment objective" role="radiogroup" aria-label="頻度の選び方">
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
              <p class="sub-label">頻度マスの数</p>
              <div v-for="id in memberIds" :key="id" class="fix-row">
                <span class="fix-name">{{ holomenName(id) }}</span>
                <div
                  class="segment fix"
                  role="radiogroup"
                  :aria-label="`${holomenName(id)}の頻度マスの数`"
                >
                  <button
                    v-for="c in FIX_CHOICES"
                    :key="String(c.value)"
                    type="button"
                    class="seg"
                    role="radio"
                    :aria-checked="useFrequency && (fixedNodes[id] ?? null) === c.value"
                    :class="{
                      'seg-active': useFrequency && (fixedNodes[id] ?? null) === c.value,
                    }"
                    :disabled="!useFrequency"
                    @click="setFixed(id, c.value)"
                  >
                    {{ c.label }}
                  </button>
                </div>
              </div>
            </div>
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
                    <tr v-for="id in shown.changed" :key="id">
                      <td class="col-name">
                        <span class="name">{{ holomenName(id) }}</span>
                      </td>
                      <td class="col-cell wide">
                        <button type="button" class="open-board" @click="previewId = id">
                          ボードを開く
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p v-if="infeasibleNames" class="warning">
                  {{
                    infeasibleNames
                  }}は、このランクでは現在のコネクト配置を維持できないため、変更していません。
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
                  <tr v-for="row in connectRows" :key="`${row.holomenId}/${row.anchor}`">
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
                    <tr v-for="row in frequencyRows" :key="row.holomenId">
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
              >この編成のまま、ユニットスコアが高くなるように選んだ値です。ボードはホロメンごとのボードPt（ホロメンランクまでに獲得した累積Pt。未登録は制限なし）とキューブ・コアキューブの範囲で、発動頻度マスを外して解放マスを選びます。コネクトは持っているコネクトの範囲で配置を選び、頻度はその盤面から発動頻度マスを選びます。いま登録しているボード・コネクト・開花・メモリー・メンバー強化ボーナスと、設定の曲（開いた直後はさがしたときの曲）で計算します。現在の値は、頻度を最適化するときはいまの登録そのまま、しないときはいまの登録から発動頻度マスを外した値です。配置のあるコネクトマスは必ず解放済みにします（1
              Pt を予算に含みます）。ボードPt・資材は外部マスタ由来の値で、実機未確認です。</span
            >
          </p>
          <p v-if="activeTab === 'board'">
            <span class="fn-num">※{{ noteNo.tab }}</span>
            <span
              >「ユニットのみ変更する」が ON
              のときは、リーダーとメンバーのホロメンのボードだけを変えます（それ以外は登録のまま）。OFF
              のときは全ホロメンのボードを変えます。頻度だけを最適化したときは、発動頻度マスとそこまでの経路を開ける変更（ボードPt
              が足りないときに外すマスを含みます）です。選び方は近似で、最大になることを保証するものではありません。反映すると、解放マスとコネクトマスの解放が置き換わります。頻度を最適化しないときは、発動頻度マスはすべて外れます。</span
            >
          </p>
          <p v-if="activeTab === 'connect'">
            <span class="fn-num">※{{ noteNo.tab }}</span>
            <span
              >「ユニットのみ変更する」が ON
              のときは、リーダーとメンバーの置き方だけを変えます（ユニット外が使っているコネクトが必要なときは、その外す変更を含みます）。OFF
              のときは全ホロメンの置き方を変えます。置き方は近似で、最大になることを保証するものではありません。</span
            >
          </p>
          <template v-if="activeTab === 'frequency'">
            <p>
              <span class="fn-num">※{{ noteNo.tab }}</span>
              <span
                >「現在」はいま登録しているボードでの発動頻度、「推奨」は最適化したボードでの値です。発動頻度マスまでの経路は、最適化したボードから追加のボードPt
                が最も少ないものを開けます。ボードPt
                が足りないときは、ユニットスコアへの影響が小さいマスから外して空けます（空けられない数は選びません。設定で固定した数も、届かなければ固定しません）。キューブ・コアキューブは足りなくても選びます。「期待値重視」「理論値重視」はライブ中のアクティブスキルの試算が最大になる組み合わせを選び、ユニットスコアは見ないので、ボードPt
                を空けるために外したマスのぶんユニットスコアが下がることがあります。「ユニットスコア重視」はユニットスコアが高くなる組み合わせを選びます（近似）。</span
              >
            </p>
            <p>
              <span class="fn-num">※{{ noteNo.score }}</span>
              <span
                >評価区間（設定の曲の演奏時間。曲を指定しないときは全曲の演奏時間の中央値
                {{ medianSongDurationSeconds }}
                秒）のあいだのアクティブスキルのスコア UP
                の時間平均（%）の試算値です。「理論値重視」は発動抽選がすべて成功した前提、ほかは各スキルの発動確率を考慮した期待値で出します。実際のライブスコアではありません
                —
                譜面のノーツ・コンボ・判定・スペシャルスキルの発動位置・スコアサポートは含みません。発動頻度
                +f% は 周期 ÷（1 + f/100）、発動率 +r% は 発動確率 ×（1 + r/100、上限
                1）として反映する仮説モデルで、ユニットスコアの試算とは別の計算です。リーダー枠のアクティブは発動しないものとして扱います。</span
              >
            </p>
            <p>
              <span class="fn-num">※{{ noteNo.coverage }}</span>
              <span
                >期待カバレッジは、評価区間のうち「少なくとも 1
                つのアクティブスキルが発動している時間」の割合（期待値）です。スコア UP
                の大きさは見ないので、スキルが途切れにくいかの目安です。</span
              >
            </p>
            <p>
              <span class="fn-num">※{{ noteNo.gap }}</span>
              <span
                >最大空白は、どのアクティブスキルも発動候補になっていない時間のうち最も長いものです（発動確率は見ません）。</span
              >
            </p>
          </template>
        </div>
      </div>

      <!-- 下端の固定エリア(結果詳細と同じ地・罫線)。左 = ボードに反映(secondary)、右 = 最適化を実行(実行専用の緑。計算中はボタンの中のリングだけ) -->
      <div class="sheet-foot">
        <button type="button" class="foot-secondary" :disabled="!canApply" @click="askApply">
          ボードに反映
        </button>
        <button
          type="button"
          class="foot-primary"
          :class="{ busy: running }"
          :disabled="!canRun"
          :aria-busy="running"
          :aria-label="running ? '計算中' : undefined"
          @click="execute"
        >
          <span class="label">最適化を実行</span>
          <span v-if="running" class="spinner" aria-hidden="true"></span>
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

    <!-- シートの上に重ねる。このオーバーレイ(z-index: 12)の子として出すので、ダイアログ自身の z-index が上に載る -->
    <ConfirmDialog
      v-if="applying !== null"
      :message="confirmMessage"
      :note="confirmNote"
      confirm-label="反映する"
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

/* 計算中はラベルを隠して(幅と高さは保つ)白い細線のリングを同じ場所に重ねる(メイン画面の「ベスト編成をさがす」と同じ) */
.foot-primary > * {
  grid-area: 1 / 1;
}

.foot-primary.busy .label {
  visibility: hidden;
}

.foot-primary.busy:disabled {
  opacity: 1;
}

.spinner {
  animation: spin 0.8s linear infinite;
  border: 2.5px solid rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  border-top-color: #fff;
  height: 22px;
  width: 22px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 2.4s;
  }
}

.fn {
  font-size: 10px;
  font-weight: 600;
  line-height: 0;
  margin-left: 1px;
}

/* 設定のタブ: 上から 曲 / ボードとコネクトの枠 / 頻度の枠 を 1 列に積む(「曲」の見出しはタブから少し離す) */
.settings {
  display: grid;
  gap: 8px;
  padding-top: 4px;
}

.song-block h4 {
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  margin: 0 0 6px;
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

/*
 * まとまりのある設定(主のチップ + ぶら下がり)は 1 つの枠で囲んで地を一段落とす(さがすのオプションの `.option-group` と同形。
 * 枠の中に区切り線は引かない — 2026-09-30 ユーザー指示)
 */
.option-group {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  gap: 6px;
  padding: 6px;
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

/* 枠の下の行: 左右半分ずつ(さがすのオプションの `.option-subs` と同形) */
.option-subs {
  display: grid;
  gap: 6px;
  grid-template-columns: 1fr 1fr;
}

/* 最後の 1 つの ON・コネクトを使えないとき・主が OFF のぶら下がり: 状態は保ったまま薄くする */
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

.segment.objective .seg,
.segment.fix .seg {
  font-size: 11px;
}

/* 「頻度マスの数」: 下の行がメンバーごとの固定であることを示す小さな見出し(枠の中の区分名) */
.sub-label {
  color: var(--ink-2);
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  margin: 4px 2px 0;
}

/* メンバーごとの固定の行: 左に名前(1 行・省略)、右に おまかせ / 0〜3 マス のセグメント */
.fix-row {
  align-items: center;
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) 216px;
}

.fix-name {
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  padding-left: 2px;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.tab-body.stale,
.warning.stale {
  opacity: 0.45;
}

.stale .score-label {
  opacity: 1;
}

.message {
  background: var(--bg);
  border-radius: var(--r-s);
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  padding: 14px;
}

/* 注意(反映すると資材が足りない / ランクの予算で変えられなかった) */
.warning {
  color: var(--error);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  margin: 0;
}

/* タブ: 上部の一番下(スクロールしない) */
.tabs {
  flex-shrink: 0;
}

.tab-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
