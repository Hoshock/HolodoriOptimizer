# playwright-cli での確認

UI の見た目と操作をブラウザで確かめる手順と、テストとの分担。

## 道具とテストの分担

- 操作の確認・UI テスト(ブラウザ自動化)には playwright-cli(npm: `@playwright/cli`)を使い、素の playwright / playwright-core のスクリプトを直接書かない。自作スクリプトの要素選択のミスを、アプリのバグと取り違えやすいため。
- playwright-cli はエージェント用のスキルを同梱している。`playwright-cli --help` が SKILL.md の場所を表示するので、初回はそれを読んでから使う。
- 見た目と操作は playwright-cli で、構造と状態はテストで固定する。並び・初期状態・トグルの `aria-checked`・二重発火しないことのような、壊れても気づきにくい構造は、ブラウザで 1 回見るだけにせずテストへ置く(`src/components/SideMenu.test.ts`)。テストの環境(happy-dom の宣言、ブラウザモードを使わないこと)は `CLAUDE.md` の「テスト」。リポジトリのファイル(`index.html` / `guides/**` / `public/**`)を読むテストは `node:fs` を使うので、型検査は `tsconfig.node.json` 側のプロジェクトに入れる(`src/seo.test.ts`)。

## 出す前に確かめること

- UI の変更は出す前に、iPhone 実寸のビューポート(390px 級)へ resize して、横スクロールが出ていないこと(`document.documentElement.scrollWidth <= clientWidth`)と、不自然な改行・要素の潰れがないことをスクリーンショットで確かめる。
- 全画面に効く扱いを入れたら、その要素を持つ画面を全部確かめる。対象は `rg` で拾ってから 1 つずつ実測する(例: `rg -l "footnotes" src/components`)。部品を共通化した直後(閉じるボタンなど)は、同種の全画面(全シート)を一括で実測する。1 画面だけ見て出すと、ほかの画面に古い扱いが残る(例: 閉じるボタンを共通化したのに、結果詳細のヘッダだけ古い寸法のまま残った)。
- 同じ部品がメイン画面とピッカーの両方に出る変更は、両方のスクリーンショットと boundingBox を撮る。ヘッダの高さも、ページとモーダルの両方で実測する。
- iOS 固有の見え方(`references/platform.md`)は Linux の Chromium では再現しない。ユーザーの実機報告は、場所が曖昧なら先に「どの画面のどの数字か」を確かめてから原因を探す(結果一覧の青い数字を、電話番号の検出と取り違えやすい)。
- 検証で触ったオプションは保存されるので、続けて別の検証をする前に消す。除外は `selection`、ほかのオプションは `search-all` / `search-options` に残る(保存キーは `.claude/skills/storage-compat/`)。枠の選択(リーダー・メンバー・曲)は保存しないので `reload` で消える。検証の前後で `localStorage.removeItem("holodori-optimizer:selection")` のように消すか、`close` → `open` で開き直す(開き直すと localStorage ごと消える)。

## 実行環境(リモート開発環境)

- playwright-cli は `npx -y @playwright/cli@latest` を scratchpad の cwd で使う。
- root で実行し、ブラウザが `/opt/pw-browsers` にある環境では、`open` に `--config` で `{"browser":{"browserName":"chromium","launchOptions":{"executablePath":"/opt/pw-browsers/chromium","headless":true,"chromiumSandbox":false}}}` を渡す。`--config` は `open` にだけ付け、ファイルのパスを取る(インラインの JSON を渡すと ENOENT になる)。scratchpad に `pw.json` を書いて、そのパスを渡す。
- `eval` は関数式で渡す(`"() => { ... }"`。文の途中で切れる式は SyntaxError)。`eval` でクリックした直後の DOM の読み取りは再描画前の値になることがあるので、状態はスクリーンショットか次の呼び出しで確かめる。ページの再読み込みは `reload` / `goto <url>` を使う(`eval "location.reload()"` は効かないことがある)。
- ブラウザのセッションが落ちることがある(`eval` が Node のスタックトレースで終わる)。そのときは `close` → `open --config` で開き直す。開き直すと localStorage が消えるので、所持カード・ボードなどは `eval` で入れ直す。ビューポートも既定(1280px)に戻るので、そのたびに `resize 390 844` をやり直す。
- dev サーバはしばらくすると落ちていることがある。撮る前に `curl` で 200 を確かめ、落ちていたら `cd /home/user/HolodoriOptimizer && (nohup pnpm dev --host 127.0.0.1 --port 5173 > <log> 2>&1 &)` で起動し直す(Bash の cwd は毎回 /home/user に戻るので cd が要る)。`pkill -f "vp dev"` や `pkill -f vite` は自分のシェルも殺すので使わない。
- `<template>` の変更は HMR で反映されないことがある(スクリプト部だけ更新され、古い描画になる)。撮る前に `curl` で配信中の `.vue` モジュール(`/HolodoriOptimizer/src/components/<Name>.vue`)の該当バインディングを grep し、古ければ dev サーバを起動し直す(`ps -eo pid,args | grep -E "node.*(vp|vite)"` で PID を取って kill してから `pnpm dev ... --force`)。
- HMR の古い描画を避けたいときは、`pnpm build` → `pnpm preview --port 4173` を撮る。配信中の JS のハッシュを `curl` で dist の中身と突き合わせて確かめる。
