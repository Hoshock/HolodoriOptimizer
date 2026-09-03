<script setup lang="ts">
import { ref, watchEffect } from "vue";

import GachaModal from "./components/GachaModal.vue";
import OptimizerPanel from "./components/OptimizerPanel.vue";
import SkillIcon from "./components/SkillIcon.vue";
import { useOkayuMode } from "./composables/useOkayuMode";
import { datasetMeta } from "./data";

const gachaOpen = ref(false);

// おかゆモード: 入口はフッター右下のおにぎり。ON のあいだ :root に okayu-mode を付けて配色を切り替える
const okayu = useOkayuMode();
watchEffect(() => {
  document.documentElement.classList.toggle("okayu-mode", okayu.active.value);
});
</script>

<template>
  <div class="page">
    <header class="site-head">
      <div class="site-head-row">
        <h1>ホロドリ編成お助けツール</h1>
        <button
          type="button"
          class="gacha-button"
          aria-label="仮想ガチャ"
          @click="gachaOpen = true"
        >
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M7 4h10l4 6-9 10-9-10z" />
            <path d="M3 10h18" />
            <path d="M9.5 4 12 10l2.5-6" />
            <path d="M8 10l4 10 4-10" />
          </svg>
        </button>
      </div>
    </header>

    <main class="content">
      <OptimizerPanel />
    </main>

    <GachaModal v-if="gachaOpen" @close="gachaOpen = false" />

    <footer class="site-footer">
      <p>
        本ツールはファンによる非公式ツールであり、カバー株式会社・株式会社QualiArtsとは一切関係ありません。ゲーム内の名称等の権利はすべて各権利者に帰属します。スコアはコミュニティの解析に基づく試算値であり、実際のゲーム内の値と異なる場合があります。仮想ガチャは実際の課金・排出とは無関係のシミュレーションです。権利者からの要請があれば速やかに公開を停止します。
      </p>
      <p>
        データ確認日: {{ datasetMeta.asOf }} /
        <a
          href="https://github.com/Hoshock/HolodoriOptimizer"
          rel="noopener noreferrer"
          target="_blank"
          >ソースコード（GitHub）</a
        >
      </p>
      <div class="footer-tail">
        <button
          type="button"
          class="okayu-button"
          :class="{ active: okayu.active.value }"
          :aria-pressed="okayu.active.value"
          aria-label="おかゆモード"
          @click="okayu.toggle()"
        >
          <SkillIcon kind="okayu" />
        </button>
      </div>
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
  padding: 16px;
}

.site-head-row {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.site-head h1 {
  font-size: 24px;
  font-weight: 900;
  line-height: 1.35;
  margin: 0;
}

/* 仮想ガチャの入口(ヘッダ右上のアイコン) */
.gacha-button {
  align-items: center;
  background: var(--bg);
  border: none;
  border-radius: 50%;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  height: 44px;
  justify-content: center;
  width: 44px;
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

.site-footer {
  border-top: 1px solid var(--line);
  color: var(--ink-2);
  font-size: 12px;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.site-footer p {
  margin: 4px 0;
}

/* おかゆモードの入口: ページ最下部の一番右に置くおにぎり(説明テキストなし) */
.footer-tail {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.okayu-button {
  align-items: center;
  background: none;
  border: none;
  color: var(--ink-2);
  cursor: pointer;
  display: flex;
  height: 44px;
  justify-content: center;
  margin-right: -9px; /* アイコンの右端を本文の右端に揃える(44px のタップ領域は保つ) */
  padding: 0;
  width: 44px;
}

.okayu-button.active {
  color: var(--primary);
}

.okayu-button:active {
  color: var(--ink);
}
</style>
