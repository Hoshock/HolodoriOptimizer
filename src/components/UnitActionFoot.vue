<script setup lang="ts">
/**
 * 結果詳細・お気に入りのユニット詳細の下端の固定エリア。上の段は左右半分ずつの 2 ボタン —
 * 左「コネクトの最適化」、右「発動頻度の最適化」（色はどちらも secondary のまま。2026-10-02 ユーザー指示で左を
 * 「検索画面に入力」から差し替えた）— で、その下に幅いっぱいの「ホロメンボードの最適化」（2026-10-04 追加。
 * ホロメンランクのボードPt の範囲で解放マスを選ぶ。3 つを 1 段に並べると 1 つあたり 114px で文字が収まらない）。前後の順位・番号へ送る三角は置かない（送りは左右のスワイプだけ）。
 * 縦に長い内訳をスクロールしても操作が残る。開ける編成がないとき（お気に入りが 0 件）は隠さず disabled にする。
 * 「コネクトの最適化」は持っているコネクトの登録がないときも disabled（`connectDisabled`）。
 *
 * **「検索画面に入力」は 2026-10-02 に画面から外した**（ユーザー指示「ロジックは残しておく」）— `load` のイベントと、
 * 受ける側（ResultDetail / UnitSheet / OptimizerPanel の `loadIntoSearch`）は残してあり、ボタンを戻せばそのまま動く
 */
const props = defineProps<{ disabled?: boolean; connectDisabled?: boolean }>();

const emit = defineEmits<{
  /** 「検索画面に入力」— この編成をメイン画面のリーダー・メンバー欄へ入れる（さがすのオプションは触らない）。いまはボタンなし */
  load: [];
  /** 「コネクトの最適化」を開く（持っているコネクトの範囲で、いまの配置からこの編成のユニットスコアが上がる変更だけを出す） */
  connect: [];
  /** 「発動頻度の最適化」を開く（ライブ最適化。表示ユニットスコアとは別モデル — ADR-007） */
  frequency: [];
  /** 「ホロメンボードの最適化」を開く（ホロメンランクのボードPt の範囲で、この編成のユニットスコアが高くなる解放マスを選ぶ） */
  board: [];
}>();
</script>

<template>
  <div class="sheet-foot">
    <button
      type="button"
      class="foot-button"
      :disabled="props.disabled || props.connectDisabled"
      @click="emit('connect')"
    >
      コネクトの最適化
    </button>
    <button type="button" class="foot-button" :disabled="props.disabled" @click="emit('frequency')">
      発動頻度の最適化
    </button>
    <button
      type="button"
      class="foot-button wide"
      :disabled="props.disabled"
      @click="emit('board')"
    >
      ホロメンボードの最適化
    </button>
  </div>
</template>

<style scoped>
/* ヘッダと同じ罫線でシートの端に張り付ける。2 段: 8 + 48 + 8 + 48 + 8 + 罫線 1 = 121px（ボタンは 48px が他シートと共通）（+ 下端の安全領域） */
.sheet-foot {
  background: var(--chrome-foot);
  border-top: 1px solid var(--line);
  display: grid;
  flex-shrink: 0;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
}

/* secondary ボタン（文字は OptimizerPanel の .secondary-button と同じ 14px/600、高さは下端のボタン共通の 48px） */
.foot-button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  height: 48px;
  padding: 0 8px;
  white-space: nowrap;
}

.foot-button.wide {
  grid-column: 1 / -1;
}

.foot-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
