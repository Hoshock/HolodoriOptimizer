# 未整理のルール候補 (induction 記録先)

housekeep 時に必ず昇格・整理される。書き方は induction スキルを参照。

## Rules

- 操作確認・UI テスト(ブラウザ自動化)には playwright-cli(npm: `@playwright/cli`)を使う。素の playwright / playwright-core スクリプトを直接書かない(紛らわしくミスの元。実際に自作スクリプト側の選択ミスで誤検出が起きた)。playwright-cli はエージェント用スキルを同梱しており、`playwright-cli --help` が SKILL.md の場所を表示する。(2026-08-31、UI 動作確認へのユーザーフィードバック)

- UI は「何も知らないユーザー」視点のユーザーストーリーから設計する。フォーム然としたドロップダウンの羅列で選ばせない — 検索・フィルタ(期生/タイプ)つきの視覚的な選択 UI にする。除外などのマルチセレクトも一目でわかる形にする。(2026-08-31、初版 UI へのフィードバック)
- デザインはポップに、メリハリ(視覚的階層・強弱)をつける。プロのデザイナーのサイトを参考にした水準の CSS にする(余白のスケール、タイプスケール、限定パレット+アクセント、状態表現)。(2026-08-31、初版 UI へのフィードバック)

## Cases

- リモート開発環境(root 実行・ブラウザは /opt/pw-browsers)では、playwright-cli の起動に `--config` で `{"browser":{"browserName":"chromium","launchOptions":{"executablePath":"/opt/pw-browsers/chromium","headless":true,"chromiumSandbox":false}}}` の指定が必要だった。(2026-08-31、E2E 確認時)
