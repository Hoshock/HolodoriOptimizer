<script setup lang="ts">
/**
 * ページ下端（結果の下・免責フッタの上）に置く、このツールの説明（2026-09-14 ユーザー指示。
 * 「編成シミュレーター」で探して来た人に、開いた画面が何なのかを言葉でも示す）。
 * 入力の導線を押し下げないように本線の一番下に置き、検索用の隠しテキストは使わない
 * （見えている本文だけで、実装にある機能だけを書く）
 */
const GUIDE_BASE = import.meta.env.BASE_URL;
</script>

<template>
  <section class="panel about" aria-labelledby="about-heading">
    <!-- 「編成シミュレーター」の途中で折り返さないよう、意味のまとまりごとに折り返し位置を決める -->
    <h2 id="about-heading">
      <span>所持カードから最適編成を探す</span><span>編成シミュレーター</span>
    </h2>
    <p>
      ホロドリの編成シミュレーターです。所持カード・開花・ホロメンボード・コネクト・イベントメモリー・メンバー強化ボーナス・楽曲条件を反映し、組める編成を全探索。ユニットスコアやスキル効果をシミュレーションして比較できます。
    </p>

    <h3>このツールでできること</h3>
    <ul>
      <li>所持カードから編成候補を全探索する</li>
      <li>リーダーとメンバー5人を評価する</li>
      <li>開花、衣装スキル、パッシブスキルを反映する</li>
      <li>ホロメンボードとコネクトを反映する</li>
      <li>イベントメモリーとメンバー強化ボーナスを反映する</li>
      <li>楽曲条件を指定できる</li>
      <li>表示値は非公式の試算値である</li>
    </ul>

    <ul class="guide-links">
      <li><a :href="`${GUIDE_BASE}guides/simulator/`">編成シミュレーターの使い方</a></li>
      <li><a :href="`${GUIDE_BASE}guides/unit-score/`">ユニットスコア計算と内訳</a></li>
    </ul>
  </section>
</template>

<style scoped>
/* 入力の本線より控えめに見せる（文字は本文サイズのまま、見出しだけステップと同じ 18px） */
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  box-shadow: var(--shadow-card);
  padding: 16px;
}

.about h2 {
  font-size: 18px;
  margin: 0 0 8px;
}

/* まとまりの中では折り返さない（狭い画面で「編成シ / ミュレーター」と割れるのを防ぐ） */
.about h2 span {
  display: inline-block;
}

.about h3 {
  font-size: 15px;
  margin: 16px 0 4px;
}

.about p {
  margin: 0;
}

.about ul {
  margin: 4px 0 0;
  padding-left: 1.3em;
}

.about li {
  margin: 2px 0;
}

.guide-links {
  border-top: 1px solid var(--line);
  list-style: none;
  margin-top: 16px;
  padding: 12px 0 0;
}
</style>
