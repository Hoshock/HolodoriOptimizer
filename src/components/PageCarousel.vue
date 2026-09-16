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

watch(count, () => {
  if (index.value !== clamp(index.value)) index.value = clamp(index.value);
});

/* ドラッグ(指に追従)とスワイプ判定 */
/**
 * ゆっくり動かしたときに送る距離。**速く払ったとき(フリック)はこの距離に届かなくても送る** —
 * 距離だけで見ていたので「さっとスワイプするとページがめくれない」(2026-09-16 ユーザー報告)
 */
const SWIPE_MIN_PX = 40;
/** フリックとみなす速さ(px/ms。離す直前の速さで見る)。0.3 = 1 秒で 300px */
const FLICK_MIN_VELOCITY = 0.3;
/** フリックでも、これだけは動いていること(指のぶれで送らない) */
const FLICK_MIN_PX = 12;
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
  /** 直近の位置と時刻。離す直前の速さを測るために 1 つ前も持つ */
  lastX: number;
  lastT: number;
  prevX: number;
  prevT: number;
}
let gesture: Gesture | null = null;
/**
 * いま触れている指。**2 本以上になったらジェスチャを捨ててブラウザへ譲る** — ピンチで拡大を戻そうとすると
 * 2 本目の指の pointerdown で横ドラッグが始まり直し、縮小できなくなる
 * (2026-09-16 ユーザー報告「ピンチインするとスワイプも競合してできない」)。
 * 指が全部離れるまで新しいジェスチャも始めない
 */
const pointers = new Set<number>();
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
function pageStyle(i: number): { transform: string } {
  return {
    transform: `translateX(calc(${String((i - index.value) * 100)}% + ${String(dragPx.value)}px))`,
  };
}

function onPointerDown(event: PointerEvent): void {
  pointers.add(event.pointerId);
  // 2 本目以降(ピンチ)。追従中なら元へ戻して、指が全部離れるまで何もしない
  if (pointers.size > 1) {
    gesture = null;
    dragging.value = false;
    dragPx.value = 0;
    return;
  }
  swipedAt = 0;
  if (event.button !== 0 && event.pointerType === "mouse") return;
  const now = performance.now();
  gesture = {
    x: event.clientX,
    y: event.clientY,
    onTrack: (event.target as Element | null)?.closest(".track") !== null,
    dragging: false,
    moved: false,
    lastX: event.clientX,
    lastT: now,
    prevX: event.clientX,
    prevT: now,
  };
}
function onPointerMove(event: PointerEvent): void {
  const g = gesture;
  if (!g) return;
  // 速さは「離す直前の 1 区間」で測る。イベントは同じ位置でも飛んでくるので、動いたときだけ更新する
  if (event.clientX !== g.lastX) {
    g.prevX = g.lastX;
    g.prevT = g.lastT;
    g.lastX = event.clientX;
    g.lastT = performance.now();
  }
  const dx = event.clientX - g.x;
  const dy = event.clientY - g.y;
  if (!g.moved && Math.abs(dx) < TAP_SLOP_PX && Math.abs(dy) < TAP_SLOP_PX) return;
  g.moved = true;
  if (!g.dragging) {
    // 縦の動きが勝つジェスチャは縦スクロールに譲る(トラックの touch-action: pan-y pinch-zoom)
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
/**
 * 離した(または取り消された)ときに送るかを決める。**ゆっくりなら距離、速ければ速さ**で見る —
 * 指が速いほど動く距離は短くなるので、距離だけだとフリックが落ちる。
 * **取り消し(pointercancel)でも、横のドラッグとして成立していたなら送る** — 速く払うと
 * ブラウザがスクロールとみなして取り消してくることがあり、そこで捨てると「めくれない」になる
 * (縦が勝ったジェスチャはこの時点で `gesture` ごと捨ててあるので、ここへは来ない)
 */
function endGesture(event: PointerEvent, cancelled: boolean): void {
  pointers.delete(event.pointerId);
  const g = gesture;
  gesture = null;
  dragging.value = false;
  dragPx.value = 0;
  if (!g) return;
  if (g.moved) swipedAt = performance.now();
  if (!g.dragging) return;
  // 取り消しの座標は当てにならないので、最後に動いた位置で測る
  const endX = cancelled ? g.lastX : event.clientX;
  const dx = endX - g.x;
  const dt = g.lastT - g.prevT;
  const velocity = dt > 0 ? (g.lastX - g.prevX) / dt : 0;
  const flicked =
    Math.abs(velocity) >= FLICK_MIN_VELOCITY &&
    Math.abs(dx) >= FLICK_MIN_PX &&
    Math.sign(velocity) === Math.sign(dx);
  if (!flicked && Math.abs(dx) < SWIPE_MIN_PX) return;
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
  const recent = performance.now() - swipedAt < SWIPE_CLICK_GRACE_MS;
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
        :class="{ current: i === index, dragging }"
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
/* スワイプを拾う範囲: 横の指の動きはこちらへ(縦スクロールとピンチはブラウザに任せる)、ドラッグ中に文字選択を始めない。
   親の要素にも付けるので非 scoped。**pinch-zoom を必ず残す** — pan-y だけだとこの範囲でピンチが効かず、
   一度拡大すると戻せなくなる(2026-09-16 ユーザー報告) */
.swipe-area {
  touch-action: pan-y pinch-zoom;
  user-select: none;
}
</style>

<style scoped>
.track {
  overflow: hidden;
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

.page.dragging {
  transition: none;
}

/* 前後の三角と「n / N」(PageNav)はトラックの下に置く */
.nav {
  margin-top: 8px;
}
</style>
