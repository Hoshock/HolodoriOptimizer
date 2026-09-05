<script lang="ts">
/**
 * 幅の再計測を 1 つの ResizeObserver で共有する(曲一覧は 200 行 × 2 つの部品になるため)。
 * 監視対象 → 再計測関数の対応を持ち、要素ごとに Observer を作らない
 */
const measurers = new WeakMap<Element, () => void>();
let sharedObserver: ResizeObserver | undefined;

function observe(el: Element, measure: () => void): void {
  measurers.set(el, measure);
  sharedObserver ??= new ResizeObserver((entries) => {
    for (const entry of entries) measurers.get(entry.target)?.();
  });
  sharedObserver.observe(el);
}

function unobserve(el: Element): void {
  measurers.delete(el);
  sharedObserver?.unobserve(el);
}

/**
 * スクロール速度(px/秒)。距離に関わらず一定にし、曲名とアーティストが同時に流れても
 * 速さが違わないようにする(2026-09-05 ユーザー指示。最小周期のクランプで遅くしない)
 */
const SPEED_PX_PER_SECOND = 30;
/** 先頭位置で読ませる停止時間(ms) */
const START_PAUSE_MS = 2000;
/** 左へ流し切って隠れてから、右端に再登場するまでの待ち(ms) */
const HIDDEN_PAUSE_MS = 800;
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";

/**
 * 1 行固定のテキスト。幅に収まるときは静止し、収まらないときだけ看板のように流す:
 * 先頭で止まる → 最後の文字が左に隠れるまで一定速度で流す → 少し待つ → 右端から現れて先頭位置に戻る。
 * 往復や先頭への巻き戻しはしない(2026-09-05 ユーザー指示)。
 * 幅は置かれた場所で実測する(ピッカーとメイン画面で幅が違っても、それぞれで判定する)。
 * 文字サイズ・色などの見た目は親のクラス(class 属性のフォールスルー)で与える
 */
const props = defineProps<{ text: string }>();

const outer = useTemplateRef("outer");
const inner = useTemplateRef("inner");
/** 流している間 true(省略記号を外し、本文を inline-block にする) */
const scrolling = ref(false);
let animation: Animation | undefined;

function stop(): void {
  animation?.cancel();
  animation = undefined;
  scrolling.value = false;
}

function measure(): void {
  if (!outer.value || !inner.value) return;
  const containerWidth = outer.value.clientWidth;
  // inline の本文は省略記号で切られていても行ボックスの実幅(全文の幅)を返す
  const textWidth = inner.value.getBoundingClientRect().width;
  if (Math.ceil(textWidth) <= containerWidth) {
    stop();
    return;
  }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    stop();
    return;
  }
  scrolling.value = true;
  void nextTick(() => start(textWidth, containerWidth));
}

/** 区間の長さ(ms)からキーフレームのオフセットを組み、一定速度の一方向ループにする */
function start(textWidth: number, containerWidth: number): void {
  if (!inner.value) return;
  animation?.cancel();
  const outMs = (textWidth / SPEED_PX_PER_SECOND) * 1000;
  const inMs = (containerWidth / SPEED_PX_PER_SECOND) * 1000;
  const total = START_PAUSE_MS + outMs + HIDDEN_PAUSE_MS + inMs;
  const at = (ms: number): number => ms / total;
  const hiddenAt = at(START_PAUSE_MS + outMs);
  const reappearAt = at(START_PAUSE_MS + outMs + HIDDEN_PAUSE_MS);
  animation = inner.value.animate(
    [
      { transform: "translateX(0)", offset: 0 },
      { transform: "translateX(0)", offset: at(START_PAUSE_MS) },
      { transform: `translateX(${String(-textWidth)}px)`, offset: hiddenAt },
      { transform: `translateX(${String(-textWidth)}px)`, offset: reappearAt },
      { transform: `translateX(${String(containerWidth)}px)`, offset: reappearAt },
      { transform: "translateX(0)", offset: 1 },
    ],
    { duration: total, iterations: Infinity, easing: "linear" },
  );
}

onMounted(() => {
  measure();
  if (outer.value) observe(outer.value, measure);
  // Web フォントの適用で寸法が変わることがあるため、読み込み完了後にもう一度測る
  void document.fonts.ready.then(measure);
});
onBeforeUnmount(() => {
  stop();
  if (outer.value) unobserve(outer.value);
});
watch(
  () => props.text,
  () => {
    stop();
    void nextTick(measure);
  },
);
</script>

<template>
  <span ref="outer" class="marquee" :class="{ scrolling }">
    <span ref="inner" class="marquee-inner">{{ props.text }}</span>
  </span>
</template>

<style scoped>
.marquee {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 流している間は末尾を隠さず(省略記号なし)、本文を inline-block にして transform を効かせる */
.marquee.scrolling {
  text-overflow: clip;
}

.marquee.scrolling .marquee-inner {
  display: inline-block;
  will-change: transform;
}
</style>
