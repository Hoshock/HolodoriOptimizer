<script setup lang="ts">
import { computed } from "vue";

import { useCopyTuning } from "../composables/useCopyTuning";
import { GUIDE_LINK_PATHS, linesOf } from "../ui/copyTuning";

/**
 * ページ下端（結果の下・免責フッタの上）に置く、このツールの説明（2026-09-14 ユーザー指示。
 * 「編成シミュレーター」で探して来た人に、開いた画面が何なのかを言葉でも示す）。
 * 入力の導線を押し下げないように本線の一番下に置き、検索用の隠しテキストは使わない
 * （見えている本文だけで、実装にある機能だけを書く）。
 *
 * 文言と位置は開発用の「文言・配置」で実機のまま差し替えられる（既定値は `src/ui/copyTuning.ts`）。
 * 出す / 出さないと上下の位置は `App.vue` が見る
 */
const BASE = import.meta.env.BASE_URL;

const { tuning } = useCopyTuning();
/** 見出しは改行が折り返しの位置（まとまりの中では折り返さない） */
const headingLines = computed(() => linesOf(tuning.value.heading));
const features = computed(() => linesOf(tuning.value.features));
const links = computed(() =>
  GUIDE_LINK_PATHS.map((path, index) => ({
    href: `${BASE}${path}`,
    label: linesOf(tuning.value.linkLabels)[index] ?? "",
  })).filter((link) => link.label !== ""),
);
</script>

<template>
  <section class="panel about" aria-labelledby="about-heading">
    <!-- 「編成シミュレーター」の途中で折り返さないよう、意味のまとまりごとに折り返し位置を決める -->
    <h2 id="about-heading">
      <span v-for="line in headingLines" :key="line">{{ line }}</span>
    </h2>
    <p>{{ tuning.lead }}</p>

    <template v-if="features.length > 0">
      <h3>{{ tuning.featuresTitle }}</h3>
      <ul>
        <li v-for="feature in features" :key="feature">{{ feature }}</li>
      </ul>
    </template>

    <ul v-if="links.length > 0" class="guide-links">
      <li v-for="link in links" :key="link.href">
        <a :href="link.href">{{ link.label }}</a>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* 入力の本線より控えめに見せる（文字は本文サイズのまま、見出しだけステップと同じ 18px） */
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-card);
  padding: 16px;
}

.about h2 {
  font-size: 18px;
  margin: 0 0 8px;
}

/* まとまりの中では折り返さない（狭い画面で「編成シ / ミュレーター」と割れるのを防ぐ） */
.about h2 span {
  display: inline-block;
}

.about h3 {
  font-size: 15px;
  margin: 16px 0 4px;
}

.about p {
  margin: 0;
}

.about ul {
  margin: 4px 0 0;
  padding-left: 1.3em;
}

.about li {
  margin: 2px 0;
}

.guide-links {
  border-top: 1px solid var(--line);
  list-style: none;
  margin-top: 16px;
  padding: 12px 0 0;
}
</style>
