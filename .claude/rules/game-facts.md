---
paths:
  - ".claude/skills/parameter-calculation/**"
  - "src/data/**"
  - "src/engine/*.ts"
  - "docs/human/**"
  - "docs/ai/tmp/pending.md"
---

# ゲーム仕様・逆解析のルール

## 必読

証拠状態とprovenanceは `docs/human/evidence-policy.md` が正典。カードDBは `docs/human/card-data-provenance.md` も読む。

## 権威順位

実機表示を最優先する。ただし転記にはヒューマンエラーがあるため、単発報告 `reported` と再確認 `rechecked` を区別する。算術一致 `cross-checked` は入力条件の再確認とは別。

## 実験

- 位置・効果・接続線は別々に検証する。
- 到達可能なボード解放集合だけを条件にする。
- 同時に複数要因が変わった観測を単独差分と呼ばない。
- 観測時点のアカウント状態を現在値で上書きしない。
- Goldenをモデルへ合わせない。
- ケース別magic constantを禁止する。
- 1つの確定から隣接する未確定項目まで確定に広げない。
- カード仕様はID / role / bloom / provenanceを確認してから因果説明へ使う。

## 横断事実

- リーダー1 + メンバー5は別枠。赤はリーダーホロメンからメンバー5へ効く。
- 総合力は6項目の加算モデル。
- count人を選ぶ確認済み効果は対象候補の素値P+T+S上位を選ぶ。
- 表示unit scoreの外側は `ceil(totalPower × (1 + bonus/100) × 2.03734)`。
- Activeは200秒共通タイムラインのモデルが既存Goldenに高精度で一致する。
- 黄10%の直接対照は `Y × (100 + Costume + Active + Passive + Special)` のBoard増分を支持する。
- 赤スコアサポートの旧候補秒率式は一般式として棄却済み。

## 実装との距離

コードコメントやテストに古い仮説が残っていても、`docs/human/` の正典に反する説明をゲーム事実として再利用しない。反証を見つけたら正典・再現資料・コメント・テストの順に整合させる。
