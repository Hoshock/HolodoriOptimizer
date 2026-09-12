# HolodoriOptimizer

『hololive Dreams』（ホロドリ）の編成を試算する非公式ファンツール。Vue 3 + TypeScript の静的サイトとしてGitHub Pagesで公開する。

## 最初に読むもの

1. `README.md`
2. `docs/index.md`
3. **ゲーム事実・データ・逆解析なら `docs/human/evidence-policy.md` を必ず読む**
4. 変更対象に一致する `.claude/rules/*.md`
5. 必要な `.claude/skills/*/SKILL.md`

## 情報の権威と不確実性

ゲーム仕様は **実機表示 > 公式・公開構造情報 > 外部解析 > 仮説** を基本とする。ただし人が実機から転記した値にもヒューマンエラーは起こり得る。`reported / rechecked / cross-checked`、転記、再構成、推定を区別する。詳細は `docs/human/evidence-policy.md`。

カード仕様を調べるとき、`cards.json` の検索スニペットだけを根拠にしない。必ずカードID・ホロメンID・リーダー/メンバー役割・開花段階を確認し、途中開花は `cardAtBloomWithProvenance()` 相当で出所を確認する。

## コマンド

```bash
pnpm install
pnpm dev
pnpm check
pnpm test
pnpm build
```

コード変更は `check / test / build` を通す。CIとPages buildも3つを実行する。

## 知識の置き場

| 種類 | 正典 |
| :--- | :--- |
| ユーザー向け概要 | `README.md` |
| 運用規則 | `CLAUDE.md` / `.claude/rules/` |
| 証拠・provenance | `docs/human/evidence-policy.md` |
| カードDB出所 | `docs/human/card-data-provenance.md` |
| ゲーム仕様 | `docs/human/game-spec.md` |
| 表示スコア逆解析 | `docs/human/display-score.md` |
| 再現観測 | `docs/human/repro/` |
| 設計判断 | `docs/adr/` |
| 未解決 | `docs/ai/tmp/pending.md` |

時系列作業ログはGit履歴・Issueへ置き、docsを日誌にしない。

## 逆解析の原則

- Golden実測値をモデルに合わせて変更しない。
- ユーザーが誤記を明示した場合だけ訂正し、理由を履歴に残す。
- 単発実機報告を尊重するが無誤謬とは扱わない。重要な対照では入力条件を再読する。
- 式から逆算した値を実測欄へ入れない。
- ケース別magic constantは禁止。
- 同時に複数要因が変わった観測を単独差分と呼ばない。
- 現在アカウント状態を過去観測へ流用しない。
- 実装の近似とゲーム内部式を分ける。反証済み実装は「既知の近似」と明記する。
- 仮説に反例が出たら例外を継ぎ足す前に棄却を検討する。

## カードデータ

- `src/data/cards.json` は取り込み元レコード。ランタイム正典は `src/data/index.ts` の `cards` / `cardById`。
- 実機訂正は `src/data/cardCorrections.ts` で明示しテスト固定する。
- `bloomVariants.raw` を自動的に「ゲーム内原文」と呼ばない。`src/data/bloomEvidence.ts` を確認する。
- `estimated-from-max` は試算値であってゲーム事実ではない。

## 注意

- 全ドキュメントは日本語。識別子・パスは原文のまま。
- 公式画像・音声・映像・スクリーンショット、解析ダンプをコミットしない。
- 非公式ファンツール・試算値の表示を消さない。
- 公開済みIDを改名しない。
- push前に最新mainを再確認し、並行エージェントとの競合を確認する。
