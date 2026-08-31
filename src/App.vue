<script setup lang="ts">
import { ref } from "vue";

import OptimizerPanel from "./components/OptimizerPanel.vue";
import { datasetMeta } from "./data";

/** 探索対象のカードプール(タブで切替)。all = 全カード / owned = 持っているカード */
type SearchMode = "all" | "owned";
const mode = ref<SearchMode>("all");
</script>

<template>
  <div class="page">
    <header class="site-head">
      <h1>ホロドリ最適化ツール</h1>
      <p class="tagline">『hololive Dreams』のユニット編成をいちばんスコアが出る形に。</p>
    </header>

    <main class="content">
      <div class="mode-tabs" role="tablist" aria-label="さがす対象のカード">
        <button
          type="button"
          role="tab"
          class="mode-tab"
          :aria-selected="mode === 'all'"
          :class="{ active: mode === 'all' }"
          @click="mode = 'all'"
        >
          全カード
        </button>
        <button
          type="button"
          role="tab"
          class="mode-tab"
          :aria-selected="mode === 'owned'"
          :class="{ active: mode === 'owned' }"
          @click="mode = 'owned'"
        >
          持っているカード
        </button>
      </div>

      <!-- v-show でタブ切替時も両タブの編成・結果を保持する -->
      <OptimizerPanel v-show="mode === 'all'" variant="all" />
      <OptimizerPanel v-show="mode === 'owned'" variant="owned" />
    </main>

    <footer class="site-footer">
      <p>
        本ツールはファンによる非公式ツールであり、カバー株式会社・株式会社QualiArtsとは一切関係ありません。ゲーム内の名称等の権利はすべて各権利者に帰属します。スコアはコミュニティの解析に基づく試算値であり、実際のゲーム内の値と異なる場合があります。権利者からの要請があれば速やかに公開を停止します。
      </p>
      <p>
        データ確認日: {{ datasetMeta.asOf }} /
        <a
          href="https://github.com/Hoshock/HolodoriOptimizer"
          rel="noopener noreferrer"
          target="_blank"
          >ソースコード (GitHub)</a
        >
      </p>
    </footer>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.site-head {
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  padding: 20px 16px 16px;
}

.site-head h1 {
  font-size: 24px;
  font-weight: 900;
  line-height: 1.35;
  margin: 0;
}

.tagline {
  color: var(--ink-2);
  font-size: 13px;
  margin: 4px 0 0;
}

.content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  margin: 0 auto;
  max-width: 44rem;
  padding: 16px;
  width: 100%;
}

/* さがす対象の切替タブ(ピッカーのセグメンテッドコントロールと同形) */
.mode-tabs {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  overflow: hidden;
}

.mode-tab {
  background: var(--surface);
  border: none;
  border-left: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
}

.mode-tab:first-child {
  border-left: none;
}

.mode-tab.active {
  background: var(--ink);
  color: #fff;
  font-weight: 700;
}

.site-footer {
  border-top: 1px solid var(--line);
  color: var(--ink-2);
  font-size: 12px;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.site-footer p {
  margin: 4px 0;
}
</style>
