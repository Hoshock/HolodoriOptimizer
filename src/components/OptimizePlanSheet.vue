<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";

import CloseButton from "./CloseButton.vue";
import BoardSheet from "./BoardSheet.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import ConnectFigure from "./ConnectFigure.vue";
import FrequencyFixDialog from "./FrequencyFixDialog.vue";
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
import type { ConnectItem } from "../engine/connectOptimize";
import type { FrequencyObjective } from "../engine/frequencyStage";
import type { OptimizePlanResult } from "../engine/optimizePlan";
import type { AccountBonus } from "../engine/power";
import type { OptimizeRunRequest } from "../engine/request";
import { connectPlanRows } from "../ui/connectPlan";
import { holomenName } from "../ui/labels";

/**
 * 「最適化」(結果詳細・ユニット詳細の下端の 1 つのボタン。2026-10-04 にホロメンボードの最適化として追加し、2026-10-07 にコネクトを、
 * 2026-10-08 に発動頻度を統合した — ユーザー指示「最適化を一つのボタンにまとめ、頻度の最適化を選択制に」)。
 * **この編成のまま**、選んだものを **ボード → コネクト → 頻度** の順に最適化する(`optimizePlan.ts` の `planOptimize`):
 * - ボード: ホロメンごとのボードPt の予算(ホロメンランク。未登録は制限なし)と共有の資材の範囲で、**表示ユニットスコア**が高くなる解放マスを選ぶ
 *   (`boardOptimize.ts`。青の発動頻度マスは OFF にして選ぶ — ADR-014)
 * - コネクト: 持っているコネクト(アカウントの「コネクト」)の範囲で、解放済みのコネクトマスの配置を変える(範囲は常にユニットのみ)
 * - 頻度: その盤面から、メンバーごとに頻度マスを選ぶ(`frequencyStage.ts`。ランクの Pt が足りなければ優先度の低いマスを外して空け、
 *   資材は不足してよい — 不足は反映すると余りのリソースが負になる。選び方は 期待値重視 / 理論値重視(既定)/ ユニットスコア重視。
 *   推奨の頻度を押すと固定でき、「一部固定で最適化」で固定した頻度のまま全体を計算し直す — ADR-015)
 * 基準は**いま登録している状態**(ボード 4 色・コネクトの解放と配置・ホロメンランク・開花・アカウント補正)と、シートの曲。
 * 上から 曲 → オプション(既定で畳む。さがすのオプションと同じ開閉行。「ボードを最適化する」「コネクトを最適化する」「頻度を最適化する」
 * 「ユニットのみ変更する」のチップと、頻度を選んだときだけ選び方のセグメント)→ 現在 / 推奨のユニットスコア → 本文(資材の不足 →
 * ボード / コネクト / 頻度 の表)→ 脚注。下端の固定エリアに緑の「ホロメンボードに反映」(確認を挟み、解放マスとコネクトマスの解放・
 * 余りのリソース・コネクトの配置をまとめて置き換える)。計算は Web Worker(`optimizeWorker.ts`)で、(曲, 範囲, 対象, 選び方, 固定)ごとに
 * 1 回(結果は覚えておく)
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
  /** ボードに置いているコネクトが所持の登録に収まっていない(コネクトを選んだままでは最適化せず、収まるよう登録を促す) */
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

const { result, error, run } = useOptimizePlan();

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

/**
 * 頻度の選び方(排他なのでセグメント。既定は理論値重視 — 頻度の最適化の既定を引き継ぐ)。
 * 期待値重視 / 理論値重視はライブ側のアクティブスキルの試算、ユニットスコア重視は表示ユニットスコアで選ぶ(モデルを混ぜない)
 */
const OBJECTIVES: { key: FrequencyObjective; label: string }[] = [
  { key: "expected", label: "期待値重視" },
  { key: "perfect", label: "理論値重視" },
  { key: "unit", label: "ユニットスコア重視" },
];
const objective = ref<FrequencyObjective>("perfect");

/**
 * メンバーごとに固定した発動頻度(実効 %。ホロメン ID → 値)。表で選ぶだけでは計算し直さない — 「一部固定で最適化」を押して初めて
 * 計算に使う(applied。頻度の最適化の固定再探索をそのまま引き継いだ — 2026-09-30 / 2026-10-08 ユーザー指示)。「推奨頻度をリセット」は両方を空に戻す
 */
const draftFixed = ref<Record<string, number>>({});
const appliedFixed = ref<Record<string, number>>({});
const fixingHolomenId = ref<string | null>(null);
const sameFixed = (a: Record<string, number>, b: Record<string, number>): boolean => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};
const canRefix = computed(() => !sameFixed(draftFixed.value, appliedFixed.value));
const canReset = computed(
  () => Object.keys(draftFixed.value).length > 0 || Object.keys(appliedFixed.value).length > 0,
);
function optimizeWithFixed(): void {
  appliedFixed.value = { ...draftFixed.value };
}
function resetFixed(): void {
  draftFixed.value = {};
  appliedFixed.value = {};
}
function pickFixed(value: number | null): void {
  const id = fixingHolomenId.value;
  if (id === null) return;
  const next = { ...draftFixed.value };
  if (value === null) delete next[id];
  else next[id] = value;
  draftFixed.value = next;
  fixingHolomenId.value = null;
}

/** ボードの変えてよい範囲(既定はユニットのみ) */
const scope = ref<BoardScope>("unit");
/** 本文のスクロール位置は範囲ごとに別々に覚える(切り替えて同じ位置から始まらない) */
const bodyEl = ref<HTMLElement | null>(null);
useTabScroll(bodyEl, () => scope.value);
/** 「ユニットのみ変更する」(ON = リーダーとメンバーのホロメンだけ / OFF = 全ホロメン)。ボードを選んでいないときは範囲が効かない */
const unitOnly = computed({
  get: () => scope.value === "unit",
  set: (value: boolean) => {
    scope.value = value ? "unit" : "all";
  },
});
/** オプション(最適化する対象・変える範囲・頻度の選び方)の開閉。既定で畳む(さがすのオプションと同じ — 2026-10-07 ユーザー指示)。開閉は保存しない */
const optionsOpen = ref(false);
/** (曲, 範囲, 対象, 選び方, 固定)ごとの結果(一度計算したら覚えておく) */
const results = reactive<Record<string, OptimizePlanResult>>({});
let requested: string | null = null;
let requestedCache: string | null = null;
/** 対象の組合せ(ボード / コネクト / 頻度)。結果のキーと保存のキーに入れる */
const targetOf = (): string =>
  `${useBoard.value ? "b" : ""}${useConnect.value ? "c" : ""}${useFrequency.value ? "f" : ""}`;
/** ボードを選ばないときは範囲が効かないので、キーにも入れない(同じ結果を範囲違いで計算し直さない)。頻度の選び方・固定も同じ */
const scopeOf = (): BoardScope => (useBoard.value ? scope.value : "unit");
const frequencyKeyOf = (): string =>
  useFrequency.value ? `${objective.value}/${JSON.stringify(appliedFixed.value)}` : "";
const keyOf = (): string => `${songId.value ?? ""}/${scopeOf()}/${targetOf()}/${frequencyKeyOf()}`;
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

/** コネクトを選んだまま、ボードに置いているコネクトが所持に収まっていないとき: 最適化せず登録を促す(2026-10-02 ユーザー指示の文言) */
const SHORTAGE_MESSAGE =
  "所持しているコネクトにないものがボードに置かれています。所持コネクトを正しく登録してください。";
const blockedMessage = computed(() =>
  useConnect.value && props.connectShortage ? SHORTAGE_MESSAGE : null,
);

function start(): void {
  if (blockedMessage.value !== null) return;
  const key = keyOf();
  if (results[key]) return;
  const cached = getPlan<OptimizePlanResult>(cacheKeyOf());
  if (cached) {
    results[key] = cached;
    return;
  }
  requested = key;
  requestedCache = cacheKeyOf();
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
    fixedFrequencies: plain(appliedFixed.value),
    horizonSeconds: horizonSeconds.value,
    items: plain(props.items),
  });
}
watch(result, (value) => {
  if (value === null || requested === null) return;
  results[requested] = plain(value) as OptimizePlanResult;
  if (requestedCache !== null) setPlan(requestedCache, results[requested]);
});
watch([scope, songId, useBoard, useConnect, useFrequency, objective, appliedFixed], () => {
  start();
});
onMounted(() => {
  start();
});

/** いま選んでいる組合せの結果(まだなら null) */
const shown = computed(() => (blockedMessage.value !== null ? null : (results[keyOf()] ?? null)));

const number = (value: number): string => value.toLocaleString("ja-JP");

/** 表の並びの基準(リーダー → メンバー(結果のメンバーの順)→ それ以外は五十音順) */
const unit = computed(() => ({
  leaderHolomenId: cardById.get(props.candidate.leaderId)?.holomenId ?? "",
  memberHolomenIds: props.candidate.memberIds.map((id) => cardById.get(id)?.holomenId ?? ""),
}));
/** コネクトの表の行(違う置き場所だけ) */
const connectRows = computed(() =>
  shown.value === null || !useConnect.value
    ? []
    : connectPlanRows(props.placements, shown.value.placements, unit.value),
);
/** ボード(頻度マスも含む)に変更があるか。ボードの表は頻度だけを選んだときも出す(頻度マスとその経路を開けるのはボードの変更) */
const hasBoardChange = computed(
  () =>
    (useBoard.value || useFrequency.value) &&
    shown.value !== null &&
    shown.value.changed.length > 0,
);
/** 変更があるか(スコアが同じでも、予算の超過や頻度マスを外すなど変更があれば反映できる) */
const hasChange = computed(() => hasBoardChange.value || connectRows.value.length > 0);
/** 頻度の表(頻度を選んだときだけ) */
const frequencyRows = computed(() =>
  useFrequency.value && shown.value?.frequency
    ? shown.value.frequency.rows.map((row) => ({
        ...row,
        name: holomenName(row.holomenId),
        fixed: draftFixed.value[row.holomenId] !== undefined,
        shownPercent: draftFixed.value[row.holomenId] ?? row.recommendedPercent,
        // 頻度マスに 1 つも届かない(Pt が足りず、空けられもしない)
        unreachable: row.choices.length <= 1,
      }))
    : [],
);
const fixingRow = computed(
  () => frequencyRows.value.find((r) => r.holomenId === fixingHolomenId.value) ?? null,
);
const percent = (value: number): string => `${value.toFixed(2)}%`;
const ratio = (value: number): string => `${(value * 100).toFixed(2)}%`;
const seconds = (value: number): string => `${value.toFixed(1)} 秒`;
/** 頻度の見込み(選んだ案のライブ側の指標)。スコアUP は理論値重視なら理論値、ほかは期待値 */
const frequencyMetrics = computed(() => {
  const m = useFrequency.value ? shown.value?.frequency?.metrics : undefined;
  if (!m) return null;
  return {
    score: percent(
      objective.value === "perfect"
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
  if (!r || !(useBoard.value || useFrequency.value)) return [];
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

/** 脚注の番号(上から出てくる順。※1 は現在 / 推奨の欄。選んだ対象の表の順に続く) */
const noteNo = computed(() => {
  let n = 1;
  const next = (on: boolean): number => (on ? (n += 1) : 0);
  const board = next(useBoard.value || useFrequency.value);
  const connect = next(useConnect.value);
  const frequency = next(useFrequency.value);
  const score = next(useFrequency.value);
  const coverage = next(useFrequency.value);
  const gap = next(useFrequency.value);
  return { board, connect, frequency, score, coverage, gap };
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
  (shown.value?.infeasible ?? []).map((id) => holomenName(id)).join("・"),
);

/** 反映の確認(開いている間は null 以外)。確認した時点の推奨を渡す — 開いたあとに範囲・対象を切り替えても別の結果を登録しない */
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
  if (!hasChange.value || shown.value === null) return;
  const withBoards = useBoard.value || useFrequency.value;
  applying.value = {
    // ボードも頻度も選ばなかったときは、ボードの変更を含めない(コネクトだけを反映する)
    boards: withBoards ? plain(shown.value.boards) : {},
    remaining: withBoards ? plain(shown.value.remainingAfter) : plain(props.resources),
    placements: useConnect.value ? plain(shown.value.placements) : null,
    withBoards,
    withConnect: useConnect.value,
    frequencyOff: useBoard.value && !useFrequency.value,
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
    <div
      class="sheet"
      :class="{ 'options-open': optionsOpen, 'frequency-on': useFrequency }"
      role="dialog"
      aria-modal="true"
      aria-label="最適化"
    >
      <header class="sheet-head">
        <h3>最適化</h3>
        <CloseButton @close="emit('close')" />
      </header>

      <!-- スクロールしない上部(ユニットスコアの欄まで): 評価に使う曲と、変えてよい範囲(左右半分ずつ。既定はユニットのみ — 選択スタイルはほかの
           セグメントと同じ)と、現在 / 推奨のユニットスコア。計算中も同じ高さの枠を残す(2026-10-02 ユーザー指示「ユニットスコアのところまでは固定。表からスクロール」) -->
      <div class="fixed-top">
        <!-- 評価に使う曲(いちばん上。部品はメイン画面の Step 3・発動頻度の最適化と同じ。選択中は右上に解除ボタン — 2026-10-03 ユーザー指示) -->
        <section class="block">
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
        <!-- オプション(既定で畳む。さがすのオプションと同じ開閉行 + ピル形のチップ — 2026-10-07 ユーザー指示)。
             最適化する対象(ボード / コネクト / 頻度)は独立した ON/OFF で、最後の 1 つは外せない。「ユニットのみ変更する」は OFF にすると全ホロメンを変える。
             頻度を選んだときだけ、その下に選び方の 3 択(排他なのでセグメント。頻度の最適化から引き継いだ並びと既定 — 2026-10-08) -->
        <div class="options">
          <button
            type="button"
            class="options-toggle"
            :aria-expanded="optionsOpen"
            aria-controls="optimize-options"
            @click="optionsOpen = !optionsOpen"
          >
            <span>オプション</span>
            <span aria-hidden="true">{{ optionsOpen ? "▲" : "▼" }}</span>
          </button>
          <div
            v-if="optionsOpen"
            id="optimize-options"
            class="option-chips"
            role="group"
            aria-label="オプション"
          >
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
            <button
              type="button"
              class="chip scope"
              role="checkbox"
              :aria-checked="unitOnly"
              :class="{ active: unitOnly }"
              :disabled="!useBoard"
              @click="unitOnly = !unitOnly"
            >
              ユニットのみ変更する
            </button>
            <div
              v-if="useFrequency"
              class="segment"
              role="radiogroup"
              aria-label="頻度の選び方（1つ選択）"
            >
              <button
                v-for="o in OBJECTIVES"
                :key="o.key"
                type="button"
                class="seg"
                role="radio"
                :aria-checked="objective === o.key"
                :class="{ 'seg-active': objective === o.key }"
                @click="objective = o.key"
              >
                {{ o.label }}
              </button>
            </div>
          </div>
        </div>
        <div class="summary" :class="{ 'summary-pending': shown === null }">
          <div class="score">
            <span class="score-label">現在</span>
            <span class="score-value">{{ shown === null ? "" : number(shown.current) }}</span>
          </div>
          <div class="score">
            <span class="score-label">推奨<sup class="fn">※1</sup></span>
            <span class="score-value">{{ shown === null ? "" : number(shown.recommended) }}</span>
          </div>
        </div>
      </div>

      <div ref="bodyEl" class="body">
        <!-- 脚注より上の本文(表)。脚注の区切り線が下端の固定エリアにちょうど来る高さを最低限確保する(初期表示では脚注を出さない) -->
        <div class="sheet-main">
          <p v-if="blockedMessage !== null" class="message">{{ blockedMessage }}</p>
          <div
            v-else-if="shown === null && error === null"
            class="working"
            role="status"
            aria-label="計算中"
          >
            <span class="spinner" aria-hidden="true"></span>
          </div>
          <p v-else-if="shown === null" class="message">{{ error }}</p>
          <template v-else>
            <!-- 反映すると足りなくなる資材(頻度マスを開ける資材は不足してよい — 2026-10-08 ユーザー指示。反映すると余りがマイナスになる) -->
            <p v-if="deficits.length > 0" class="warning lead">
              {{ deficits.join("、") }} 不足します。
            </p>
            <!-- ボード: 推奨だけの 1 列(現在 / Pt / 増減の数字は出さない — 2026-10-04 ユーザー指示)。各行の推奨の欄に「ボードを開く」ボタンを置く -->
            <section v-if="hasBoardChange" class="part">
              <h4>ボード</h4>
              <table class="plan-table">
                <thead>
                  <tr>
                    <th class="col-name">ホロメン</th>
                    <th class="col-cell wide">
                      推奨<sup class="fn">※{{ noteNo.board }}</sup>
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
            </section>
            <!-- コネクト: 違う置き場所だけ。推奨が現在と同じとき(いまの置き方が最良)は表を出さず、文言も置かない(現在と推奨のユニットスコアが同じなら分かる) -->
            <section v-if="connectRows.length > 0" class="part">
              <h4>コネクト</h4>
              <table class="plan-table">
                <thead>
                  <tr>
                    <th class="col-name">ホロメン</th>
                    <th class="col-cell">現在</th>
                    <th class="col-cell">
                      推奨<sup class="fn">※{{ noteNo.connect }}</sup>
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
            </section>
            <!-- 頻度: メンバーごとの 現在 / 推奨(推奨は押すと固定の選択が開く。頻度マスに届かないメンバーは「届かない」)と、選んだ案の見込み 3 つ、
                 固定の操作 2 つ(頻度の最適化の下端にあったもの。下端は反映の 1 つなので、この節の下に置く) -->
            <section v-if="frequencyRows.length > 0" class="part">
              <h4>頻度</h4>
              <table class="plan-table">
                <thead>
                  <tr>
                    <th class="col-name">ホロメン</th>
                    <th class="col-cell">現在</th>
                    <th class="col-cell">
                      推奨<sup class="fn">※{{ noteNo.frequency }}</sup>
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
                      <button
                        v-else
                        type="button"
                        class="fix-btn"
                        :class="{ 'fix-active': row.fixed }"
                        :aria-label="`${row.name}の発動頻度を固定`"
                        @click="fixingHolomenId = row.holomenId"
                      >
                        {{ formatBoardPercent(row.shownPercent) }}
                      </button>
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
              <div class="fix-actions">
                <button type="button" class="fix-action" :disabled="!canReset" @click="resetFixed">
                  推奨頻度をリセット
                </button>
                <button
                  type="button"
                  class="fix-action"
                  :disabled="!canRefix"
                  @click="optimizeWithFixed"
                >
                  一部固定で最適化
                </button>
              </div>
            </section>
            <p v-if="useBoard && shown.infeasible.length > 0" class="warning">
              {{
                infeasibleNames
              }}は、このランクでは現在のコネクト配置を維持できないため、変更していません。
            </p>
          </template>
        </div>

        <div class="footnotes">
          <p>
            <span class="fn-num">※1</span>
            <span
              >この編成のまま、ユニットスコアが高くなるように選んだ値です。ボードはホロメンごとのボードPt（ホロメンランクまでに獲得した累積Pt。未登録は制限なし）とキューブ・コアキューブの範囲で、発動頻度マスを外して解放マスを選びます。コネクトは持っているコネクトの範囲で配置を選び、頻度はその盤面から発動頻度マスを選びます。いま登録しているボード・コネクト・開花・メモリー・メンバー強化ボーナスと、一番上で選んだ曲（開いた直後はさがしたときの曲）で計算します。現在の値は、頻度を最適化するときはいまの登録そのまま、しないときはいまの登録から発動頻度マスを外した値です。配置のあるコネクトマスは必ず解放済みにします（1
              Pt を予算に含みます）。ボードPt・資材は外部マスタ由来の値で、実機未確認です。</span
            >
          </p>
          <p v-if="noteNo.board">
            <span class="fn-num">※{{ noteNo.board }}</span>
            <span v-if="useBoard"
              >「ユニットのみ変更する」が ON
              のときは、リーダーとメンバーのホロメンのボードだけを変えます（それ以外は登録のまま）。OFF
              のときは全ホロメンのボードを変えます。選び方は近似で、最大になることを保証するものではありません。反映すると、解放マスとコネクトマスの解放が置き換わります。頻度を最適化しないときは、発動頻度マスはすべて外れます。</span
            >
            <span v-else
              >発動頻度マスと、そこまでの経路を開ける変更です（ボードPt
              が足りないときに外すマスを含みます）。</span
            >
          </p>
          <p v-if="noteNo.connect">
            <span class="fn-num">※{{ noteNo.connect }}</span>
            <span
              >コネクトの変更は、リーダーとメンバーの置き方だけです（ユニット外が使っているコネクトが必要なときは、その外す変更を含みます）。置き方は近似で、最大になることを保証するものではありません。</span
            >
          </p>
          <p v-if="noteNo.frequency">
            <span class="fn-num">※{{ noteNo.frequency }}</span>
            <span
              >「現在」はいま登録しているボードでの発動頻度、「推奨」は最適化したボードでの値です。発動頻度マスまでの経路は、最適化したボードから追加のボードPt
              が最も少ないものを開けます。ボードPt
              が足りないときは、ユニットスコアへの影響が小さいマスから外して空けます（空けられない頻度は選びません）。キューブ・コアキューブは足りなくても選びます。「期待値重視」「理論値重視」はライブ中のアクティブスキルの試算が最大になる組み合わせを選び、ユニットスコアは見ないので、ボードPt
              を空けるために外したマスのぶんユニットスコアが下がることがあります。「ユニットスコア重視」はユニットスコアが高くなる組み合わせを選びます（近似）。</span
            >
          </p>
          <p v-if="noteNo.score">
            <span class="fn-num">※{{ noteNo.score }}</span>
            <span
              >評価区間（一番上で選んだ曲の演奏時間。曲を指定しないときは全曲の演奏時間の中央値
              {{ medianSongDurationSeconds }}
              秒）のあいだのアクティブスキルのスコア UP
              の時間平均（%）の試算値です。「理論値重視」は発動抽選がすべて成功した前提、ほかは各スキルの発動確率を考慮した期待値で出します。実際のライブスコアではありません
              —
              譜面のノーツ・コンボ・判定・スペシャルスキルの発動位置・スコアサポートは含みません。発動頻度
              +f% は 周期 ÷（1 + f/100）、発動率 +r% は 発動確率 ×（1 + r/100、上限
              1）として反映する仮説モデルで、ユニットスコアの試算とは別の計算です。リーダー枠のアクティブは発動しないものとして扱います。</span
            >
          </p>
          <p v-if="noteNo.coverage">
            <span class="fn-num">※{{ noteNo.coverage }}</span>
            <span
              >期待カバレッジは、評価区間のうち「少なくとも 1
              つのアクティブスキルが発動している時間」の割合（期待値）です。スコア UP
              の大きさは見ないので、スキルが途切れにくいかの目安です。</span
            >
          </p>
          <p v-if="noteNo.gap">
            <span class="fn-num">※{{ noteNo.gap }}</span>
            <span
              >最大空白は、どのアクティブスキルも発動候補になっていない時間のうち最も長いものです（発動確率は見ません）。</span
            >
          </p>
        </div>
      </div>

      <!-- 下端の固定エリア(結果詳細と同じ地・罫線)。緑の主ボタン 1 つ -->
      <div class="sheet-foot">
        <button type="button" class="foot-primary" :disabled="!hasChange" @click="askApply">
          ホロメンボードに反映
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
    <!-- 1 人の発動頻度を固定する選択(推奨の値を押すと開く) -->
    <FrequencyFixDialog
      v-if="fixingRow"
      :name="fixingRow.name"
      :choices="fixingRow.choices"
      :value="draftFixed[fixingRow.holomenId] ?? null"
      @pick="pickFixed"
      @close="fixingHolomenId = null"
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
  --song-h: 88px; /* 曲のブロックの高さ(見出し 20 + 間隔 8 + 行 60。脚注の min-height の計算に使う) */
  --summary-h: 78px; /* 現在 / 推奨のスコア欄の高さ(計算中も同じ。脚注の min-height の計算にも使う) */
  --opts-h: 36px; /* オプションの開閉行(畳んでいるとき)の高さ。開くと 開閉行 36 + 間隔 6 + チップ 2 行 70 = 112、頻度を選んでいれば + 間隔 6 + 選び方 42 = 160(脚注の min-height の計算にも使う) */
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

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 16px 16px;
}

/* スクロールしない上部: 曲・オプションの開閉行と現在 / 推奨のユニットスコア(表から下がスクロールする) */
.fixed-top {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 16px;
  padding: 16px 16px 0;
}

/* 本文(表。脚注より上)の最低の高さ: ヘッダ 77 + 上部の固定(余白 16 + 曲のブロック --song-h + 間隔 16 + オプション --opts-h + 間隔 16 + スコア欄 --summary-h)
   + 本文の間隔 16 + 下端の固定エリア 65 を viewport から引くと、脚注の区切り線が固定エリアの上端に来る(定数 206 = 77 + 16 + 16 + 16 + 16 + 65) */
.sheet-main {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: calc(
    100dvh - 206px - var(--song-h) - var(--opts-h) - var(--summary-h) - env(safe-area-inset-bottom)
  );
}

@media (min-width: 48rem) {
  .sheet-main {
    min-height: 0;
  }
}

.footnotes {
  flex-shrink: 0;
}

/* 下端の固定エリア(結果詳細の固定エリアと同じ地・罫線・寸法)。主ボタンは実行専用の緑で高さ 48px・15px/700 */
.sheet-foot {
  background: var(--chrome-foot);
  border-top: 1px solid var(--line);
  display: grid;
  flex-shrink: 0;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
}

.foot-primary {
  background: var(--action);
  border: none;
  border-radius: var(--r-m);
  color: #fff;
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  height: 48px;
  padding: 0 8px;
}

.foot-primary:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.fn {
  font-size: 10px;
  font-weight: 600;
  line-height: 0;
  margin-left: 1px;
}

/* 計算中: 本文の中央に細線のリング(押したボタンの中のリングと同形。色だけ文字色) */
.working {
  align-items: center;
  display: flex;
  flex: 1;
  justify-content: center;
}

.spinner {
  animation: spin 0.8s linear infinite;
  border: 2.5px solid var(--line);
  border-radius: 50%;
  border-top-color: var(--ink);
  height: 28px;
  width: 28px;
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

/* 曲の行(メイン画面の Step 3・発動頻度の最適化と同形。選択中は右上に解除ボタンを重ねる) */
.block {
  flex-shrink: 0;
  height: var(--song-h);
}

/* 見出し「曲」(発動頻度の最適化と同じ 15px。高さを固定して脚注の min-height の計算を正確にする) */
.block h4 {
  font-size: 15px;
  line-height: 20px;
  margin: 0 0 8px;
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

.message {
  background: var(--bg);
  border-radius: var(--r-s);
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  padding: 14px;
}

/* 現在 / 推奨のユニットスコア: 淡色の地に 2 列(伸びの % は出さない — 2026-10-02 ユーザー指示)。計算中も同じ高さの枠を残す */
.summary {
  background: var(--bg);
  border-radius: var(--r-m);
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
  height: var(--summary-h);
  padding: 14px 16px;
}

.summary-pending .score-label {
  visibility: hidden;
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
  min-height: 29px;
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

/* 表: ホロメン / 現在 / 推奨 の 3 列(列見出しはこの 3 語)。値の枠は同じ幅にそろえて左揃え */
.plan-table {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
}

/* 列見出しは脚注が出てくる(表を過ぎる)までスクロールの上端に固定する。行が下を通るので地を持たせる */
.plan-table th {
  background: var(--surface);
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
  padding: 8px 0; /* 固定したときもスコア欄との距離を保つ */
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

/* 名前の下の小さな補足(Rank と 色ごとの増減) */
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

/* 変更の区分(ボード / コネクト): 短い名詞の見出し + 表 */
.part {
  flex-shrink: 0;
}

.part h4 {
  font-size: 15px;
  line-height: 20px;
  margin: 0;
  padding-top: 16px; /* 固定の上部(スコア欄)や前の表との間隔 */
}

/* オプションの開閉行: さがすのオプションと同じ(枠なし・文字のみ。▼/▲ は開閉の状態記号) */
.options {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 6px;
}

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
  padding: 0 4px;
  width: 100%;
}

.sheet.options-open {
  --opts-h: 112px;
}

.sheet.options-open.frequency-on {
  --opts-h: 160px;
}

/* オプションのチップ: 2 列(上の行 = ボード / コネクト、下の行 = 頻度 / ユニットのみ変更する)。形・選択スタイルはボードの反映のチップと同じ */
.option-chips {
  display: grid;
  gap: 6px;
  grid-template-columns: 1fr 1fr;
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
  padding: 0 6px;
  white-space: nowrap;
}

/* 最後の 1 つの ON と、コネクトを使えないとき・ボードを選んでいないときの範囲: 状態は保ったまま薄くする */
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

/* 頻度の選び方の 3 択: 排他なのでセグメント(ピッカー・旧「発動頻度の最適化」と同形)。1 行まるごと */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(3, 1fr);
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
  white-space: nowrap;
}

.seg:first-child {
  border-left: none;
}

.seg-active {
  background: var(--selected);
  color: var(--selected-ink);
  font-weight: 700;
}

/* 頻度の表の「現在」は比較の対象なので淡色(旧「発動頻度の最適化」と同じ) */
.current {
  color: var(--ink-2);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

/*
 * 推奨の頻度は押せる枠(固定の選択を開く)。未固定は枠線だけ、固定中は選択スタイル。
 * 値の桁数によらず枠の幅は同じにし、数字は右に揃える(旧「発動頻度の最適化」と同じ — 2026-09-30 ユーザー指示)
 */
.fix-btn {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  color: inherit;
  cursor: pointer;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  height: 28px;
  padding: 0 8px;
  text-align: right;
  width: 72px;
}

.fix-active {
  background: var(--selected);
  border-color: var(--selected);
  color: var(--selected-ink);
  font-weight: 700;
}

/* 選んだ案の見込み 3 つ(表の下に等幅で横並び。旧「発動頻度の最適化」・結果詳細の内訳と同じ「項目名の下に数値」) */
.param-grid {
  display: grid;
  gap: 0 8px;
  grid-template-columns: repeat(3, 1fr);
  margin: 8px 0 0;
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

/* 頻度の固定の操作 2 つ(左右半分ずつ。secondary の形 — 結果詳細の下端のボタンと同じ地・罫線で、高さだけ本文向けに 40px) */
.fix-actions {
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
  margin-top: 12px;
}

.fix-action {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 40px;
  padding: 0 2px;
  white-space: nowrap;
}

.fix-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
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

/* 本文の先頭の注意(反映すると足りなくなる資材)。表の見出しと同じだけ上をあける */
.warning.lead {
  margin: 16px 0 0;
}

/* 変更できなかったホロメンの注意(必須のコネクトがランクの予算に収まらない) */
.warning {
  color: var(--error);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  margin: 12px 0 0;
}
</style>
