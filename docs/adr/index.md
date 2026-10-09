# ADR 索引

覆しにくい横断的な意思決定の記録。書き方は `.claude/skills/adr-convention/`（Accepted 後の本文は凍結。決定が変わったら新 ADR を書き、旧 ADR は Superseded）。

| ADR                                                      | 概要                                                                                                                                                 |
| :------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ADR-001](001-tech-stack-vue3-ts-viteplus-pnpm-pages.md) | Vue 3 + TypeScript + Vite+ + pnpm + GitHub Pages                                                                                                     |
| [ADR-002](002-game-data-text-only-hand-entered.md)       | ゲームデータはテキストのみで保持                                                                                                                     |
| [ADR-003](003-in-browser-typescript-optimizer.md)        | ブラウザ内 TypeScript の全探索を基本とする                                                                                                           |
| [ADR-004](004-total-power-additive-model.md)             | 総合力は加算モデル、表示スコアと実ライブを分離                                                                                                       |
| [ADR-005](005-display-unit-score-shortlist-search.md)    | 表示ユニットスコア探索は shortlist + 厳密検証                                                                                                        |
| [ADR-006](006-actual-live-score-separate-engine.md)      | 実ライブスコアは別エンジン                                                                                                                           |
| [ADR-007](007-live-frequency-optimizer.md)               | 発動頻度最適化は別のライブ・アクティブ評価（→ ADR-015）                                                                                              |
| [ADR-008](008-connect-effect-provisional-model.md)       | コネクトは暫定モデル（所持の登録は → ADR-023）                                                                                                       |
| [ADR-009](009-evidence-provenance.md)                    | 実測・転記・再構成・推定を provenance で分離                                                                                                         |
| [ADR-010](010-guide-pages-static-mpa.md)                 | 検索向けの解説ページは静的 HTML の MPA                                                                                                               |
| [ADR-011](011-bloom-text-known-or-unknown.md)            | 開花途中の文言は確認済 / 未確認の 2 状態                                                                                                             |
| [ADR-012](012-board-points-rank-model.md)                | ホロメンランクのボードPt とコネクトの明示解放                                                                                                        |
| [ADR-013](013-board-materials-shared-constraint.md)      | キューブ・コアキューブはボード最適化だけの共有資材                                                                                                   |
| [ADR-014](014-board-connect-optimize-frequency-off.md)   | ボードの最適化はボード・コネクトを選んで回し、頻度マスは OFF（→ ADR-015）                                                                            |
| [ADR-015](015-optimize-with-frequency-stage.md)          | 最適化は 1 つの入口で ボード → コネクト → 頻度、頻度も反映                                                                                           |
| [ADR-016](016-true-ranking-proxy-boards.md)              | 最適化順は見込みのボードで候補を選び、資材は編成に効かないマスも使う（緑の扱いは → ADR-019）                                                         |
| [ADR-017](017-one-ui-for-everyone.md)                    | 画面はモードを分けず、育成の前提の 3 択・組み直すと・組み直しプラン（範囲の名前は → ADR-019）                                                        |
| [ADR-018](018-faster-without-changing-results.md)        | 計算は値を変えずに速くし、重い計算は Worker を何本か立てて分担する                                                                                   |
| [ADR-019](019-minimal-rebuild-scope.md)                  | 組み直しの範囲は「最小限」と「全整理」で、最小限でもユニット外の緑・黄を使う（→ ADR-020）                                                            |
| [ADR-020](020-minimal-rebuild-outsiders-pt.md)           | 最小限でも同じ所属のユニット外は緑を開け、その Pt は効かない赤・青を外して空ける（→ ADR-021）                                                        |
| [ADR-021](021-minimal-green-priority.md)                 | 最小限の緑は ユニット外の所属マス（経路込み・上限 900 まで）→ ユニットの残り Pt の順。曲を指定したらユニット外の歌唱者の黄とそのコネクトも（Update） |
| [ADR-022](022-star4-cards-fixed-only.md)                 | ★4 カードを正式に収録し、編成には自分で枠に置いたときだけ入れる（おまかせは ★5 のみ。Update: ★5 のないホロメンの ★4 はリーダーのおまかせに入れる）   |
| [ADR-023](023-connect-inventory-from-owned-cards.md)     | 持っているコネクトは所持カードから導き、カード固有のコネクト効果の対応表を持つ                                                                       |
| [ADR-024](024-tier-list-precomputed.md)                  | ティア表は探索の結果で評価し（段は仮想アカウントでの採用率）、事前計算のデータを同梱する                                                             |
