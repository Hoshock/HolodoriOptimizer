# HolodoriOptimizer

『hololive Dreams』(ホロドリ)のパーティ編成を最適化する非公式ファンツール。Vue 3 + TypeScript の静的サイトとして GitHub Pages で公開する。パブリックリポジトリであり、権利関係の制約(注意点参照)がすべての変更に優先する。

## ディレクトリ構成

```txt
.
├── .claude/
│   ├── rules/      # パス単位のルール(必ず paths: glob つき)
│   └── skills/     # housekeep (コマンド型)、induction (知識型)
├── .github/
│   └── workflows/  # ci.yml (PR/ブランチの check+build)、deploy.yml (main → GitHub Pages)
├── docs/
│   ├── adr/        # 意思決定の記録(形式は adr/index.md 冒頭を参照)
│   ├── ai/
│   │   ├── rules/  # エージェント向け恒久ルール。index.md が入口
│   │   └── tmp/    # 揮発性の作業ドキュメント (plan/progress/pending/rules) — タスク進行中のみ存在
│   ├── human/      # 人間向けドキュメント。tmp/ には日付つき調査スナップショット (YYYYMMDD-<topic>.md)
│   └── index.md    # 全ドキュメントの索引 — ドキュメントの追加・移動の前に読む
└── src/            # アプリ本体(Vue SFC + TypeScript)
```

## コマンド

```bash
pnpm install       # 依存インストール(pnpm は devEngines/packageManager で 11.24.0 に固定)
pnpm dev           # 開発サーバ (vp dev)
pnpm check         # フォーマット + lint + 型検査 (vp check)。--fix で自動整形。Markdown も整形対象
pnpm test          # テスト (vp test)
pnpm build         # vue-tsc -b && vp build → dist/
pnpm preview       # ビルド結果のプレビュー
```

コミット前に `pnpm check` と `pnpm build` を通すこと(CI と同じ検査)。

## 技術スタック

| 領域           | 技術                          | 備考                                                      |
| :------------- | :---------------------------- | :-------------------------------------------------------- |
| フロントエンド | Vue 3 + TypeScript            | Composition API + `<script setup>`                        |
| ツールチェーン | Vite+ (`vp`) + pnpm           | 0.x のため破壊的変更に注意。ADR-001 参照                  |
| ゲームデータ   | リポジトリ内 JSON/TS(手入力)  | 画像・公式アセット禁止、解析ダンプ由来禁止。ADR-002 参照  |
| 計算エンジン   | ブラウザ内 TypeScript         | 全探索ベース。Web Worker / 枝刈りは拡張点。ADR-003 参照   |
| デプロイ       | GitHub Actions → GitHub Pages | `base: '/HolodoriOptimizer/'`。サーバ・外部 API・計測なし |

## ドキュメントの分担

| 内容の種類                                  | 置き場                                                                                   |
| :------------------------------------------ | :--------------------------------------------------------------------------------------- |
| ユーザーのフィードバック / 新しいルール候補 | `docs/ai/tmp/rules.md` に induction スキルで記録 — フィードバックと同じターン内に行う    |
| エージェント向け恒久ルール(パス単位でない)  | `docs/ai/rules/` + `docs/ai/rules/index.md` への行追加                                   |
| 特定のパス配下でのみ適用されるルール        | `.claude/rules/`(必ず `paths:` glob つき。無条件なら CLAUDE.md へ)                       |
| 覆しにくい横断的な意思決定                  | `docs/adr/` に新規 ADR(形式は `docs/adr/index.md` 冒頭)                                  |
| 進行中の特定タスク(計画・進捗・保留)        | `docs/ai/tmp/`(plan.md / progress.md / pending.md)— タスク完了時に昇格してから丸ごと削除 |
| 人間向けリファレンス                        | `docs/human/` + `docs/index.md` への行追加                                               |
| 陳腐化を許容する時点スナップショット調査    | `docs/human/tmp/YYYYMMDD-<topic>.md` + `docs/index.md` への行追加                        |

定例の棚卸し・`docs/ai/tmp/rules.md` からの昇格・タスクのクローズは housekeep スキルで行う(ユーザーが `/housekeep` で起動)。

## 注意点

- このリポジトリでは CLAUDE.md・`.claude/rules/`・スキル・ADR を含む全ドキュメントを日本語で書く。コード識別子・パス・コマンド名は原文のまま。
- **パブリックリポジトリ**である。所属組織・社内システム・個人を特定する情報(氏名・社内 URL・社内リポジトリ名など)を書かない。
- **公式アセット(イラスト・ロゴ・音声・映像・スクリーンショット)をコミットしない。** ゲームデータはテキストのみを手入力で持つ(ADR-002)。ゲームクライアントの解析・データダンプ由来のデータやコードを持ち込まない。
- 非公式ファンツールである旨の免責は README とサイト UI の双方に常に表示する。スコアは「試算値」と明記する。
