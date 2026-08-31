# 進捗ログ

進行中タスクのステータスと時系列ログ。日付は最新が上。恒久化すべき内容は都度 ADR / docs/human/ へ昇格し、ここには昇格前の生の状況のみ残す。

## ステータス

| カテゴリ        | 状況                                                 | 次のアクション                                   |
| :-------------- | :--------------------------------------------------- | :----------------------------------------------- |
| Phase 0〜4.5    | 完了・公開済み(plan.md の完了サマリ参照)             | —                                                |
| 残作業(plan.md) | スキーマ拡張・スキル寄与内訳・実測検証の 3 件        | スキーマ拡張から着手                             |
| 保留事項        | 4 件(pending.md)。1 は人間確認、2 はユーザー承認待ち | ガイドライン原文確認・データ出典方針の回答を待つ |

## 時系列ログ

- **2026-08-31**: 棚卸し(housekeep)実施。rules.md の全ルール候補を `docs/ai/rules/ui-verification.md`(playwright-cli での UI 確認)と `.claude/rules/ui-design.md`(UI デザイン制約、paths: src/**/*.{vue,css} + index.html)へ昇格。pending から解消済み 2 件(LICENSE=MIT 決定、表示名=ホロドリ最適化ツール決定)を削除し 4 件に整理。plan.md を完了サマリ+残作業に縮約。
- **2026-08-31(要約)**: Phase 0〜4.5 を 1 日で実施し公開まで完了。調査→ADR-001〜003→スキャフォールド+CI→データ 70 枚/181 曲→エンジン(1,124 万通り約 5 秒・Worker 化)→UI 2 回の作り直し(ユーザーフィードバック: 固定枠 5 化、リーダーとメンバーの重複可、ドロップダウン廃止→カードピッカー、AI デザイン排除・タイプ色訂正・モバイル最適化)。PR #1〜#3 を main にマージし https://hoshock.github.io/HolodoriOptimizer/ で公開中。詳細な経緯は git log と PR 参照。

## コンパクション地点のログ(2026-08-31 housekeep)

- 未コミットの変更: 本棚卸しによる docs/ai/(rules 昇格・tmp 縮約)と `.claude/rules/ui-design.md` の新規追加のみ。src/ のコード変更はなし(公開済み main と一致)
- 未 push: 同上(コミット自体未実施 — housekeep は指示なしに commit しない)
- 次のアクション: plan.md「残作業」の先頭(スキーマ拡張: パッシブ「自身」対象とスコアサポート複合)
- 参照すべき方針: 分担表= CLAUDE.md、UI 制約= `.claude/rules/ui-design.md`、UI 確認手順= docs/ai/rules/ui-verification.md、権利= docs/human/rights-policy.md、スコアモデルの前提= docs/human/game-spec.md
