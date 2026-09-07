<script setup lang="ts" generic="T">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";

/**
 * 1 ページずつの横送り。同じ形の大きな部品を縦に何個も並べない(2026-09-08 ユーザー指示)。
 * 下に現在位置「n / N」と前後の三角(端は disabled で隠さない)。
 * ブラウザのスクロールスナップは「スワイプしてから止まるまでが遅い。止まるまではサクッと」(2026-09-08)なので使わず、
 * 自前で送る: トラック上のドラッグは指に追従し、離した瞬間にページを決めて短い transition(300ms。180ms は「スピード早すぎ」)で収める。
 * 収まるのを待たずにタップできる。スワイプは swipeElement(パネル全体など。省略時はこの部品)で拾い、
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
function pageStyle(i: number): { transform: string } {
  return {
    transform: `translateX(calc(${String((i - index.value) * 100)}% + ${String(dragPx.value)}px))`,
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
  () => props.swipeElement ?? root.value,
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
    <div class="nav">
      <button
        type="button"
        class="arrow"
        :disabled="index <= 0"
        aria-label="前へ"
        @click="goTo(index - 1)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 2 4 8l7 6z" /></svg>
      </button>
      <span class="counter" aria-live="polite">{{ index + 1 }} / {{ count }}</span>
      <button
        type="button"
        class="arrow"
        :disabled="index >= count - 1"
        aria-label="次へ"
        @click="goTo(index + 1)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2l7 6-7 6z" /></svg>
      </button>
    </div>
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

/* 前後の三角と「n / N」。端の三角は disabled(グレーアウト)で隠さない */
.nav {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-top: 8px;
}

.arrow {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  height: 40px;
  justify-content: center;
  padding: 0;
  width: 56px;
}

.arrow svg {
  fill: currentColor;
  height: 16px;
  width: 16px;
}

.arrow:disabled {
  color: var(--ink-2);
  cursor: not-allowed;
  opacity: 0.35;
}

.counter {
  color: var(--ink-2);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  min-width: 56px;
  text-align: center;
}
</style>
