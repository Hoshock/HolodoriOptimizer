---
name: parameter-calculation
description: |
  ホロドリのカード詳細P/T/S、ユニット総合力、4色ホロメンボードとカードデータprovenanceを参照する。表示ユニットスコアは docs/human/display-score.md が正典。
version: 2026-09-12-02
---

# パラメータ計算仕様

## 最初に確認

カード値を使う前に `docs/human/evidence-policy.md` と `docs/human/card-data-provenance.md` を読む。`cards.json` の検索断片からカードを直接帰属しない。

## 参照

- `references/blue-board.md`: 青31マス
- `references/green-board.md`: 緑24マス
- `references/yellow-board.md`: 黄31マス
- `references/red-board.md`: 赤63マス。表示スコア一般式は `docs/human/display-score.md` を優先
- `references/connect-effect.md`: コネクト暫定モデル

## カード詳細P/T/S

反映: カード本体Lv/開花、青・緑、所属向けパラメータ、コネクト増幅された青・緑。

非反映: 赤、メモリーのユニットパラメータ、メンバー強化、編成条件衣装/パッシブ、Active/SPスコア効果。

## 開花

確認済みの★5強化段階:

| 段階 | 主な強化    |
| :--- | :---------- |
| 1凸  | Active      |
| 2凸  | 全パラ+10%  |
| 3凸  | SP          |
| 4凸  | Passive     |
| 5凸  | Connect関連 |

トップレベルカード値は最大開花側の取り込みレコード。途中段階は `cardAtBloomWithProvenance()` を使う。

- `observed-variant`: 実機variant
- `reconstructed-observation`: 数値は実機由来だがraw文は再構成
- `extracted-master-variant`: 抽出マスター（外部解析）由来。実機目視ではない
- `derived-from-max-confirmed-ratio`: 2凸+10%からの逆算
- `estimated-from-max`: 仮定倍率からの推定

推定値を確定値として引用しない。

## ボードの役割

- 赤: リーダー用、メンバー5人へのP/T/S・スコアサポート等
- 青: メンバー本人のP/T/S・Active発動率/頻度
- 黄: 曲・ホロワーク
- 緑: アカウント全体のP/T/S・所属効果

ボード状態はホロメン単位。

## 総合力

```txt
totalPower = memberParameters
           + costumeSkill
           + holomenBoard
           + passiveSkill
           + memory
           + enhancement
```

各項目は素値を基準に独立算出する。count人対象は確認済み範囲で素値P+T+S上位。メンバー強化はメモリーを基準に含めない。赤P/T/SはBoard項。丸めには±1〜2の未解明が残る。

表示unit scoreの入口だけは

```txt
ceil(totalPower × (1 + scoreBonus / 100) × 2.03734)
```

表示カテゴリ内部は `docs/human/display-score.md`、実ライブはADR-006。
