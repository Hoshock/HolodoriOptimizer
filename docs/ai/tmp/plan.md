# 開発計画: ホロドリ パーティ編成最適化ツール

『hololive Dreams』のユニット編成(リーダー 1 + メンバー 5)を最適化する静的サイトを作り、GitHub Pages で公開する。設計判断は ADR-001〜003、ゲーム仕様は [docs/human/game-spec.md](../../human/game-spec.md)、権利の枠は [docs/human/rights-policy.md](../../human/rights-policy.md) が前提。

## 要件(確定)

- 技術: Vue 3 + TypeScript + Vite+ (`vp`) + pnpm。GitHub Actions → GitHub Pages(ADR-001)
- データ: 全★5 カード・全楽曲・全ホロメンの衣装スキルをテキスト DB として保持(ADR-002)
- 最適化: リーダー指定でメンバー 5 人を最適化 / 一部メンバー固定で残り枠のみ最適化 / TOP n 候補の提示(ADR-003)
- 将来対応を見込む: 特定楽曲向け最適化、ホロメンボード補正、特定カード除外
- UI: 画一的な AI 生成風デザイン(shadcn / Tailwind 的テンプレート)を避け、利用者本位のシンプルで分かりやすい手書きデザイン

## Phase 0: 調査・方針決定 — 完了 (2026-08-31)

ゲーム仕様・既存ツール・権利関係・Vite+ を調査し、ADR-001〜003 と docs/ 骨格を作成した。詳細は [docs/human/tmp/20260831-prior-research.md](../../human/tmp/20260831-prior-research.md)。

## Phase 1: スキャフォールドとデプロイ確認

- [x] `vp create vite:application -- --template vue-ts` でスキャフォールド。pnpm 11.24.0 固定、catalog + overrides は生成された `pnpm-workspace.yaml` のまま
- [x] `vite.config.ts` に `base: '/HolodoriOptimizer/'`。fmt / lint / 型検査は `vp check` に集約(Markdown も整形対象)
- [x] GitHub Actions: ci.yml(PR/ブランチで `pnpm check` + `pnpm build`)と deploy.yml(main → Pages。`vite-plus` は devDependency なので setup-vp 不要、ADR-001 の Update 参照)
- [x] LICENSE (MIT) 追加済み
- [x] プレースホルダーページ(免責文入り・手書き CSS・ダークモード対応)作成、ローカルで `pnpm check` / `pnpm build` 通過
- [ ] main マージ後: deploy.yml の実行と Pages での表示を確認(`actions/configure-pages` の enablement で自動有効化を試み、失敗時は Settings > Pages で Source: GitHub Actions を手動設定)

## Phase 2: データ層 — ほぼ完了 (2026-08-31)

- [x] スキーマ定義(`src/data/types.ts`): Holomen / Affiliation / Card(4 系統スキルは raw 原文 + structured の二重持ち)/ Song / DatasetMeta。テキストパースをしない構造化表現
- [x] データバリデーション(`src/data/validate.ts` + `dataset.test.ts`)を `vp test` に組込み
- [x] ★5 全 70 枚・楽曲 181 曲・ホロメン 54 名・所属 15 件を投入。初期ソースは先行公開ツールの内蔵データの事実情報転記(pending 6 で要ユーザー確認)。構造化率: 衣装 77% / パッシブ 84% / アクティブ・SP 100%(null は「自身対象」と「スコアサポート複合」でスキーマ未対応のもの)
- [x] 出典・確認日を `src/data/meta.json` に記録
- [ ] スキーマ拡張(パッシブの「自身」対象、衣装スキルのスコアサポート成分)で構造化率を上げる

## Phase 3: 計算エンジン — ほぼ完了 (2026-08-31)

- [x] スコアモデル(`src/engine/score.ts`): メンバー 5 人合算 → 衣装スキル乗算、内訳つき。純粋関数
- [x] 全探索最適化(`src/engine/optimize.ts`): リーダー固定 / 一部メンバー固定(0〜4 人)/ カード除外 / TOP n / 進捗コールバック / 同一ホロメン排他。探索はアロケーション排除の高速パス(70 枚 C(69,5)≈1,124 万通りを実測約 5 秒)、内訳は上位のみ再計算
- [x] 単体テスト 7 件(条件判定・パッシブ適用・排他・固定・除外・降順)
- [x] Web Worker 化(`src/engine/worker.ts` + `useOptimizer` composable。進捗バー・中止つき)
- [ ] 実測値との突き合わせで係数検証(pending 4 参照)

## Phase 4: UI — ほぼ完了 (2026-08-31)

- [x] 画面実装: リーダー選択(衣装スキル原文表示)→ 固定メンバー(最大4)→ 除外カード → TOP n → 結果一覧(スコア・タイプバッジ・固定バッジ・P/T/S 内訳・未構造化スキルの警告表示)
- [x] デザイン: 手書き CSS(フレームワーク非依存)、システムフォント、ダークモード、モバイル対応グリッド、免責文フッター常時表示
- [x] Web Worker + プログレスバー + 中止ボタン(探索中も UI が固まらない)
- [x] playwright-cli による E2E 動作確認(リーダーのみ 1,048 万通り・固定 1 人 78 万通りの双方で結果表示を確認。postMessage の DataCloneError を検出して修正)
- [ ] 手動編成(5 人指定)のスコア試算ビュー
- [ ] スキルの寄与内訳(どのスキルが何 % 効いたか)の表示

## Phase 5(将来): 拡張

- 特定楽曲向け最適化(曲長・コンボ数 × アクティブスキル発動周期)
- ホロメンボード補正の入力(入力方式は pending 参照)
- 所持カード絞り込み(localStorage)
