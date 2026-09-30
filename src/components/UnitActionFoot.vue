<script setup lang="ts">
/**
 * 結果詳細・お気に入りのユニット詳細の下端の固定エリア（2026-09-30 ユーザー指示）。
 * 左右半分ずつの 2 ボタン — 左「検索画面に入力」、右「発動頻度の最適化」（色はどちらも secondary のまま）。
 * 前後の順位・番号へ送る三角は置かない（送りは左右のスワイプだけ）。縦に長い内訳をスクロールしても操作が残る。
 * 開ける編成がないとき（お気に入りが 0 件）は隠さず disabled にする
 */
const props = defineProps<{ disabled?: boolean }>();

const emit = defineEmits<{
  /** 「検索画面に入力」— この編成をメイン画面のリーダー・メンバー欄へ入れる（さがすのオプションは触らない） */
  load: [];
  /** 「発動頻度の最適化」を開く（ライブ最適化。表示ユニットスコアとは別モデル — ADR-007） */
  frequency: [];
}>();
</script>

<template>
  <div class="sheet-foot">
    <button type="button" class="foot-button" :disabled="props.disabled" @click="emit('load')">
      検索画面に入力
    </button>
    <button type="button" class="foot-button" :disabled="props.disabled" @click="emit('frequency')">
      発動頻度の最適化
    </button>
  </div>
</template>

<style scoped>
/* ヘッダと同じ罫線でシートの端に張り付ける。高さは 8 + 44 + 8 + 罫線 1 = 61px（+ 下端の安全領域） */
.sheet-foot {
  background: var(--chrome-foot);
  border-top: 1px solid var(--line);
  display: grid;
  flex-shrink: 0;
  gap: 12px;
  grid-template-columns: 1fr 1fr;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
}

/* 別モデル（ライブ最適化）へ渡る secondary ボタン（OptimizerPanel の .secondary-button と同寸法） */
.foot-button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  padding: 0 8px;
  white-space: nowrap;
}

.foot-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
