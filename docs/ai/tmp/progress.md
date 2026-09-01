# 進捗ログ

進行中タスクのステータスと時系列ログ。日付は最新が上。恒久化すべき内容は都度 ADR / docs/human/ へ昇格し、ここには昇格前の生の状況のみ残す。

## ステータス

| カテゴリ     | 状況                                                                                | 次のアクション                                   |
| :----------- | :---------------------------------------------------------------------------------- | :----------------------------------------------- |
| Phase 0〜4.5 | 完了・公開済み（plan.md の完了サマリ参照）                                          | —                                                |
| 期待値最適化 | Step 1〜3+リーダー常時おまかせ+UI 刷新まで完了・デプロイ済み（main = ace1216）      | Step 4（ボード配分）はユーザーの再開指示待ち     |
| 保留事項     | 6 件（pending.md）。1 は人間確認、2・5 はユーザー確認待ち、6 は仮定値運用で合意済み | ガイドライン原文確認・データ出典方針の回答を待つ |

## 時系列ログ

- **2026-09-01（期待値最適化 Step 1〜3+UI 刷新、要約）**: タブ統合(1 フロー 6 ステップ・セグメンテッドコントロール・入口 disabled・メンバー枠は上から順)→アクティブ/SP 期待値エンジン(`src/data/live.ts`+`src/engine/live.ts`、総合期待スコア=unitScore×(1+active+sp)、検算できる内訳表)→曲別最適化(SongPicker、曲長を期待値へ反映)→リーダー常時おまかせ(衣装スキル同型クラス評価+上限枝刈りで 7.9 億通り約 4 秒)→文言刷新(名詞見出し・件数は行ボタン内の値・既定値「おまかせ」)→正円アイコン化(`SkillIcon.vue`、サンプル画像 3 往復で確定)。各段階で 390px 実測・check/test/build green・main へ push・デプロイ成功確認済み(〜ace1216)。導かれた UI 規則は棚卸し 5 回目で `.claude/rules/ui-design.md` へ昇格済み。2026-09-01「オーケー3は完了でいったんストップ」で一時停止。
- **2026-08-31（知識管理の再編、要約）**: ui-verification.md を `.claude/rules/` へ移設し `docs/ai/rules/` を廃止。規約スキル 3 つ（claude-md/rules/skills-convention）を追加、housekeep に CLAUDE.md 監査・README 整合の手順を追加。`.vscode` 削除。
- **2026-08-31（仮想ガチャ、要約）**: ガチャ・課金仕様を調査（検索要約ベース・実測未確認）して game-spec.md「ガチャと課金」に記録し、ヘッダ右上アイコンから開く仮想ガチャ（ピックアップのみ・有償ダイヤのみ・天井なし）を実装（〜8f60be8）。
- **2026-08-31（機能追加+UI、要約）**: 所持カードモード、スキーマ拡張で構造化率 100%（テストで強制）、UI 磨き込み第 3〜9 弾（経緯は git log 参照）。
- **2026-08-31（要約）**: Phase 0〜4.5 を 1 日で実施し公開まで完了。https://hoshock.github.io/HolodoriOptimizer/ で公開中。

## コンパクション地点のログ（2026-09-01 housekeep 5 回目）

- 未コミットの変更: 本棚卸しの反映のみ — `.claude/rules/ui-design.md`（UI 規則 10 件前後を統合・バッジ前提の旧 3 箇条を書き換え）、README.md（機能一覧を現状に同期）、docs/ai/tmp/（rules.md 空化・plan/progress 縮約）。src/ は main（ace1216）と一致
- 未 push: 同上（棚卸し分は指示があるまで commit しない — ただし従来どおり Stop hook が commit+push を要求する見込み）
- 次のアクション: plan.md「残作業」の Step 4（ボード青マス配分）。ただしユーザーが「いったんストップ」中のため、再開指示（「4 やって」等）を待つ
- 参照すべき方針: 分担表= CLAUDE.md、UI 制約= `.claude/rules/ui-design.md`（アイコン・表・レイアウト規則を集約済み）、UI 確認手順= `.claude/rules/ui-verification.md`、規約= `.claude/skills/` の claude-md/rules/skills-convention、権利= docs/human/rights-policy.md、ゲーム実仕様= docs/human/game-spec.md、期待値の仮定値= src/data/live.ts（pending 6）、データ更新の約束事= src/data/README.md（構造化 100% 必須・★5 のみ探索）
- 運用メモ: このセッションでは「main に直接プッシュでいい」の指示を受けており、機能変更は branch `claude/holodor-optimizer-party-ahh84e` と main の両方へ push、デプロイは deploy.yml の完了を Monitor で確認している。UI 変更はサンプル画像（playwright 390px 実測のスクリーンショット）を共有して承認を得てからコミットする流れが確立している
