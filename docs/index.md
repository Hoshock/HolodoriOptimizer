# docs 索引

置き場の考え方は `CLAUDE.md` の「ドキュメントの分担」を参照する。文書を足す・消すときは、同じ変更でこの索引を更新する。ADR は個別に並べず、`adr/index.md` に委ねる。

| 文書                                                                                             | 概要                                                                       |
| :----------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| [adr/index.md](adr/index.md)                                                                     | ADR の索引                                                                 |
| [ai/evidence-policy.md](ai/evidence-policy.md)                                                   | 実測・再確認・転記・推定・仮説の区別と状態ラベル。逆解析の前に読む         |
| [ai/card-data-provenance.md](ai/card-data-provenance.md)                                         | カード DB・開花 variant・推定値の出所                                      |
| [ai/game-spec.md](ai/game-spec.md)                                                               | 変わりにくいゲーム仕様                                                     |
| [ai/display-score.md](ai/display-score.md)                                                       | 表示ユニットスコアの確定事項・強い推定・棄却した仮説・未解明               |
| [ai/rights-policy.md](ai/rights-policy.md)                                                       | 権利・公開の方針                                                           |
| [ai/repro/README.md](ai/repro/README.md)                                                         | 再現資料の読み方。raw export と、そこから再構成した実効値(derived)の分け方 |
| [ai/repro/display-score-20260908-11.md](ai/repro/display-score-20260908-11.md)                   | 表示スコア・総合力の実機観測コーパス(2026-09-08〜11)                       |
| [ai/repro/display-score-20260912.md](ai/repro/display-score-20260912.md)                         | 表示スコア逆解析の実機観測コーパス(2026-09-12 起点。K6 / K7 は 09-13)      |
| [ai/repro/display-score-20260913-blue-weight.md](ai/repro/display-score-20260913-blue-weight.md) | 青ボードの発動率 / 発動頻度の matched pair(`W_blue` の観測)                |
| [ai/repro/display-score-20260913-frequency.md](ai/repro/display-score-20260913-frequency.md)     | 発動頻度の ownership 系列(F0〜F3)                                          |
| [ai/repro/display-score-20260913-sp.md](ai/repro/display-score-20260913-sp.md)                   | SP 欄の発動率 UP 40% の切り分け                                            |
| [ai/repro/display-score-20260915-costume.md](ai/repro/display-score-20260915-costume.md)         | 3 欄(衣装 / ボード / パッシブ)の配分と量子化の位相                         |
| [ai/repro/20260912-account-snapshot.md](ai/repro/20260912-account-snapshot.md)                   | アカウント構造化データのスナップショット(2026-09-12)                       |
| [ai/repro/20260913-account-snapshot.md](ai/repro/20260913-account-snapshot.md)                   | アカウント構造化データのスナップショット(2026-09-13)                       |
| [ai/repro/20260915-account-snapshot.md](ai/repro/20260915-account-snapshot.md)                   | アカウント構造化データのスナップショット(2026-09-15)                       |
| [ai/tmp/plan.md](ai/tmp/plan.md)                                                                 | 進行中のタスクの計画(タスクがあるときだけ)                                 |
| [ai/tmp/progress.md](ai/tmp/progress.md)                                                         | 進行中のタスクの進捗とコンパクション地点のログ(タスクがあるときだけ)       |
| [ai/tmp/pending.md](ai/tmp/pending.md)                                                           | 未解決の調査項目と判断待ち。番号は固定の ID                                |
| [ai/tmp/journal.md](ai/tmp/journal.md)                                                           | ユーザーの訂正と落とし穴の記録。棚卸し(distill)で規則にまとめて移す        |
