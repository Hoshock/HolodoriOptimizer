<script lang="ts">
/**
 * 幅・高さの再計測を 1 つの ResizeObserver で共有する(曲一覧は 200 行 × 2 つの部品になるため)。
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

/** スクロール速度(px/秒)。「ゆっくり」— 読みながら追える速さ(2026-09-05 ユーザー指示) */
const SPEED_PX_PER_SECOND = 30;
/** 1 周期のうち末尾へ進む区間の割合(残りは両端の停止と、先頭への速い巻き戻し — keyframes と対応) */
const TRAVEL_RATIO = 0.6;
const MIN_DURATION_SECONDS = 3;
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";

/**
 * 1 行固定のテキスト。幅に収まるときは静止し、収まらないときだけ全文が読めるように
 * 末尾までゆっくり横に進み、速く先頭へ巻き戻して繰り返す(収まっているときは何もしない)。
 * 幅は置かれた場所で実測する(ピッカーとメイン画面で幅が違っても、それぞれで判定する)。
 * 複数行の文章には使わない(縦送りは 2026-09-05 に却下 — 高さは最大行数で固定する)。
 * 文字サイズ・色などの見た目は親のクラス(class 属性のフォールスルー)で与える
 */
const props = defineProps<{ text: string }>();

const outer = useTemplateRef("outer");
const inner = useTemplateRef("inner");
/** はみ出し量(px)。0 なら静止 */
const overflow = ref(0);

function measure(): void {
  if (!outer.value || !inner.value) return;
  const content = inner.value.getBoundingClientRect().width;
  overflow.value = Math.max(0, Math.ceil(content - outer.value.clientWidth));
}

const scrollStyle = computed(() => {
  if (overflow.value === 0) return undefined;
  const travelSeconds = overflow.value / SPEED_PX_PER_SECOND;
  const duration = Math.max(MIN_DURATION_SECONDS, travelSeconds / TRAVEL_RATIO);
  return { "--shift": `-${String(overflow.value)}px`, "--duration": `${duration.toFixed(1)}s` };
});

onMounted(() => {
  measure();
  if (outer.value) observe(outer.value, measure);
  // Web フォントの適用で寸法が変わることがあるため、読み込み完了後にもう一度測る
  void document.fonts.ready.then(measure);
});
onBeforeUnmount(() => {
  if (outer.value) unobserve(outer.value);
});
watch(
  () => props.text,
  () => void nextTick(measure),
);
</script>

<template>
  <span ref="outer" class="marquee" :class="{ scrolling: overflow > 0 }" :style="scrollStyle">
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

/* スクロール中は末尾を隠さず(省略記号なし)、本文を inline-block にして transform を効かせる */
.marquee.scrolling {
  text-overflow: clip;
}

.marquee.scrolling .marquee-inner {
  animation: marquee-scroll var(--duration) linear infinite;
  display: inline-block;
}

/*
 * 先頭で止まる(15%) → 末尾までゆっくり進む(60%) → 末尾で止まる(15%) → 先頭へ速く巻き戻す(10%)。
 * 往復ではなく、読み終えたら先頭からもう一度読める(2026-09-05 ユーザー指示)
 */
@keyframes marquee-scroll {
  0%,
  15% {
    transform: translateX(0);
  }

  75%,
  90% {
    transform: translateX(var(--shift));
  }

  100% {
    transform: translateX(0);
  }
}

/* 動きを減らす設定では静止し、従来どおり省略記号で示す */
@media (prefers-reduced-motion: reduce) {
  .marquee.scrolling {
    text-overflow: ellipsis;
  }

  .marquee.scrolling .marquee-inner {
    animation: none;
    display: inline;
  }
}
</style>
