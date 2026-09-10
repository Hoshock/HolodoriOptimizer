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
- **全画面に効く扱いを入れたら、その要素を持つ画面を全部確認する**（同種 3 回目 — 2026-09-05 ピッカーだけ見て push しメイン側が直っていなかった / 2026-09-07 閉じるボタンを共通化したのに結果詳細のヘッダだけ 12px のまま / 2026-09-10 「脚注を初期表示から外す」を結果詳細にだけ入れて発動頻度のシートで「できてない」と指摘された）。対象の一覧は `rg` で拾ってから 1 つずつ実測する（例: `rg -l "footnotes" src/components`）。
- 同じ部品がメイン画面とピッカーの両方に出る変更は、両方のスクリーンショットと boundingBox を撮る（ピッカーだけ確認して push し、メイン側の別実装が直っていなかった — 2026-09-05）。ヘッダの高さもページとモーダルの両方で実測する。部品を共通化した直後（閉じるボタンなど）は、同種の全画面（全シート）を一括で実測する — 結果詳細だけ 12px/18px のヘッダが残っていた（2026-09-07）。
- iOS 固有の見え方（`<button>` の既定文字色がシステムの青、電話番号の自動リンク化など）は Linux の Chromium では再現しない。ユーザーの実機報告は場所が曖昧なら先に「どの画面のどの数字か」を確認してから原因を探す（結果一覧の青い数字を電話番号検出と誤診した — 2026-09-07）。
- 備考（実行環境）: playwright-cli は `npx -y @playwright/cli@latest` を scratchpad の cwd で使い、`--config` は `open` にだけ付ける。`--config` は**ファイルパスを取る**（インライン JSON を渡すと ENOENT — 2026-09-09。scratchpad に `pw.json` を書いてそのパスを渡す）。`eval` は関数式で渡す（`"() => { ... }"`。文と文の途中で切れる式は SyntaxError）。HMR の古い描画を避けたいときは `pnpm build` → `pnpm preview --port 4173` を撮る（配信中の JS のハッシュを `curl` で dist の中身と突き合わせて確かめる — 2026-09-09）。dev サーバはしばらくすると落ちていることがあるので、撮る前に `curl` で 200 を確かめ、落ちていたら `cd /home/user/HolodoriOptimizer && (nohup pnpm dev --host 127.0.0.1 --port 5173 > <log> 2>&1 &)` で再起動する（Bash の cwd は毎回 /home/user に戻るので cd が要る。`pkill -f "vp dev"` は自分のシェルも殺す）。ブラウザセッションも落ちることがあり（`eval` が Node のスタックトレースで終わる）、`close` → `open --config` で開き直す。開き直すと localStorage も消えるので、所持カード・ボードなどは `eval` で再投入する。ページの再読み込みは `reload` / `goto <url>` を使う（`eval "location.reload()"` は効かないことがある）。`eval` でクリックした直後の DOM 読み取りは再描画前の値になることがあるので、状態の確認はスクリーンショットか次の呼び出しで行う。`close` → `open` で開き直すとビューポートは既定（1280px）に戻るので、そのたびに `resize 390 844` をやり直す（1280px の画像を出して「なぜスクショがモバイルじゃないの？」— 2026-09-06）。`<template>` の変更は HMR で反映されないことがある（スクリプト部だけ更新され古い描画になる）— 撮る前に `curl` で配信中の `.vue` モジュール（`/HolodoriOptimizer/src/components/<Name>.vue`）の該当バインディングを grep し、古ければ dev サーバを再起動する（`ps -eo pid,args | grep -E "node.*(vp|vite)"` で PID を取って kill してから `pnpm dev ... --force`。`pkill -f vite` も自分のシェルを殺す — 2026-09-06、同じ指摘を 2 回させた）。
