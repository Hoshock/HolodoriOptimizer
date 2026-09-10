<script setup lang="ts">
import { onUnmounted, watch } from "vue";

import { acquireModalChrome } from "../composables/useModalChrome";

/**
 * ヘッダ右上のハンバーガーから開く右サイドバー(2026-09-07 ユーザー指示)。
 * 一番上に「データの取り込み」、続いて一覧・遊び機能(カード一覧・曲一覧・仮想ガチャ)を上に、
 * ソースコード・管理用画面はセパレータで区切って下に寄せ(2026-09-10 ユーザー指示)、
 * モードの切替(ダークモード → 絶対おかゆんモードの順)を一番下(一覧がスクロールしても常に最下部)に置く。閉じる手段は 3 つ —
 * ✕ に変わったハンバーガー自体(App.vue 側)・サイドバーの外側のタップ・Escape。
 * ヘッダには掛けず(top = ヘッダ下端)、地は不透過(透過は「やっぱ透過しないように」で撤回 — 2026-09-07)。
 * 背後は scrim で少し暗くする(「とてもいい」)。
 * 常時マウントし、open で transform を切り替えて右からスライドさせる
 */
const props = defineProps<{
  open: boolean;
  /** 上端(px)。ヘッダの下端に合わせて App.vue が渡す */
  top: number;
  /** おかゆモードが ON か(ラベルを ON / OFF で切り替える) */
  okayu: boolean;
  /** ダークモードが ON か(ラベルを切り替え先の名前にする) */
  dark: boolean;
}>();
const emit = defineEmits<{
  close: [];
  importData: [];
  cards: [];
  songs: [];
  gacha: [];
  admin: [];
  okayu: [];
  dark: [];
}>();

// 開いている間だけ背景スクロールをロックし、Escape で閉じる(モーダルと同じ振る舞い)
let chrome: { release: () => void } | null = null;
watch(
  () => props.open,
  (open) => {
    if (open && chrome === null) chrome = acquireModalChrome(() => emit("close"));
    else if (!open && chrome !== null) {
      chrome.release();
      chrome = null;
    }
  },
  { immediate: true },
);
onUnmounted(() => chrome?.release());
</script>

<template>
  <div
    class="menu-root"
    :class="{ open: props.open }"
    :style="{ top: `${String(props.top)}px` }"
    :aria-hidden="!props.open"
  >
    <div class="scrim" @click="emit('close')"></div>
    <nav class="drawer" aria-label="メニュー" :inert="!props.open">
      <ul class="items">
        <li>
          <button type="button" class="item" @click="emit('importData')">
            <!-- 取り込み: 受け皿へ下向きの矢印 -->
            <svg
              class="item-icon"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3v10" />
              <path d="M8 9.5l4 4 4-4" />
              <path d="M4 16v3.5h16V16" />
            </svg>
            <span>データの取り込み</span>
          </button>
        </li>
        <li>
          <button type="button" class="item" @click="emit('cards')">
            <!-- カード: 縦長の角丸カード -->
            <svg
              class="item-icon"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="5" y="3" width="14" height="18" rx="2" />
              <path d="M8.5 15.5h7" />
              <path d="M8.5 18h4" />
            </svg>
            <span>カード一覧</span>
          </button>
        </li>
        <li>
          <button type="button" class="item" @click="emit('songs')">
            <!-- 曲: 音符 -->
            <svg
              class="item-icon"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M9 18V5l11-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="17" cy="16" r="3" />
            </svg>
            <span>曲一覧</span>
          </button>
        </li>
        <li>
          <button type="button" class="item" @click="emit('gacha')">
            <svg
              class="item-icon"
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
            <span>仮想ガチャ</span>
          </button>
        </li>
      </ul>

      <!--
        2 つめの区分: モード切替。上がダークモード、下が絶対おかゆんモード
        (2026-09-09 ユーザー指定「絶対おかゆんモードの上におこう。セパレータより下」)。
        ダークモードのラベルは切り替え先の名前(ライトなら「ダークモード」)、アイコンは月と太陽
      -->
      <div class="modes">
        <button type="button" class="item" :aria-pressed="props.dark" @click="emit('dark')">
          <svg
            class="item-icon"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <!-- ライトのときは行き先(ダーク)の月、ダークのときは行き先(ライト)の太陽 -->
            <path v-if="!props.dark" d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
            <template v-else>
              <circle cx="12" cy="12" r="4.5" />
              <path
                d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"
              />
            </template>
          </svg>
          <span>{{ props.dark ? "ライトモード" : "ダークモード" }}</span>
        </button>
        <button type="button" class="item" :aria-pressed="props.okayu" @click="emit('okayu')">
          <!-- おにぎり単体(他の項目と同じく丸で囲まない — 2026-09-07 ユーザー指示。形は SkillIcon の okayu と同じ) -->
          <svg
            class="item-icon okayu-icon"
            :class="{ active: props.okayu }"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path
              d="M12 4.5c1 0 1.9.5 2.4 1.4l5.4 9c.9 1.5-.2 3.6-2 3.6H6.2c-1.8 0-2.9-2.1-2-3.6l5.4-9c.5-.9 1.4-1.4 2.4-1.4z"
            />
            <path d="M9 18.5v-4h6v4" />
          </svg>
          <span>{{ props.okayu ? "絶対おかゆんモードをOFF" : "絶対おかゆんモードをON" }}</span>
        </button>
      </div>
      <!--
        一番下(スクロールしても最下部)の区分: 外部リンクと管理用。本線の入口ではないので下端へ寄せる
        (2026-09-10 ユーザー指示。同日「サイドバーの 2 つめと 3 つめの区分入れかえよう」でモード切替の下へ)
      -->
      <ul class="tools">
        <li>
          <a
            class="item"
            href="https://github.com/Hoshock/HolodoriOptimizer"
            rel="noopener noreferrer"
            target="_blank"
          >
            <!-- GitHub のマーク(リンク先を示す用途。https://github.com/logos の利用範囲内) -->
            <svg
              class="item-icon"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.17c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"
              />
            </svg>
            <span>ソースコード（GitHub）</span>
          </a>
        </li>
        <li>
          <button type="button" class="item" @click="emit('admin')">
            <!-- 管理用: スライダー(調整のメタファー) -->
            <svg
              class="item-icon"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
              <circle cx="9" cy="7" r="2.2" />
              <circle cx="15" cy="12" r="2.2" />
              <circle cx="7" cy="17" r="2.2" />
            </svg>
            <span>管理用画面</span>
          </button>
        </li>
      </ul>
    </nav>
  </div>
</template>

<style scoped>
.menu-root {
  bottom: 0;
  left: 0;
  pointer-events: none;
  position: fixed;
  right: 0;
  z-index: 20; /* ピッカー・ボード(10・11)より上。top はヘッダ下端(inline style) */
}

.menu-root.open {
  pointer-events: auto;
}

.scrim {
  background: rgba(35, 48, 61, 0.3);
  inset: 0;
  opacity: 0;
  position: absolute;
  transition: opacity 0.25s ease;
}

.menu-root.open .scrim {
  opacity: 1;
}

/* 右から出るシート(地は不透過) */
.drawer {
  background: var(--surface);
  bottom: 0;
  box-shadow: -8px 0 24px rgba(35, 48, 61, 0.16);
  display: flex;
  flex-direction: column;
  position: absolute;
  right: 0;
  top: 0;
  transform: translateX(100%);
  transition: transform 0.25s ease;
  width: min(80vw, 300px);
}

.menu-root.open .drawer {
  transform: translateX(0);
}

.items {
  flex: 1;
  list-style: none;
  margin: 0;
  overflow-y: auto;
  padding: 8px 0;
}

/* 3 つめの区分: 外部リンク・管理用。最下部なので安全領域ぶんの余白を持つ */
.tools {
  border-top: 1px solid var(--line);
  flex-shrink: 0;
  list-style: none;
  margin: 0;
  padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
}

/* 2 つめの区分: モード切替 */
.modes {
  border-top: 1px solid var(--line);
  flex-shrink: 0;
  padding: 8px 0;
}

/* 1 行 1 項目。アイコンは左の固定列(26px)、ラベルは 16px/700(ホロメン一覧の行と同じ高さ 56px) */
.item {
  align-items: center;
  background: none;
  border: none;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-size: 16px;
  font-weight: 700;
  gap: 14px;
  height: 56px;
  padding: 0 20px;
  text-align: left;
  text-decoration: none;
  width: 100%;
}

.item-icon {
  align-items: center;
  color: var(--ink-2);
  display: flex;
  flex-shrink: 0;
  justify-content: center;
  width: 26px;
}

.okayu-icon.active {
  color: var(--primary);
}

@media (prefers-reduced-motion: reduce) {
  .scrim,
  .drawer {
    transition: none;
  }
}
</style>
