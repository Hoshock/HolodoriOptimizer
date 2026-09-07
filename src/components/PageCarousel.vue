<script setup lang="ts" generic="T">
import { computed, onBeforeUnmount, useTemplateRef, watch } from "vue";

/**
 * 1 ページずつの横スクロール(scroll-snap)。同じ形の大きな部品を縦に何個も並べない(2026-09-08 ユーザー指示)。
 * 下に現在位置「n / N」と前後の三角(端は disabled で隠さない)。
 * トラック上のタッチはブラウザの横スクロール(snap)に任せ、それ以外(見出し・ナビ・PC のマウスドラッグ)の
 * 左右スワイプは swipeElement(省略時はこの部品自身)で拾ってページを送る。スワイプ直後の click は
 * 中の行ボタンに届かないよう止める
 */
const props = defineProps<{
  /** ページにする項目(1 項目 = 1 ページ) */
  items: readonly T[];
  /** トラックの aria-label */
  label: string;
  /** スワイプを拾う要素(パネル全体など)。省略時はこの部品の範囲 */
  swipeElement?: HTMLElement | null;
}>();

/** 現在のページ(0 始まり)。外から変えるとそのページへスクロールする */
const index = defineModel<number>({ default: 0 });

const count = computed(() => props.items.length);
const root = useTemplateRef<HTMLDivElement>("root");
const track = useTemplateRef<HTMLDivElement>("track");

function clamp(i: number): number {
  return Math.min(Math.max(0, count.value - 1), Math.max(0, i));
}

function pageAtScroll(): number {
  const el = track.value;
  if (!el || el.clientWidth === 0) return index.value;
  return clamp(Math.round(el.scrollLeft / el.clientWidth));
}

/**
 * ボタン・スワイプで送ったときの目標ページ。smooth スクロールの途中は scroll イベントごとに位置から
 * ページを計算すると分子が 1 と 2 を行き来する(2026-09-08 ユーザー指摘)ので、目標に着くまで index を固定し、
 * 着いたら(またはユーザーがトラックに触れたら)位置への追従に戻す
 */
let pendingTarget: number | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
function settle(): void {
  pendingTarget = null;
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  pendingTimer = null;
}

function onScroll(): void {
  const el = track.value;
  if (pendingTarget !== null) {
    if (!el || Math.abs(el.scrollLeft - pendingTarget * el.clientWidth) > 1) return;
    settle();
  }
  index.value = pageAtScroll();
}

function goTo(i: number): void {
  const target = clamp(i);
  index.value = target;
  const el = track.value;
  if (!el || pageAtScroll() === target) return;
  settle();
  pendingTarget = target;
  // smooth スクロールが途中で止まっても追従に戻れるよう、保険で一定時間後に解除する
  pendingTimer = setTimeout(settle, 1000);
  el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
}

watch(index, (i) => {
  if (pageAtScroll() !== i) goTo(i);
});

/* 左右スワイプ(トラック上のタッチ以外) */
const SWIPE_MIN_PX = 40;
/** スワイプ直後の click を止める猶予。これを過ぎた click は通常のタップとして通す */
const SWIPE_CLICK_GRACE_MS = 300;
let swipeStart: { x: number; y: number; nativeScroll: boolean } | null = null;
/** 直前のスワイプで送った時刻(その click を 1 回だけ止める)。0 = なし */
let swipedAt = 0;

function onPointerDown(event: PointerEvent): void {
  // 新しいジェスチャが始まったら、前のスワイプの click 抑止は解く(click が来なかったスワイプの旗が
  // 次のタップを食って「スワイプ直後に選択できない」になった — 2026-09-08 ユーザー指摘)
  swipedAt = 0;
  const onTrack = (event.target as Element | null)?.closest(".track") !== null;
  if (onTrack) settle();
  swipeStart = {
    x: event.clientX,
    y: event.clientY,
    nativeScroll: onTrack && event.pointerType === "touch",
  };
}
function onPointerUp(event: PointerEvent): void {
  const start = swipeStart;
  swipeStart = null;
  if (!start || start.nativeScroll) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return;
  swipedAt = event.timeStamp;
  goTo(index.value + (dx < 0 ? 1 : -1));
}
function onPointerCancel(): void {
  swipeStart = null;
}
/** スワイプで終わった操作の click は中の行ボタンへ届かせない */
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
onBeforeUnmount(() => {
  detach();
  settle();
});
</script>

<template>
  <div ref="root" class="carousel">
    <div
      ref="track"
      class="track"
      role="group"
      :aria-label="props.label"
      @scroll.passive="onScroll"
    >
      <div v-for="(item, i) in props.items" :key="i" class="page">
        <slot name="page" :item="item" :index="i" />
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
/* スワイプを拾う範囲ではドラッグ中に文字選択を始めない(親の要素にも付けるので非 scoped) */
.swipe-area {
  user-select: none;
}
</style>

<style scoped>
.track {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}

.track::-webkit-scrollbar {
  display: none;
}

.page {
  flex: 0 0 100%;
  min-width: 0;
  scroll-snap-align: start;
  width: 100%;
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
