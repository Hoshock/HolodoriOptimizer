<script setup lang="ts">
// プレースホルダーページ。機能実装は docs/ai/tmp/plan.md の Phase 2 以降。
</script>

<template>
  <div class="page">
    <header class="site-header">
      <h1>ホロドリ最適化ツール</h1>
      <p class="tagline">
        『hololive Dreams』のユニット編成(リーダー1人+メンバー5人)を最適化する非公式ファンツール
      </p>
    </header>

    <main class="content">
      <section class="notice">
        <h2>準備中です</h2>
        <p>
          リーダーを選ぶと、ユニットスコアが最大になるメンバーの組み合わせを探索して上位候補を提示するツールを開発中です。
        </p>
      </section>
    </main>

    <footer class="site-footer">
      <p>
        本ツールはファンによる非公式ツールであり、カバー株式会社・株式会社QualiArtsとは一切関係ありません。ゲーム内の名称等の権利はすべて各権利者に帰属します。スコアはコミュニティの解析に基づく試算値であり、実際のゲーム内の値と異なる場合があります。権利者からの要請があれば速やかに公開を停止します。
      </p>
      <p>
        <a
          href="https://github.com/Hoshock/HolodoriOptimizer"
          rel="noopener noreferrer"
          target="_blank"
          >ソースコード (GitHub)</a
        >
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

.site-header {
  border-bottom: 1px solid var(--border);
  padding: 1.25rem 1rem;
}

.site-header h1 {
  font-size: 1.35rem;
  margin: 0;
}

.tagline {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0.4rem 0 0;
}

.content {
  flex: 1;
  margin: 0 auto;
  max-width: 44rem;
  padding: 2rem 1rem;
  width: 100%;
}

.notice h2 {
  font-size: 1.1rem;
  margin: 0 0 0.5rem;
}

.site-footer {
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.8rem;
  padding: 1rem;
}

.site-footer p {
  margin: 0.3rem 0;
}
</style>
