# 再現資料

ここには、後から同じ条件を組み直して観測を検証するために必要なデータを置く。証拠状態の定義は [../evidence-policy.md](../evidence-policy.md)。

## 残すもの

- 編成、開花、Lv、ボード状態などの入力条件
- 実機で表示された値
- 操作前後で何だけを変えたか
- 観測日時点のスナップショット
- 観測状態: `reported` / `rechecked` と、独立算術確認があれば `cross-checked`
- 不明な入力は推測で埋めず「不明」「約」「未再確認」と書く

## アカウントスナップショットと「実効値」

`*-account-snapshot.md` は、サイトの「データの出力」で得た `holodori-optimizer/account` の出力（raw export）をそのまま貼る。

- **raw（解放マス ID・コネクトの配置）と derived（実効値）を分けて書く。** derived は production の `connectFactorMapOf` → 各色の `*BoardEffects` で**再構成した**値であって実機表示ではない（証拠状態は `derived`）。
- **bare（マスの表記値の単純合計）と 実効（コネクト増幅込み）を混同しない。** 解析 fixture に入れてよいのは実効のほう。2026-09-13 に bare の 6% を入れて `W_blue` の解析を誤らせた事故がある。
- 表は raw JSON から機械生成し、手で転記しない（`src/data/accountSnapshot.fixture.ts` が唯一の読み口、`src/engine/accountSnapshot.audit.test.ts` が一致を固定する）。
- 日付ごとに別ファイルにし、**過去の観測を現在の snapshot で上書きしない**。どの観測がどの時点の snapshot を使うかは解析コーパス側で明示する。
- **実験中の途中状態（transient）は snapshot にしない。** snapshot は各日の**現在状態**だけを持ち、途中状態は「snapshot からのマスの ON / OFF」として観測資料側に書く（`src/data/accountSnapshot.fixture.ts` の `withBlueNodes()` が raw から再構成する）。例: 2026-09-13 の発動頻度 ownership 系列（[display-score-20260913-frequency.md](./display-score-20260913-frequency.md)）は 4 状態あるが、snapshot はその終了時点 1 つだけ。

## 残さないもの

- 作業の時系列日誌
- 一般式の説明
- モデルから逆算した値を実機観測と同じ列に置くこと
- 後から思い出した条件を確定値のように補うこと

実機観測はモデルに合わせて変更しない。ユーザーが誤記を明示した場合のみ訂正し、理由をGit履歴に残す。カテゴリ和やunit score式の一致は `cross-checked` として価値があるが、カード・編成・Lvの取り違えを否定するものではない。
