# アカウント構造化データのスナップショット（2026-09-15）

ユーザーがサイトの「データの出力」でコピーした `holodori-optimizer/account` **version 1** をそのまま保存したもの（4 色ボードのマス ID・コネクトの配置・所持メンバーと開花・イベントメモリー・メンバー強化ボーナス）。**2026-09-15 時点の current snapshot** で、時点情報なので陳腐化を許容する。

- **historical observation へ遡及適用しない。** 過去の観測は観測時点のボード状態で固定してある。直前の状態は [20260913-account-snapshot.md](./20260913-account-snapshot.md)（下の「2026-09-13 からの差分」）。
- この日の実機観測（[display-score-20260915-costume.md](./display-score-20260915-costume.md) の 16 編成）は **青 0・赤 0・黄 0・曲なし**の 5 人で取っているので、**この snapshot のボード状態は結果に効かない**。記録するのは provenance のためで、同じ編成を後で再現するときに「その時点で青が本当に 0 だったか」を確認できるようにする。
- ユーザーは同じ日に 2 回出力しており（1 回目のあとに「ボード情報実は少し変わってた」と申告）、ここに保存したのは**あとの方**。差分は 猫又おかゆ / 戌神ころね / 白銀ノエル / モココ・アビスガード の 4 人。
- 出力そのものに対するユーザーの訂正指示はない。JSON 本文は **raw export のまま**で、推測による変更はしていない。
- 個人を特定する情報（プレイヤー名・ID・フレンドコード）は含まない。
- 下の表はすべて JSON から機械生成し、手で転記していない。

## 概要（raw の解放マス数とコネクトの配置）

| ホロメン                     | 赤  | 青  | 黄  | 緑  | コネクト（アンカー=形/‰）                                     |
| ---------------------------- | --- | --- | --- | --- | ------------------------------------------------------------- |
| ときのそら                   | 0   | 0   | 8   | 4   | center=leader-2/2150                                          |
| ロボ子さん                   | 0   | 0   | 0   | 4   | center=leader-2/1650                                          |
| アキ・ローゼンタール         | 0   | 0   | 0   | 4   | center=leader-2/2200                                          |
| 赤井はあと                   | 0   | 0   | 0   | 4   | center=content-4/1150                                         |
| 白上フブキ                   | 0   | 13  | 16  | 8   | center=center-3/1400 card=content-3/1500 content=card-1/1100  |
| 夏色まつり                   | 0   | 0   | 0   | 4   | center=center-4/1150                                          |
| 百鬼あやめ                   | 0   | 0   | 12  | 4   | center=center-4/1150                                          |
| 癒月ちょこ                   | 0   | 0   | 0   | 4   | center=content-4/1150                                         |
| 大空スバル                   | 0   | 0   | 0   | 4   | center=leader-2/1650                                          |
| AZKi                         | 24  | 0   | 0   | 4   | center=leader-2/1650 leader=leader-1/1500                     |
| 大神ミオ                     | 40  | 31  | 0   | 0   | center=center-1/1400 leader=content-2/1350 card=card-3/1600   |
| さくらみこ                   | 0   | 31  | 0   | 4   | center=center-2/1400 card=content-3/2000                      |
| 猫又おかゆ                   | 0   | 30  | 11  | 17  | center=card-3/1600 card=content-2/850                         |
| 戌神ころね                   | 0   | 31  | 18  | 10  | center=center-4/1650 card=card-3/1600 content=content-1/1100  |
| 星街すいせい                 | 0   | 0   | 0   | 4   | center=leader-2/1650                                          |
| 兎田ぺこら                   | 0   | 0   | 0   | 10  | center=leader-2/1650                                          |
| 不知火フレア                 | 0   | 0   | 0   | 8   | center=content-4/1150                                         |
| 白銀ノエル                   | 0   | 31  | 0   | 8   | center=center-4/1150 card=content-3/2000                      |
| 宝鐘マリン                   | 0   | 0   | 18  | 8   | center=content-4/1150 content=center-4/1150                   |
| 角巻わため                   | 0   | 0   | 0   | 4   | center=content-4/1150                                         |
| 常闇トワ                     | 0   | 0   | 0   | 4   | center=center-4/1150                                          |
| 姫森ルーナ                   | 0   | 0   | 0   | 4   | center=leader-2/1650                                          |
| 雪花ラミィ                   | 24  | 0   | 16  | 4   | center=center-4/1150 leader=card-2/850 content=card-1/1100    |
| 桃鈴ねね                     | 0   | 0   | 0   | 4   | center=content-4/1150                                         |
| 獅白ぼたん                   | 0   | 0   | 0   | 4   | center=center-4/1150                                          |
| 尾丸ポルカ                   | 0   | 0   | 13  | 4   | center=content-4/1150                                         |
| ラプラス・ダークネス         | 0   | 0   | 0   | 4   | center=center-4/1150                                          |
| 鷹嶺ルイ                     | 7   | 0   | 20  | 0   | center=center-1/1400 content=content-1/1100                   |
| 博衣こより                   | 24  | 0   | 15  | 4   | center=center-4/1150 leader=general-1/550                     |
| 風真いろは                   | 0   | 0   | 0   | 4   | center=content-4/1150                                         |
| アユンダ・リス               | 0   | 0   | 0   | 4   | center=center-4/1150                                          |
| ムーナ・ホシノヴァ           | 0   | 0   | 0   | 4   | center=content-4/1150                                         |
| アイラニ・イオフィフティーン | 0   | 0   | 0   | 4   |                                                               |
| クレイジー・オリー           | 0   | 0   | 0   | 4   |                                                               |
| アーニャ・メルフィッサ       | 0   | 0   | 0   | 4   | center=center-2/1200                                          |
| パヴォリア・レイネ           | 0   | 0   | 0   | 4   | center=content-4/1150                                         |
| ベスティア・ゼータ           | 0   | 0   | 0   | 4   |                                                               |
| カエラ・コヴァルスキア       | 0   | 0   | 0   | 4   |                                                               |
| こぼ・かなえる               | 0   | 0   | 0   | 4   |                                                               |
| 森カリオペ                   | 0   | 0   | 0   | 4   |                                                               |
| 小鳥遊キアラ                 | 0   | 0   | 0   | 4   |                                                               |
| 一伊那尓栖                   | 0   | 0   | 0   | 4   |                                                               |
| IRyS                         | 0   | 0   | 0   | 4   |                                                               |
| オーロ・クロニー             | 0   | 0   | 0   | 4   |                                                               |
| ハコス・ベールズ             | 0   | 0   | 0   | 4   | center=leader-2/1650                                          |
| シオリ・ノヴェラ             | 0   | 0   | 0   | 10  | center=center-4/1150                                          |
| 古石ビジュー                 | 0   | 0   | 0   | 7   | center=leader-2/1650                                          |
| ネリッサ・レイヴンクロフト   | 0   | 0   | 0   | 4   |                                                               |
| フワワ・アビスガード         | 44  | 18  | 0   | 0   | center=center-1/1400 leader=leader-1/1500 card=content-3/2000 |
| モココ・アビスガード         | 0   | 29  | 20  | 4   | center=content-4/1150 card=card-3/2100 content=content-1/1100 |
| 音乃瀬奏                     | 0   | 0   | 0   | 4   |                                                               |
| 一条莉々華                   | 0   | 0   | 0   | 4   |                                                               |
| 儒烏風亭らでん               | 0   | 0   | 0   | 4   |                                                               |
| 轟はじめ                     | 0   | 0   | 0   | 4   |                                                               |

## derived: production 経路で再構成した実効値

**実機に表示された値ではない。** 上の raw（解放マス ID + コネクトの配置）を production の
`connectFactorMapOf` → `blueBoardEffects` / `redBoardEffects` / `yellowBoardEffects` に通して**再構成した**値で、
証拠状態は `derived`（[../evidence-policy.md](../evidence-policy.md)）。コネクト効果そのものは ADR-008 の暫定モデル。

### 青（アクティブ発動率 / 発動頻度）

`bare` はマスの表記値の単純合計、`実効` はコネクト増幅込み。**解析 fixture へ入れてよいのは `実効` のほう**。

| ホロメン             | holomenId          | bare 発動率 | bare 発動頻度 | 実効 発動率 | 実効 発動頻度 | 増幅されたマス                                                                                                        |
| -------------------- | ------------------ | ----------- | ------------- | ----------- | ------------- | --------------------------------------------------------------------------------------------------------------------- |
| 白上フブキ           | `shirakami-fubuki` | 6           | 0             | 15          | 0             | B-008×2.5 B-007×2.5 B-006×2.5                                                                                         |
| 大神ミオ             | `ookami-mio`       | 30          | 12            | 39.6        | 12            | B-008×2.6 B-007×2.6 B-006×2.6                                                                                         |
| さくらみこ           | `sakura-miko`      | 30          | 12            | 42          | 12            | B-001×2.4 B-003×2.4 B-002×2.4 B-004×2.4 B-005×2.4 B-008×3 B-007×3 B-006×3                                             |
| 猫又おかゆ           | `nekomata-okayu`   | 30          | 8             | 35.1        | 8             | B-001×2.6 B-002×2.6 B-005×2.6 B-009×1.85 B-010×1.85 B-016×1.85 B-017×1.85 B-024×1.85 B-023×1.85 B-025×1.85 B-026×1.85 |
| 戌神ころね           | `inugami-korone`   | 30          | 12            | 39.6        | 12            | B-001×2.65 B-002×2.65 B-008×2.6 B-007×2.6 B-006×2.6                                                                   |
| 白銀ノエル           | `shirogane-noel`   | 30          | 12            | 42          | 12            | B-008×3 B-007×3 B-006×3                                                                                               |
| フワワ・アビスガード | `fuwawa-abyssgard` | 18          | 0             | 30          | 0             | B-008×3 B-007×3 B-006×3                                                                                               |
| モココ・アビスガード | `mococo-abyssgard` | 30          | 4             | 42.6        | 4             | B-008×3.1 B-007×3.1 B-006×3.1                                                                                         |

### 赤（スコアサポート効果 %）

| ホロメン             | holomenId          | bare 支援 | 実効 支援 | bare 歌唱者 | 実効 歌唱者 |
| -------------------- | ------------------ | --------- | --------- | ----------- | ----------- |
| AZKi                 | `azki`             | 10        | 16        | 10          | 10          |
| 大神ミオ             | `ookami-mio`       | 20        | 28.1      | 10          | 24          |
| 雪花ラミィ           | `yukihana-lamy`    | 14        | 19.1      | 10          | 10          |
| 鷹嶺ルイ             | `takane-lui`       | 0         | 0         | 10          | 24          |
| 博衣こより           | `hakui-koyori`     | 14        | 17.3      | 10          | 10          |
| フワワ・アビスガード | `fuwawa-abyssgard` | 20        | 26        | 10          | 24          |

### 黄（楽曲スコアボーナス ‰）

| ホロメン             | holomenId          | bare ソロ / ユニット / 全体 ‰ | 実効 ソロ / ユニット / 全体 ‰ |
| -------------------- | ------------------ | ----------------------------- | ----------------------------- |
| ときのそら           | `tokino-sora`      | 25 / 10 / 1                   | 25 / 10 / 1                   |
| 白上フブキ           | `shirakami-fubuki` | 50 / 40 / 0                   | 98.5 / 54 / 0                 |
| 百鬼あやめ           | `nakiri-ayame`     | 30 / 40 / 0                   | 41.5 / 40 / 0                 |
| 猫又おかゆ           | `nekomata-okayu`   | 30 / 30 / 0                   | 30 / 30 / 0                   |
| 戌神ころね           | `inugami-korone`   | 75 / 20 / 0                   | 102.5 / 20 / 0                |
| 宝鐘マリン           | `houshou-marine`   | 40 / 20 / 1                   | 63 / 20 / 1                   |
| 雪花ラミィ           | `yukihana-lamy`    | 75 / 10 / 0                   | 114 / 10 / 0                  |
| 尾丸ポルカ           | `omaru-polka`      | 30 / 20 / 1                   | 41.5 / 20 / 1                 |
| 鷹嶺ルイ             | `takane-lui`       | 75 / 40 / 0                   | 102.5 / 40 / 0                |
| 博衣こより           | `hakui-koyori`     | 75 / 0 / 0                    | 86.5 / 0 / 0                  |
| モココ・アビスガード | `mococo-abyssgard` | 75 / 40 / 0                   | 114 / 40 / 0                  |

### 緑

緑はアカウント全体の合計として効く（`accountGreenEffects`）。

## 所持メンバーと開花

| ホロメン                     | カード                         | ID                      | 開花 |
| ---------------------------- | ------------------------------ | ----------------------- | ---- |
| さくらみこ                   | ビーチで弾ける、光彩ショット！ | `sakura-miko-02`        | 1    |
| 大神ミオ                     | ホッととろけるnightscape       | `ookami-mio-01`         | 1    |
| 大神ミオ                     | 夏にまどろむWolf Heart         | `ookami-mio-02`         | 1    |
| 白上フブキ                   | 狐のお宮でこんこんこん         | `shirakami-fubuki-01`   | 1    |
| 戌神ころね                   | Go! Go! Laughing Skater        | `inugami-korone-01`     | 3    |
| 戌神ころね                   | 密林を舞うワイルドサマー！     | `inugami-korone-02`     | 2    |
| 兎田ぺこら                   | 愛嬌たっぷりラビットフィールド | `usada-pekora-01`       | 1    |
| 白銀ノエル                   | 波まとうゆるふわKnight         | `shirogane-noel-02`     | 0    |
| 白銀ノエル                   | 風薫るおっとり騎士             | `shirogane-noel-01`     | 0    |
| 宝鐘マリン                   | 妖艶あふれるマリンブルー       | `houshou-marine-01`     | 1    |
| 不知火フレア                 | ハーフエルフの風渡るゴンドラ   | `shiranui-flare-01`     | 0    |
| ときのそら                   | ひたむきに描く虹のうた         | `tokino-sora-01`        | 0    |
| ロボ子さん                   | 高性能なVサイン                | `roboco-san-01`         | 0    |
| 尾丸ポルカ                   | 変幻自在！ポルカサーカス開演！ | `omaru-polka-01`        | 0    |
| さくらみこ                   | サクラBloom                    | `sakura-miko-01`        | 0    |
| 大空スバル                   | クワッとじゃれ合うアヒルの午後 | `oozora-subaru-01`      | 0    |
| 白上フブキ                   | 渚で魅せるtwinkle              | `shirakami-fubuki-02`   | 0    |
| 猫又おかゆ                   | 宴の果てに、ナイショの戯れ     | `nekomata-okayu-01`     | 1    |
| 猫又おかゆ                   | パラソル下のリバティキャット   | `nekomata-okayu-02`     | 5    |
| アキ・ローゼンタール         | 艶帯びたハーフエルフ           | `aki-rosenthal-01`      | 0    |
| 獅白ぼたん                   | 目を奪う神エイム！lion's hunt  | `shishiro-botan-01`     | 0    |
| フワワ・アビスガード         | フワワのFlowing Summer         | `fuwawa-abyssgard-02`   | 0    |
| アイラニ・イオフィフティーン | 陽光射すCosmos Palette         | `airani-iofifteen-01`   | 0    |
| アユンダ・リス               | いたずらたくらむ木漏れ日の森   | `ayunda-risu-01`        | 0    |
| アーニャ・メルフィッサ       | ソファに沈んでまったりゲーム   | `anya-melfissa-01`      | 0    |
| パヴォリア・レイネ           | おすまし孔雀と嗜む一杯         | `pavolia-reine-01`      | 0    |
| こぼ・かなえる               | あめ上がりの雨喜雨喜シャーマン | `kobo-kanaeru-01`       | 0    |
| IRyS                         | nephilim sonority              | `irys-01`               | 0    |
| オーロ・クロニー             | 典獄ささやくClock Tower        | `ouro-kronii-01`        | 1    |
| 古石ビジュー                 | キラッキラCrystal place        | `koseki-bijou-01`       | 0    |
| ネリッサ・レイヴンクロフト   | 歌に揺らめくノクターン         | `nerissa-ravencroft-01` | 1    |
| モココ・アビスガード         | のほほんドーナツパーティー♪    | `mococo-abyssgard-01`   | 0    |
| 儒烏風亭らでん               | 叡智を灯し、アートに導く       | `juufuutei-raden-01`    | 0    |
| 音乃瀬奏                     | 潮風にのせる、笑顔のハーモニー | `otonose-kanade-02`     | 0    |

## アカウント補正

- `memoryPercent` = 6
- `enhancementPercent` = 3.08

## 2026-09-13 からの差分

前回の snapshot（[20260913-account-snapshot.md](./20260913-account-snapshot.md)）から**変わったものだけ**。

| 対象                 | 変更                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| さくらみこ           | 青 28 → 31（+B-013 / B-031 / B-020）                                                                                                                                                                                                                                                                                                  |
| 猫又おかゆ           | 青 31 → 30（−B-020）                                                                                                                                                                                                                                                                                                                  |
| 戌神ころね           | 青 29 → 31（+B-020 / B-031）                                                                                                                                                                                                                                                                                                          |
| 兎田ぺこら           | 青 30 → 0（−B-001 / B-002 / B-003 / B-004 / B-005 / B-006 / B-007 / B-008 / B-009 / B-010 / B-011 / B-012 / B-014 / B-015 / B-016 / B-017 / B-018 / B-019 / B-020 / B-021 / B-022 / B-023 / B-024 / B-025 / B-026 / B-027 / B-028 / B-029 / B-030 / B-031）、コネクト center=leader-2/1650 card=content-1/1100 → center=leader-2/1650 |
| 白銀ノエル           | 青 30 → 31（+B-020）                                                                                                                                                                                                                                                                                                                  |
| 鷹嶺ルイ             | 赤 23 → 7（−R-008 / R-021 / R-032 / R-049 / R-055 / R-052 / R-051 / R-050 / R-053 / R-054 / R-033 / R-034 / R-035 / R-040 / R-041 / R-020）、緑 4 → 0（−G-005 / G-002 / G-001 / G-004）、コネクト center=center-1/1400 leader=leader-3/1500 content=leader-2/2200 → center=center-1/1400 content=content-1/1100                       |
| フワワ・アビスガード | 青 14 → 18（+B-018 / B-019 / B-022 / B-021）                                                                                                                                                                                                                                                                                          |
| モココ・アビスガード | 青 28 → 29（+B-013）                                                                                                                                                                                                                                                                                                                  |
| 所持メンバー         | 変化あり（下の「所持メンバーと開花」）                                                                                                                                                                                                                                                                                                |
| `memoryPercent`      | 6 → 6                                                                                                                                                                                                                                                                                                                                 |
| `enhancementPercent` | 3.02 → 3.08                                                                                                                                                                                                                                                                                                                           |

**青の実効値**（09-13 との比較）:

| ホロメン             | 09-13 実効 | 09-15 実効 |
| -------------------- | ---------- | ---------- |
| 白上フブキ           | 15 / 0     | 15 / 0     |
| 大神ミオ             | 39.6 / 12  | 39.6 / 12  |
| さくらみこ           | 42 / 0     | 42 / 12    |
| 猫又おかゆ           | 35.1 / 12  | 35.1 / 8   |
| 戌神ころね           | 39.6 / 4   | 39.6 / 12  |
| 兎田ぺこら           | 30 / 8     | 青なし     |
| 白銀ノエル           | 42 / 8     | 42 / 12    |
| フワワ・アビスガード | 24 / 0     | 30 / 0     |
| モココ・アビスガード | 42.6 / 0   | 42.6 / 4   |

## 出力そのもの（raw export）

```json
{
  "format": "holodori-optimizer/account",
  "version": 1,
  "holomen": [
    {
      "holomen": "ときのそら",
      "holomenId": "tokino-sora",
      "yellow": ["Y-003", "Y-002", "Y-001", "Y-004", "Y-008", "Y-007", "Y-006", "Y-005"],
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "leader-2",
          "permil": 2150
        }
      }
    },
    {
      "holomen": "ロボ子さん",
      "holomenId": "roboco-san",
      "green": ["G-004", "G-002", "G-001", "G-005"],
      "connect": {
        "center": {
          "extent": "leader-2",
          "permil": 1650
        }
      }
    },
    {
      "holomen": "アキ・ローゼンタール",
      "holomenId": "aki-rosenthal",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "leader-2",
          "permil": 2200
        }
      }
    },
    {
      "holomen": "赤井はあと",
      "holomenId": "akai-haato",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "content-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "白上フブキ",
      "holomenId": "shirakami-fubuki",
      "blue": [
        "B-001",
        "B-002",
        "B-003",
        "B-004",
        "B-005",
        "B-006",
        "B-007",
        "B-008",
        "B-009",
        "B-016",
        "B-023",
        "B-024",
        "B-025"
      ],
      "yellow": [
        "Y-015",
        "Y-014",
        "Y-011",
        "Y-010",
        "Y-009",
        "Y-008",
        "Y-007",
        "Y-006",
        "Y-005",
        "Y-002",
        "Y-001",
        "Y-025",
        "Y-016",
        "Y-024",
        "Y-023",
        "Y-003"
      ],
      "green": ["G-004", "G-002", "G-001", "G-011", "G-008", "G-007", "G-006", "G-005"],
      "connect": {
        "center": {
          "extent": "center-3",
          "permil": 1400
        },
        "card": {
          "extent": "content-3",
          "permil": 1500
        },
        "content": {
          "extent": "card-1",
          "permil": 1100
        }
      }
    },
    {
      "holomen": "夏色まつり",
      "holomenId": "natsuiro-matsuri",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "百鬼あやめ",
      "holomenId": "nakiri-ayame",
      "yellow": [
        "Y-008",
        "Y-007",
        "Y-006",
        "Y-005",
        "Y-002",
        "Y-001",
        "Y-015",
        "Y-014",
        "Y-011",
        "Y-010",
        "Y-009",
        "Y-003"
      ],
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "癒月ちょこ",
      "holomenId": "yuzuki-choco",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "content-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "大空スバル",
      "holomenId": "oozora-subaru",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "leader-2",
          "permil": 1650
        }
      }
    },
    {
      "holomen": "AZKi",
      "holomenId": "azki",
      "red": [
        "R-003",
        "R-002",
        "R-001",
        "R-004",
        "R-050",
        "R-049",
        "R-021",
        "R-008",
        "R-007",
        "R-006",
        "R-005",
        "R-020",
        "R-019",
        "R-033",
        "R-041",
        "R-040",
        "R-035",
        "R-034",
        "R-037",
        "R-036",
        "R-009",
        "R-022",
        "R-010",
        "R-032"
      ],
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "leader-2",
          "permil": 1650
        },
        "leader": {
          "extent": "leader-1",
          "permil": 1500
        }
      }
    },
    {
      "holomen": "大神ミオ",
      "holomenId": "ookami-mio",
      "red": [
        "R-001",
        "R-002",
        "R-003",
        "R-005",
        "R-006",
        "R-007",
        "R-008",
        "R-021",
        "R-020",
        "R-032",
        "R-033",
        "R-034",
        "R-035",
        "R-036",
        "R-037",
        "R-038",
        "R-039",
        "R-040",
        "R-041",
        "R-042",
        "R-043",
        "R-044",
        "R-045",
        "R-046",
        "R-047",
        "R-048",
        "R-062",
        "R-063",
        "R-019",
        "R-060",
        "R-056",
        "R-053",
        "R-052",
        "R-051",
        "R-050",
        "R-049",
        "R-061",
        "R-058",
        "R-054",
        "R-055"
      ],
      "blue": [
        "B-008",
        "B-007",
        "B-006",
        "B-005",
        "B-002",
        "B-001",
        "B-010",
        "B-009",
        "B-026",
        "B-023",
        "B-013",
        "B-012",
        "B-011",
        "B-015",
        "B-014",
        "B-029",
        "B-028",
        "B-027",
        "B-024",
        "B-022",
        "B-021",
        "B-018",
        "B-017",
        "B-016",
        "B-020",
        "B-019",
        "B-003",
        "B-004",
        "B-025",
        "B-031",
        "B-030"
      ],
      "connect": {
        "center": {
          "extent": "center-1",
          "permil": 1400
        },
        "leader": {
          "extent": "content-2",
          "permil": 1350
        },
        "card": {
          "extent": "card-3",
          "permil": 1600
        }
      }
    },
    {
      "holomen": "さくらみこ",
      "holomenId": "sakura-miko",
      "blue": [
        "B-001",
        "B-002",
        "B-003",
        "B-004",
        "B-005",
        "B-006",
        "B-007",
        "B-008",
        "B-009",
        "B-010",
        "B-011",
        "B-012",
        "B-016",
        "B-017",
        "B-018",
        "B-019",
        "B-021",
        "B-022",
        "B-023",
        "B-024",
        "B-025",
        "B-026",
        "B-027",
        "B-028",
        "B-029",
        "B-030",
        "B-013",
        "B-031",
        "B-014",
        "B-015",
        "B-020"
      ],
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "center-2",
          "permil": 1400
        },
        "card": {
          "extent": "content-3",
          "permil": 2000
        }
      }
    },
    {
      "holomen": "猫又おかゆ",
      "holomenId": "nekomata-okayu",
      "blue": [
        "B-001",
        "B-002",
        "B-003",
        "B-004",
        "B-005",
        "B-006",
        "B-007",
        "B-008",
        "B-009",
        "B-010",
        "B-011",
        "B-014",
        "B-015",
        "B-016",
        "B-017",
        "B-018",
        "B-019",
        "B-021",
        "B-022",
        "B-023",
        "B-024",
        "B-025",
        "B-026",
        "B-027",
        "B-028",
        "B-029",
        "B-030",
        "B-031",
        "B-012",
        "B-013"
      ],
      "yellow": [
        "Y-015",
        "Y-014",
        "Y-011",
        "Y-010",
        "Y-009",
        "Y-008",
        "Y-007",
        "Y-006",
        "Y-005",
        "Y-002",
        "Y-001"
      ],
      "green": [
        "G-021",
        "G-018",
        "G-011",
        "G-008",
        "G-007",
        "G-006",
        "G-005",
        "G-002",
        "G-001",
        "G-016",
        "G-015",
        "G-013",
        "G-012",
        "G-009",
        "G-010",
        "G-003",
        "G-004"
      ],
      "connect": {
        "center": {
          "extent": "card-3",
          "permil": 1600
        },
        "card": {
          "extent": "content-2",
          "permil": 850
        }
      }
    },
    {
      "holomen": "戌神ころね",
      "holomenId": "inugami-korone",
      "blue": [
        "B-001",
        "B-002",
        "B-003",
        "B-004",
        "B-005",
        "B-006",
        "B-007",
        "B-008",
        "B-009",
        "B-010",
        "B-011",
        "B-012",
        "B-014",
        "B-015",
        "B-016",
        "B-017",
        "B-018",
        "B-019",
        "B-021",
        "B-022",
        "B-023",
        "B-024",
        "B-025",
        "B-026",
        "B-027",
        "B-028",
        "B-029",
        "B-030",
        "B-013",
        "B-020",
        "B-031"
      ],
      "yellow": [
        "Y-011",
        "Y-010",
        "Y-009",
        "Y-008",
        "Y-007",
        "Y-006",
        "Y-005",
        "Y-002",
        "Y-001",
        "Y-016",
        "Y-025",
        "Y-023",
        "Y-024",
        "Y-029",
        "Y-028",
        "Y-027",
        "Y-026",
        "Y-003"
      ],
      "green": [
        "G-005",
        "G-002",
        "G-001",
        "G-004",
        "G-021",
        "G-018",
        "G-011",
        "G-008",
        "G-007",
        "G-006"
      ],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1650
        },
        "card": {
          "extent": "card-3",
          "permil": 1600
        },
        "content": {
          "extent": "content-1",
          "permil": 1100
        }
      }
    },
    {
      "holomen": "星街すいせい",
      "holomenId": "hoshimachi-suisei",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "leader-2",
          "permil": 1650
        }
      }
    },
    {
      "holomen": "兎田ぺこら",
      "holomenId": "usada-pekora",
      "green": [
        "G-005",
        "G-002",
        "G-001",
        "G-004",
        "G-021",
        "G-018",
        "G-011",
        "G-008",
        "G-007",
        "G-006"
      ],
      "connect": {
        "center": {
          "extent": "leader-2",
          "permil": 1650
        }
      }
    },
    {
      "holomen": "不知火フレア",
      "holomenId": "shiranui-flare",
      "green": ["G-005", "G-002", "G-001", "G-004", "G-011", "G-008", "G-007", "G-006"],
      "connect": {
        "center": {
          "extent": "content-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "白銀ノエル",
      "holomenId": "shirogane-noel",
      "blue": [
        "B-001",
        "B-002",
        "B-003",
        "B-004",
        "B-005",
        "B-006",
        "B-007",
        "B-008",
        "B-009",
        "B-010",
        "B-011",
        "B-012",
        "B-014",
        "B-015",
        "B-016",
        "B-017",
        "B-018",
        "B-019",
        "B-021",
        "B-022",
        "B-023",
        "B-024",
        "B-025",
        "B-026",
        "B-027",
        "B-028",
        "B-029",
        "B-030",
        "B-013",
        "B-031",
        "B-020"
      ],
      "green": ["G-004", "G-002", "G-001", "G-005", "G-011", "G-008", "G-007", "G-006"],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1150
        },
        "card": {
          "extent": "content-3",
          "permil": 2000
        }
      }
    },
    {
      "holomen": "宝鐘マリン",
      "holomenId": "houshou-marine",
      "yellow": [
        "Y-003",
        "Y-002",
        "Y-001",
        "Y-004",
        "Y-013",
        "Y-012",
        "Y-011",
        "Y-010",
        "Y-009",
        "Y-008",
        "Y-007",
        "Y-006",
        "Y-005",
        "Y-031",
        "Y-030",
        "Y-027",
        "Y-026",
        "Y-023"
      ],
      "green": ["G-004", "G-002", "G-001", "G-011", "G-008", "G-007", "G-006", "G-005"],
      "connect": {
        "center": {
          "extent": "content-4",
          "permil": 1150
        },
        "content": {
          "extent": "center-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "角巻わため",
      "holomenId": "tsunomaki-watame",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "content-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "常闇トワ",
      "holomenId": "tokoyami-towa",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "姫森ルーナ",
      "holomenId": "himemori-luna",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "leader-2",
          "permil": 1650
        }
      }
    },
    {
      "holomen": "雪花ラミィ",
      "holomenId": "yukihana-lamy",
      "red": [
        "R-004",
        "R-002",
        "R-001",
        "R-003",
        "R-051",
        "R-050",
        "R-049",
        "R-021",
        "R-008",
        "R-007",
        "R-006",
        "R-005",
        "R-055",
        "R-052",
        "R-020",
        "R-019",
        "R-034",
        "R-033",
        "R-032",
        "R-036",
        "R-035",
        "R-009",
        "R-022",
        "R-010"
      ],
      "yellow": [
        "Y-003",
        "Y-002",
        "Y-001",
        "Y-024",
        "Y-023",
        "Y-008",
        "Y-007",
        "Y-006",
        "Y-005",
        "Y-025",
        "Y-009",
        "Y-016",
        "Y-029",
        "Y-028",
        "Y-027",
        "Y-026"
      ],
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1150
        },
        "leader": {
          "extent": "card-2",
          "permil": 850
        },
        "content": {
          "extent": "card-1",
          "permil": 1100
        }
      }
    },
    {
      "holomen": "桃鈴ねね",
      "holomenId": "momosuzu-nene",
      "green": ["G-002", "G-001", "G-004", "G-005"],
      "connect": {
        "center": {
          "extent": "content-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "獅白ぼたん",
      "holomenId": "shishiro-botan",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "尾丸ポルカ",
      "holomenId": "omaru-polka",
      "yellow": [
        "Y-003",
        "Y-002",
        "Y-001",
        "Y-004",
        "Y-013",
        "Y-012",
        "Y-011",
        "Y-010",
        "Y-009",
        "Y-008",
        "Y-007",
        "Y-006",
        "Y-005"
      ],
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "content-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "ラプラス・ダークネス",
      "holomenId": "laplus-darknesss",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "鷹嶺ルイ",
      "holomenId": "takane-lui",
      "red": ["R-003", "R-002", "R-001", "R-004", "R-007", "R-006", "R-005"],
      "yellow": [
        "Y-002",
        "Y-001",
        "Y-009",
        "Y-008",
        "Y-007",
        "Y-006",
        "Y-005",
        "Y-029",
        "Y-028",
        "Y-027",
        "Y-026",
        "Y-023",
        "Y-024",
        "Y-025",
        "Y-016",
        "Y-015",
        "Y-014",
        "Y-011",
        "Y-010",
        "Y-003"
      ],
      "connect": {
        "center": {
          "extent": "center-1",
          "permil": 1400
        },
        "content": {
          "extent": "content-1",
          "permil": 1100
        }
      }
    },
    {
      "holomen": "博衣こより",
      "holomenId": "hakui-koyori",
      "red": [
        "R-003",
        "R-002",
        "R-001",
        "R-004",
        "R-055",
        "R-052",
        "R-051",
        "R-050",
        "R-049",
        "R-021",
        "R-008",
        "R-007",
        "R-006",
        "R-005",
        "R-054",
        "R-022",
        "R-010",
        "R-009",
        "R-035",
        "R-034",
        "R-033",
        "R-032",
        "R-020",
        "R-019"
      ],
      "yellow": [
        "Y-008",
        "Y-007",
        "Y-006",
        "Y-005",
        "Y-002",
        "Y-001",
        "Y-024",
        "Y-023",
        "Y-025",
        "Y-016",
        "Y-009",
        "Y-029",
        "Y-028",
        "Y-027",
        "Y-026"
      ],
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1150
        },
        "leader": {
          "extent": "general-1",
          "permil": 550
        }
      }
    },
    {
      "holomen": "風真いろは",
      "holomenId": "kazama-iroha",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "content-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "アユンダ・リス",
      "holomenId": "ayunda-risu",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "ムーナ・ホシノヴァ",
      "holomenId": "moona-hoshinova",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "content-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "アイラニ・イオフィフティーン",
      "holomenId": "airani-iofifteen",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "クレイジー・オリー",
      "holomenId": "kureiji-ollie",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "アーニャ・メルフィッサ",
      "holomenId": "anya-melfissa",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "center-2",
          "permil": 1200
        }
      }
    },
    {
      "holomen": "パヴォリア・レイネ",
      "holomenId": "pavolia-reine",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "content-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "ベスティア・ゼータ",
      "holomenId": "vestia-zeta",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "カエラ・コヴァルスキア",
      "holomenId": "kaela-kovalskia",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "こぼ・かなえる",
      "holomenId": "kobo-kanaeru",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "森カリオペ",
      "holomenId": "mori-calliope",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "小鳥遊キアラ",
      "holomenId": "takanashi-kiara",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "一伊那尓栖",
      "holomenId": "ninomae-inanis",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "IRyS",
      "holomenId": "irys",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "オーロ・クロニー",
      "holomenId": "ouro-kronii",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "ハコス・ベールズ",
      "holomenId": "hakos-baelz",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "leader-2",
          "permil": 1650
        }
      }
    },
    {
      "holomen": "シオリ・ノヴェラ",
      "holomenId": "shiori-novella",
      "green": [
        "G-005",
        "G-002",
        "G-001",
        "G-004",
        "G-021",
        "G-018",
        "G-011",
        "G-008",
        "G-007",
        "G-006"
      ],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "古石ビジュー",
      "holomenId": "koseki-bijou",
      "green": ["G-005", "G-002", "G-001", "G-004", "G-007", "G-006", "G-008"],
      "connect": {
        "center": {
          "extent": "leader-2",
          "permil": 1650
        }
      }
    },
    {
      "holomen": "ネリッサ・レイヴンクロフト",
      "holomenId": "nerissa-ravencroft",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "フワワ・アビスガード",
      "holomenId": "fuwawa-abyssgard",
      "red": [
        "R-008",
        "R-007",
        "R-006",
        "R-005",
        "R-002",
        "R-001",
        "R-032",
        "R-049",
        "R-021",
        "R-055",
        "R-052",
        "R-051",
        "R-050",
        "R-053",
        "R-044",
        "R-043",
        "R-042",
        "R-041",
        "R-040",
        "R-035",
        "R-034",
        "R-033",
        "R-063",
        "R-039",
        "R-038",
        "R-037",
        "R-036",
        "R-062",
        "R-048",
        "R-047",
        "R-046",
        "R-045",
        "R-058",
        "R-061",
        "R-019",
        "R-060",
        "R-056",
        "R-010",
        "R-009",
        "R-022",
        "R-020",
        "R-054",
        "R-003",
        "R-004"
      ],
      "blue": [
        "B-004",
        "B-002",
        "B-001",
        "B-003",
        "B-010",
        "B-009",
        "B-008",
        "B-007",
        "B-006",
        "B-005",
        "B-026",
        "B-023",
        "B-017",
        "B-016",
        "B-018",
        "B-019",
        "B-022",
        "B-021"
      ],
      "connect": {
        "center": {
          "extent": "center-1",
          "permil": 1400
        },
        "leader": {
          "extent": "leader-1",
          "permil": 1500
        },
        "card": {
          "extent": "content-3",
          "permil": 2000
        }
      }
    },
    {
      "holomen": "モココ・アビスガード",
      "holomenId": "mococo-abyssgard",
      "blue": [
        "B-001",
        "B-002",
        "B-003",
        "B-004",
        "B-005",
        "B-006",
        "B-007",
        "B-008",
        "B-009",
        "B-010",
        "B-011",
        "B-012",
        "B-014",
        "B-015",
        "B-016",
        "B-017",
        "B-018",
        "B-019",
        "B-021",
        "B-022",
        "B-023",
        "B-024",
        "B-025",
        "B-026",
        "B-027",
        "B-028",
        "B-029",
        "B-030",
        "B-013"
      ],
      "yellow": [
        "Y-011",
        "Y-010",
        "Y-009",
        "Y-008",
        "Y-007",
        "Y-006",
        "Y-005",
        "Y-002",
        "Y-001",
        "Y-003",
        "Y-016",
        "Y-025",
        "Y-023",
        "Y-024",
        "Y-029",
        "Y-028",
        "Y-027",
        "Y-026",
        "Y-015",
        "Y-014"
      ],
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "content-4",
          "permil": 1150
        },
        "card": {
          "extent": "card-3",
          "permil": 2100
        },
        "content": {
          "extent": "content-1",
          "permil": 1100
        }
      }
    },
    {
      "holomen": "音乃瀬奏",
      "holomenId": "otonose-kanade",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "一条莉々華",
      "holomenId": "ichijou-ririka",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "儒烏風亭らでん",
      "holomenId": "juufuutei-raden",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "轟はじめ",
      "holomenId": "todoroki-hajime",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    }
  ],
  "members": [
    {
      "holomen": "さくらみこ",
      "card": "ビーチで弾ける、光彩ショット！",
      "cardId": "sakura-miko-02",
      "bloom": 1
    },
    {
      "holomen": "大神ミオ",
      "card": "ホッととろけるnightscape",
      "cardId": "ookami-mio-01",
      "bloom": 1
    },
    {
      "holomen": "大神ミオ",
      "card": "夏にまどろむWolf Heart",
      "cardId": "ookami-mio-02",
      "bloom": 1
    },
    {
      "holomen": "白上フブキ",
      "card": "狐のお宮でこんこんこん",
      "cardId": "shirakami-fubuki-01",
      "bloom": 1
    },
    {
      "holomen": "戌神ころね",
      "card": "Go! Go! Laughing Skater",
      "cardId": "inugami-korone-01",
      "bloom": 3
    },
    {
      "holomen": "戌神ころね",
      "card": "密林を舞うワイルドサマー！",
      "cardId": "inugami-korone-02",
      "bloom": 2
    },
    {
      "holomen": "兎田ぺこら",
      "card": "愛嬌たっぷりラビットフィールド",
      "cardId": "usada-pekora-01",
      "bloom": 1
    },
    {
      "holomen": "白銀ノエル",
      "card": "波まとうゆるふわKnight",
      "cardId": "shirogane-noel-02",
      "bloom": 0
    },
    {
      "holomen": "白銀ノエル",
      "card": "風薫るおっとり騎士",
      "cardId": "shirogane-noel-01",
      "bloom": 0
    },
    {
      "holomen": "宝鐘マリン",
      "card": "妖艶あふれるマリンブルー",
      "cardId": "houshou-marine-01",
      "bloom": 1
    },
    {
      "holomen": "不知火フレア",
      "card": "ハーフエルフの風渡るゴンドラ",
      "cardId": "shiranui-flare-01",
      "bloom": 0
    },
    {
      "holomen": "ときのそら",
      "card": "ひたむきに描く虹のうた",
      "cardId": "tokino-sora-01",
      "bloom": 0
    },
    {
      "holomen": "ロボ子さん",
      "card": "高性能なVサイン",
      "cardId": "roboco-san-01",
      "bloom": 0
    },
    {
      "holomen": "尾丸ポルカ",
      "card": "変幻自在！ポルカサーカス開演！",
      "cardId": "omaru-polka-01",
      "bloom": 0
    },
    {
      "holomen": "さくらみこ",
      "card": "サクラBloom",
      "cardId": "sakura-miko-01",
      "bloom": 0
    },
    {
      "holomen": "大空スバル",
      "card": "クワッとじゃれ合うアヒルの午後",
      "cardId": "oozora-subaru-01",
      "bloom": 0
    },
    {
      "holomen": "白上フブキ",
      "card": "渚で魅せるtwinkle",
      "cardId": "shirakami-fubuki-02",
      "bloom": 0
    },
    {
      "holomen": "猫又おかゆ",
      "card": "宴の果てに、ナイショの戯れ",
      "cardId": "nekomata-okayu-01",
      "bloom": 1
    },
    {
      "holomen": "猫又おかゆ",
      "card": "パラソル下のリバティキャット",
      "cardId": "nekomata-okayu-02",
      "bloom": 5
    },
    {
      "holomen": "アキ・ローゼンタール",
      "card": "艶帯びたハーフエルフ",
      "cardId": "aki-rosenthal-01",
      "bloom": 0
    },
    {
      "holomen": "獅白ぼたん",
      "card": "目を奪う神エイム！lion's hunt",
      "cardId": "shishiro-botan-01",
      "bloom": 0
    },
    {
      "holomen": "フワワ・アビスガード",
      "card": "フワワのFlowing Summer",
      "cardId": "fuwawa-abyssgard-02",
      "bloom": 0
    },
    {
      "holomen": "アイラニ・イオフィフティーン",
      "card": "陽光射すCosmos Palette",
      "cardId": "airani-iofifteen-01",
      "bloom": 0
    },
    {
      "holomen": "アユンダ・リス",
      "card": "いたずらたくらむ木漏れ日の森",
      "cardId": "ayunda-risu-01",
      "bloom": 0
    },
    {
      "holomen": "アーニャ・メルフィッサ",
      "card": "ソファに沈んでまったりゲーム",
      "cardId": "anya-melfissa-01",
      "bloom": 0
    },
    {
      "holomen": "パヴォリア・レイネ",
      "card": "おすまし孔雀と嗜む一杯",
      "cardId": "pavolia-reine-01",
      "bloom": 0
    },
    {
      "holomen": "こぼ・かなえる",
      "card": "あめ上がりの雨喜雨喜シャーマン",
      "cardId": "kobo-kanaeru-01",
      "bloom": 0
    },
    {
      "holomen": "IRyS",
      "card": "nephilim sonority",
      "cardId": "irys-01",
      "bloom": 0
    },
    {
      "holomen": "オーロ・クロニー",
      "card": "典獄ささやくClock Tower",
      "cardId": "ouro-kronii-01",
      "bloom": 1
    },
    {
      "holomen": "古石ビジュー",
      "card": "キラッキラCrystal place",
      "cardId": "koseki-bijou-01",
      "bloom": 0
    },
    {
      "holomen": "ネリッサ・レイヴンクロフト",
      "card": "歌に揺らめくノクターン",
      "cardId": "nerissa-ravencroft-01",
      "bloom": 1
    },
    {
      "holomen": "モココ・アビスガード",
      "card": "のほほんドーナツパーティー♪",
      "cardId": "mococo-abyssgard-01",
      "bloom": 0
    },
    {
      "holomen": "儒烏風亭らでん",
      "card": "叡智を灯し、アートに導く",
      "cardId": "juufuutei-raden-01",
      "bloom": 0
    },
    {
      "holomen": "音乃瀬奏",
      "card": "潮風にのせる、笑顔のハーモニー",
      "cardId": "otonose-kanade-02",
      "bloom": 0
    }
  ],
  "memoryPercent": 6,
  "enhancementPercent": 3.08
}
```
