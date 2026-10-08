<script setup lang="ts">
import { useModalChrome } from "../composables/useModalChrome";

/**
 * 育成プランの条件の「頻度マスの数」(2026-10-08 ユーザー指示で、条件のタブの中の一覧から 1 行 + 中央のダイアログへ移した — めったに使わないので
 * 条件のタブを長くしない)。メンバーごとに おまかせ / 0〜3 マス を選ぶ。名前は 1 行を取り、セグメントはその下(可変長の名前と固定幅の
 * コントロールを同じ行に並べない — `ui-design.md`)。選んだ時点で親の値が変わり、「閉じる」で閉じる。説明文は置かない
 */
const props = defineProps<{
  members: readonly { id: string; name: string }[];
  /** メンバー(ホロメン ID)ごとに固定した頻度マスの数(ない = おまかせ) */
  fixed: Readonly<Record<string, number>>;
}>();

const emit = defineEmits<{ set: [holomenId: string, value: number | null]; close: [] }>();

/** 固定の選択肢(おまかせ = null / 頻度マスの数) */
const CHOICES: { value: number | null; label: string }[] = [
  { value: null, label: "おまかせ" },
  { value: 0, label: "0マス" },
  { value: 1, label: "1マス" },
  { value: 2, label: "2マス" },
  { value: 3, label: "3マス" },
];

// 背景が見えるダイアログなのでスクロールロックはかけない(ConfirmDialog と同じ)
useModalChrome(() => emit("close"), { lockScroll: false });
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="frequency-fix-title">
      <h3 id="frequency-fix-title">頻度マスの数</h3>
      <div v-for="m in props.members" :key="m.id" class="member">
        <span class="name">{{ m.name }}</span>
        <div class="segment" role="radiogroup" :aria-label="`${m.name}の頻度マスの数`">
          <button
            v-for="c in CHOICES"
            :key="String(c.value)"
            type="button"
            class="seg"
            role="radio"
            :aria-checked="(props.fixed[m.id] ?? null) === c.value"
            :class="{ 'seg-active': (props.fixed[m.id] ?? null) === c.value }"
            @click="emit('set', m.id, c.value)"
          >
            {{ c.label }}
          </button>
        </div>
      </div>
      <button type="button" class="close" @click="emit('close')">閉じる</button>
    </div>
  </div>
</template>

<style scoped>
/* 育成プランのシート(z-index: 12)の上に重ねる */
.overlay {
  align-items: center;
  background: rgba(35, 48, 61, 0.4);
  display: flex;
  inset: 0;
  justify-content: center;
  overscroll-behavior: contain;
  padding: 24px;
  position: fixed;
  /* 背景のスクロールは止めるが、ピンチ(拡大の戻し)はブラウザへ譲る(ConfirmDialog と同じ) */
  touch-action: pinch-zoom;
  z-index: 13;
}

.dialog {
  background: var(--surface);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-sheet);
  display: grid;
  gap: 4px;
  max-width: 22rem;
  padding: 16px;
  width: 100%;
}

h3 {
  font-size: 15px;
  font-weight: 700;
  margin: 0 0 4px;
}

.member {
  display: grid;
  gap: 4px;
  margin-top: 6px;
}

.name {
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* おまかせ / 0〜3 マス: 排他なのでセグメント(条件のタブの選び方と同形) */
.segment {
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  height: 34px;
  overflow: hidden;
}

.seg {
  background: var(--surface);
  border: none;
  border-left: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  padding: 0;
  white-space: nowrap;
}

.seg:first-child {
  border-left: none;
}

.seg-active {
  background: var(--selected);
  color: var(--selected-ink);
  font-weight: 700;
}

.close {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  margin-top: 14px;
}
</style>
