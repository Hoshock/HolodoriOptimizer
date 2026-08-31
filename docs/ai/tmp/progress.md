# 進捗ログ

進行中タスクのステータスと時系列ログ。日付は最新が上。恒久化すべき内容は都度 ADR / docs/human/ へ昇格し、ここには昇格前の生の状況のみ残す。

## ステータス

| カテゴリ        | 状況                                                 | 次のアクション                                   |
| :-------------- | :--------------------------------------------------- | :----------------------------------------------- |
| Phase 0〜4.5    | 完了・公開済み(plan.md の完了サマリ参照)             | —                                                |
| UI 磨き込み     | フィードバック第 3〜7 弾を反映し main へ直接反映済み | ユーザーの実機確認待ち                           |
| 残作業(plan.md) | スキーマ拡張・スキル寄与内訳・実測検証の 3 件        | スキーマ拡張から着手                             |
| 保留事項        | 4 件(pending.md)。1 は人間確認、2 はユーザー承認待ち | ガイドライン原文確認・データ出典方針の回答を待つ |

## 時系列ログ

- **2026-08-31(UI 磨き込み、要約)**: ユーザーフィードバック第 3〜7 弾を同日中に反映し、いずれも main へ直接 push・デプロイ済み(ユーザー指示による運用)。主な帰結 — 全カード表示をタイプ淡色面+固定寸法スロットに統一、スキル行は 2 行占有の 2 カラム、結果一覧は最小限+タップで詳細モーダル、topN デフォルト 5/上限 100、iOS の電話番号誤検出対策。導かれた制約はすべて `.claude/rules/ui-design.md` へ昇格済み。個別の経緯は git log(eaec3a3〜3a7bce9)参照。
- **2026-08-31**: 棚卸し(housekeep)2 回目。rules.md の全候補を `.claude/rules/ui-design.md` に統合・昇格(体系化のため全面書き直し)。docs/index.md に design-research の行を補完。
- **2026-08-31**: 棚卸し(housekeep)1 回目。rules.md 候補を `docs/ai/rules/ui-verification.md` と `.claude/rules/ui-design.md` へ昇格。pending を 4 件に整理。plan.md を完了サマリ+残作業に縮約。
- **2026-08-31(要約)**: Phase 0〜4.5 を 1 日で実施し公開まで完了。調査→ADR-001〜003→スキャフォールド+CI→データ 70 枚/181 曲→エンジン(1,124 万通り約 5 秒・Worker 化)→UI 構築。PR #1〜#3 を main にマージし https://hoshock.github.io/HolodoriOptimizer/ で公開中。

## コンパクション地点のログ(2026-08-31 housekeep 2 回目)

- 未コミットの変更: 本棚卸しによる docs/ai/tmp/(rules.md 空化・plan/progress 縮約)、`.claude/rules/ui-design.md` の全面書き直し、docs/index.md の行補完のみ。src/ は main(3a7bce9)と一致
- 未 push: 同上(棚卸し分は指示があるまで commit しない)
- 次のアクション: plan.md「残作業」の先頭(スキーマ拡張: パッシブ「自身」対象とスコアサポート複合)。ただし着手前にユーザーの続行指示を待つ
- 参照すべき方針: 分担表= CLAUDE.md、UI 制約= `.claude/rules/ui-design.md`(7 弾ぶん集約済み)、UI 確認手順= docs/ai/rules/ui-verification.md、権利= docs/human/rights-policy.md、スコアモデルの前提= docs/human/game-spec.md
- 運用メモ: このセッションでは「main に直接プッシュでいい」の指示を受けており、機能変更は branch と main の両方へ push している
