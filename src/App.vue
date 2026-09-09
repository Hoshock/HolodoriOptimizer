<script setup lang="ts">
import { ref, useTemplateRef, watchEffect } from "vue";

import AdminPanel from "./components/AdminPanel.vue";
import CardDetail from "./components/CardDetail.vue";
import CardPicker from "./components/CardPicker.vue";
import GachaModal from "./components/GachaModal.vue";
import OptimizerPanel from "./components/OptimizerPanel.vue";
import SideMenu from "./components/SideMenu.vue";
import SongDetail from "./components/SongDetail.vue";
import SongPicker from "./components/SongPicker.vue";
import { useDarkMode } from "./composables/useDarkMode";
import { useOkayuMode } from "./composables/useOkayuMode";
import { applyPalette, modeOf } from "./composables/usePalette";

// ヘッダ右上のハンバーガー → 右のサイドメニュー(カード一覧・曲一覧・仮想ガチャ・ソースコード・おかゆモード。2026-09-07 ユーザー指示)。
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

/** メニューから開く一覧(カード / 曲)と、その上に重ねる詳細 */
const browse = ref<"cards" | "songs" | null>(null);
const detailCardId = ref<string | null>(null);
const detailSongId = ref<string | null>(null);
const gachaOpen = ref(false);
const adminOpen = ref(false);
function openBrowse(kind: "cards" | "songs"): void {
  menuOpen.value = false;
  browse.value = kind;
}
function openGacha(): void {
  menuOpen.value = false;
  gachaOpen.value = true;
}
function openAdmin(): void {
  menuOpen.value = false;
  adminOpen.value = true;
}

/*
 * ダークモード(2026-09-09 ユーザー指示): 入口はサイドメニュー最下部、おかゆモードの上の 1 行。
 * ON のあいだ :root に dark-mode を付けてトークンを差し替える。既定はライトで、状態は保存する。
 * 切り替えてもメニューは閉じない — 配色の変化はメニュー自身にも出るので、そこで見比べられる
 */
const dark = useDarkMode();
watchEffect(() => {
  document.documentElement.classList.toggle("dark-mode", dark.active.value);
});

// おかゆモード: 入口はサイドメニュー最下部の 1 行。ON のあいだ :root に okayu-mode を付けて配色を切り替える
const okayu = useOkayuMode();
watchEffect(() => {
  document.documentElement.classList.toggle("okayu-mode", okayu.active.value);
});
/*
 * 管理用画面（AdminSheet）で上書きした配色を、いまのモードのぶんだけ :root へ当てる。
 * モードのクラスが決まったあとに走らせる（既定値の読み取りがクラスに依存する）
 */
watchEffect(() => {
  applyPalette(modeOf(dark.active.value, okayu.active.value));
});

// 切り替えたらメニューを閉じてページ先頭へ戻す(変わった配色と枠の状態を先頭から見せる。OFF も同様)
function toggleOkayu(): void {
  okayu.toggle();
  menuOpen.value = false;
  window.scrollTo(0, 0);
}
</script>

<template>
  <div class="page">
    <header ref="siteHead" class="site-head">
      <div class="site-head-row">
        <h1>ホロドリ編成お助けツール</h1>
        <!-- 3 本線。メニューが開いている間は同じ場所で ✕ に変わり、押すと閉じる(✕ の形は CloseButton と同じ) -->
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

    <SideMenu
      :open="menuOpen"
      :top="menuTop"
      :okayu="okayu.active.value"
      :dark="dark.active.value"
      @close="menuOpen = false"
      @cards="openBrowse('cards')"
      @songs="openBrowse('songs')"
      @gacha="openGacha"
      @admin="openAdmin"
      @okayu="toggleOkayu"
      @dark="dark.toggle"
    />
    <CardPicker
      v-if="browse === 'cards'"
      title="カード一覧"
      mode="pick"
      skill-view="member"
      memory-key="browse-cards"
      @pick="detailCardId = $event"
      @close="browse = null"
    />
    <CardDetail v-if="detailCardId !== null" :card-id="detailCardId" @close="detailCardId = null" />
    <SongPicker
      v-if="browse === 'songs'"
      title="曲一覧"
      :selected-id="null"
      @pick="detailSongId = $event"
      @close="browse = null"
    />
    <SongDetail v-if="detailSongId !== null" :song-id="detailSongId" @close="detailSongId = null" />
    <GachaModal v-if="gachaOpen" @close="gachaOpen = false" />
    <AdminPanel v-if="adminOpen" @close="adminOpen = false" />

    <footer class="site-footer">
      <p>
        本ツールはファンによる非公式ツールであり、カバー株式会社・株式会社QualiArtsとは一切関係ありません。ゲーム内の名称等の権利はすべて各権利者に帰属します。スコアはコミュニティの解析に基づく試算値であり、実際のゲーム内の値と異なる場合があります。仮想ガチャは実際の課金・排出とは無関係のシミュレーションです。権利者からの要請があれば速やかに公開を停止します。
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

/* ヘッダは本文の面と地を変えて境目を見せる(2026-09-09 ユーザー指示) */
.site-head {
  background: var(--chrome-head);
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

/* メニューの入口(ヘッダ右上の 44px 正円。寸法は CloseButton と同じ)。地は本文の面 —
   ヘッダが --chrome になったので、円だけは面の色にして押せることを示す */
.menu-button {
  align-items: center;
  background: var(--surface);
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

/* 3 本線 → ✕: 上下の線を中央へ寄せて 45° 回し、中央の線は消す(✕ の形は CloseButton と一致) */
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

/* フッタは免責のみ(データ確認日・GitHub リンクは削除、おかゆモードはサイドメニューへ — 2026-09-07)。
   地はヘッダと同じ --chrome(2026-09-09 ユーザー指示「メインの注釈のフッタの背景色も」) */
.site-footer {
  background: var(--chrome-foot);
  border-top: 1px solid var(--line);
  color: var(--ink-2);
  font-size: 12px;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.site-footer p {
  margin: 0;
}
</style>
