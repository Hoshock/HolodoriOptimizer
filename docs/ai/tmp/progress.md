# 進捗ログ

進行中タスクのステータスと時系列ログ。日付は最新が上。恒久化すべき内容は都度 ADR / docs/human/ へ昇格し、ここには昇格前の生の状況のみ残す。

## ステータス

| カテゴリ          | 状況                                                                 | 次のアクション                                   |
| :---------------- | :------------------------------------------------------------------- | :----------------------------------------------- |
| Phase 0〜4.5      | 完了・公開済み（plan.md の完了サマリ参照）                           | —                                                |
| 機能追加・UI      | 所持カードモード・構造化 100%・仮想ガチャ（フィードバック 5 巡）済み | ユーザーの実機確認待ち                           |
| 残作業（plan.md） | スキル寄与の内訳表示・実測検証の 2 件                                | スキル寄与の内訳表示から着手                     |
| 保留事項          | 5 件（pending.md）。1 は人間確認、2・5 はユーザー確認待ち            | ガイドライン原文確認・データ出典方針の回答を待つ |

## 時系列ログ

- **2026-08-31（知識管理の再編）**: ガチャは現状で承認。ui-verification.md を `docs/ai/rules/` から `.claude/rules/`（paths: src/\*\*/\*.{vue,css}・index.html）へ移設し、空になった `docs/ai/rules/` を廃止（恒久ルールの行き先は無条件 → CLAUDE.md 注意点 / パス単位 → .claude/rules / 随時参照の知識 → スキル に一本化）。規約スキル 3 つ（claude-md-convention・rules-convention・skills-convention + 知識型/コマンド型リファレンス）を日本語化・本リポジトリ適応のうえ `.claude/skills/` に追加（adr-convention は docs/adr/index.md 冒頭に同等規約があるため見送り。公開リポジトリのため出典の社内情報は書いていない）。housekeep に CLAUDE.md ドリフト検査+監査・README 整合（免責・試算値表記の必須確認）の手順を追加。
- **2026-08-31（仮想ガチャ、要約）**: ガチャ・課金仕様を調査（検索要約ベース・実測未確認、攻略サイト本体はネットワーク制約で閲覧不可）して game-spec.md「ガチャと課金」に記録し、ヘッダ右上アイコンから開く仮想ガチャを実装。5 巡のフィードバックで最終形はピックアップガチャのみ: UnitSlot 同形のピックアップ枠+1回/10回の等幅同色ボタン、有償ダイヤ+課金額（操作は隣接アイコン）、結果グリッドと見出し「結果（n回）」、説明文なし、天井なし。ヘッダのサブタイトル削除、モーダルヘッダはページヘッダと同寸法・同文字。UI 文字列の括弧を全角へ統一。導かれた規則は棚卸し 4 回目で昇格済み（main へ push・デプロイ済み、〜8f60be8）。
- **2026-08-31（機能追加+UI 第 8〜9 弾、要約）**: 所持カードモード（ページ内タブ、localStorage 保存、所持カード内でのリーダー探索 `leader: null`）を追加し、スキーマ拡張（`self` 対象・スコアサポートの効果単位条件）で衣装・パッシブの構造化率を 100% に（テストで強制）。UI はヘッダ手順の削除・チップ一覧の廃止（件数のみ表示、管理はピッカー再オープン）・secondary ボタンの全幅化・状態バッジ廃止（不発動はグレーアウト）。main へ直接 push・デプロイ済み（〜9fa1bcd）。
- **2026-08-31（UI 磨き込み、要約）**: フィードバック第 3〜7 弾を反映（タイプ淡色面+固定寸法スロット、2 行占有スキル行、タップで詳細モーダル、topN 5/100、iOS 電話番号誤検出対策）。経緯は git log（eaec3a3〜3a7bce9）参照。
- **2026-08-31**: 棚卸し 4 回（rules.md の候補を `.claude/rules/ui-design.md`・`docs/ai/rules/ui-verification.md`・CLAUDE.md・`src/data/README.md` へ昇格、tmp を縮約）。
- **2026-08-31（要約）**: Phase 0〜4.5 を 1 日で実施し公開まで完了。調査→ADR-001〜003→スキャフォールド+CI→データ 70 枚/181 曲→エンジン（Worker 化）→UI 構築。https://hoshock.github.io/HolodoriOptimizer/ で公開中。

## コンパクション地点のログ（2026-08-31 housekeep 4 回目）

- 未コミットの変更: 本棚卸しによる昇格反映のみ — CLAUDE.md（括弧表記規則）、`.claude/rules/ui-design.md`（ガチャ 5 巡で得た規則）、`src/data/README.md`（★5 のみ探索）、docs/ai/tmp/（rules.md 空化・progress 縮約）。src/ は main（8f60be8）と一致
- 未 push: 同上（棚卸し分は指示があるまで commit しない — ただし従来どおり Stop hook が commit+push を要求する見込み）
- 次のアクション: plan.md「残作業」の先頭（スキル寄与の内訳表示）。ただし着手前にユーザーの続行指示を待つ。アクティブ・SP の期待値評価（Phase 5 楽曲別最適化）は提案済み・回答待ち。pending 5（★3/★4 一覧・ダイヤ全パック価格）はユーザーの実機確認・共有待ち
- 参照すべき方針: 分担表= CLAUDE.md（括弧表記規則もここ）、UI 制約= `.claude/rules/ui-design.md`（第 3〜9 弾+ガチャ 5 巡を集約済み）、UI 確認手順= `.claude/rules/ui-verification.md`、規約= `.claude/skills/` の claude-md/rules/skills-convention、権利= docs/human/rights-policy.md、ガチャ実仕様= docs/human/game-spec.md「ガチャと課金」、データ更新の約束事= src/data/README.md（構造化 100% 必須・★5 のみ探索）
- 運用メモ: このセッションでは「main に直接プッシュでいい」の指示を受けており、機能変更は branch `claude/holodor-optimizer-party-ahh84e` と main の両方へ push している。恒久ルールはすべて自動読込の置き場（CLAUDE.md・.claude/rules・.claude/skills）に移設済みで、docs/ai/rules は廃止した（2026-08-31）
