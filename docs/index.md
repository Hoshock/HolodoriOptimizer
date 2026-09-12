# ドキュメントインデックス

HolodoriOptimizer の知識は「現在の仕様」「再現資料」「設計判断」「一時的な未解決」に分ける。作業履歴そのものは Git 履歴・Issue に任せる。

## 入口

| ドキュメント | 役割 |
| :--- | :--- |
| [README.md](../README.md) | ユーザー向け概要・免責・試算モデルの現在地 |
| [CLAUDE.md](../CLAUDE.md) | リポジトリ全体の運用・知識配置 |

## 人間向けの正典

| ドキュメント | 役割 |
| :--- | :--- |
| [human/game-spec.md](./human/game-spec.md) | ゲーム仕様の概観。変わりにくい事実だけを持つ |
| [human/display-score.md](./human/display-score.md) | 表示ユニットスコアの確定事項・強い推定・棄却済み仮説・未解決 |
| [human/rights-policy.md](./human/rights-policy.md) | 権利・公開方針 |

## 再現資料

`human/repro/` は「その観測を後から再現・検証するために必要な入力と出力」を保存する。現在仕様の説明や作業日誌は置かない。

| ドキュメント | 役割 |
| :--- | :--- |
| [human/repro/README.md](./human/repro/README.md) | 再現資料の書き方 |
| [human/repro/display-score-20260912.md](./human/repro/display-score-20260912.md) | 2026-09-12 の表示スコア逆解析で使う実機観測コーパス |
| [human/repro/20260912-account-snapshot.md](./human/repro/20260912-account-snapshot.md) | 2026-09-12 時点のアカウント構造化スナップショット |

## エージェント向け

恒久ルールは `CLAUDE.md` と `.claude/rules/`、多手順の手順・専門知識は `.claude/skills/` にある。

主な知識スキル:

- `parameter-calculation`: カード詳細 P/T/S、総合力、4 色ボードの構造
- `structure-import`: スクリーンショットから構造化入力を作る手順
- `housekeep`: 知識の棚卸し
- `induction`: ユーザーフィードバックからルール候補を作る手順

### 一時ファイル

| ドキュメント | 役割 |
| :--- | :--- |
| [ai/tmp/pending.md](./ai/tmp/pending.md) | 現在も未解決の事項だけ。解決した履歴は残さない |
| `ai/tmp/rules.md` | 未査定ルール候補がある時だけ存在する |
| [ai/tmp/status.md](./ai/tmp/status.md) | 旧リンクを保つための移転案内だけ。新規情報は書かない |

`plan.md` / `progress.md` の長期常設や、`status.md` へのログ追記は行わない。

## ADR

[adr/index.md](./adr/index.md) を索引とする。ADR は「なぜその設計を選び、何を捨てたか」を残す場所であり、現在の実測値や進捗ログの置き場ではない。
