<script setup lang="ts">
import { onUnmounted, reactive, watch } from "vue";

import { acquireModalChrome } from "../composables/useModalChrome";

/**
 * ヘッダ右上のハンバーガーから開く右サイドバー(2026-09-07 ユーザー指示)。1 本のリストで、セパレータは置かない
 * (2026-09-11 ユーザー指示「境目の感覚が一定じゃない。セパレータをやめて折り畳みをグループごとに作ろう」):
 * 1 つめ(折り畳みなし) = お気に入り / カード一覧 / 曲一覧 / データの取り込み / データの出力 / ダークモード、
 * 2 つめ = 「おまけ機能」(折り畳み) = 仮想ガチャ / 絶対おかゆんモード、3 つめ = 「開発用」(折り畳み) = GitHub / カラー確認 /
 * ホロメンボード。折り畳みは最初は畳み、開くと一段下げた項目(アイコン + 内容)が出て、その位置より下の行が下へ動く
 * (下端に貼り付けない)。閉じる手段は 3 つ — ✕ に変わったハンバーガー自体(App.vue 側)・サイドバーの外側のタップ・Escape。
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
  favorites: [];
  importData: [];
  exportData: [];
  cards: [];
  songs: [];
  gacha: [];
  admin: [];
  boards: [];
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

/** 折り畳みグループ(おまけ機能 / 開発用)の開閉。最初は畳み、メニューを閉じたら畳み直す */
const groups = reactive({ extras: false, dev: false });
watch(
  () => props.open,
  (open) => {
    if (!open) {
      groups.extras = false;
      groups.dev = false;
    }
  },
);
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
          <button type="button" class="item" @click="emit('favorites')">
            <!-- お気に入り: 星(結果の 1 件の登録ボタンと同じメタファー) -->
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
              <path
                d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"
              />
            </svg>
            <span>お気に入り</span>
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
          <button type="button" class="item" @click="emit('exportData')">
            <!-- 出力: 受け皿から上向きの矢印(取り込みの矢印を上下反転) -->
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
              <path d="M12 13V3" />
              <path d="M8 6.5l4-4 4 4" />
              <path d="M4 16v3.5h16V16" />
            </svg>
            <span>データの出力</span>
          </button>
        </li>
        <li>
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
        </li>
        <!-- 2 つめのグループ「おまけ機能」(折り畳み。最初は畳む): 仮想ガチャ / 絶対おかゆんモード。アイコンは贈り物の箱 -->
        <li>
          <button
            type="button"
            class="item"
            :aria-expanded="groups.extras"
            aria-controls="group-extras"
            @click="groups.extras = !groups.extras"
          >
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
              <rect x="3" y="8.5" width="18" height="12.5" rx="2" />
              <path d="M12 8.5V21M3 13.5h18" />
              <path
                d="M12 8.5c-1.5-3.5-6-4-6-1.5S10 8.5 12 8.5zm0 0c1.5-3.5 6-4 6-1.5S14 8.5 12 8.5z"
              />
            </svg>
            <span>おまけ機能</span>
            <!-- 右端の山形: 閉じているとき下向き、開くと上向きに回る -->
            <svg
              class="chevron"
              :class="{ open: groups.extras }"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <!-- 折り畳みの中身: 一段下げた項目(アイコン + 内容)。高さは grid の 0fr ⇄ 1fr で開閉し、下の行を押し下げる -->
          <div :id="`group-extras`" class="fold" :class="{ open: groups.extras }">
            <ul class="sub-items" :inert="!groups.extras">
              <li>
                <button type="button" class="sub-item" @click="emit('gacha')">
                  <!-- 仮想ガチャ: ダイヤ -->
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
                    <path d="M7 4h10l4 6-9 10-9-10z" />
                    <path d="M3 10h18" />
                    <path d="M9.5 4 12 10l2.5-6" />
                    <path d="M8 10l4 10 4-10" />
                  </svg>
                  <span>仮想ガチャ</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  class="sub-item"
                  :aria-pressed="props.okayu"
                  @click="emit('okayu')"
                >
                  <!-- おにぎり単体(丸で囲まない — 2026-09-07 ユーザー指示。形は SkillIcon の okayu と同じ) -->
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
                  <span>{{
                    props.okayu ? "絶対おかゆんモードをOFF" : "絶対おかゆんモードをON"
                  }}</span>
                </button>
              </li>
            </ul>
          </div>
        </li>
        <!-- 3 つめのグループ「開発用」(折り畳み。最初は畳む): GitHub / カラー確認 / ホロメンボード。アイコンはコードの括弧 -->
        <li>
          <button
            type="button"
            class="item"
            :aria-expanded="groups.dev"
            aria-controls="group-dev"
            @click="groups.dev = !groups.dev"
          >
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
              <path d="M8 7l-5 5 5 5" />
              <path d="M16 7l5 5-5 5" />
              <path d="M14 4l-4 16" />
            </svg>
            <span>開発用</span>
            <!-- 右端の山形: 閉じているとき下向き、開くと上向きに回る -->
            <svg
              class="chevron"
              :class="{ open: groups.dev }"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <!-- 折り畳みの中身: 一段下げた項目(アイコン + 内容)。高さは grid の 0fr ⇄ 1fr で開閉し、下の行を押し下げる -->
          <div :id="`group-dev`" class="fold" :class="{ open: groups.dev }">
            <ul class="sub-items" :inert="!groups.dev">
              <li>
                <a
                  class="sub-item"
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
                  <span>GitHub</span>
                </a>
              </li>
              <li>
                <button type="button" class="sub-item" @click="emit('admin')">
                  <!-- カラー確認: パレット -->
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
                    <path
                      d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-2 0-.6-.2-1-.5-1.4-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h1.8c2.3 0 4.2-1.9 4.2-4.2C21 6.3 17 3 12 3z"
                    />
                    <circle cx="7.5" cy="12" r="1.2" />
                    <circle cx="10" cy="7.8" r="1.2" />
                    <circle cx="15" cy="7.5" r="1.2" />
                  </svg>
                  <span>カラー確認</span>
                </button>
              </li>
              <li>
                <button type="button" class="sub-item" @click="emit('boards')">
                  <!-- ホロメンボード: 3 マスを線で繋いだ図 -->
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
                    <circle cx="12" cy="5" r="2.2" />
                    <circle cx="6" cy="18" r="2.2" />
                    <circle cx="18" cy="18" r="2.2" />
                    <path d="M12 7.2v3.8M12 11l-5 5M12 11l5 5" />
                  </svg>
                  <span>ホロメンボード</span>
                </button>
              </li>
            </ul>
          </div>
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

/* 1 本のリスト(折り畳みを開いた分だけ下の行が下へ動く)。最下部は安全領域ぶんの余白を持つ */
.items {
  flex: 1;
  list-style: none;
  margin: 0;
  overflow-y: auto;
  padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
}

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

/* 折り畳みの山形は行の右端に寄せる */
.chevron {
  color: var(--ink-2);
  flex-shrink: 0;
  margin-left: auto;
  transition: transform 0.25s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

/* 折り畳み: grid-template-rows を 0fr → 1fr にして高さを滑らかに開く */
.fold {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.25s ease;
}

.fold.open {
  grid-template-rows: 1fr;
}

.sub-items {
  list-style: none;
  margin: 0;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}

/* 折り畳みの項目: 親の行を一段(24px)右へ下げ、同じ並び(アイコン列 + 内容)。親より 1 段小さい文字(15px / 600・48px) */
.sub-item {
  align-items: center;
  background: none;
  border: none;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-size: 15px;
  font-weight: 600;
  gap: 14px;
  height: 48px;
  padding: 0 20px 0 44px;
  text-align: left;
  text-decoration: none;
  width: 100%;
}

@media (prefers-reduced-motion: reduce) {
  .scrim,
  .drawer,
  .chevron,
  .fold {
    transition: none;
  }
}
</style>
