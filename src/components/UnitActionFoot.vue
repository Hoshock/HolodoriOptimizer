<script setup lang="ts">
/**
 * 結果詳細・お気に入りのユニット詳細の下端の固定エリア。**1 行に 2 つ**（2026-10-07 ユーザー指示）: 左から
 * 「ボードの最適化」（ホロメンボードとコネクトを、選んだものだけ最適化する。頻度マスは OFF にして行う）・「頻度の最適化」（発動頻度。
 * 経路が一意でないので反映はなく、おすすめを見て手で登録する）。色はどちらも secondary のまま。
 * それまでは「ボードの最適化 / コネクトの最適化 / 頻度の最適化」の 3 つだった（コネクトはボードの最適化の中の選択肢にした）。
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
  /** 「発動頻度の最適化」を開く（ライブ最適化。表示ユニットスコアとは別モデル — ADR-007） */
  frequency: [];
  /** 「ボードの最適化」を開く（ホロメンボード・コネクトを選んで、この編成のユニットスコアが高くなる解放マス・配置を選ぶ） */
  board: [];
}>();
</script>

<template>
  <div class="sheet-foot">
    <button type="button" class="foot-button" :disabled="props.disabled" @click="emit('board')">
      ボードの最適化
    </button>
    <button type="button" class="foot-button" :disabled="props.disabled" @click="emit('frequency')">
      頻度の最適化
    </button>
  </div>
</template>

<style scoped>
/* ヘッダと同じ罫線でシートの端に張り付ける。高さは 8 + 48 + 8 + 罫線 1 = 65px（発動頻度の最適化シートの下端と同じ。ボタンは 48px が他シートと共通）（+ 下端の安全領域） */
.sheet-foot {
  background: var(--chrome-foot);
  border-top: 1px solid var(--line);
  display: grid;
  flex-shrink: 0;
  gap: 8px;
  grid-template-columns: repeat(2, 1fr);
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
}

/* secondary ボタン（文字は OptimizerPanel の .secondary-button と同じ 14px/600、高さは下端のボタン共通の 48px。2 つなので幅に合わせて縮めない） */
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
