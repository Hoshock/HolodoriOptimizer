# ADR 索引

いま効いている ADR だけを載せる。Superseded / Deprecated の経緯は、置き換えた ADR の Context と旧 ADR の Status から辿る。書き方は `.claude/skills/adr-convention/`。

| ADR                                                      | 概要                                                                                                      |
| :------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| [ADR-001](001-tech-stack-vue3-ts-viteplus-pnpm-pages.md) | 技術スタック: Vue 3 + TypeScript + Vite+ + pnpm、GitHub Pages 配信                                        |
| [ADR-002](002-game-data-text-only-hand-entered.md)       | ゲームデータは手入力のテキストだけで持ち、公式アセットに依存しない(例外は ADR-022 / 023)                  |
| [ADR-003](003-in-browser-typescript-optimizer.md)        | 計算と探索はブラウザ内の TypeScript で行う                                                                |
| [ADR-004](004-total-power-additive-model.md)             | 総合力は加算モデル。表示ユニットスコアと実ライブを分ける                                                  |
| [ADR-005](005-display-unit-score-shortlist-search.md)    | 表示ユニットスコアの探索は shortlist + 厳密探索での検証                                                   |
| [ADR-006](006-actual-live-score-separate-engine.md)      | 実ライブスコアは表示ユニットスコアと別のエンジン                                                          |
| [ADR-008](008-connect-effect-provisional-model.md)       | コネクト効果は外部データ由来の暫定モデル(所持は ADR-023)                                                  |
| [ADR-009](009-evidence-provenance.md)                    | 実測・転記・再構成・推定を provenance で分ける                                                            |
| [ADR-010](010-guide-pages-static-mpa.md)                 | 検索向けの解説ページは静的 HTML の MPA                                                                    |
| [ADR-011](011-bloom-text-known-or-unknown.md)            | 開花途中のスキル文言は確認済 / 未確認の 2 状態                                                            |
| [ADR-012](012-board-points-rank-model.md)                | ホロメンランクのボードPt の予算と、コネクトマスの明示解放                                                 |
| [ADR-013](013-board-materials-shared-constraint.md)      | キューブ・コアキューブはアカウント共有の資材。手動の解放・解除で余りを増減する                            |
| [ADR-015](015-optimize-with-frequency-stage.md)          | 最適化は 1 つの入口で ボード → コネクト → 頻度 を選び、頻度マスも反映する                                 |
| [ADR-016](016-true-ranking-proxy-boards.md)              | 「組み直すと」は見込みのボードで候補を選び、資材は編成に効かないマスも使う(緑の扱いは ADR-029)            |
| [ADR-017](017-one-ui-for-everyone.md)                    | 画面はモードを分けず、全員が同じ導線を使う(範囲の中身は ADR-029)                                          |
| [ADR-018](018-faster-without-changing-results.md)        | 計算は値を変えずに速くし、重い計算は Worker を何本か立てて分担する                                        |
| [ADR-022](022-star4-cards-fixed-only.md)                 | ★4 を正式に収録し、編成には自分で枠に置いたときだけ入れる                                                 |
| [ADR-023](023-connect-inventory-from-owned-cards.md)     | 持っているコネクトは所持カードから導き、カード固有のコネクト効果の対応表を持つ                            |
| [ADR-024](024-tier-list-precomputed.md)                  | ティア表は探索の結果(仮想アカウントでの採用率)で評価し、事前計算のデータを同梱する                        |
| [ADR-029](029-rebuild-board-rules.md)                    | 組み直しのボードの決まり(効率順・効かないマスだけ外す・緑を初めて変える手間・緑の形・手前の 7 マスを先に) |
