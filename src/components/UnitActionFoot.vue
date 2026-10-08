<script setup lang="ts">
/**
 * 結果詳細・お気に入りのユニット詳細の下端の固定エリア。**「育成プラン」の 1 つ**（2026-10-08 ユーザー指示「最適化を一つのボタンにまとめ、
 * 頻度の最適化を選択制に」。名前は同日のユーザー指示で「最適化」から改めた）: 押すと育成プランのシートが開き、ボード・コネクト・発動頻度のうち
 * 選んだものを最適化する。色は secondary のまま。
 * それまでは「ボードの最適化 / 頻度の最適化」の 2 つ（2026-10-07）、その前は コネクトも別の 3 つだった。
 * 前後の順位・番号へ送る三角は置かない（送りは左右のスワイプだけ）。
 * 縦に長い内訳をスクロールしても操作が残る。開ける編成がないとき（お気に入りが 0 件）は隠さず disabled にする。
 *
 * **「検索画面に入力」は 2026-10-02 に画面から外した**（ユーザー指示「ロジックは残しておく」）— `load` のイベントと、
 * 受ける側（ResultDetail / UnitSheet / OptimizerPanel の `loadIntoSearch`）は残してあり、ボタンを戻せばそのまま動く
 */
const props = defineProps<{ disabled?: boolean }>();

const emit = defineEmits<{
  /** 「検索画面に入力」— この編成をメイン画面のリーダー・メンバー欄へ入れる（さがすのオプションは触らない）。いまはボタンなし */
  load: [];
  /** 「育成プラン」を開く（この編成のまま、ボード → コネクト → 発動頻度 のうち選んだものを最適化する） */
  optimize: [];
}>();
</script>

<template>
  <div class="sheet-foot">
    <button type="button" class="foot-button" :disabled="props.disabled" @click="emit('optimize')">
      育成プラン
    </button>
  </div>
</template>

<style scoped>
/* ヘッダと同じ罫線でシートの端に張り付ける。高さは 8 + 48 + 8 + 罫線 1 = 65px（最適化のシートの下端と同じ。ボタンは 48px が他シートと共通）（+ 下端の安全領域） */
.sheet-foot {
  background: var(--chrome-foot);
  border-top: 1px solid var(--line);
  display: grid;
  flex-shrink: 0;
  gap: 8px;
  grid-template-columns: 1fr;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
}

/* secondary ボタン（文字は OptimizerPanel の .secondary-button と同じ 14px/600、高さは下端のボタン共通の 48px。全幅） */
.foot-button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 48px;
  padding: 0 2px;
  white-space: nowrap;
}

.foot-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
