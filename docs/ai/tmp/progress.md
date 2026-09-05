# 進捗ログ

進行中タスクのステータスと時系列ログ。日付は最新が上。恒久化すべき内容は都度 ADR / docs/human/ へ昇格し、ここには昇格前の生の状況のみ残す。

## ステータス

| カテゴリ     | 状況                                                                                                                                                                                        | 次のアクション                                       |
| :----------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------- |
| Phase 0〜4.5 | 完了・公開済み（plan.md の完了サマリ参照）                                                                                                                                                  | —                                                    |
| 期待値最適化 | Step 1〜3+UI 刷新+開花（凸）対応+ピッカー操作性+SEO・改名+保存層+おかゆモード+スキル発動のしぼりこみ+曲ピッカー刷新（アーティスト・193 曲・並び順）まで完了・デプロイ済み（main = ba82eee） | Step 4（ボード配分）はユーザーの再開指示待ち         |
| 保留事項     | 8 件（pending.md）。1 は人間確認、2・5 はユーザー確認待ち、6・7 は仮定値運用で合意済み、8 は SEO 経過（余白バグ 9 は 2026-09-05 ユーザー判断で解消扱い）                                    | ガイドライン原文確認・実機の開花文言・SEO 経過を待つ |

## 時系列ログ

- **2026-09-05（曲ピッカー刷新+楽曲追加、要約）**: 「楽曲の数少ない・ピッカーを更新したい・未選択時のおまかせ表記に違和感」→ 出典の artist を `artists` として転記、所属チップ+オリジナル/カバー セグメント+2 列行のピッカー、Step 5 未指定は「指定なし / 中央値」に。ゲーム側 193 曲との差 12 曲はユーザーが別エージェントで収集した JSON（Game8・horodori.com・wikiwiki 照合）から手入力（攻略サイトはこの環境から egress 不可）。サンプル画像 5 枚で承認 →「そのまま実装して push」（8caec02）。続けて並び順（曲長・Lv、既定は長い順）: 4 分割セグメント→「同じボタンでトグル」→ ⇅ の反転記号→「▲▼ の片方」の 3 往復で確定・push。フィードバックは rules.md に事例として記録
- **2026-09-05（スキル発動のしぼりこみ、要約）**: Step 6 に「衣装スキル発動」「パッシブ全員発動」のしぼりこみを追加（e305937。エンジンに requireCostumeSkill / requireAllPassives、テスト 3 件、README・sitemap lastmod 更新）→ユーザー指摘 2 件（チェックマークはルール違反で削除、既定 ON にすると実行ボタンと見分けがつかない）→既定 ON+ピッカーの所属チップと同形のピル化で形・高さ・幅により役割を分ける（0791e07）。両 push でデプロイ成功確認済み。フィードバック 3 件は棚卸し 9 回目で ui-design.md に統合
- **2026-09-01〜02（SEO・保存層・おかゆモード、要約）**: ピッカーの自動フォーカスをシートへ（faa08bd）→「ホロドリ編成お助けツール」へ改名+title/description/OGP/robots/sitemap/Search Console 確認タグ（67397b0。インデックス登録の経過は pending 8）→所持カード保存層の後方互換+ID 凍結（356f19a）→おかゆモード（089b5cd→3e465b9→a43a0f7。仕様の確定経緯: リーダー固定+メンバー 1 枚、全カード/所持で挙動が違う、案内はラベルで、先頭へ戻る、最後の枠の表示は 4 枚選択後のみ）。全 push でデプロイ成功確認済み。余白バグ報告は pending 9
- **2026-09-01（結果表示刷新+開花対応+ピッカー操作性、要約）**: 候補数入力廃止・10 件逐次表示・誘導/説明テキスト全廃（〜28b8428）→開花(凸)対応: bloomVariants スキーマ+仮定倍率の推定計算+凸ステッパー+花アイコン+リーダー行の無彩色バンド（60092eb。段階仕様はユーザー確認、実数値は非公開のため推定 — 根拠は game-spec.md 育成と pending 7）→ステッパー上下限の押下無効化（52cfd4f）→ピッカーの状態フィルター+絞り込み保持+選択中の先頭フィーチャー（480c5be）→タップハイライト全体無効化・結果見出しの「X 通り」削除・リーダー行のセパレータ化・詳細のピン廃止（70e48fb〜1e4d3d9）→ピッカー選択スタイルの統一・チップ✓削除（cf4066e）。全 push でデプロイ成功確認済み。この回から「コミット・push は承認後のみ」ルール運用（CLAUDE.md 注意点に昇格）

- **2026-09-01（期待値最適化 Step 1〜3+UI 刷新、要約）**: タブ統合(1 フロー 6 ステップ・セグメンテッドコントロール・入口 disabled・メンバー枠は上から順)→アクティブ/SP 期待値エンジン(`src/data/live.ts`+`src/engine/live.ts`、総合期待スコア=unitScore×(1+active+sp)、検算できる内訳表)→曲別最適化(SongPicker、曲長を期待値へ反映)→リーダー常時おまかせ(衣装スキル同型クラス評価+上限枝刈りで 7.9 億通り約 4 秒)→文言刷新(名詞見出し・件数は行ボタン内の値・既定値「おまかせ」)→正円アイコン化(`SkillIcon.vue`、サンプル画像 3 往復で確定)。各段階で 390px 実測・check/test/build green・main へ push・デプロイ成功確認済み(〜ace1216)。導かれた UI 規則は棚卸し 5 回目で `.claude/rules/ui-design.md` へ昇格済み。2026-09-01「オーケー3は完了でいったんストップ」で一時停止。
- **2026-08-31（知識管理の再編、要約）**: ui-verification.md を `.claude/rules/` へ移設し `docs/ai/rules/` を廃止。規約スキル 3 つ（claude-md/rules/skills-convention）を追加、housekeep に CLAUDE.md 監査・README 整合の手順を追加。`.vscode` 削除。
- **2026-08-31（仮想ガチャ、要約）**: ガチャ・課金仕様を調査（検索要約ベース・実測未確認）して game-spec.md「ガチャと課金」に記録し、ヘッダ右上アイコンから開く仮想ガチャ（ピックアップのみ・有償ダイヤのみ・天井なし）を実装（〜8f60be8）。
- **2026-08-31（機能追加+UI、要約）**: 所持カードモード、スキーマ拡張で構造化率 100%（テストで強制）、UI 磨き込み第 3〜9 弾（経緯は git log 参照）。
- **2026-08-31（要約）**: Phase 0〜4.5 を 1 日で実施し公開まで完了。https://hoshock.github.io/HolodoriOptimizer/ で公開中。

## コンパクション地点のログ（2026-09-05 housekeep 10 回目）

- 未コミットの変更（2026-09-05 追記、承認待ちで stash 退避中 `git stash pop` で復元）: あいうえお順（`holomen.json` / `cards.json` に `reading` 追加、`labels.ts` の sortCards / matchesQuery が読みで比較・検索、`readingSortKey` が長音を母音化、`validate.ts` がひらがな検査、テスト fixture に reading 追加、`src/ui/labels.test.ts` 新規）、効果テキストは 2 行固定高（3 行案・縦送り案・3 行固定案をすべて却下、行の隙間 2px）。メイン画面とピッカーの部品を統一 — `UnitSlot` は `CardTile` を包むだけ、曲は `SongRow.vue`（新規）を SongPicker と Step 5 で共用し、幅 358 / 高さ（リーダー 100・メンバー 176・曲 60）を一致。メイン画面は元のパネル（白いカード、16px + 16px）が基準。ピッカーは白い 1 枚のシート（ヘッダ → 絞り込み → 一覧）に戻し、幅の一致は諦めた（同じ部品・同じ固定高で担保。メイン 324 / ピッカー 358 @390px。罫線+接続線・全幅の白い帯・角丸ブロック・ピッカーのカードスタイルはすべて却下）。ピッカーのヘッダはページヘッダと同寸（77px、24px/900 の見出し、下罫線）に揃えた。曲名・アーティストのはみ出しは省略記号（スクロール表示 MarqueeText は「バグってる」で廃止・削除）。結果一覧・詳細はホロメン名とカード名を隣接（行間 14px・-3px）、`src/data/README.md` と `meta.json` notes に読みの約束事、`docs/ai/tmp/rules.md` に induction 記録
- 未コミットの変更（棚卸し 10 回目時点の記述）: 本棚卸しの反映のみ — `.claude/rules/ui-design.md`（並び順コントロールの形・状態記号 ▼/▲ の許容・「おまかせ」と「指定なし」の使い分けを統合）、`src/data/README.md`（楽曲の追加手順）、README.md（並べ替えの一言）、docs/ai/tmp/（rules.md 空化・progress 更新）。src/ は main（ba82eee）と一致
- 未 push: 同上（承認を得てから commit+push。承認前は stash 退避 — CLAUDE.md 注意点）
- 次のアクション: plan.md「残作業」の Step 4（ボード青マス配分）はユーザーの再開指示待ち。開花の実文言・2凸パラメータ上昇量が共有されたら bloomVariants / 仮定値を実値に置き換える（pending 7）。SEO の登録状況はユーザー側で確認（pending 8）。楽曲はゲーム側の追加に追随（手順は src/data/README.md）
- 参照すべき方針: 分担表= CLAUDE.md、UI 制約= `.claude/rules/ui-design.md`、UI 確認手順= `.claude/rules/ui-verification.md`、保存データの互換= `.claude/rules/storage-compat.md`、規約= `.claude/skills/` の claude-md/rules/skills-convention、権利= docs/human/rights-policy.md、ゲーム実仕様= docs/human/game-spec.md、期待値の仮定値= src/data/live.ts（pending 6）、開花の仮定値= src/data/bloom.ts（pending 7）、データ更新の約束事・楽曲追加手順= src/data/README.md、おかゆモード= src/composables/useOkayuMode.ts、しぼりこみ= `optimize.ts` の requireCostumeSkill / requireAllPassives、曲ピッカー= `SongPicker.vue`（絞り込み・並び順の保持は module スコープの filterMemory）と `labels.ts` の affiliationsOfSong
- 運用メモ: 機能変更は branch `claude/holodor-optimizer-party-ahh84e` と main の両方へ push し、デプロイは deploy.yml の完了を Monitor で確認。UI 変更はサンプル画像（playwright 390px 実測）共有→承認→コミット→push（承認ルールは CLAUDE.md 注意点）。playwright-cli は `npx -y @playwright/cli@latest`（グローバルにはない）を scratchpad cwd で使い、`open` のみ `--config pw-config.json` を付ける（resize 等は付けない）。dev サーバが落ちていたら `nohup pnpm dev --host 127.0.0.1 --port 5173 &` を単独の Bash で再起動してから open（`pkill -f "vp dev"` は自分のシェルも殺すので使わない）。eval 直後の DOM 読み取りは再描画前の値になるので、状態確認はスクリーンショットで行う
