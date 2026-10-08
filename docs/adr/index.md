# ADR 索引

覆しにくい横断的な意思決定の記録。Accepted 後の本文は原則凍結し、変更は新 ADR で置き換える。

| ADR                                                      | 概要                                                                 |
| :------------------------------------------------------- | :------------------------------------------------------------------- |
| [ADR-001](001-tech-stack-vue3-ts-viteplus-pnpm-pages.md) | Vue 3 + TypeScript + Vite+ + pnpm + GitHub Pages                     |
| [ADR-002](002-game-data-text-only-hand-entered.md)       | ゲームデータはテキストのみで保持                                     |
| [ADR-003](003-in-browser-typescript-optimizer.md)        | ブラウザ内 TypeScript の全探索を基本とする                           |
| [ADR-004](004-total-power-additive-model.md)             | 総合力は加算モデル、表示スコアと実ライブを分離                       |
| [ADR-005](005-display-unit-score-shortlist-search.md)    | 表示ユニットスコア探索は shortlist + 厳密検証                        |
| [ADR-006](006-actual-live-score-separate-engine.md)      | 実ライブスコアは別エンジン                                           |
| [ADR-007](007-live-frequency-optimizer.md)               | 発動頻度最適化は別のライブ・アクティブ評価                           |
| [ADR-008](008-connect-effect-provisional-model.md)       | コネクトは暫定モデル                                                 |
| [ADR-009](009-evidence-provenance.md)                    | 実測・転記・再構成・推定を provenance で分離                         |
| [ADR-010](010-guide-pages-static-mpa.md)                 | 検索向けの解説ページは静的 HTML の MPA                               |
| [ADR-011](011-bloom-text-known-or-unknown.md)            | 開花途中の文言は確認済 / 未確認の 2 状態                             |
| [ADR-012](012-board-points-rank-model.md)                | ホロメンランクのボードPt とコネクトの明示解放                        |
| [ADR-013](013-board-materials-shared-constraint.md)      | キューブ・コアキューブはボード最適化だけの共有資材                   |
| [ADR-014](014-board-connect-optimize-frequency-off.md)   | ボードの最適化はボード・コネクトを選んで回し、頻度マスは OFF         |
| [ADR-015](015-optimize-with-frequency-stage.md)          | 最適化は 1 つの入口で ボード → コネクト → 頻度、頻度も反映           |
| [ADR-016](016-true-ranking-proxy-boards.md)              | 最適化順は見込みのボードで候補を選び、資材は編成に効かないマスも使う |
| [ADR-017](017-one-ui-for-everyone.md)                    | 画面はモードを分けず、育成の前提の 3 択・組み直すと・組み直しプラン  |
| [ADR-018](018-faster-without-changing-results.md)        | 計算は値を変えずに速くし、重い計算は Worker を何本か立てて分担する   |
