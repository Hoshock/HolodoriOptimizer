---
paths:
  - "src/**/*.{vue,css}"
  - "index.html"
---

# UI の動作確認は playwright-cli で行う

- 操作確認・UI テスト（ブラウザ自動化）には playwright-cli（npm: `@playwright/cli`）を使う。素の playwright / playwright-core スクリプトを直接書かない — 紛らわしくミスの元で、実際に自作スクリプト側の要素選択ミスで「アプリのバグ」と誤検出した実績がある（2026-08-31）。
- playwright-cli はエージェント用スキルを同梱している。`playwright-cli --help` が SKILL.md の場所を表示するので、初回はそれを読んでから使う。
- UI 変更は出す前に、iPhone 実寸ビューポート（390px 級）へ resize して「横スクロールが出ていないこと（`document.documentElement.scrollWidth <= clientWidth`）」「不自然な改行・要素潰れがないこと」をスクリーンショットで確認する。
- 備考（リモート開発環境の起動）: root 実行かつブラウザが `/opt/pw-browsers` にある環境では、`--config` で `{"browser":{"browserName":"chromium","launchOptions":{"executablePath":"/opt/pw-browsers/chromium","headless":true,"chromiumSandbox":false}}}` の指定が必要だった（2026-08-31）。
- 同じ部品がメイン画面とピッカーの両方に出る変更は、両方のスクリーンショットと boundingBox を撮る（ピッカーだけ確認して push し、メイン側の別実装が直っていなかった — 2026-09-05）。ヘッダの高さもページとモーダルの両方で実測する。
- 備考（実行環境）: playwright-cli は `npx -y @playwright/cli@latest` を scratchpad の cwd で使い、`--config` は `open` にだけ付ける。dev サーバが落ちていたら `nohup pnpm dev --host 127.0.0.1 --port 5173 &` を単独の Bash で再起動する（`pkill -f "vp dev"` は自分のシェルも殺す）。`eval` でクリックした直後の DOM 読み取りは再描画前の値になることがあるので、状態の確認はスクリーンショットか次の呼び出しで行う。
