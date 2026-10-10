<script setup lang="ts">
import { computed, ref } from "vue";

import CloseButton from "./CloseButton.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import ConnectFigure from "./ConnectFigure.vue";
import ConnectListDialog from "./ConnectListDialog.vue";
import ConnectPermilDialog from "./ConnectPermilDialog.vue";
import ConnectTakeDialog from "./ConnectTakeDialog.vue";
import { useModalChrome } from "../composables/useModalChrome";
import { holomen } from "../data";
import {
  CONNECT_ANCHOR_LABELS,
  CONNECT_EXTENT_DISPLAY_ORDER,
  CONNECT_EXTENT_LABELS,
  CONNECT_ANCHORS,
  CONNECT_EXTENTS,
  connectPermilCandidates,
} from "../data/connect";
import type {
  ConnectAnchor,
  ConnectExtentId,
  ConnectPlacement,
  ConnectPlacements,
} from "../data/connect";
import type { BoardColor } from "../storage/boards";
import { inventoryCount, placementSlots } from "../storage/connectInventory";
import type { ConnectInventoryEntry, ConnectSlot } from "../storage/connectInventory";
import { badgeAtBottom } from "../ui/connectBadge";
import { sortHolomen } from "../ui/labels";

/**
 * コネクトマスの入力（2026-09-11 ユーザー指示「コネクトマスをタッチしたらサイドバーが出てきて、効果マスの形一覧が図形で
 * 出てくる。クリックすると倍率を入力するテンキーが出て、確定するとコネクトマスの色がそのボードの色になる。
 * ホロメンカードを指定するよりそちらの方が楽」）。
 * 中央のモーダル（2026-10-10 に右から出るサイドバーから変更。一覧のダイアログと同じ器）に範囲の形 17 種を同じ大きさの正方形のタイルで 4 列に並べる。並びは対称な形が左右に
 * 並ぶ固定順（`CONNECT_EXTENT_DISPLAY_ORDER`）で、入れてある形**だけ**を先頭に出す（対になる形は動かさない —
 * 2026-09-11「そのペアみたいなのも一緒に上に来るのはやめよう」）。図形は**物理座標の向きのまま**で、ホロメンの左右配置や
 * コネクトマスの色で反転しない（2026-09-11「図形の反転はやめる。純粋に形で決まる」— 反転していた時期は対の形の見た目が
 * ホロメンによって入れ替わって見えた）。形をタップすると `ConnectPermilDialog` で
 * 倍率（%。ゲーム内の「範囲内のホロメンボード効果を X% UP」の X）を**候補から選び**、選んだら確定して閉じる
 * （2026-10-02 ユーザー指示。それまでは NumberPad の自由入力で、候補は出さなかった。保存済みの値が候補にないときも
 * そのまま残り、ダイアログの選択肢に添える）。入れた値はタイルの右上（どの形も使わない角に置き、中心の四角はタイルの中心のまま）。下端に「外す」。
 * 見出しの右の「一覧」で、全ホロメンのコネクト効果の一覧ダイアログ（`ConnectListDialog.vue`）を開く。
 * **持っている枚数と見比べる**（2026-10-10 ユーザー指示）: 倍率の候補の下に「残り n」を出し、残り 0（ほかのコネクトマスで
 * 持っている枚数を使い切っている・持っていない）の倍率を選ぶと `ConnectTakeDialog` で警告する。同じ 形 × ％ を置いている場所を選べば
 * そこから外してここへ置き（`move`）、「無視して置く」なら超えたまま置く（`submit`。禁止はしない）。所持カードが未登録でも
 * 見比べる（持っているコネクトは 0 枚）
 */
const props = withDefaults(
  defineProps<{
    holomenId: string;
    anchor: ConnectAnchor;
    /** いまの入力（未配置なら null） */
    placement: ConnectPlacement | null;
    /** 図形の塗りに使うボードの色（開いている盤面の色） */
    color: BoardColor;
    /** 全ホロメンのコネクトの入力（一覧ダイアログ・残りの枚数・持ってくる場所） */
    allPlacements: Readonly<Record<string, ConnectPlacements>>;
    /** 持っているコネクト（所持カードから導く） */
    inventory: readonly ConnectInventoryEntry[];
    /** 所持カードを 1 枚も登録していない（警告に一言添える） */
    cardsUnregistered?: boolean;
    /**
     * コネクトマスが解放済みか（既定 true。中心は常に true）。**未解放のあいだは形・倍率を入れられない**（2026-10-04 ユーザー指示。
     * 解放の状態は効果の配置とは別）。解放は 1 Pt で、直前のマスまで解放していて、ホロメンランクの残りPt が足りるときだけ押せる
     */
    unlocked?: boolean;
    /** 解放できるか（未解放のときだけ見る） */
    canUnlock?: boolean;
    /** 解放に要るボードPt */
    unlockPoints?: number;
    /** 解除すると同時に解除される先の通常マスの数（確認の文言に使う。0 なら確認は配置があるときだけ） */
    lockImpact?: number;
  }>(),
  { cardsUnregistered: false, unlocked: true, canUnlock: false, unlockPoints: 1, lockImpact: 0 },
);

const emit = defineEmits<{
  submit: [placement: ConnectPlacement];
  /** `from` に置いているコネクトを外して、ここへ置く */
  move: [placement: ConnectPlacement, from: ConnectSlot];
  clear: [];
  /** コネクトマスを解放する（1 Pt） */
  unlock: [];
  /** コネクトマスの解放を外す（先のマス・置いている効果も外れる） */
  lock: [];
  close: [];
}>();

/** 中心は常に解放済みで、解放・解除の対象ではない */
const unlockable = computed(() => props.anchor !== "center");
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

// 背景が見えるダイアログなのでスクロールロックはかけない(ConfirmDialog と同じ。背景のスクロールはオーバーレイで止める)
useModalChrome(() => emit("close"), { lockScroll: false });

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
/** いま入力しているコネクトマス（ほかの場所の数から除く） */
const here = computed<ConnectSlot>(() => ({ holomenId: props.holomenId, anchor: props.anchor }));
/** 倍率ごとの残り（持っている枚数 − ほかのコネクトマスに置いている数。0 未満は 0） */
const remaining = computed<Record<number, number>>(() => {
  const extent = editing.value;
  const out: Record<number, number> = {};
  if (extent === null) return out;
  const permils = [...connectPermilCandidates(extent)];
  if (editingValue.value !== null && !permils.includes(editingValue.value)) {
    permils.push(editingValue.value);
  }
  for (const permil of permils) {
    const elsewhere = placementSlots(props.allPlacements, extent, permil, here.value).length;
    out[permil] = Math.max(0, inventoryCount(props.inventory, extent, permil) - elsewhere);
  }
  return out;
});

/** 持ってくる場所の並び: ホロメンの読みの五十音順 → コネクトマスの順 */
const holomenOrder = new Map(sortHolomen(holomen).map((h, i) => [h.id, i]));
function sortSlots(slots: ConnectSlot[]): ConnectSlot[] {
  return slots.sort(
    (a, b) =>
      (holomenOrder.get(a.holomenId) ?? 999) - (holomenOrder.get(b.holomenId) ?? 999) ||
      CONNECT_ANCHORS.indexOf(a.anchor) - CONNECT_ANCHORS.indexOf(b.anchor),
  );
}

/** 持っている枚数を超える置き方の警告（null = 閉じている） */
const taking = ref<{ placement: ConnectPlacement; owned: number; sources: ConnectSlot[] } | null>(
  null,
);
function onPick(permil: number): void {
  const extent = editing.value;
  editing.value = null;
  if (extent === null) return;
  const placement = { extent, permil };
  const current = props.placement;
  // 入れてあるものと同じなら枚数は変わらない
  if (current && current.extent === extent && current.permil === permil) {
    emit("submit", placement);
    return;
  }
  const elsewhere = placementSlots(props.allPlacements, extent, permil, here.value);
  const owned = inventoryCount(props.inventory, extent, permil);
  if (elsewhere.length < owned) {
    emit("submit", placement);
    return;
  }
  taking.value = { placement, owned, sources: sortSlots(elsewhere) };
}
function onTake(from: ConnectSlot): void {
  const t = taking.value;
  taking.value = null;
  if (t) emit("move", t.placement, from);
}
function onPlaceAnyway(): void {
  const t = taking.value;
  taking.value = null;
  if (t) emit("submit", t.placement);
}
</script>

<template>
  <div class="connect-overlay" @click.self="emit('close')">
    <div
      class="panel"
      role="dialog"
      aria-modal="true"
      :aria-label="`${CONNECT_ANCHOR_LABELS[props.anchor]}のコネクト効果`"
      :style="{ '--board': `var(--board-${props.color})` }"
    >
      <header class="head">
        <p class="title">コネクト効果</p>
        <!-- 見出しの右: 全ホロメンのコネクト効果の一覧（アイコン + 文字で分かりやすく）。右端は閉じる -->
        <button type="button" class="list-button" @click="listOpen = true">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M3 5h2v2H3zm4 0h10v2H7zM3 9h2v2H3zm4 0h10v2H7zm-4 4h2v2H3zm4 0h10v2H7z"
              fill="currentColor"
            />
          </svg>
          <span>一覧</span>
        </button>
        <CloseButton @close="emit('close')" />
      </header>
      <!--
        コネクトマスの解放ボタン(中心以外。2026-10-04): 「コネクトマスを解放 1 Pt」だけを置き、説明文・見出しは出さない。
        直前のマスまで解放していて予算が足りるときだけ押せ、解放済みのときも disabled。未解放のあいだは形・倍率を入れられない
      -->
      <div v-if="unlockable" class="locked-box">
        <button type="button" class="unlock" :disabled="!props.canUnlock" @click="emit('unlock')">
          コネクトマスを解放 <span class="pts">{{ props.unlockPoints }} Pt</span>
        </button>
      </div>
      <!-- 範囲の形の一覧（4 列・同じ大きさの正方形。2026-10-10 ユーザー指示で 2 列から）。入れてある形は先頭で枠を濃くし、倍率をタイルの右上（図形の使わない角）に出す -->
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
            <span
              v-if="props.placement?.extent === s.id"
              class="value"
              :class="{ bottom: badgeAtBottom(s.id) }"
            >
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
    </div>

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
      :remaining="remaining"
      @pick="onPick"
      @close="editing = null"
    />
    <ConnectTakeDialog
      v-if="taking !== null"
      :placement="taking.placement"
      :owned="taking.owned"
      :sources="taking.sources"
      :cards-unregistered="props.cardsUnregistered"
      :color="props.color"
      @take="onTake"
      @place="onPlaceAnyway"
      @cancel="taking = null"
    />
    <ConnectListDialog
      v-if="listOpen"
      :placements="props.allPlacements"
      :inventory="props.inventory"
      @close="listOpen = false"
    />
  </div>
</template>

<style scoped>
/*
 * 中央のモーダル（2026-10-10 ユーザー指示「サイドバーでなくモーダルにしたい」。それまでは右から出るサイドバー）。
 * 器は一覧のダイアログ（ConnectListDialog）と同じ。ボードのシート（11）より上。ルートのクラスは中に重ねる
 * ダイアログ（ConnectPermilDialog の .overlay）と別の名前にする — 子のルートには親の scoped なスタイルも当たる
 */
.connect-overlay {
  align-items: center;
  background: rgba(35, 48, 61, 0.4);
  display: flex;
  inset: 0;
  justify-content: center;
  overscroll-behavior: contain;
  padding: 24px 16px;
  position: fixed;
  touch-action: pinch-zoom;
  z-index: 12;
}

.panel {
  background: var(--surface);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-sheet);
  display: flex;
  flex-direction: column;
  max-height: min(85dvh, 40rem);
  max-width: 26rem;
  overflow: hidden;
  width: 100%;
}

.head {
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  padding: 8px 8px 8px 16px;
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
  flex: 1;
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

.shapes {
  align-content: start; /* 縦に余っても行を引き伸ばさない */
  display: grid;
  flex: 1;
  gap: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  list-style: none;
  margin: 0;
  overflow-y: auto;
  padding: 12px;
  touch-action: pan-y pinch-zoom;
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
  padding: 13px;
  position: relative;
  width: 100%;
}

.shape.selected {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}

/*
 * 入れた倍率: タイルの右上（2026-09-11「やっぱ % 表示右上で。図形に被らないように」）。4 列（2026-10-10）のタイルは小さいので、
 * タイルの余白を 13px に広げ、札（高さ 14px）が図形の 2 段目より上に収まるようにする（枠の外へははみ出さない — 「はみ出してる」で差し戻し）。
 * 図形の中心の四角はタイルの中心のまま。いちばん上の段にマスがある上十字だけ右下の角に置く（`.value.bottom` — `badgeAtBottom`）
 */
.value {
  background: var(--board);
  border-radius: var(--r-pill);
  color: #fff;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 14px;
  padding: 0 5px;
  position: absolute;
  right: 4px;
  top: 4px;
}

.value.bottom {
  bottom: 4px;
  top: auto;
}

.foot {
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 8px;
  padding: 8px 12px 12px;
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
