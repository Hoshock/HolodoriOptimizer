# ADR-001: 技術スタックは Vue 3 + TypeScript + Vite+ (vp) + pnpm、GitHub Pages 配信

Date: 2026-08-31

## Status

Accepted

## Decision

フロントエンドは Vue 3 + TypeScript(Composition API + `<script setup>`)、ツールチェーンは Vite+(CLI `vp`)+ pnpm とし、GitHub Actions でビルドして GitHub Pages(Source: GitHub Actions)へ静的サイトとして配信する。サーバサイドは持たない。

## Context

Vue 3 + TypeScript + Vite+ + pnpm はオーナーの要件として指定された。Vite+ は 2026-03 に MIT ライセンスで完全にオープンソースになったので、パブリックリポジトリで使っても法的な問題はない。dev / build / test(Vitest)/ lint(Oxlint)/ format(Oxfmt)が `vp` 1 本と `vite.config.ts` 1 ファイルにまとまり、小さなプロジェクトの設定を減らせる。

一方で Vite+ は 2026-08 時点で v0.3.0(0.x)で、破壊的変更が続いている。そこで次の 3 つを条件にした。

1. CI では `voidzero-dev/setup-vp` をバージョンかコミット SHA でピン留めする(`v1` タグは更新が止まっているので使わない)。
2. pnpm では公式手順どおり、`pnpm-workspace.yaml` の `overrides` で `vite` を `@voidzero-dev/vite-plus-core` へエイリアスする。
3. Vue プラグインは標準の `@vitejs/plugin-vue` を使い、Vite+ が支障になったら通常の Vite 8 + Vitest 構成へ戻せる形を保つ。

外した案は通常の Vite 8 構成。安定性では勝るが、要件で指定されていることと、条件 3 で戻る道を残せることから Vite+ を採った。

## Consequences

### Pros

- 要件どおりの構成で、lint / format / test を含む開発コマンドが `vp` にそろう。
- 静的サイトと GitHub Actions だけで動き、運用コストがかからない。外部 API・サーバ・DB を持たない。
- `@vitejs/plugin-vue` を使っているので、通常の Vite へ退避しやすい。

### Cons

- Vite+ 0.x の破壊的変更に追従する手間がかかる。
- 事例とドキュメントが通常の Vite より少なく、トラブルの調査に時間がかかる。

**Update (2026-08-31):** CI では `voidzero-dev/setup-vp` を使わず、`vite-plus`(`vp` を同梱)を devDependency にして pnpm で入れる形にした。バージョンは lockfile と `pnpm-workspace.yaml` の catalog で固定されるので条件 1 の目的は満たしたまま、CI の準備が pnpm だけで済む(グローバルインストーラ `curl -fsSL https://vite.plus | bash` は開発環境のネットワーク制約で使えなかった)。
