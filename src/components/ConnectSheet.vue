<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";

import CloseButton from "./CloseButton.vue";
import ConnectFigure from "./ConnectFigure.vue";
import ConnectPermilPane from "./ConnectPermilPane.vue";
import ConnectUsageList from "./ConnectUsageList.vue";
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
 * 中央のモーダル（2026-10-10 に右から出るサイドバーから変更）に範囲の形 17 種を同じ大きさの正方形のタイルで 4 列に並べる。並びは対称な形が左右に
 * 並ぶ固定順（`CONNECT_EXTENT_DISPLAY_ORDER`）で、入れてある形**だけ**を先頭に出す（対になる形は動かさない —
 * 2026-09-11「そのペアみたいなのも一緒に上に来るのはやめよう」）。図形は**物理座標の向きのまま**で、ホロメンの左右配置や
 * コネクトマスの色で反転しない（2026-09-11「図形の反転はやめる。純粋に形で決まる」— 反転していた時期は対の形の見た目が
 * ホロメンによって入れ替わって見えた）。形をタップすると同じモーダルの中身が倍率（`ConnectPermilPane`）に切り替わり、
 * 倍率（%。ゲーム内の「範囲内のホロメンボード効果を X% UP」の X）を**候補から選び**、選んだら確定して閉じる
 * （2026-10-02 ユーザー指示。それまでは NumberPad の自由入力で、候補は出さなかった。保存済みの値が候補にないときも
 * そのまま残り、ダイアログの選択肢に添える）。入れた値はタイルの右上（どの形も使わない角に置き、中心の四角はタイルの中心のまま）。「外す」は図形と同じタイルで左上（2026-10-10）。
 * 見出しの右の「一覧」で、中身が全ホロメンのコネクト効果の一覧（`ConnectUsageList.vue`）に切り替わる。
 * **持っている枚数と見比べる**（2026-10-10 ユーザー指示）: 倍率の候補の下に「残り n」を出し、残り 0（ほかのコネクトマスで
 * 持っている枚数を使い切っている・持っていない）の倍率を選ぶと、その行が広がって中に持ってくる場所（`ConnectTakePane`）が出る。同じ 形 × ％ を置いている場所を選べば
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
     * 解放の状態は効果の配置とは別）。解放は直前のマスまで解放していて、ホロメンランクの残りPt が足りるときだけ押せる
     */
    unlocked?: boolean;
    /** 解放できるか（未解放のときだけ見る） */
    canUnlock?: boolean;
    /** 解除すると同時に解除される先の通常マスの数（確認の文言に使う。0 なら確認は配置があるときだけ） */
    lockImpact?: number;
  }>(),
  { cardsUnregistered: false, unlocked: true, canUnlock: false, lockImpact: 0 },
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
/** 解除の確認: 置いている効果か、先の解放済みのマスが一緒に外れるときだけ挟む(モーダルの中身を切り替えて聞く) */
const lockMessage = computed(() => {
  const parts: string[] = [];
  if (props.placement) parts.push("置いているコネクト効果");
  if (props.lockImpact > 0) parts.push(`先の解放済みのマス ${String(props.lockImpact)} 個`);
  return `コネクトマスの解放を外すと、${parts.join("と")}も外れます。解除しますか？`;
});
function onLockPress(): void {
  if (props.placement || props.lockImpact > 0) view.value = "lock";
  else emit("lock");
}
function onLockConfirm(): void {
  view.value = "grid";
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

/**
 * モーダルの中身の切り替え(2026-10-10 ユーザー指示「モーダルの上にモーダルってキモい」「図形選択したらそれが拡大されて％選べるようになる」
 * 「所持より多い時のエラーもちゃんと考えて。シームレスにアニメーション入れて」)。上にダイアログを重ねず、1 つのモーダルの本文を
 * 形の一覧(grid)→ 倍率(permil)と切り替える。持っている枚数が足りない倍率を選ぶと、倍率の中身の下に持ってくる場所が出る
 * (図形と倍率の候補は上に置いたまま動かさない — 2026-10-10「その後のページでどこから外すかみたいなやつでまた図形の位置変わったりするのキモい」)。
 * 一覧(list)と解除の確認(lock)も同じ本文で切り替える。本文の高さは形の一覧で決まり、ほかの中身はその上に重ねるので、
 * 切り替えてもモーダルの大きさは変わらない
 */
type View = "grid" | "permil" | "list" | "lock";
const view = ref<View>("grid");
const bodyEl = ref<HTMLElement | null>(null);

/** 倍率を選んでいる形（形の一覧では null） */
const editing = ref<ConnectExtentId | null>(null);
/** 選択中の倍率: 同じ形を入れてあればその倍率、それ以外は未選択 */
const editingValue = computed(() => {
  const current = props.placement;
  return current && current.extent === editing.value ? current.permil : null;
});
/** いま入力しているコネクトマス（ほかの場所の数から除く） */
const here = computed<ConnectSlot>(() => ({ holomenId: props.holomenId, anchor: props.anchor }));
/**
 * 倍率ごとの残り（持っている枚数 − 置いている数。いま入力しているマスに置いている分も数える — アカウントの「コネクト」の 使用 / 所持 と
 * 同じ数え方。超えて置いていれば「残り -2」のように負のまま — 2026-10-10 ユーザー指示「残り-2とかいう表示もゆるす」）。
 * 持ってくる場所を出すかどうかは、このマスの分を除いた数で決める（`onPick`。入れてあるものを選び直しても枚数は変わらない）
 */
const remaining = computed<Record<number, number>>(() => {
  const extent = editing.value;
  const out: Record<number, number> = {};
  if (extent === null) return out;
  const permils = [...connectPermilCandidates(extent)];
  if (editingValue.value !== null && !permils.includes(editingValue.value)) {
    permils.push(editingValue.value);
  }
  for (const permil of permils) {
    const placed = placementSlots(props.allPlacements, extent, permil).length;
    out[permil] = inventoryCount(props.inventory, extent, permil) - placed;
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

/** 持っている枚数を超える置き方（持ってくる場所の中身で使う） */
const taking = ref<{ placement: ConnectPlacement; owned: number; sources: ConnectSlot[] } | null>(
  null,
);

/**
 * 拡大して移る図形（ヒーロー）。押したタイルの図形の位置から、倍率の中身の大きな枠・持ってくる場所の中身の小さな枠
 * (`[data-hero-slot]`)へ、本文の上に重ねた 1 つの図形を動かして見せる。戻るときはタイルの位置へ縮んで戻る
 */
const hero = ref<{
  extent: ConnectExtentId;
  x: number;
  y: number;
  size: number;
  animate: boolean;
} | null>(null);
const HERO_MS = 340;
const reduceMotion =
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const frame = (cb: () => void): void => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(cb);
  else setTimeout(cb, 0);
};
let heroTimer: ReturnType<typeof setTimeout> | null = null;
onBeforeUnmount(() => {
  if (heroTimer !== null) clearTimeout(heroTimer);
});

/**
 * 本文の左上を原点にした要素の位置と大きさ。transform(中身が浮かび上がる途中・一覧が奥へ引いた状態)に左右されないよう、
 * getBoundingClientRect ではなく offset の位置を足し、スクロールの分を引く(行き先は動き終えたあとの位置)
 */
function rectIn(el: HTMLElement | null | undefined): { x: number; y: number; size: number } | null {
  const body = bodyEl.value;
  if (!el || !body) return null;
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== body) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  if (node !== body) return null;
  for (let p = el.parentElement; p && p !== body; p = p.parentElement) {
    x -= p.scrollLeft;
    y -= p.scrollTop;
  }
  return { x, y, size: el.offsetWidth };
}
/** タイルの図形の位置(図形は余白の内側いっぱいの正方形。SVG は offset を持たないのでタイルから求める) */
function tileFigureRect(extent: ConnectExtentId): { x: number; y: number; size: number } | null {
  const tile = bodyEl.value?.querySelector<HTMLElement>(`[data-extent="${extent}"]`);
  const r = rectIn(tile);
  if (!tile || !r) return null;
  const pad = Number.parseFloat(getComputedStyle(tile).paddingLeft) || 0;
  const inset = tile.clientLeft + pad;
  return { x: r.x + inset, y: r.y + inset, size: tile.clientWidth - pad * 2 };
}
const slotRect = (v: View): { x: number; y: number; size: number } | null =>
  rectIn(bodyEl.value?.querySelector<HTMLElement>(`[data-view="${v}"] [data-hero-slot]`));

/** ヒーローを `target` の位置へ動かし、動き終えたら `then` */
async function moveHero(
  target: () => { x: number; y: number; size: number } | null,
  then?: () => void,
): Promise<void> {
  await nextTick();
  const to = target();
  const current = hero.value;
  if (!current || !to) {
    then?.();
    return;
  }
  if (reduceMotion) {
    hero.value = { ...current, ...to, animate: false };
    then?.();
    return;
  }
  // 出発の位置を描いてから(2 フレーム待つ)行き先へ動かす
  frame(() =>
    frame(() => {
      if (!hero.value) return;
      hero.value = { ...hero.value, ...to, animate: true };
      if (heroTimer !== null) clearTimeout(heroTimer);
      heroTimer = setTimeout(() => {
        heroTimer = null;
        then?.();
      }, HERO_MS);
    }),
  );
}

/**
 * 図形が大きな枠に収まったか。収まったらヒーローを消して枠の中に図形を描く(倍率の中身はスクロールするので、
 * 本文に重ねたヒーローのままだとスクロールについてこない)。戻るときは枠の位置からヒーローを出し直す
 */
const heroLanded = ref(false);

/** 形を押す: その図形が拡大して上へ移り、下に倍率の候補が出る */
function openShape(id: ConnectExtentId): void {
  const from = tileFigureRect(id);
  editing.value = id;
  taking.value = null;
  heroLanded.value = false;
  view.value = "permil";
  hero.value = from ? { extent: id, ...from, animate: false } : null;
  void moveHero(
    () => slotRect("permil"),
    () => {
      if (view.value !== "permil" || editing.value !== id) return;
      heroLanded.value = true;
      hero.value = null;
    },
  );
}
/** 形の一覧へ戻る: 図形は大きな枠から元のタイルへ縮んで戻る */
function backToGrid(): void {
  const id = editing.value;
  const from = id === null ? null : slotRect("permil");
  view.value = "grid";
  taking.value = null;
  heroLanded.value = false;
  if (id === null || from === null) {
    hero.value = null;
    editing.value = null;
    return;
  }
  hero.value = { extent: id, ...from, animate: false };
  void moveHero(
    () => tileFigureRect(id),
    () => {
      if (view.value !== "grid") return;
      hero.value = null;
      editing.value = null;
    },
  );
}
/** 戻る: どの中身からも形の一覧へ(行を広げていても、いったん閉じずにそのまま戻る — 2026-10-10 ユーザー指示) */
function onBack(): void {
  if (view.value === "permil") backToGrid();
  else view.value = "grid";
}

function onPick(permil: number): void {
  const extent = editing.value;
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
  // 足りない: その行の矩形が広がって中に持ってくる場所が出る(下の候補は押し下げられる)。
  // 同じ行をもう一度押したら閉じる。広がりきったあと、画面の外なら見えるところまで送る
  if (taking.value?.placement.permil === permil) {
    taking.value = null;
    return;
  }
  taking.value = { placement, owned, sources: sortSlots(elsewhere) };
  setTimeout(
    () => {
      const el = bodyEl.value?.querySelector<HTMLElement>(`[data-view='permil'] .row-box.open`);
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
      }
    },
    reduceMotion ? 0 : HERO_MS,
  );
}
function onTake(from: ConnectSlot): void {
  const t = taking.value;
  if (t) emit("move", t.placement, from);
}
function onPlaceAnyway(): void {
  const t = taking.value;
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
        <!-- 形の一覧以外の中身では、見出しの左に戻る -->
        <button v-if="view !== 'grid'" type="button" class="back" aria-label="戻る" @click="onBack">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M12.5 4.5 7 10l5.5 5.5"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
        </button>
        <p class="title">{{ view === "list" ? "コネクト効果の一覧" : "コネクト効果" }}</p>
        <!-- 見出しの右: 全ホロメンのコネクト効果の一覧（アイコン + 文字で分かりやすく）。右端は閉じる -->
        <button v-if="view === 'grid'" type="button" class="list-button" @click="view = 'list'">
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
      <div ref="bodyEl" class="body">
        <!-- 形の一覧: 本文の高さを決める。ほかの中身のあいだは薄くして触れない -->
        <div
          class="grid-view"
          :class="{ away: view !== 'grid' }"
          :inert="view !== 'grid'"
          :aria-hidden="view !== 'grid'"
        >
          <!--
            コネクトマスの解除と解放(中心以外): 左右に等幅で並べ、解放は右(2026-10-10 ユーザー指示。Pt の表記は置かない)。説明文・見出しは出さない。
            解放は直前のマスまで解放していて予算が足りるときだけ押せ、解放済みのときは disabled。解除は解放済みのときだけ押せる。
            未解放のあいだは形・倍率を入れられない
          -->
          <div v-if="unlockable" class="locked-box">
            <button type="button" class="lock" :disabled="!props.unlocked" @click="onLockPress">
              コネクトマスを解除
            </button>
            <button
              type="button"
              class="unlock"
              :disabled="!props.canUnlock"
              @click="emit('unlock')"
            >
              コネクトマスを解放
            </button>
          </div>
          <!-- 範囲の形の一覧（4 列・同じ大きさの正方形。2026-10-10 ユーザー指示で 2 列から）。入れてある形は先頭で枠を濃くし、倍率をタイルの右上に出す -->
          <ul class="shapes" :class="{ disabled: !props.unlocked }">
            <!-- 外す: 図形と同じタイルで左上(2026-10-10 ユーザー指示)。入れていないときも枠は残して disabled -->
            <li>
              <button
                type="button"
                class="shape remove"
                :disabled="!props.unlocked || !props.placement"
                @click="emit('clear')"
              >
                外す
              </button>
            </li>
            <li v-for="s in shapes" :key="s.id">
              <button
                type="button"
                class="shape"
                :class="{
                  selected: props.placement?.extent === s.id,
                  lifted: hero !== null && hero.extent === s.id,
                }"
                :data-extent="s.id"
                :aria-label="CONNECT_EXTENT_LABELS[s.id]"
                :disabled="!props.unlocked"
                @click="openShape(s.id)"
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
        </div>

        <Transition name="pane">
          <div
            v-if="view === 'permil' && editing !== null"
            class="pane permil-view"
            data-view="permil"
          >
            <ConnectPermilPane
              :extent="editing"
              :show-figure="heroLanded"
              :value="taking?.placement.permil ?? editingValue"
              :remaining="remaining"
              :taking="taking"
              :cards-unregistered="props.cardsUnregistered"
              @pick="onPick"
              @take="onTake"
              @place="onPlaceAnyway"
            />
          </div>
        </Transition>
        <Transition name="slide">
          <div v-if="view === 'list'" class="pane" data-view="list">
            <ConnectUsageList :placements="props.allPlacements" :inventory="props.inventory" />
          </div>
        </Transition>
        <Transition name="pane">
          <div v-if="view === 'lock'" class="pane lock-pane" data-view="lock">
            <p class="lock-message">{{ lockMessage }}</p>
            <div class="lock-actions">
              <button type="button" @click="view = 'grid'">キャンセル</button>
              <button type="button" class="confirm" @click="onLockConfirm">解除する</button>
            </div>
          </div>
        </Transition>

        <!-- 拡大して移る図形(押したタイル → 倍率の大きな枠 → 持ってくる場所の小さな枠) -->
        <div
          v-if="hero !== null"
          class="hero"
          :class="{ animate: hero.animate }"
          :style="{
            transform: `translate(${hero.x}px, ${hero.y}px)`,
            width: `${hero.size}px`,
            height: `${hero.size}px`,
          }"
          aria-hidden="true"
        >
          <ConnectFigure :cells="CONNECT_EXTENTS[hero.extent]" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * 中央のモーダル（2026-10-10 ユーザー指示「サイドバーでなくモーダルにしたい」。それまでは右から出るサイドバー）。
 * ボードのシート（11）より上。ルートのクラスは部品固有の名前にする — 子のルートには親の scoped なスタイルも当たる
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

/* 本文: 形の一覧が高さを決め、ほかの中身(.pane)とヒーローはその上に重ねる */
.body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.grid-view {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y pinch-zoom;
  transition:
    opacity 0.22s ease,
    transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* ほかの中身のあいだ: 少し奥へ引いて消える(戻ると手前へ戻る) */
.grid-view.away {
  opacity: 0;
  pointer-events: none;
  transform: scale(0.97);
}

.shapes {
  align-content: start; /* 縦に余っても行を引き伸ばさない */
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  list-style: none;
  margin: 0;
  padding: 12px;
}

/* 拡大して移っている形のタイルは、図形をヒーローに任せて消しておく */
.shape.lifted .figure {
  visibility: hidden;
}

.pane {
  inset: 0;
  overflow: hidden;
  position: absolute;
}

/* 倍率・持ってくる場所・解除の確認: 図形が動き出してから下から浮かび上がる。消えるときは短く */
.pane-enter-from {
  opacity: 0;
  transform: translateY(14px);
}

.pane-enter-active {
  transition:
    opacity 0.26s ease 0.12s,
    transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1) 0.12s;
}

.pane-leave-active {
  transition: opacity 0.14s ease;
}

.pane-leave-to {
  opacity: 0;
}

/*
 * 倍率の中身: 図形 → ％ の行(足りない行は広がって中に持ってくる場所)を 1 本の縦の流れにし、余白は 16px でそろえる。
 * 持ってくる場所が多いときは中身ごとスクロールする(図形の位置は流れの先頭のまま変わらない)
 */
.permil-view {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px;
  touch-action: pan-y pinch-zoom;
}

/* 一覧: 右から送られてくる */
.slide-enter-from {
  opacity: 0;
  transform: translateX(28px);
}

.slide-enter-active {
  transition:
    opacity 0.22s ease,
    transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.slide-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.2s ease;
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(28px);
}

/* 拡大して移る図形: 位置は transform、大きさは幅と高さで動かす */
.hero {
  left: 0;
  pointer-events: none;
  position: absolute;
  top: 0;
  z-index: 2;
}

.hero.animate {
  transition:
    transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1),
    width 0.34s cubic-bezier(0.2, 0.8, 0.2, 1),
    height 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .grid-view,
  .hero.animate,
  .pane-enter-active,
  .pane-leave-active,
  .slide-enter-active,
  .slide-leave-active {
    transition: none;
  }
}

/* 見出しの左の戻る(閉じると同じ 44px の正円・面の色) */
.back {
  align-items: center;
  background: var(--surface);
  border: none;
  border-radius: var(--r-pill);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  height: 44px;
  justify-content: center;
  margin-left: -8px;
  width: 44px;
}

.back svg {
  height: 22px;
  width: 22px;
}

/* 解除の確認: 本文の中央に文と 2 つのボタン(ConfirmDialog と同じ文字と配色) */
.lock-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
  justify-content: center;
  padding: 16px;
}

.lock-message {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.6;
  margin: 0;
}

.lock-actions {
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
}

.lock-actions button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  height: 44px;
  padding: 0 8px;
}

.lock-actions .confirm {
  background: var(--action);
  border: none;
  color: #fff;
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

/* 解除と解放: 左右に等幅(解放は右。主操作なので緑、解除は白) */
.locked-box {
  border-bottom: 1px solid var(--line);
  display: grid;
  flex-shrink: 0;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
  padding: 12px;
}

.unlock,
.lock {
  border-radius: var(--r-m);
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  height: 44px;
  padding: 0 4px;
  white-space: nowrap;
}

.unlock {
  background: var(--action);
  border: none;
  color: #fff;
}

.lock {
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink);
}

.unlock:disabled,
.lock:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

/* 未解放のあいだは形を選べない */
.shapes.disabled {
  opacity: 0.4;
}

.shape:disabled {
  cursor: not-allowed;
}

/* 外す: 図形のタイルと同じ器に文字だけ。入れていないときは淡く */
.shape.remove {
  font-size: 14px;
  font-weight: 700;
}

.shapes:not(.disabled) .shape.remove:disabled {
  color: var(--ink-2);
  opacity: 0.45;
}
</style>
