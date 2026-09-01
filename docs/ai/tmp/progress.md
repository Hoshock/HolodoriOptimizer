# 進捗ログ

進行中タスクのステータスと時系列ログ。日付は最新が上。恒久化すべき内容は都度 ADR / docs/human/ へ昇格し、ここには昇格前の生の状況のみ残す。

## ステータス

| カテゴリ     | 状況                                                                                    | 次のアクション                                   |
| :----------- | :-------------------------------------------------------------------------------------- | :----------------------------------------------- |
| Phase 0〜4.5 | 完了・公開済み（plan.md の完了サマリ参照）                                              | —                                                |
| 期待値最適化 | Step 1〜3+UI 刷新+開花（凸）対応+ピッカー操作性まで完了・デプロイ済み（main = 480c5be） | Step 4（ボード配分）はユーザーの再開指示待ち     |
| 保留事項     | 7 件（pending.md）。1 は人間確認、2・5 はユーザー確認待ち、6・7 は仮定値運用で合意済み  | ガイドライン原文確認・実機の開花文言の共有を待つ |

## 時系列ログ

- **2026-09-01（結果表示刷新+開花対応+ピッカー操作性、要約）**: 候補数入力廃止・10 件逐次表示・誘導/説明テキスト全廃（〜28b8428）→開花(凸)対応: bloomVariants スキーマ+仮定倍率の推定計算+凸ステッパー+花アイコン+リーダー行の無彩色バンド（60092eb。段階仕様はユーザー確認、実数値は非公開のため推定 — 根拠は game-spec.md 育成と pending 7）→ステッパー上下限の押下無効化（52cfd4f）→ピッカーの状態フィルター+絞り込み保持+選択中の先頭フィーチャー（480c5be）。全 push でデプロイ成功確認済み。この回から「コミット・push は承認後のみ」ルール運用（CLAUDE.md 注意点に昇格）

- **2026-09-01（期待値最適化 Step 1〜3+UI 刷新、要約）**: タブ統合(1 フロー 6 ステップ・セグメンテッドコントロール・入口 disabled・メンバー枠は上から順)→アクティブ/SP 期待値エンジン(`src/data/live.ts`+`src/engine/live.ts`、総合期待スコア=unitScore×(1+active+sp)、検算できる内訳表)→曲別最適化(SongPicker、曲長を期待値へ反映)→リーダー常時おまかせ(衣装スキル同型クラス評価+上限枝刈りで 7.9 億通り約 4 秒)→文言刷新(名詞見出し・件数は行ボタン内の値・既定値「おまかせ」)→正円アイコン化(`SkillIcon.vue`、サンプル画像 3 往復で確定)。各段階で 390px 実測・check/test/build green・main へ push・デプロイ成功確認済み(〜ace1216)。導かれた UI 規則は棚卸し 5 回目で `.claude/rules/ui-design.md` へ昇格済み。2026-09-01「オーケー3は完了でいったんストップ」で一時停止。
- **2026-08-31（知識管理の再編、要約）**: ui-verification.md を `.claude/rules/` へ移設し `docs/ai/rules/` を廃止。規約スキル 3 つ（claude-md/rules/skills-convention）を追加、housekeep に CLAUDE.md 監査・README 整合の手順を追加。`.vscode` 削除。
- **2026-08-31（仮想ガチャ、要約）**: ガチャ・課金仕様を調査（検索要約ベース・実測未確認）して game-spec.md「ガチャと課金」に記録し、ヘッダ右上アイコンから開く仮想ガチャ（ピックアップのみ・有償ダイヤのみ・天井なし）を実装（〜8f60be8）。
- **2026-08-31（機能追加+UI、要約）**: 所持カードモード、スキーマ拡張で構造化率 100%（テストで強制）、UI 磨き込み第 3〜9 弾（経緯は git log 参照）。
- **2026-08-31（要約）**: Phase 0〜4.5 を 1 日で実施し公開まで完了。https://hoshock.github.io/HolodoriOptimizer/ で公開中。

## コンパクション地点のログ（2026-09-01 housekeep 6 回目）

- 未コミットの変更: 本棚卸しの反映のみ — CLAUDE.md（注意点に push 承認ルール）、`.claude/rules/ui-design.md`（2026-09-01 後半の規則 10 件前後を統合・「最大強化前提」の陳腐化修正）、README.md（開花機能を追記）、docs/ai/tmp/（rules.md 空化・plan/progress 更新）。src/ は main（480c5be）と一致
- 未 push: 同上（棚卸し分は承認を得てから commit+push する — CLAUDE.md 注意点のルールに従い、承認前は stash 退避）
- 次のアクション: plan.md「残作業」の Step 4（ボード青マス配分）。ただしユーザーが「いったんストップ」中のため、再開指示（「4 やって」等）を待つ。開花の実文言・2凸パラメータ上昇量が共有されたら bloomVariants / 仮定値を実値に置き換える（pending 7）
- 参照すべき方針: 分担表= CLAUDE.md、UI 制約= `.claude/rules/ui-design.md`、UI 確認手順= `.claude/rules/ui-verification.md`、規約= `.claude/skills/` の claude-md/rules/skills-convention、権利= docs/human/rights-policy.md、ゲーム実仕様= docs/human/game-spec.md、期待値の仮定値= src/data/live.ts（pending 6）、開花の仮定値= src/data/bloom.ts（pending 7）、データ更新の約束事= src/data/README.md（構造化 100% 必須・★5 のみ探索・開花最大とみなす）
- 運用メモ: 「main に直接プッシュでいい」指示により、機能変更は branch `claude/holodor-optimizer-party-ahh84e` と main の両方へ push し、デプロイは deploy.yml の完了を Monitor で確認する。UI 変更はサンプル画像（playwright 390px 実測）共有→承認→コミット→push の流れ（承認ルールは CLAUDE.md 注意点）。playwright-cli は scratchpad cwd で `--config pw-config.json`、dev サーバが落ちていたら `pnpm dev` を再起動してから open
