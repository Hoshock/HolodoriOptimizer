<script setup lang="ts">
import { computed, ref } from "vue";

import ConfirmDialog from "./ConfirmDialog.vue";
import ConnectFigure from "./ConnectFigure.vue";
import ConnectListDialog from "./ConnectListDialog.vue";
import ConnectPermilDialog from "./ConnectPermilDialog.vue";
import { useModalChrome } from "../composables/useModalChrome";
import {
  CONNECT_ANCHOR_LABELS,
  CONNECT_EXTENT_DISPLAY_ORDER,
  CONNECT_EXTENT_LABELS,
  CONNECT_EXTENTS,
} from "../data/connect";
import type {
  ConnectAnchor,
  ConnectExtentId,
  ConnectPlacement,
  ConnectPlacements,
} from "../data/connect";
import type { BoardColor } from "../storage/boards";

/**
 * コネクトマスの入力（2026-09-11 ユーザー指示「コネクトマスをタッチしたらサイドバーが出てきて、効果マスの形一覧が図形で
 * 出てくる。クリックすると倍率を入力するテンキーが出て、確定するとコネクトマスの色がそのボードの色になる。
 * ホロメンカードを指定するよりそちらの方が楽」）。
 * 右から出るサイドバー（SideMenu と同じ器）に範囲の形 17 種を同じ大きさの正方形のタイルで並べる。並びは対称な形が左右に
 * 並ぶ固定順（`CONNECT_EXTENT_DISPLAY_ORDER`）で、入れてある形**だけ**を先頭に出す（対になる形は動かさない —
 * 2026-09-11「そのペアみたいなのも一緒に上に来るのはやめよう」）。図形は**物理座標の向きのまま**で、ホロメンの左右配置や
 * コネクトマスの色で反転しない（2026-09-11「図形の反転はやめる。純粋に形で決まる」— 反転していた時期は対の形の見た目が
 * ホロメンによって入れ替わって見えた）。形をタップすると `ConnectPermilDialog` で
 * 倍率（%。ゲーム内の「範囲内のホロメンボード効果を X% UP」の X）を**候補から選び**、選んだら確定して閉じる
 * （2026-10-02 ユーザー指示。それまでは NumberPad の自由入力で、候補は出さなかった。保存済みの値が候補にないときも
 * そのまま残り、ダイアログの選択肢に添える）。入れた値はタイルの右上（どの形も使わない角に置き、中心の四角はタイルの中心のまま）。下端に「外す」。
 * 見出しの右の「一覧」で、全ホロメンのコネクト効果の一覧ダイアログ（`ConnectListDialog.vue`）を開く
 */
const props = withDefaults(
  defineProps<{
    holomenId: string;
    anchor: ConnectAnchor;
    /** いまの入力（未配置なら null） */
    placement: ConnectPlacement | null;
    /** 図形の塗りに使うボードの色（開いている盤面の色） */
    color: BoardColor;
    /** 全ホロメンのコネクトの入力（一覧ダイアログ用） */
    allPlacements: Readonly<Record<string, ConnectPlacements>>;
    /**
     * コネクトマスが解放済みか（既定 true。中心は常に true）。**未解放のあいだは形・倍率を入れられない**（2026-10-04 ユーザー指示。
     * 解放の状態は効果の配置とは別）。解放は 1 Pt で、直前のマスまで解放していて、ホロメンランクの残りPt が足りるときだけ押せる
     */
    unlocked?: boolean;
    /** 解放できるか（未解放のときだけ見る） */
    canUnlock?: boolean;
    /** 解放できない理由: 直前まで解放していない / ボードPt が足りない */
    unlockReason?: "notReached" | "budget" | null;
    /** 解放に要るボードPt */
    unlockPoints?: number;
    /** 解除すると同時に解除される先の通常マスの数（確認の文言に使う。0 なら確認は配置があるときだけ） */
    lockImpact?: number;
  }>(),
  { unlocked: true, canUnlock: false, unlockReason: null, unlockPoints: 1, lockImpact: 0 },
);

const emit = defineEmits<{
  submit: [placement: ConnectPlacement];
  clear: [];
  /** コネクトマスを解放する（1 Pt） */
  unlock: [];
  /** コネクトマスの解放を外す（先のマス・置いている効果も外れる） */
  lock: [];
  close: [];
}>();

/** 中心は常に解放済みで、解放・解除の対象ではない */
const unlockable = computed(() => props.anchor !== "center");
const unlockReasonText = computed(() => {
  if (props.canUnlock) return "";
  if (props.unlockReason === "notReached")
    return "手前のマスまで解放すると、このコネクトマスを解放できます。";
  if (props.unlockReason === "budget") return "ボードPt が足りません。";
  return "";
});
/** 解除の確認: 置いている効果か、先の解放済みのマスが一緒に外れるときだけ挟む */
const lockConfirm = ref(false);
const lockMessage = computed(() => {
  const parts: string[] = [];
  if (props.placement) parts.push("置いているコネクト効果");
  if (props.lockImpact > 0) parts.push(`先の解放済みのマス ${String(props.lockImpact)} 個`);
  return `コネクトマスの解放を外すと、${parts.join("と")}も外れます。解除しますか？`;
});
function onLockPress(): void {
  if (props.placement || props.lockImpact > 0) lockConfirm.value = true;
  else emit("lock");
}
function onLockConfirm(): void {
  lockConfirm.value = false;
  emit("lock");
}

useModalChrome(() => emit("close"));

interface Shape {
  id: ConnectExtentId;
  cells: readonly (readonly [number, number])[];
}
/** 入れてある形だけを先頭に、残りは固定順のまま */
const shapes = computed<Shape[]>(() => {
  const selected = props.placement?.extent;
  const order = selected
    ? [selected, ...CONNECT_EXTENT_DISPLAY_ORDER.filter((id) => id !== selected)]
    : CONNECT_EXTENT_DISPLAY_ORDER;
  return order.map((id) => ({ id, cells: CONNECT_EXTENTS[id] }));
});

/** 一覧ダイアログ（全ホロメンのコネクト効果） */
const listOpen = ref(false);

/** 倍率を選んでいる形（null = 閉じている） */
const editing = ref<ConnectExtentId | null>(null);
/** 選択中の倍率: 同じ形を入れてあればその倍率、それ以外は未選択 */
const editingValue = computed(() => {
  const current = props.placement;
  return current && current.extent === editing.value ? current.permil : null;
});
function onPick(permil: number): void {
  const extent = editing.value;
  editing.value = null;
  if (extent === null) return;
  emit("submit", { extent, permil });
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <aside
      class="drawer"
      role="dialog"
      aria-modal="true"
      :aria-label="`${CONNECT_ANCHOR_LABELS[props.anchor]}のコネクト効果`"
      :style="{ '--board': `var(--board-${props.color})` }"
    >
      <header class="head">
        <p class="title">コネクト効果</p>
        <!-- 右上: 全ホロメンのコネクト効果の一覧（アイコン + 文字で分かりやすく） -->
        <button type="button" class="list-button" @click="listOpen = true">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M3 5h2v2H3zm4 0h10v2H7zM3 9h2v2H3zm4 0h10v2H7zm-4 4h2v2H3zm4 0h10v2H7z"
              fill="currentColor"
            />
          </svg>
          <span>一覧</span>
        </button>
      </header>
      <!--
        未解放のコネクトマス(2026-10-04): 形・倍率は入れられない。「コネクトマスを解放 1 Pt」で解放する(直前のマスまで解放していて、
        ホロメンランクの残りPt が足りるときだけ押せる。理由は文で出す)
      -->
      <div v-if="!props.unlocked" class="locked-box">
        <p class="locked-title">コネクトマス 未解放</p>
        <button type="button" class="unlock" :disabled="!props.canUnlock" @click="emit('unlock')">
          コネクトマスを解放 <span class="pts">{{ props.unlockPoints }} Pt</span>
        </button>
        <p v-if="unlockReasonText" class="locked-reason">{{ unlockReasonText }}</p>
      </div>
      <!-- 範囲の形の一覧（2 列・同じ大きさの正方形）。入れてある形は先頭で枠を濃くし、倍率をタイルの右上（図形の使わない角）に出す -->
      <ul class="shapes" :class="{ disabled: !props.unlocked }">
        <li v-for="s in shapes" :key="s.id">
          <button
            type="button"
            class="shape"
            :class="{ selected: props.placement?.extent === s.id }"
            :aria-label="CONNECT_EXTENT_LABELS[s.id]"
            :disabled="!props.unlocked"
            @click="editing = s.id"
          >
            <ConnectFigure :cells="s.cells" />
            <span v-if="props.placement?.extent === s.id" class="value">
              +{{ props.placement.permil / 10 }}%
            </span>
          </button>
        </li>
      </ul>
      <div v-if="props.placement || (unlockable && props.unlocked)" class="foot">
        <button v-if="props.placement" type="button" class="clear" @click="emit('clear')">
          外す
        </button>
        <!-- 解放済みのコネクトマスの解除(置いている効果・先のマスも外れる)。中心は常に解放済みなので出さない -->
        <button
          v-if="unlockable && props.unlocked"
          type="button"
          class="clear"
          @click="onLockPress"
        >
          コネクトマスを解除
        </button>
      </div>
    </aside>

    <ConfirmDialog
      v-if="lockConfirm"
      :message="lockMessage"
      confirm-label="解除する"
      @confirm="onLockConfirm"
      @cancel="lockConfirm = false"
    />
    <ConnectPermilDialog
      v-if="editing !== null"
      :extent="editing"
      :value="editingValue"
      @pick="onPick"
      @close="editing = null"
    />
    <ConnectListDialog
      v-if="listOpen"
      :placements="props.allPlacements"
      @close="listOpen = false"
    />
  </div>
</template>

<style scoped>
/* 右から出るサイドバー（SideMenu と同じ幅・地）。ボードのシート（11）より上 */
.overlay {
  background: rgba(35, 48, 61, 0.3);
  inset: 0;
  position: fixed;
  z-index: 12;
}

.drawer {
  background: var(--surface);
  bottom: 0;
  box-shadow: -8px 0 24px rgba(35, 48, 61, 0.16);
  display: flex;
  flex-direction: column;
  position: absolute;
  right: 0;
  top: 0;
  width: min(80vw, 300px);
}

.head {
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-shrink: 0;
  justify-content: space-between;
  padding: 12px 12px 12px 20px;
}

/* 一覧を開くボタン: 器のある押せる面(枡 + 罫線)に一覧アイコンと文字 */
.list-button {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  font-size: 13px;
  font-weight: 700;
  gap: 4px;
  height: 32px;
  padding: 0 12px 0 8px;
}

.list-button svg {
  height: 18px;
  width: 18px;
}

.title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

.shapes {
  display: grid;
  flex: 1;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
  list-style: none;
  margin: 0;
  overflow-y: auto;
  padding: 12px;
}

/* 図形のタイル: 器のある押せる面（枡 + 罫線）。全部同じ大きさの正方形で、図形はその中に収める。選択中は濃色の輪 */
.shape {
  align-items: center;
  aspect-ratio: 1 / 1;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 10px;
  position: relative;
  width: 100%;
}

.shape.selected {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}

/*
 * 入れた倍率: タイルの右上（2026-09-11「やっぱ % 表示右上で。図形に被らないように」）。図形は 7 × 7 の格子で、
 * どの形も角の 2 × 2 のマス（dx, dy ともに 2 以上）は使わないので、そこに収まる大きさなら図形に被らない。
 * 余白は上下左右とも同じで、中心の四角がタイルの中心に来る
 */
.value {
  background: var(--board);
  border-radius: var(--r-pill);
  color: #fff;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 16px;
  padding: 0 7px;
  position: absolute;
  right: 5px;
  top: 5px;
}

.foot {
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 8px;
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
}

/* 未解放の表示と解放ボタン(解放は主操作なので緑のボタン) */
.locked-box {
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 8px;
  padding: 12px;
}

.locked-title {
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 700;
  margin: 0;
}

.unlock {
  background: var(--action);
  border: none;
  border-radius: var(--r-m);
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  height: 44px;
  width: 100%;
}

.unlock:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.unlock .pts {
  font-variant-numeric: tabular-nums;
  margin-left: 6px;
}

.locked-reason {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
}

/* 未解放のあいだは形を選べない */
.shapes.disabled {
  opacity: 0.4;
}

.shape:disabled {
  cursor: not-allowed;
}

.clear {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  width: 100%;
}
</style>
