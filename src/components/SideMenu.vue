<script setup lang="ts">
import { onUnmounted, watch } from "vue";

import { acquireModalChrome } from "../composables/useModalChrome";

/**
 * ヘッダ右上のハンバーガーから開く右サイドバー(2026-09-07 ユーザー指示)。
 * 本線の外の入口(仮想ガチャ・ソースコード)を置く。閉じる手段は 3 つ —
 * ✕ に変わったハンバーガー自体(App.vue 側)・サイドバーの外側のタップ・Escape。
 * ヘッダには掛けず(top = ヘッダ下端)、地は少し透過させて背後を透かす(2026-09-07 ユーザー指示)。
 * 常時マウントし、open で transform を切り替えて右からスライドさせる
 */
const props = defineProps<{
  open: boolean;
  /** 上端(px)。ヘッダの下端に合わせて App.vue が渡す */
  top: number;
}>();
const emit = defineEmits<{ close: []; gacha: [] }>();

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

/* 右から出るシート。地は少し透過させ、背後はぼかして文字を読みやすく保つ */
.drawer {
  backdrop-filter: blur(14px);
  background: color-mix(in srgb, var(--surface) 82%, transparent);
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
  list-style: none;
  margin: 0;
  padding: 8px 0;
}

/* 1 行 1 項目。アイコンは左の固定列、ラベルは 16px/700(ホロメン一覧の行と同じ高さ 56px) */
.item {
  align-items: center;
  background: none;
  border: none;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-size: 16px;
  font-weight: 700;
  gap: 16px;
  height: 56px;
  padding: 0 20px;
  text-align: left;
  text-decoration: none;
  text-shadow: 0 1px 2px var(--surface); /* 透過地の上でも輪郭が沈まないように */
  width: 100%;
}

.item:active {
  background: var(--bg);
}

.item-icon {
  color: var(--ink-2);
  flex-shrink: 0;
}

@media (prefers-reduced-motion: reduce) {
  .scrim,
  .drawer {
    transition: none;
  }
}
</style>
