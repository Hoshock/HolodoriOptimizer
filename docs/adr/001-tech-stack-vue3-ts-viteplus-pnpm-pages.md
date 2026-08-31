# ADR-001: 技術スタックは Vue 3 + TypeScript + Vite+ (vp) + pnpm、GitHub Pages 配信

- Date: 2026-08-31
- Status: Accepted

## Decision

フロントエンドは Vue 3 + TypeScript(Composition API + `<script setup>`)、ツールチェーンは Vite+(CLI `vp`)+ pnpm を採用する。ビルドは GitHub Actions で行い、GitHub Pages(Source: GitHub Actions)へ静的サイトとしてデプロイする。サーバサイドは持たない。

## Context

オーナーの要件として Vue 3 + TypeScript + Vite+ (`vp`) + pnpm が指定された。Vite+ は 2026-03 に MIT ライセンスで完全オープンソース化されており、パブリックリポジトリでの利用に法的問題はない。dev/build/test (Vitest)/lint (Oxlint)/format (Oxfmt) が `vp` 1 本と `vite.config.ts` 1 ファイルに集約されるため、小規模プロジェクトの設定量を抑えられる。

ただし 2026-08 時点で v0.3.0(0.x)であり、破壊的変更が続いている。このため (1) CI では `voidzero-dev/setup-vp` をバージョンまたはコミット SHA でピン留めする(`v1` タグは更新停止のため使用しない)、(2) pnpm 利用時は公式手順どおり `pnpm-workspace.yaml` の `overrides` で `vite` を `@voidzero-dev/vite-plus-core` にエイリアスする、(3) Vue プラグインは標準の `@vitejs/plugin-vue` を使い、Vite+ が支障になった場合に通常の Vite 8 + Vitest 構成へ戻せる形を保つ、を条件とする。代替案の通常 Vite 8 構成は安定性で勝るが、要件指定とフォールバック可能性を踏まえ Vite+ を採る。

GitHub Pages はプロジェクトサイトのため `vite.config.ts` に `base: '/HolodoriOptimizer/'` を設定する。

## Consequences

### Pros

- 要件どおりの構成で、lint / format / test を含む開発コマンドが `vp` に統一される。
- 静的サイト + GitHub Actions のみで運用コストゼロ。外部 API・サーバ・DB を持たない。
- `@vitejs/plugin-vue` ベースなので通常 Vite への退避が容易。

### Cons

- Vite+ 0.x の破壊的変更に追従するメンテナンスコストがかかる。
- 事例・ドキュメントが通常の Vite より少なく、トラブル時の調査コストが高い。
