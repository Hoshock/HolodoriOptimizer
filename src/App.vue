<script setup lang="ts">
import { ref, useTemplateRef, watchEffect } from "vue";

import GachaModal from "./components/GachaModal.vue";
import OptimizerPanel from "./components/OptimizerPanel.vue";
import SideMenu from "./components/SideMenu.vue";
import SkillIcon from "./components/SkillIcon.vue";
import { useOkayuMode } from "./composables/useOkayuMode";
import { datasetMeta } from "./data";

// ヘッダ右上のハンバーガー → 右のサイドメニュー(仮想ガチャ・ソースコードの入口。2026-09-07 ユーザー指示)。
// サイドメニューはヘッダに掛けない: 開く瞬間のヘッダ下端を測って、その下から出す(開いている間はスクロールロック中なので動かない)
const siteHead = useTemplateRef("siteHead");
const menuOpen = ref(false);
const menuTop = ref(0);
function toggleMenu(): void {
  if (!menuOpen.value) {
    menuTop.value = Math.max(0, siteHead.value?.getBoundingClientRect().bottom ?? 0);
  }
  menuOpen.value = !menuOpen.value;
}
const gachaOpen = ref(false);
function openGacha(): void {
  menuOpen.value = false;
  gachaOpen.value = true;
}

// おかゆモード: 入口はフッター右下のおにぎり。ON のあいだ :root に okayu-mode を付けて配色を切り替える
const okayu = useOkayuMode();
watchEffect(() => {
  document.documentElement.classList.toggle("okayu-mode", okayu.active.value);
});
// 切り替えたらページ先頭へ戻す(入口が最下部にあり、変わった配色と枠の状態を先頭から見せる。OFF も同様)
function toggleOkayu(): void {
  okayu.toggle();
  window.scrollTo(0, 0);
}
</script>

<template>
  <div class="page">
    <header ref="siteHead" class="site-head">
      <div class="site-head-row">
        <h1>ホロドリ編成お助けツール</h1>
        <!-- 3 本線。メニューが開いている間は同じ場所で ✕ に変わり、押すと閉じる -->
        <button
          type="button"
          class="menu-button"
          :class="{ open: menuOpen }"
          :aria-expanded="menuOpen"
          :aria-label="menuOpen ? 'メニューを閉じる' : 'メニュー'"
          @click="toggleMenu"
        >
          <span class="bar" aria-hidden="true"></span>
          <span class="bar" aria-hidden="true"></span>
          <span class="bar" aria-hidden="true"></span>
        </button>
      </div>
    </header>

    <main class="content">
      <OptimizerPanel />
    </main>

    <SideMenu :open="menuOpen" :top="menuTop" @close="menuOpen = false" @gacha="openGacha" />
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
          @click="toggleOkayu"
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

/* メニューの入口(ヘッダ右上の 44px 正円) */
.menu-button {
  align-items: center;
  background: var(--bg);
  border: none;
  border-radius: 50%;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 5px;
  height: 44px;
  justify-content: center;
  padding: 0;
  width: 44px;
}

.menu-button:active {
  background: var(--line);
}

.bar {
  background: currentColor;
  border-radius: 1px;
  display: block;
  height: 2px;
  transition:
    transform 0.25s ease,
    opacity 0.2s ease;
  width: 18px;
}

/* 3 本線 → ✕: 上下の線を中央へ寄せて 45° 回し、中央の線は消す */
.menu-button.open .bar:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}

.menu-button.open .bar:nth-child(2) {
  opacity: 0;
  transform: scaleX(0);
}

.menu-button.open .bar:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

@media (prefers-reduced-motion: reduce) {
  .bar {
    transition: none;
  }
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
