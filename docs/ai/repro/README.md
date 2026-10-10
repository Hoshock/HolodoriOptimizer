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
- **bare（マスの表記値の単純合計）と 実効（コネクト増幅込み）を混同しない。** 解析 fixture に入れてよいのは実効のほう（例: K7 の 水着フブキ の発動率は bare 6% に対し実効 15%。[display-score-20260912.md](./display-score-20260912.md)）。
- 表は raw JSON から機械生成し、手で転記しない（`src/data/accountSnapshot.fixture.ts` が唯一の読み口、`src/engine/accountSnapshot.audit.test.ts` が一致を固定する）。
- 日付ごとに別ファイルにし、**過去の観測を現在の snapshot で上書きしない**。どの観測がどの時点の snapshot を使うかは解析コーパス側で明示する。
- **実験中の途中状態（transient）は snapshot にしない。** snapshot は各日の**現在状態**だけを持ち、途中状態は「snapshot からのマスの ON / OFF」として観測資料側に書く（`src/data/accountSnapshot.fixture.ts` の `withBlueNodes()` が raw から再構成する）。例: [display-score-20260913-frequency.md](./display-score-20260913-frequency.md) の 4 状態に対し、snapshot はその終了時点 1 つだけ。[display-score-20260913-blue-weight.md](./display-score-20260913-blue-weight.md) の 9 状態は snapshot より**あと**の状態で、こちらも snapshot からの差分として書く。

## 残さないもの

- 作業の時系列日誌
- 一般式の説明
- モデルから逆算した値を実機観測と同じ列に置くこと
- 後から思い出した条件を確定値のように補うこと

観測値の訂正と `cross-checked` の扱いは [../evidence-policy.md](../evidence-policy.md)「実機 Golden」が正典。
