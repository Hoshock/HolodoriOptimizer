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
- 備考（実行環境）: playwright-cli は `npx -y @playwright/cli@latest` を scratchpad の cwd で使い、`--config` は `open` にだけ付ける。dev サーバはしばらくすると落ちていることがあるので、撮る前に `curl` で 200 を確かめ、落ちていたら `cd /home/user/HolodoriOptimizer && (nohup pnpm dev --host 127.0.0.1 --port 5173 > <log> 2>&1 &)` で再起動する（Bash の cwd は毎回 /home/user に戻るので cd が要る。`pkill -f "vp dev"` は自分のシェルも殺す）。ブラウザセッションも落ちることがあり（`eval` が Node のスタックトレースで終わる）、`close` → `open --config` で開き直す。開き直すと localStorage も消えるので、所持カード・ボードなどは `eval` で再投入する。ページの再読み込みは `reload` / `goto <url>` を使う（`eval "location.reload()"` は効かないことがある）。`eval` でクリックした直後の DOM 読み取りは再描画前の値になることがあるので、状態の確認はスクリーンショットか次の呼び出しで行う。`close` → `open` で開き直すとビューポートは既定（1280px）に戻るので、そのたびに `resize 390 844` をやり直す（1280px の画像を出して「なぜスクショがモバイルじゃないの？」— 2026-09-06）。`<template>` の変更は HMR で反映されないことがある（スクリプト部だけ更新され古い描画になる）— 撮る前に `curl` で配信中の `.vue` モジュール（`/HolodoriOptimizer/src/components/<Name>.vue`）の該当バインディングを grep し、古ければ dev サーバを再起動する（`ps -eo pid,args | grep -E "node.*(vp|vite)"` で PID を取って kill してから `pnpm dev ... --force`。`pkill -f vite` も自分のシェルを殺す — 2026-09-06、同じ指摘を 2 回させた）。
