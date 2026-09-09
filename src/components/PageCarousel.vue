<script setup lang="ts" generic="T">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";

import PageNav from "./PageNav.vue";

/**
 * 1 ページずつの横送り。同じ形の大きな部品を縦に何個も並べない(2026-09-08 ユーザー指示)。
 * 下に現在位置「n / N」と前後の三角(`PageNav`。端は disabled で隠さない。navPosition="none" なら
 * 置かず、呼び出し側が別の場所 — 詳細シート下端の固定エリア — に PageNav を置く)。
 * ブラウザのスクロールスナップは「スワイプしてから止まるまでが遅い。止まるまではサクッと」(2026-09-08)なので使わず、
 * 自前で送る: トラック上のドラッグは指に追従し、離した瞬間にページを決めて短い transition(300ms。180ms は「スピード早すぎ」)で収める。
 * 収まるのを待たずにタップできる。スワイプは swipeElement(パネル全体など。省略時はこの部品)で拾い(noSwipe で無効)、
 * トラックの外(見出し・ナビ)のスワイプと PC のマウスドラッグでも送る。動かしたジェスチャの click は中の行に届かせない。
 * 描くのは現在ページの前後 2 ページだけで、各ページを個別に transform し、常時レイヤーに載せる(will-change) —
 * 全ページを 1 枚の帯にすると 100 件で横 35,000px 超のレイヤーになるうえ、送りの開始・終了のレイヤーの作り直しで
 * iOS が一瞬ちらついた(2026-09-08 ユーザー指摘。メンバー枠 5 つでも起きた)
 */
const props = defineProps<{
  /** ページにする項目(1 項目 = 1 ページ) */
  items: readonly T[];
  /** トラックの aria-label */
  label: string;
  /** スワイプを拾う要素(パネル全体など)。省略時はこの部品の範囲 */
  swipeElement?: HTMLElement | null;
  /**
   * true = 左右スワイプで送らず、三角ボタンだけで送る。縦に長い本文を縦スクロールする置き場
   * (詳細シート)で誤爆させない(2026-09-09 ユーザー指示「スワイプを許さない。ボタンだけ」)。
   * 否定形の名前にしているのは、boolean の prop は**渡さないと false になる**ため
   * (`swipe?: boolean` にしたら省略時も false になり、全部のカルーセルでスワイプが死んだ)
   */
  noSwipe?: boolean;
  /**
   * 「n / N」と前後の三角(`PageNav`)を置く位置。既定はトラックの下。
   * 1 ページが縦に長く、下端がスクロールの先にある置き場(詳細シート)では "none" にして、
   * 呼び出し側がシート下端の固定エリアへ PageNav を置く
   */
  navPosition?: "bottom" | "none";
}>();

/** 現在のページ(0 始まり)。外から変えるとそのページへ送る */
const index = defineModel<number>({ default: 0 });

const count = computed(() => props.items.length);
const root = useTemplateRef<HTMLDivElement>("root");

function clamp(i: number): number {
  return Math.min(Math.max(0, count.value - 1), Math.max(0, i));
}

function goTo(i: number): void {
  index.value = clamp(i);
}

/**
 * アニメーションなしでページを切り替える(送りの transition を 1 回だけ切る)。
 * カードを入れたあとの「次の枠へ」で使う — 送ると入れたカードの面が最後にチラ見えする(2026-09-08 ユーザー指摘)
 */
const instant = ref(false);
function jumpTo(i: number): void {
  instant.value = true;
  index.value = clamp(i);
  // 新しい位置が描かれた(transition の対象にならなかった)あとで戻す
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      instant.value = false;
    });
  });
}
defineExpose({ jumpTo });

watch(count, () => {
  if (index.value !== clamp(index.value)) index.value = clamp(index.value);
});

/* ドラッグ(指に追従)とスワイプ判定 */
/** これ以上動いたらスワイプ(タップではない) */
const SWIPE_MIN_PX = 40;
/** 動かしたジェスチャの click を止める猶予 */
const SWIPE_CLICK_GRACE_MS = 300;
/** これ以上動いたらそのジェスチャの click は「タップ」でない */
const TAP_SLOP_PX = 10;

interface Gesture {
  x: number;
  y: number;
  /** トラック上で始まった(指に追従して動かす)か */
  onTrack: boolean;
  /** 横方向と判定してドラッグ中か */
  dragging: boolean;
  moved: boolean;
}
let gesture: Gesture | null = null;
let swipedAt = 0;
/** ドラッグ中のずれ(px)。0 以外のあいだは transition を切って指に追従する */
const dragPx = ref(0);
const dragging = ref(false);

/** 描くページ(現在の前後 2 ページ。送りの途中で隣が見え、離れたページは描かない) */
const RENDER_WINDOW = 2;
const renderedPages = computed(() => {
  const pages: number[] = [];
  const from = Math.max(0, index.value - RENDER_WINDOW);
  const to = Math.min(count.value - 1, index.value + RENDER_WINDOW);
  for (let i = from; i <= to; i += 1) pages.push(i);
  return pages;
});
function itemAt(i: number): T {
  return props.items[i] as T;
}
/**
 * ページ同士の隙間(px)。トラックは overflow-clip-margin で少しのはみ出し(結果の 1 件の角に重ねる星の
 * 半分)を描くので、隣のページがその範囲に入らないだけ離しておく
 */
const PAGE_GAP_PX = 24;
function pageStyle(i: number): { transform: string } {
  const offset = i - index.value;
  return {
    transform: `translateX(calc(${String(offset * 100)}% + ${String(offset * PAGE_GAP_PX + dragPx.value)}px))`,
  };
}

function onPointerDown(event: PointerEvent): void {
  swipedAt = 0;
  if (event.button !== 0 && event.pointerType === "mouse") return;
  gesture = {
    x: event.clientX,
    y: event.clientY,
    onTrack: (event.target as Element | null)?.closest(".track") !== null,
    dragging: false,
    moved: false,
  };
}
function onPointerMove(event: PointerEvent): void {
  const g = gesture;
  if (!g) return;
  const dx = event.clientX - g.x;
  const dy = event.clientY - g.y;
  if (!g.moved && Math.abs(dx) < TAP_SLOP_PX && Math.abs(dy) < TAP_SLOP_PX) return;
  g.moved = true;
  if (!g.dragging) {
    // 縦の動きが勝つジェスチャは縦スクロールに譲る(トラックの touch-action: pan-y)
    if (Math.abs(dy) > Math.abs(dx)) {
      gesture = null;
      return;
    }
    g.dragging = true;
    dragging.value = g.onTrack;
  }
  if (!g.onTrack) return;
  // 端の外へは 1/3 の抵抗で少しだけ動く
  const atEdge = (dx > 0 && index.value === 0) || (dx < 0 && index.value >= count.value - 1);
  dragPx.value = atEdge ? dx / 3 : dx;
}
function endGesture(event: PointerEvent, cancelled: boolean): void {
  const g = gesture;
  gesture = null;
  dragging.value = false;
  dragPx.value = 0;
  if (!g) return;
  if (g.moved) swipedAt = event.timeStamp;
  if (cancelled || !g.dragging) return;
  const dx = event.clientX - g.x;
  if (Math.abs(dx) < SWIPE_MIN_PX) return;
  goTo(index.value + (dx < 0 ? 1 : -1));
}
function onPointerUp(event: PointerEvent): void {
  endGesture(event, false);
}
function onPointerCancel(event: PointerEvent): void {
  endGesture(event, true);
}
/** 動かしたジェスチャの click は中の行ボタンへ届かせない(直後の別のタップは通す) */
function onClickCapture(event: MouseEvent): void {
  if (swipedAt === 0) return;
  const recent = event.timeStamp - swipedAt < SWIPE_CLICK_GRACE_MS;
  swipedAt = 0;
  if (!recent) return;
  event.stopPropagation();
  event.preventDefault();
}

let attached: HTMLElement | null = null;
function detach(): void {
  if (!attached) return;
  attached.removeEventListener("pointerdown", onPointerDown);
  attached.removeEventListener("pointermove", onPointerMove);
  attached.removeEventListener("pointerup", onPointerUp);
  attached.removeEventListener("pointercancel", onPointerCancel);
  attached.removeEventListener("click", onClickCapture, true);
  attached.classList.remove("swipe-area");
  attached = null;
}
function attach(el: HTMLElement | null): void {
  detach();
  if (!el) return;
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerCancel);
  el.addEventListener("click", onClickCapture, true);
  el.classList.add("swipe-area");
  attached = el;
}
watch(
  () => (props.noSwipe ? null : (props.swipeElement ?? root.value)),
  (el) => {
    attach(el ?? null);
  },
  { immediate: true, flush: "post" },
);
onBeforeUnmount(detach);
</script>

<template>
  <div ref="root" class="carousel">
    <div class="track" role="group" :aria-label="props.label">
      <!-- 現在ページだけが高さを決め(position: relative)、前後は同じ位置に絶対配置して横へずらす -->
      <div
        v-for="i in renderedPages"
        :key="i"
        class="page"
        :class="{ current: i === index, dragging, instant }"
        :style="pageStyle(i)"
        :aria-hidden="i !== index"
      >
        <slot name="page" :item="itemAt(i)" :index="i" />
      </div>
    </div>
    <PageNav v-if="props.navPosition !== 'none'" v-model="index" :count="count" class="nav" />
  </div>
</template>

<style>
/* スワイプを拾う範囲: 横の指の動きはこちらへ(縦スクロールはブラウザに任せる)、ドラッグ中に文字選択を始めない。親の要素にも付けるので非 scoped */
.swipe-area {
  touch-action: pan-y;
  user-select: none;
}
</style>

<style scoped>
.track {
  /* 隣のページ(±100% ずれ)を隠す。ページの中身が少しはみ出すぶん(結果の 1 件の角に重ねる星の半分)は
     clip-margin のぶんだけ描く。overflow: clip 未対応のブラウザは 1 行目の hidden にフォールバックする */
  overflow: hidden;
  overflow: clip;
  overflow-clip-margin: 20px;
  position: relative;
}

/* ページは各自 transform で横にずれる。送りは短い transition(離した瞬間にページが決まり、サクッと収まる。180ms は「早すぎ」で 300ms)。指に追従中は切る */
.page {
  backface-visibility: hidden;
  left: 0;
  position: absolute;
  top: 0;
  transition: transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
  width: 100%;
  /* 送りの開始・終了でレイヤーを作り直すと iOS が一瞬白く抜ける(メンバー枠でもちらついた — 2026-09-08)ので、常時レイヤーに載せておく */
  will-change: transform;
}

.page.current {
  position: relative;
}

.page.dragging,
.page.instant {
  transition: none;
}

/* 前後の三角と「n / N」(PageNav)はトラックの下に置く */
.nav {
  margin-top: 8px;
}
</style>
