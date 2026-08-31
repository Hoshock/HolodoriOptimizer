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

## Phase 2: データ層

- [ ] スキーマ定義: `Holomen`(所属含む) / `Card`(P/T/S、タイプ、4 系統スキル) / `Song`(難易度・時間・コンボ数) / スキル効果の構造化表現(効果種別・対象条件・倍率・発動周期などを列挙型で持ち、テキストパースをしない)
- [ ] データバリデーション(スキーマ検査 + 相互整合チェック)を `vp test` に組み込む
- [ ] ★5 全カード(約 70 枚)・全楽曲・全衣装スキルを手入力(ゲーム画面・公開攻略情報から。ADR-002 の範囲厳守)
- [ ] データ出典と入力日をデータファイルのメタ情報として記録

## Phase 3: 計算エンジン

- [ ] スコアモデル実装(メンバー 5 人合算 → 衣装スキル乗算。ADR-003 のコミュニティモデル)を純粋関数で
- [ ] リーダー固定の全探索 + 上位 n 件保持(組合せ生成はイテレータ化し Worker 移行に備える)
- [ ] 一部メンバー固定(1〜4 人)対応、カード除外リスト対応(将来要件の先取りだが探索器の引数として自然に入る)
- [ ] 単体テスト: 既知編成のスコア再現、境界条件(条件人数ちょうど・重複所属)
- [ ] 実測値との突き合わせで係数検証(pending 参照)

## Phase 4: UI

- [ ] 画面設計: リーダー選択 → (任意)固定メンバー・除外指定 → 最適化実行 → TOP n を内訳(どのスキルがいくら寄与したか)つきで表示
- [ ] 手動編成のスコア試算ビュー
- [ ] デザイン方針: 手書き CSS(フレームワーク非依存)、システムフォント、モバイル対応、画像なしでもカードを識別しやすい配色・タイポグラフィ。免責文をフッターに常時表示
- [ ] 探索が長い場合のプログレス表示(この時点で必要なら Web Worker 化)

## Phase 5(将来): 拡張

- 特定楽曲向け最適化(曲長・コンボ数 × アクティブスキル発動周期)
- ホロメンボード補正の入力(入力方式は pending 参照)
- 所持カード絞り込み(localStorage)
