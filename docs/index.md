# ドキュメントインデックス

HolodoriOptimizer の知識は「現在の仕様」「証拠の扱い」「再現資料」「設計判断」「未解決」に分ける。作業履歴はGit履歴・Issueへ置く。

## 入口

| ドキュメント              | 役割                                       |
| :------------------------ | :----------------------------------------- |
| [README.md](../README.md) | ユーザー向け概要・免責・試算モデルの現在地 |
| [CLAUDE.md](../CLAUDE.md) | リポジトリ全体の運用・知識配置             |

## 人間向け正典

| ドキュメント                                                     | 役割                                                 |
| :--------------------------------------------------------------- | :--------------------------------------------------- |
| [human/evidence-policy.md](./human/evidence-policy.md)           | 実測・再確認・転記・推定・仮説の区別。逆解析前に必読 |
| [human/card-data-provenance.md](./human/card-data-provenance.md) | カードDB・開花variant・推定値の出所                  |
| [human/game-spec.md](./human/game-spec.md)                       | 変わりにくいゲーム仕様                               |
| [human/display-score.md](./human/display-score.md)               | 表示ユニットスコアの確定事項・強い推定・棄却・未解明 |
| [human/rights-policy.md](./human/rights-policy.md)               | 権利・公開方針                                       |

## 再現資料

`human/repro/` は同じ条件を組み直せる入力・操作・実機表示を保存する。推定値を実測列へ混ぜない。

- [human/repro/README.md](./human/repro/README.md)
- [human/repro/display-score-20260912.md](./human/repro/display-score-20260912.md)
- [human/repro/20260912-account-snapshot.md](./human/repro/20260912-account-snapshot.md)

## エージェント向け

恒久ルールは `CLAUDE.md` と `.claude/rules/`、手順は `.claude/skills/`。

- `parameter-calculation`: P/T/S、総合力、4色ボード
- `structure-import`: メンバー一覧の構造化
- `housekeep`: 知識の棚卸し
- `induction`: フィードバックのルール化

`docs/ai/tmp/pending.md` は現在の未解決だけ。`status.md` は旧リンク用の移転案内のみ。

## ADR

[adr/index.md](./adr/index.md) を索引とする。
