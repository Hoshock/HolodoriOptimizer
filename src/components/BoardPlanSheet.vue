<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";

import CloseButton from "./CloseButton.vue";
import BoardSheet from "./BoardSheet.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import ConnectFigure from "./ConnectFigure.vue";
import SongPicker from "./SongPicker.vue";
import SongRow from "./SongRow.vue";
import type { CandidateView } from "../composables/useOptimizer";
import { useBoardPlan } from "../composables/useBoardPlan";
import { getPlan, planCacheKey, setPlan } from "../composables/usePlanCache";
import { useModalChrome } from "../composables/useModalChrome";
import { useTabScroll } from "../composables/useTabScroll";
import { cardById, songById } from "../data";
import type { BloomMap } from "../data/bloom";
import {
  CONNECT_ANCHOR_LABELS,
  CONNECT_EXTENT_LABELS,
  CONNECT_EXTENTS,
  connectFactorMapOf,
} from "../data/connect";
import type { ConnectAnchor, ConnectPlacement } from "../data/connect";
import type { HolomenBoards } from "../data/boardState";
import type { BoardConnectMap } from "../storage/boardConnects";
import type { BoardResources } from "../storage/boardResources";
import type { BoardMap } from "../storage/boards";
import type { ConnectPlacementMap } from "../storage/connect";
import type { HolomenRankMap } from "../storage/holomenRank";
import type { BoardScope } from "../engine/boardOptimize";
import type { BoardConnectPlanResult } from "../engine/boardConnectPlan";
import type { ConnectItem } from "../engine/connectOptimize";
import type { AccountBonus } from "../engine/power";
import type { OptimizeRunRequest } from "../engine/request";
import { connectPlanRows } from "../ui/connectPlan";
import { holomenName } from "../ui/labels";

/**
 * 「ボードの最適化」(結果詳細・ユニット詳細の下端。2026-10-04 ユーザー指示。2026-10-07 にコネクトの最適化を統合し、**ホロメンボード / コネクト**を
 * 独立した ON/OFF のチップで選ぶ形にした — 既定は両方 ON)。
 * **この編成のまま**、ホロメンごとのボードPt の予算(ホロメンランク。未登録は制限なし)と共有の資材の範囲で、**表示ユニットスコア**が高くなる
 * 解放マスを選ぶ(`boardOptimize.ts`。ライブスコアの式は未確定なので目的関数にしない)。**青の発動頻度マスはすべて OFF にして行い**、反映すると
 * 登録している頻度マスは外れる(頻度の配分は「頻度の最適化」の担当。反映の確認に一言の注意を出す)。コネクトは、持っているコネクト(アカウントの「コネクト」)の
 * 範囲で解放済みのコネクトマスの配置を変える(範囲は常にユニットのみ)。両方を選ぶと ボード → コネクト の順に、スコアが上がらなくなるまで
 * 最大 3 周回す(`boardConnectPlan.ts`)。配置のあるコネクトマスは、ボードの推奨でも必ず解放済み(1 Pt を予算に含む)。
 * 基準は発動頻度の最適化と同じ**いま登録している状態**(ボード 4 色・コネクトの解放と配置・開花・アカウント補正)と、シートの曲。
 * 一番上に評価に使う曲(開いた直後はメイン画面の曲か、前に選び直した曲。ここで選び直せる)、その下のチップで最適化する対象、
 * その下のトグルでボードの変えてよい範囲:
 * **ユニットのみ変更**(既定。リーダーとメンバーのホロメンのボードだけ。それ以外は登録のまま)/ **全て変更**(全ホロメン。緑ボードはアカウント全体に
 * 効くのでユニット外のボードもスコアに効く)。ボードを選んでいないときは範囲は使わないので disabled。
 * 範囲の下にユニットスコア(現在 / 推奨。現在は頻度マスを外した登録の値)、その下に変更のある内容の表(ボード = ホロメンごとに「ボードを開く」、
 * コネクト = ホロメン / 現在 / 推奨)。下端の固定エリアに緑の「ホロメンボードに反映」(確認を挟み、解放マスとコネクトマスの解放・コネクトの配置を
 * 置き換える)。キューブ・コアキューブ(色ごとのアカウント共有の資材。「リソース」の登録値は余り)も予算に含め、反映するときは余りのリソースも推奨に
 * 合わせて置き換える(`apply` の `remaining`)。計算は Web Worker(`boardWorker.ts`)で、選んだ(曲, 範囲, 対象)ごとに 1 回(結果は覚えておく)。
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
  /** いまボードに置いているコネクト(変えない) */
  placements: ConnectPlacementMap;
  /** ホロメン ID → 解放済みのコネクトマス(赤 / 青 / 黄) */
  connects: BoardConnectMap;
  /** ホロメン ID → ホロメンランク(登録済みのホロメンだけ。載っていないホロメンはボードPt の制限なし) */
  ranks: HolomenRankMap;
  /** 「リソース」の登録値(いまのボードを開けた上で余っているキューブ・コアキューブ。未登録の項目は制限なし) */
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
   * 推奨のボードと、それに組み替えたあとの余りのリソース、推奨のコネクトの配置(コネクトを選んだときだけ。null は配置を変えない)を
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

const { result, error, run } = useBoardPlan();

/** リアクティブ Proxy は postMessage で複製できないので、プレーンな値に写す */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** 評価に使う曲(開いた時点の曲で始まり、ここで変えられる。ここで変えても元の画面の曲は変わらない) */
const songId = ref<string | null>(props.songId);
const song = computed(() => (songId.value ? (songById.get(songId.value) ?? null) : null));
const pickerOpen = ref(false);
watch(songId, (value) => emit("songChange", value));

/** 最適化する対象(独立した ON/OFF。少なくとも 1 つは ON)。コネクトを最適化できないときは OFF で始める */
const useBoard = ref(true);
const useConnect = ref(!props.connectDisabled);
/** 最後の 1 つの ON は外せない(両方 OFF にできる道を作らない) */
const lastOnly = (which: "board" | "connect"): boolean =>
  which === "board" ? useBoard.value && !useConnect.value : useConnect.value && !useBoard.value;
function toggleTarget(which: "board" | "connect"): void {
  if (which === "board") {
    if (!lastOnly("board")) useBoard.value = !useBoard.value;
  } else if (!props.connectDisabled && !lastOnly("connect")) {
    useConnect.value = !useConnect.value;
  }
}

/** ボードの変えてよい範囲(既定はユニットのみ)と、(曲, 範囲, 対象)ごとの結果(一度計算したら覚えておく) */
const scope = ref<BoardScope>("unit");
/** 本文のスクロール位置は範囲ごとに別々に覚える(切り替えて同じ位置から始まらない) */
const bodyEl = ref<HTMLElement | null>(null);
useTabScroll(bodyEl, () => scope.value);
const SCOPES: { value: BoardScope; label: string }[] = [
  { value: "unit", label: "ユニットのみ変更" },
  { value: "all", label: "全て変更" },
];
const results = reactive<Record<string, BoardConnectPlanResult>>({});
let requested: string | null = null;
let requestedCache: string | null = null;
/** 対象の組合せ(ボード / コネクト)。結果のキーと保存のキーに入れる */
const targetOf = (): string => `${useBoard.value ? "b" : ""}${useConnect.value ? "c" : ""}`;
/** ボードを選ばないときは範囲が効かないので、キーにも入れない(同じ結果を範囲違いで計算し直さない) */
const scopeOf = (): BoardScope => (useBoard.value ? scope.value : "unit");
const keyOf = (): string => `${songId.value ?? ""}/${scopeOf()}/${targetOf()}`;
/** 閉じて開き直しても残るキャッシュのキー(結果詳細に戻るまで再計算しない — usePlanCache.ts) */
const cacheKeyOf = (): string =>
  planCacheKey(
    "board",
    { leaderId: props.candidate.leaderId, memberIds: props.candidate.memberIds },
    props.blooms,
    songId.value,
    // 資材の登録・対象・範囲が違えば結果も違うので、キーに含める(古い結果を返さない)
    [scopeOf(), targetOf(), plain(props.resources)],
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
  const cached = getPlan<BoardConnectPlanResult>(cacheKeyOf());
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
    items: plain(props.items),
  });
}
watch(result, (value) => {
  if (value === null || requested === null) return;
  results[requested] = plain(value) as BoardConnectPlanResult;
  if (requestedCache !== null) setPlan(requestedCache, results[requested]);
});
watch([scope, songId, useBoard, useConnect], () => {
  start();
});
onMounted(() => {
  start();
});

/** いま選んでいる範囲の結果(まだなら null) */
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
const hasBoardChange = computed(
  () => useBoard.value && shown.value !== null && shown.value.changed.length > 0,
);
/** 変更があるか(スコアが同じでも、予算の超過や頻度マスを外すなど変更があれば反映できる) */
const hasChange = computed(() => hasBoardChange.value || connectRows.value.length > 0);

/** 脚注の番号(上から出てくる順。※1 は現在 / 推奨の欄。ボードを選んでいなければコネクトが ※2) */
const noteNo = computed(() => ({ board: 2, connect: useBoard.value ? 3 : 2 }));

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
  const placements = props.placements[id] ?? {};
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
  withBoard: boolean;
  withConnect: boolean;
} | null>(null);
function askApply(): void {
  if (!hasChange.value || shown.value === null) return;
  applying.value = {
    // ボードを選ばなかったときは、ボードの変更を含めない(コネクトだけを反映する)
    boards: useBoard.value ? plain(shown.value.boards) : {},
    remaining: useBoard.value ? plain(shown.value.remainingAfter) : plain(props.resources),
    placements: useConnect.value ? plain(shown.value.placements) : null,
    withBoard: useBoard.value,
    withConnect: useConnect.value,
  };
}
/** 確認ダイアログの文言(反映する内容に合わせる) */
const confirmMessage = computed(() => {
  const a = applying.value;
  if (a === null) return "";
  if (a.withBoard && a.withConnect) return "推奨のホロメンボードとコネクトの配置を反映しますか？";
  if (a.withBoard) return "推奨のホロメンボードを反映しますか？（コネクトの配置は変わりません）";
  return "推奨のコネクトの配置を反映しますか？";
});
/** ボードを反映するときの一言の注意(登録している頻度マスは外れる — 2026-10-07 ユーザー指示) */
const FREQUENCY_NOTE = "発動頻度マスはすべて外れます。";
function onApply(): void {
  const next = applying.value;
  applying.value = null;
  if (next !== null)
    emit("apply", { boards: next.boards, remaining: next.remaining, placements: next.placements });
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="ボードの最適化">
      <header class="sheet-head">
        <h3>ボードの最適化</h3>
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
        <!-- 最適化する対象: 独立した ON/OFF なのでセグメントでなくピル形のチップ(ボードの反映のチップと同形)。最後の 1 つは外せない -->
        <div class="targets" role="group" aria-label="最適化する対象">
          <button
            type="button"
            class="chip"
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
            class="chip"
            role="checkbox"
            :aria-checked="useConnect"
            :class="{ active: useConnect }"
            :disabled="props.connectDisabled || lastOnly('connect')"
            @click="toggleTarget('connect')"
          >
            コネクト
          </button>
        </div>
        <div
          class="segment"
          :class="{ 'segment-off': !useBoard }"
          role="radiogroup"
          aria-label="ボードの変更する範囲"
        >
          <button
            v-for="s in SCOPES"
            :key="s.value"
            type="button"
            class="seg"
            role="radio"
            :aria-checked="scope === s.value"
            :class="{ 'seg-active': scope === s.value }"
            :disabled="!useBoard"
            @click="scope = s.value"
          >
            {{ s.label }}
          </button>
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
              >この編成のまま、ユニットスコアが高くなるように選んだ値です。ボードはホロメンごとのボードPt（ホロメンランクまでに獲得した累積Pt。未登録は制限なし）とキューブ・コアキューブの範囲で解放マスを選び、コネクトは持っているコネクトの範囲で配置を選びます。いま登録しているボード・コネクト・開花・メモリー・メンバー強化ボーナスと、一番上で選んだ曲（開いた直後はさがしたときの曲）で計算します。発動頻度マスは含めずに計算するので、現在の値はいまの登録から頻度マスを外した値です。配置のあるコネクトマスは必ず解放済みにします（1
              Pt を予算に含みます）。ボードPt・資材は外部マスタ由来の値で、実機未確認です。</span
            >
          </p>
          <p v-if="useBoard">
            <span class="fn-num">※{{ noteNo.board }}</span>
            <span
              >「ユニットのみ変更」は、リーダーとメンバーのホロメンのボードだけを変えます（それ以外は登録のまま）。選び方は近似で、最大になることを保証するものではありません。反映すると、解放マスとコネクトマスの解放が置き換わり、発動頻度マスはすべて外れます。</span
            >
          </p>
          <p v-if="useConnect">
            <span class="fn-num">※{{ noteNo.connect }}</span>
            <span
              >コネクトの変更は、リーダーとメンバーの置き方だけです（ユニット外が使っているコネクトが必要なときは、その外す変更を含みます）。置き方は近似で、最大になることを保証するものではありません。</span
            >
          </p>
        </div>
      </div>

      <!-- 下端の固定エリア(結果詳細・発動頻度の最適化と同じ地・罫線)。緑の主ボタン 1 つ -->
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
      :note="applying.withBoard ? FREQUENCY_NOTE : undefined"
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

/* スクロールしない上部: 曲・範囲の 2 択と現在 / 推奨のユニットスコア(表から下がスクロールする) */
.fixed-top {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 16px;
  padding: 16px 16px 0;
}

/* 本文(表。脚注より上)の最低の高さ: ヘッダ 77 + 上部の固定(余白 16 + 曲のブロック --song-h + 間隔 16 + 対象のチップ 32 + 間隔 16 + 範囲の 2 択 42 + 間隔 16 + スコア欄 --summary-h)
   + 本文の間隔 16 + 下端の固定エリア 65 を viewport から引くと、脚注の区切り線が固定エリアの上端に来る */
.sheet-main {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: calc(100dvh - 296px - var(--song-h) - var(--summary-h) - env(safe-area-inset-bottom));
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

/* 変更する範囲の 2 択: ピッカーのセグメントと同形で左右半分ずつ(選択スタイルは全画面共通の --selected) */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  flex-shrink: 0;
  grid-template-columns: 1fr 1fr;
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
  padding: 0 4px;
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

/* 最適化する対象のチップ(2 つ。左右半分ずつ。形・選択スタイルはボードの反映のチップと同じ) */
.targets {
  display: grid;
  flex-shrink: 0;
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
  padding: 0 14px;
}

/* 最後の 1 つの ON と、コネクトを使えないとき: 状態は保ったまま薄くする */
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

/* ボードを選んでいないあいだ、範囲の 2 択は選択状態を保ったまま薄くする */
.segment-off {
  opacity: 0.45;
}

.seg:disabled {
  cursor: not-allowed;
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

/* 変更できなかったホロメンの注意(必須のコネクトがランクの予算に収まらない) */
.warning {
  color: var(--error);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  margin: 12px 0 0;
}
</style>
