---
paths:
  - ".claude/skills/parameter-calculation/**"
  - "src/data/*Board.ts"
  - "src/data/boardGraph.ts"
  - "src/data/songSingers.ts"
  - "src/data/events.*"
  - "src/engine/*.ts"
  - "docs/human/game-spec.md"
  - "docs/human/display-score.md"
  - "docs/human/repro/**"
---

# ゲーム仕様・逆解析のルール

## 権威順位

ゲーム仕様は **ユーザーの実機観測 > ゲーム内表示 > 公式・外部から確認できる構造情報 > 外部解析 > 仮説** の順で扱う。実機で原理的に確認できない情報は【外部情報】と明記し、実機確定と混ぜない。解析ダンプそのものをリポジトリへ持ち込まない。

## 正典

- ゲーム仕様の概観: `docs/human/game-spec.md`
- 表示ユニットスコア: `docs/human/display-score.md`
- 実測 Golden と入力条件: `docs/human/repro/`
- 4 色ボードの配置・ノード: `parameter-calculation/references/*-board.md`
- カード詳細 P/T/S・総合力: `parameter-calculation` スキル

同じ式を複数箇所で全文管理しない。古い観測ログより対象別の正典を優先する。

## 実験

- 位置・効果・接続線は別々に検証する。
- ボードは `boardGraph` 上で到達可能な解放集合だけを実機条件にする。実現できない「1 マスだけ変更」を依頼しない。
- 同時に複数要因が変わった観測を単独差分と呼ばない。
- 観測時点と現在のアカウント状態を混ぜない。必要な状態は日付つき再現資料へ残す。
- Golden の実機列をモデルへ合わせて変更しない。モデル列と誤差を更新する。
- ケース別 magic constant を禁止する。1 ケースだけに合う係数を「確定」と呼ばない。
- 1 つの確定事項から、別の未確定項目まで解決済みに広げない。

## 確定している横断事実

- 楽曲はソロ / ユニット / 全体に分け、所属名だけで解けない歌唱者は `songSingers.ts` の明示データを使う。
- イベントの「メンバー」対象と「ホロメン」対象は別に加算する。確認済みイベントのスコアボーナスは +10% 上限で、リーダー枠は対象外。
- 総合力は 6 項目の加算。count 人を選ぶ確認済み効果は素値合計 P+T+S 上位から選ぶ。
- 表示ユニットスコアは `ceil(totalPower × (1 + bonus/100) × 2.03734)`。
- 表示 Active は 200 秒共通タイムラインのモデルが Golden に高精度で一致する。
- 黄の楽曲スコアボーナスは Board カテゴリへ入り、raw で `Y × (100 + Costume + Active + Passive + Special)` を加える観測と整合する。
- 赤スコアサポートの旧 `X × 基準候補秒率` は一般式として**棄却済み**。詳細は `docs/human/display-score.md`。

## 実装との距離

現在コードに残る仮説が新しい実測で崩れた場合、コメントやテストの既存仮説を「確定」として援用しない。まず `display-score.md` と再現コーパスを更新し、実装変更は別の作業として行う。
