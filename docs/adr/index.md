# ADR 索引

覆しにくい横断的な意思決定の記録。1 ADR = 1 決定・約 1 ページ。ファイル名は `NNN-short-kebab-case-title.md`(3 桁ゼロ埋め、最大番号 +1)。本文は先頭に `- Date: YYYY-MM-DD` / `- Status:` を置き、`## Decision`(結論 1〜2 文)→ `## Context`(必要になった理由・却下した代替案とその理由)→ `## Consequences`(`### Pros` / `### Cons`、Cons を必ず書く)の順。Accepted 後の本文は凍結し、変更は新 ADR で置き換えて旧 Status を `Superseded by [ADR-NNN](NNN-....md)` にする(削除・移動はしない)。日付つき追記 `**Update (YYYY-MM-DD):** ...` のみ許容。

| ADR                                                      | 概要                                                                             |
| :------------------------------------------------------- | :------------------------------------------------------------------------------- |
| [ADR-001](001-tech-stack-vue3-ts-viteplus-pnpm-pages.md) | 技術スタックは Vue 3 + TypeScript + Vite+ (`vp`) + pnpm、GitHub Pages 配信       |
| [ADR-002](002-game-data-text-only-hand-entered.md)       | ゲームデータは手入力のテキストのみで保持し、公式アセットと解析ダンプに依存しない |
| [ADR-003](003-in-browser-typescript-optimizer.md)        | スコア計算・編成最適化はブラウザ内 TypeScript の全探索を基本とする               |
