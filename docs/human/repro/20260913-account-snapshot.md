# アカウント構造化データのスナップショット（2026-09-13）

ユーザーがサイトの「データの出力」でコピーした `holodori-optimizer/account` **version 1** をそのまま保存したもの（4 色ボードのマス ID・コネクトの配置・所持メンバーと開花・イベントメモリー・メンバー強化ボーナス）。**2026-09-13 時点の current snapshot**（発動頻度 ownership 実験の終了時点 = F3）で、時点情報なので陳腐化を許容する。

- **historical observation へ遡及適用しない。** 過去の観測（[display-score-20260908-11.md](./display-score-20260908-11.md) / [display-score-20260912.md](./display-score-20260912.md) の Golden・コーパス）は、その観測時点のボード状態で固定してある。この snapshot で過去の値を書き換えない。直前の状態は [20260912-account-snapshot.md](./20260912-account-snapshot.md)（下の「2026-09-12 からの差分」）。
- 出力そのものに対するユーザーの訂正指示は今回ない。JSON 本文は **raw export のまま**で、推測による変更はしていない（2026-09-12 の snapshot にあった さくらみこ 2 枚の開花逆転は、この出力では `sakura-miko-02` = 1凸 / `sakura-miko-01` = 0凸 と正しく出ている）。
- 個人を特定する情報（プレイヤー名・ID・フレンドコード）は含まない。
- 下の表はすべて JSON から機械生成し、手で転記していない（`src/engine/accountSnapshot.audit.test.ts` が JSON と表の一致・derived 値を固定する）。

## 概要（raw の解放マス数とコネクトの配置）

| ホロメン                     |  赤 |  青 |  黄 |  緑 | コネクト（アンカー=形/‰）                                                           |
| :--------------------------- | --: | --: | --: | --: | :---------------------------------------------------------------------------------- |
| ときのそら                   |   0 |   0 |   8 |   4 | center=leader-2/2150                                                                |
| ロボ子さん                   |   0 |   0 |   0 |   4 | center=leader-2/1650                                                                |
| アキ・ローゼンタール         |   0 |   0 |   0 |   4 | center=leader-2/2200                                                                |
| 赤井はあと                   |   0 |   0 |   0 |   4 | center=content-4/1150                                                               |
| 白上フブキ                   |   0 |  13 |  16 |   8 | center=center-3/1400 card=content-3/1500 content=card-1/1100                        |
| 夏色まつり                   |   0 |   0 |   0 |   4 | center=center-4/1150                                                                |
| 百鬼あやめ                   |   0 |   0 |  12 |   4 | center=center-4/1150                                                                |
| 癒月ちょこ                   |   0 |   0 |   0 |   4 | center=content-4/1150                                                               |
| 大空スバル                   |   0 |   0 |   0 |   4 | center=leader-2/1650                                                                |
| AZKi                         |  24 |   0 |   0 |   4 | center=leader-2/1650 leader=leader-1/1500                                           |
| 大神ミオ                     |  40 |  31 |   0 |   0 | center=center-1/1400 leader=content-2/1350 card=card-3/1600                         |
| さくらみこ                   |   0 |  28 |   0 |   4 | center=center-2/1400 card=content-3/2000                                            |
| 猫又おかゆ                   |   0 |  31 |  11 |  17 | center=card-3/1600 card=content-2/850                                               |
| 戌神ころね                   |   0 |  29 |  18 |  10 | center=center-4/1650 card=card-3/1600 content=content-1/1100                        |
| 星街すいせい                 |   0 |   0 |   0 |   4 | center=leader-2/1650                                                                |
| 兎田ぺこら                   |   0 |  30 |   0 |  10 | center=leader-2/1650 card=content-1/1100                                            |
| 不知火フレア                 |   0 |   0 |   0 |   8 | center=content-4/1150                                                               |
| 白銀ノエル                   |   0 |  30 |   0 |   8 | center=center-4/1150 card=content-3/2000                                            |
| 宝鐘マリン                   |   0 |   0 |  18 |   8 | center=content-4/1150 content=center-4/1150                                         |
| 角巻わため                   |   0 |   0 |   0 |   4 | center=content-4/1150                                                               |
| 常闇トワ                     |   0 |   0 |   0 |   4 | center=center-4/1150                                                                |
| 姫森ルーナ                   |   0 |   0 |   0 |   4 | center=leader-2/1650                                                                |
| 雪花ラミィ                   |  24 |   0 |  16 |   4 | center=center-4/1150 leader=card-2/850 content=card-1/1100                          |
| 桃鈴ねね                     |   0 |   0 |   0 |   4 | center=content-4/1150                                                               |
| 獅白ぼたん                   |   0 |   0 |   0 |   4 | center=center-4/1150                                                                |
| 尾丸ポルカ                   |   0 |   0 |  13 |   4 | center=content-4/1150                                                               |
| ラプラス・ダークネス         |   0 |   0 |   0 |   4 | center=center-4/1150                                                                |
| 鷹嶺ルイ                     |  23 |   0 |  20 |   4 | center=center-1/1400 leader=leader-3/1500 content=content-3/1500                    |
| 博衣こより                   |  24 |   0 |  15 |   4 | center=center-4/1150 leader=general-1/550                                           |
| 風真いろは                   |   0 |   0 |   0 |   4 | center=content-4/1150                                                               |
| アユンダ・リス               |   0 |   0 |   0 |   4 | center=center-4/1150                                                                |
| ムーナ・ホシノヴァ           |   0 |   0 |   0 |   4 | center=content-4/1150                                                               |
| アイラニ・イオフィフティーン |   0 |   0 |   0 |   4 |                                                                                     |
| クレイジー・オリー           |   0 |   0 |   0 |   4 |                                                                                     |
| アーニャ・メルフィッサ       |   0 |   0 |   0 |   4 | center=center-2/1200                                                                |
| パヴォリア・レイネ           |   0 |   0 |   0 |   4 | center=content-4/1150                                                               |
| ベスティア・ゼータ           |   0 |   0 |   0 |   4 |                                                                                     |
| カエラ・コヴァルスキア       |   0 |   0 |   0 |   4 |                                                                                     |
| こぼ・かなえる               |   0 |   0 |   0 |   4 |                                                                                     |
| 森カリオペ                   |   0 |   0 |   0 |   4 |                                                                                     |
| 小鳥遊キアラ                 |   0 |   0 |   0 |   4 |                                                                                     |
| 一伊那尓栖                   |   0 |   0 |   0 |   4 |                                                                                     |
| IRyS                         |   0 |   0 |   0 |   4 |                                                                                     |
| オーロ・クロニー             |   0 |   0 |   0 |   4 |                                                                                     |
| ハコス・ベールズ             |   0 |   0 |   0 |   4 | center=leader-2/1650                                                                |
| シオリ・ノヴェラ             |   0 |   0 |   0 |   4 |                                                                                     |
| 古石ビジュー                 |   0 |   0 |   0 |   4 |                                                                                     |
| ネリッサ・レイヴンクロフト   |   0 |   0 |   0 |   4 |                                                                                     |
| フワワ・アビスガード         |  42 |   0 |  14 |   0 | center=center-1/1400 leader=leader-1/1500 card=content-3/2000 content=leader-3/1500 |
| モココ・アビスガード         |   0 |  28 |  10 |   4 | center=content-4/1150 card=card-3/2100 content=content-1/1100                       |
| 音乃瀬奏                     |   0 |   0 |   0 |   4 |                                                                                     |
| 一条莉々華                   |   0 |   0 |   0 |   4 |                                                                                     |
| 儒烏風亭らでん               |   0 |   0 |   0 |   4 |                                                                                     |
| 轟はじめ                     |   0 |   0 |   0 |   4 |                                                                                     |

## derived: production 経路で再構成した実効値

**実機に表示された値ではない。** 上の raw（解放マス ID + コネクトの配置）を production の
`connectFactorMapOf` → `blueBoardEffects` / `redBoardEffects` / `yellowBoardEffects` に通して**再構成した**値で、
証拠状態は `derived`（[../evidence-policy.md](../evidence-policy.md)）。コネクト効果そのものは ADR-008 の暫定モデル。

### 青（アクティブ発動率 / 発動頻度）

`bare` はマスの表記値の単純合計、`実効` はコネクト増幅込み。**解析 fixture へ入れてよいのは `実効` のほう**
（2026-09-13 の K7 は `bare` の 6% を入れて解析を誤らせた — `.claude/rules/game-facts.md`）。

| ホロメン             | holomenId          | bare 発動率 | bare 発動頻度 | 実効 発動率 | 実効 発動頻度 | 増幅されたマス                                                                                                        |
| :------------------- | :----------------- | ----------: | ------------: | ----------: | ------------: | :-------------------------------------------------------------------------------------------------------------------- |
| 白上フブキ           | `shirakami-fubuki` |           6 |             0 |          15 |             0 | B-006×2.5 B-007×2.5 B-008×2.5                                                                                         |
| 大神ミオ             | `ookami-mio`       |          30 |            12 |        39.6 |            12 | B-006×2.6 B-007×2.6 B-008×2.6                                                                                         |
| さくらみこ           | `sakura-miko`      |          30 |             0 |          42 |             0 | B-001×2.4 B-002×2.4 B-003×2.4 B-004×2.4 B-005×2.4 B-006×3 B-007×3 B-008×3                                             |
| 猫又おかゆ           | `nekomata-okayu`   |          30 |            12 |        35.1 |            12 | B-001×2.6 B-002×2.6 B-005×2.6 B-009×1.85 B-010×1.85 B-016×1.85 B-017×1.85 B-023×1.85 B-024×1.85 B-025×1.85 B-026×1.85 |
| 戌神ころね           | `inugami-korone`   |          30 |             4 |        39.6 |             4 | B-001×2.65 B-002×2.65 B-006×2.6 B-007×2.6 B-008×2.6                                                                   |
| 兎田ぺこら           | `usada-pekora`     |          30 |             8 |          30 |             8 | B-008×2.1 B-009×2.1 B-016×2.1 B-023×2.1 B-024×2.1 B-025×2.1                                                           |
| 白銀ノエル           | `shirogane-noel`   |          30 |             8 |          42 |             8 | B-006×3 B-007×3 B-008×3                                                                                               |
| モココ・アビスガード | `mococo-abyssgard` |          30 |             0 |        42.6 |             0 | B-006×3.1 B-007×3.1 B-008×3.1                                                                                         |

### 赤（スコアサポート効果 %）

| ホロメン             | holomenId          | bare 支援 | 実効 支援 | bare 歌唱者 | 実効 歌唱者 |
| :------------------- | :----------------- | --------: | --------: | ----------: | ----------: |
| AZKi                 | `azki`             |        10 |        16 |          10 |          10 |
| 大神ミオ             | `ookami-mio`       |        20 |      28.1 |          10 |          24 |
| 雪花ラミィ           | `yukihana-lamy`    |        14 |      19.1 |          10 |          10 |
| 鷹嶺ルイ             | `takane-lui`       |        17 |        23 |          10 |          24 |
| 博衣こより           | `hakui-koyori`     |        14 |      17.3 |          10 |          10 |
| フワワ・アビスガード | `fuwawa-abyssgard` |        20 |        26 |          10 |          24 |

### 黄（楽曲スコアボーナス ‰）

| ホロメン             | holomenId          | bare ソロ / ユニット / 全体 ‰ | 実効 ソロ / ユニット / 全体 ‰ |
| :------------------- | :----------------- | ----------------------------: | ----------------------------: |
| ときのそら           | `tokino-sora`      |                   25 / 10 / 1 |                   25 / 10 / 1 |
| 白上フブキ           | `shirakami-fubuki` |                   50 / 40 / 0 |                 98.5 / 54 / 0 |
| 百鬼あやめ           | `nakiri-ayame`     |                   30 / 40 / 0 |                 41.5 / 40 / 0 |
| 猫又おかゆ           | `nekomata-okayu`   |                   30 / 30 / 0 |                   30 / 30 / 0 |
| 戌神ころね           | `inugami-korone`   |                   75 / 20 / 0 |                102.5 / 20 / 0 |
| 宝鐘マリン           | `houshou-marine`   |                   40 / 20 / 1 |                   63 / 20 / 1 |
| 雪花ラミィ           | `yukihana-lamy`    |                   75 / 10 / 0 |                  114 / 10 / 0 |
| 尾丸ポルカ           | `omaru-polka`      |                   30 / 20 / 1 |                 41.5 / 20 / 1 |
| 鷹嶺ルイ             | `takane-lui`       |                   75 / 40 / 0 |                   90 / 40 / 0 |
| 博衣こより           | `hakui-koyori`     |                    75 / 0 / 0 |                  86.5 / 0 / 0 |
| フワワ・アビスガード | `fuwawa-abyssgard` |                   40 / 40 / 0 |                   55 / 40 / 0 |
| モココ・アビスガード | `mococo-abyssgard` |                   30 / 20 / 0 |                   47 / 20 / 0 |

### 緑

緑はアカウント全体の合計として効く（`accountGreenEffects`）。この snapshot ではコネクトの範囲に緑のマスが入る配置がなく、
bare と実効が全ホロメンで一致する。

## 所持メンバーと開花

| ホロメン             | カード                         | ID                    | 開花 |
| :------------------- | :----------------------------- | :-------------------- | ---: |
| さくらみこ           | ビーチで弾ける、光彩ショット！ | `sakura-miko-02`      |    1 |
| 大神ミオ             | ホッととろけるnightscape       | `ookami-mio-01`       |    1 |
| 大神ミオ             | 夏にまどろむWolf Heart         | `ookami-mio-02`       |    1 |
| 白上フブキ           | 狐のお宮でこんこんこん         | `shirakami-fubuki-01` |    1 |
| 戌神ころね           | Go! Go! Laughing Skater        | `inugami-korone-01`   |    3 |
| 戌神ころね           | 密林を舞うワイルドサマー！     | `inugami-korone-02`   |    2 |
| 兎田ぺこら           | 愛嬌たっぷりラビットフィールド | `usada-pekora-01`     |    1 |
| 白銀ノエル           | 波まとうゆるふわKnight         | `shirogane-noel-02`   |    0 |
| 白銀ノエル           | 風薫るおっとり騎士             | `shirogane-noel-01`   |    0 |
| 宝鐘マリン           | 妖艶あふれるマリンブルー       | `houshou-marine-01`   |    1 |
| 不知火フレア         | ハーフエルフの風渡るゴンドラ   | `shiranui-flare-01`   |    0 |
| ときのそら           | ひたむきに描く虹のうた         | `tokino-sora-01`      |    0 |
| ロボ子さん           | 高性能なVサイン                | `roboco-san-01`       |    0 |
| 尾丸ポルカ           | 変幻自在！ポルカサーカス開演！ | `omaru-polka-01`      |    0 |
| さくらみこ           | サクラBloom                    | `sakura-miko-01`      |    0 |
| 大空スバル           | クワッとじゃれ合うアヒルの午後 | `oozora-subaru-01`    |    0 |
| 白上フブキ           | 渚で魅せるtwinkle              | `shirakami-fubuki-02` |    0 |
| 猫又おかゆ           | 宴の果てに、ナイショの戯れ     | `nekomata-okayu-01`   |    1 |
| 猫又おかゆ           | パラソル下のリバティキャット   | `nekomata-okayu-02`   |    5 |
| アキ・ローゼンタール | 艶帯びたハーフエルフ           | `aki-rosenthal-01`    |    0 |
| 獅白ぼたん           | 目を奪う神エイム！lion's hunt  | `shishiro-botan-01`   |    0 |
| フワワ・アビスガード | フワワのFlowing Summer         | `fuwawa-abyssgard-02` |    0 |

## アカウント補正

- `memoryPercent` = 6
- `enhancementPercent` = 3.02

## 2026-09-12 からの差分

前回の snapshot（[20260912-account-snapshot.md](./20260912-account-snapshot.md)）から**変わったものだけ**。

| 対象                 | 変更                                                                                                                               |
| :------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| フワワ・アビスガード | 赤 35 → 42（+R-009 / R-010 / R-019 / R-020 / R-022 / R-056 / R-058 / R-060 / R-061、−R-003 / R-004）、黄 16 → 14（−Y-024 / Y-025） |
| 戌神ころね           | 青 28 → 29（+B-013 = 発動頻度 +4%）                                                                                                |
| 猫又おかゆ           | 赤 1 → 0（−R-001）。青は 31 のまま（実験中に 28 まで減らしてから戻した — 下の注）                                                  |
| 大神ミオ             | 赤 42 → 40（−R-004 / R-009）、青 25 → 31（+B-003 / B-004 / B-024 / B-025 / B-030 / B-031）                                         |
| さくらみこ           | 青は 28 のまま（実験中に 31 まで増やしてから戻した — 下の注）                                                                      |
| 鷹嶺ルイ             | 赤 0 → 23、コネクト center `content-4`/1150 → `center-1`/1400、leader に `leader-3`/1500 を追加                                    |
| 所持メンバー         | 変化なし（22 枚、開花も同じ）                                                                                                      |
| `memoryPercent`      | 6 → 6（変化なし）                                                                                                                  |
| `enhancementPercent` | 3 → 3.02                                                                                                                           |

**青の実効値への影響**（この差分が解析に効く点）:

| ホロメン   | 09-12 実効 | 09-13 実効 |
| :--------- | ---------: | ---------: |
| 大神ミオ   |   36.6 / 8 |  39.6 / 12 |
| さくらみこ |     42 / 0 |     42 / 0 |
| 猫又おかゆ |  35.1 / 12 |  35.1 / 12 |
| 戌神ころね |   39.6 / 0 |   39.6 / 4 |
| 白上フブキ |     15 / 0 |     15 / 0 |
| 兎田ぺこら |     30 / 8 |     30 / 8 |
| 白銀ノエル |     42 / 8 |     42 / 8 |
| モココ     |   42.6 / 0 |   42.6 / 0 |

K1〜K4（2026-09-12 の観測）は **09-12 の値のまま**使う。K7（2026-09-13 の観測）だけが 09-13 の値を使い、
そこで効くのは 白上フブキ の 15 / 0 だけ（K7 の他の 4 人は青なし）。

**発動頻度 ownership 実験について。** この日、さくらみこ と 猫又おかゆ のあいだで発動頻度マス 3 つ
（`B-013` / `B-020` / `B-031`）を 1 つずつ移す 4 状態を実機で観測した
（[display-score-20260913-frequency.md](./display-score-20260913-frequency.md)）。**この snapshot は実験の
終了時点（F3 = さくらみこ 0 マス / 猫又おかゆ 3 マス）**で、途中の F0〜F2 は transient なので snapshot にはしない。
K7 を観測したのは実験の**前**（さくらみこ 3 マス / 猫又おかゆ 0 マス）だが、K7 の 5 人にどちらも入らないので
K7 の入力はこの snapshot からそのまま導出できる。

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
      "connect": { "center": { "extent": "leader-2", "permil": 2150 } }
    },
    {
      "holomen": "ロボ子さん",
      "holomenId": "roboco-san",
      "green": ["G-004", "G-002", "G-001", "G-005"],
      "connect": { "center": { "extent": "leader-2", "permil": 1650 } }
    },
    {
      "holomen": "アキ・ローゼンタール",
      "holomenId": "aki-rosenthal",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": { "center": { "extent": "leader-2", "permil": 2200 } }
    },
    {
      "holomen": "赤井はあと",
      "holomenId": "akai-haato",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": { "center": { "extent": "content-4", "permil": 1150 } }
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
        "center": { "extent": "center-3", "permil": 1400 },
        "card": { "extent": "content-3", "permil": 1500 },
        "content": { "extent": "card-1", "permil": 1100 }
      }
    },
    {
      "holomen": "夏色まつり",
      "holomenId": "natsuiro-matsuri",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": { "center": { "extent": "center-4", "permil": 1150 } }
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
      "connect": { "center": { "extent": "center-4", "permil": 1150 } }
    },
    {
      "holomen": "癒月ちょこ",
      "holomenId": "yuzuki-choco",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": { "center": { "extent": "content-4", "permil": 1150 } }
    },
    {
      "holomen": "大空スバル",
      "holomenId": "oozora-subaru",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": { "center": { "extent": "leader-2", "permil": 1650 } }
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
        "center": { "extent": "leader-2", "permil": 1650 },
        "leader": { "extent": "leader-1", "permil": 1500 }
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
        "center": { "extent": "center-1", "permil": 1400 },
        "leader": { "extent": "content-2", "permil": 1350 },
        "card": { "extent": "card-3", "permil": 1600 }
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
        "B-030"
      ],
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": { "extent": "center-2", "permil": 1400 },
        "card": { "extent": "content-3", "permil": 2000 }
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
        "center": { "extent": "card-3", "permil": 1600 },
        "card": { "extent": "content-2", "permil": 850 }
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
        "center": { "extent": "center-4", "permil": 1650 },
        "card": { "extent": "card-3", "permil": 1600 },
        "content": { "extent": "content-1", "permil": 1100 }
      }
    },
    {
      "holomen": "星街すいせい",
      "holomenId": "hoshimachi-suisei",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": { "center": { "extent": "leader-2", "permil": 1650 } }
    },
    {
      "holomen": "兎田ぺこら",
      "holomenId": "usada-pekora",
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
        "B-020",
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
        "B-031"
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
        "center": { "extent": "leader-2", "permil": 1650 },
        "card": { "extent": "content-1", "permil": 1100 }
      }
    },
    {
      "holomen": "不知火フレア",
      "holomenId": "shiranui-flare",
      "green": ["G-005", "G-002", "G-001", "G-004", "G-011", "G-008", "G-007", "G-006"],
      "connect": { "center": { "extent": "content-4", "permil": 1150 } }
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
        "B-031"
      ],
      "green": ["G-004", "G-002", "G-001", "G-005", "G-011", "G-008", "G-007", "G-006"],
      "connect": {
        "center": { "extent": "center-4", "permil": 1150 },
        "card": { "extent": "content-3", "permil": 2000 }
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
        "center": { "extent": "content-4", "permil": 1150 },
        "content": { "extent": "center-4", "permil": 1150 }
      }
    },
    {
      "holomen": "角巻わため",
      "holomenId": "tsunomaki-watame",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": { "center": { "extent": "content-4", "permil": 1150 } }
    },
    {
      "holomen": "常闇トワ",
      "holomenId": "tokoyami-towa",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": { "center": { "extent": "center-4", "permil": 1150 } }
    },
    {
      "holomen": "姫森ルーナ",
      "holomenId": "himemori-luna",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": { "center": { "extent": "leader-2", "permil": 1650 } }
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
        "center": { "extent": "center-4", "permil": 1150 },
        "leader": { "extent": "card-2", "permil": 850 },
        "content": { "extent": "card-1", "permil": 1100 }
      }
    },
    {
      "holomen": "桃鈴ねね",
      "holomenId": "momosuzu-nene",
      "green": ["G-002", "G-001", "G-004", "G-005"],
      "connect": { "center": { "extent": "content-4", "permil": 1150 } }
    },
    {
      "holomen": "獅白ぼたん",
      "holomenId": "shishiro-botan",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": { "center": { "extent": "center-4", "permil": 1150 } }
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
      "connect": { "center": { "extent": "content-4", "permil": 1150 } }
    },
    {
      "holomen": "ラプラス・ダークネス",
      "holomenId": "laplus-darknesss",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": { "center": { "extent": "center-4", "permil": 1150 } }
    },
    {
      "holomen": "鷹嶺ルイ",
      "holomenId": "takane-lui",
      "red": [
        "R-003",
        "R-002",
        "R-001",
        "R-004",
        "R-007",
        "R-006",
        "R-005",
        "R-008",
        "R-021",
        "R-032",
        "R-049",
        "R-055",
        "R-052",
        "R-051",
        "R-050",
        "R-053",
        "R-054",
        "R-033",
        "R-034",
        "R-035",
        "R-040",
        "R-041",
        "R-020"
      ],
      "yellow": [
        "Y-003",
        "Y-002",
        "Y-001",
        "Y-015",
        "Y-014",
        "Y-011",
        "Y-010",
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
        "Y-016"
      ],
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": { "extent": "center-1", "permil": 1400 },
        "leader": { "extent": "leader-3", "permil": 1500 },
        "content": { "extent": "content-3", "permil": 1500 }
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
        "center": { "extent": "center-4", "permil": 1150 },
        "leader": { "extent": "general-1", "permil": 550 }
      }
    },
    {
      "holomen": "風真いろは",
      "holomenId": "kazama-iroha",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": { "center": { "extent": "content-4", "permil": 1150 } }
    },
    {
      "holomen": "アユンダ・リス",
      "holomenId": "ayunda-risu",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": { "center": { "extent": "center-4", "permil": 1150 } }
    },
    {
      "holomen": "ムーナ・ホシノヴァ",
      "holomenId": "moona-hoshinova",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": { "center": { "extent": "content-4", "permil": 1150 } }
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
      "connect": { "center": { "extent": "center-2", "permil": 1200 } }
    },
    {
      "holomen": "パヴォリア・レイネ",
      "holomenId": "pavolia-reine",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": { "center": { "extent": "content-4", "permil": 1150 } }
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
    { "holomen": "IRyS", "holomenId": "irys", "green": ["G-005", "G-002", "G-001", "G-004"] },
    {
      "holomen": "オーロ・クロニー",
      "holomenId": "ouro-kronii",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "ハコス・ベールズ",
      "holomenId": "hakos-baelz",
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": { "center": { "extent": "leader-2", "permil": 1650 } }
    },
    {
      "holomen": "シオリ・ノヴェラ",
      "holomenId": "shiori-novella",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "古石ビジュー",
      "holomenId": "koseki-bijou",
      "green": ["G-005", "G-002", "G-001", "G-004"]
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
        "R-054"
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
        "Y-016",
        "Y-023",
        "Y-003"
      ],
      "connect": {
        "center": { "extent": "center-1", "permil": 1400 },
        "leader": { "extent": "leader-1", "permil": 1500 },
        "card": { "extent": "content-3", "permil": 2000 },
        "content": { "extent": "leader-3", "permil": 1500 }
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
        "B-030"
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
        "Y-003"
      ],
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": { "extent": "content-4", "permil": 1150 },
        "card": { "extent": "card-3", "permil": 2100 },
        "content": { "extent": "content-1", "permil": 1100 }
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
    { "holomen": "ロボ子さん", "card": "高性能なVサイン", "cardId": "roboco-san-01", "bloom": 0 },
    {
      "holomen": "尾丸ポルカ",
      "card": "変幻自在！ポルカサーカス開演！",
      "cardId": "omaru-polka-01",
      "bloom": 0
    },
    { "holomen": "さくらみこ", "card": "サクラBloom", "cardId": "sakura-miko-01", "bloom": 0 },
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
    }
  ],
  "memoryPercent": 6,
  "enhancementPercent": 3.02
}
```
