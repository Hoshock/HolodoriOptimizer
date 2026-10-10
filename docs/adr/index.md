# ADR 索引

書き方は `.claude/skills/adr-convention/`。決定が変わったら新しい ADR を書き、古い ADR は Superseded にする。

| ADR                                                      | 概要                                                                                              |
| :------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| [ADR-001](001-tech-stack-vue3-ts-viteplus-pnpm-pages.md) | 技術スタック: Vue 3 + TypeScript + Vite+ + pnpm、GitHub Pages 配信                                |
| [ADR-002](002-game-data-text-only-hand-entered.md)       | ゲームデータは手入力のテキストだけで持ち、公式アセットに依存しない(例外は ADR-022 / 023)          |
| [ADR-003](003-in-browser-typescript-optimizer.md)        | 計算と探索はブラウザ内の TypeScript で行う                                                        |
| [ADR-004](004-total-power-additive-model.md)             | 総合力は加算モデル。表示ユニットスコアと実ライブを分ける                                          |
| [ADR-005](005-display-unit-score-shortlist-search.md)    | 表示ユニットスコアの探索は shortlist + 厳密探索での検証                                           |
| [ADR-006](006-actual-live-score-separate-engine.md)      | 実ライブスコアは表示ユニットスコアと別のエンジン                                                  |
| [ADR-007](007-live-frequency-optimizer.md)               | 発動頻度マスの最適化は別のライブ側のエンジン(Superseded → ADR-015)                                |
| [ADR-008](008-connect-effect-provisional-model.md)       | コネクト効果は外部データ由来の暫定モデル(所持は ADR-023)                                          |
| [ADR-009](009-evidence-provenance.md)                    | 実測・転記・再構成・推定を provenance で分ける                                                    |
| [ADR-010](010-guide-pages-static-mpa.md)                 | 検索向けの解説ページは静的 HTML の MPA                                                            |
| [ADR-011](011-bloom-text-known-or-unknown.md)            | 開花途中のスキル文言は確認済 / 未確認の 2 状態                                                    |
| [ADR-012](012-board-points-rank-model.md)                | ホロメンランクのボードPt の予算と、コネクトマスの明示解放                                         |
| [ADR-013](013-board-materials-shared-constraint.md)      | キューブ・コアキューブはボード最適化だけのアカウント共有の資材制約                                |
| [ADR-014](014-board-connect-optimize-frequency-off.md)   | ボードの最適化はボードとコネクトを選んで回し、頻度マスは OFF(Superseded → ADR-015)                |
| [ADR-015](015-optimize-with-frequency-stage.md)          | 最適化は 1 つの入口で ボード → コネクト → 頻度 を選び、頻度マスも反映する                         |
| [ADR-016](016-true-ranking-proxy-boards.md)              | 「組み直すと」は見込みのボードで候補を選び、資材は編成に効かないマスも使う                        |
| [ADR-017](017-one-ui-for-everyone.md)                    | 画面はモードを分けず、全員が同じ導線を使う                                                        |
| [ADR-018](018-faster-without-changing-results.md)        | 計算は値を変えずに速くし、重い計算は Worker を何本か立てて分担する                                |
| [ADR-019](019-minimal-rebuild-scope.md)                  | 組み直しの範囲は「最小限」と全整理の 2 つ(Superseded → ADR-020)                                   |
| [ADR-020](020-minimal-rebuild-outsiders-pt.md)           | 最小限でも同じ所属のユニット外は緑を開け、Pt は効かない赤・青を外して空ける(Superseded → ADR-021) |
| [ADR-021](021-minimal-green-priority.md)                 | 最小限の緑はユニット外の所属マス → ユニットの残り Pt の順(Superseded → ADR-025)                   |
| [ADR-022](022-star4-cards-fixed-only.md)                 | ★4 を正式に収録し、編成には自分で枠に置いたときだけ入れる                                         |
| [ADR-023](023-connect-inventory-from-owned-cards.md)     | 持っているコネクトは所持カードから導き、カード固有のコネクト効果の対応表を持つ                    |
| [ADR-024](024-tier-list-precomputed.md)                  | ティア表は探索の結果(仮想アカウントでの採用率)で評価し、事前計算のデータを同梱する                |
| [ADR-025](025-green-unit-squares-and-cross.md)           | 組み直しで開ける緑はユニット系マスと十字の 5 マスまで(Superseded → ADR-026)                       |
| [ADR-026](026-rebuild-three-rules.md)                    | 組み直しのボードは 3 つのルール(効率順・効かないマスだけ外す・新しく触る手間)で選ぶ               |
