# アカウント構造化データのスナップショット（2026-09-12）

ユーザーが「データの出力」でコピーした `holodori-optimizer/account` v1 をそのまま保存したもの（ボードのマス ID・コネクトの配置・所持メンバーと開花・イベントメモリー・メンバー強化ボーナス）。時点情報なので陳腐化を許容する。実機との突き合わせは [display-score-20260912.md](./display-score-20260912.md)「水着フワワリーダーの初観測」と `src/engine/power.test.ts`「水着フワワリーダーの 5 人」。

- 訂正: 出力時点の `members` では さくらみこ 2 枚の開花が逆に登録されていた（`sakura-miko-02` 0 / `sakura-miko-01` 1）。ユーザー確認（2026-09-12「2枚のみこの開花状況逆だった。構造化データ側のミス」）に従い、下の JSON は **`sakura-miko-02` = 1凸 / `sakura-miko-01` = 0凸** に直した値。
- 個人を特定する情報（プレイヤー名・ID・フレンドコード）は含まない。
- 追記（2026-09-12、同日の実機報告）: 出力時点の `members` にない **典獄ささやくClock Tower（`ouro-kronii-01`）Lv40 / 0凸** を所持している。オーロ・クロニーのボードは上表どおり 赤 0 / 青 0 / 黄 0 / 緑 4。JSON 本文は出力時点のまま変更しない。

## 概要

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
| 大神ミオ                     |  42 |  25 |   0 |   0 | center=center-1/1400 leader=content-2/1350 card=card-3/1600                         |
| さくらみこ                   |   0 |  28 |   0 |   4 | center=center-2/1400 card=content-3/2000                                            |
| 猫又おかゆ                   |   1 |  31 |  11 |  17 | center=card-3/1600 card=content-2/850                                               |
| 戌神ころね                   |   0 |  28 |  18 |  10 | center=center-4/1650 card=card-3/1600 content=content-1/1100                        |
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
| 鷹嶺ルイ                     |   0 |   0 |  20 |   4 | center=content-4/1150 content=content-3/1500                                        |
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
| フワワ・アビスガード         |  35 |   0 |  16 |   0 | center=center-1/1400 card=content-3/2000 content=leader-3/1500 leader=leader-1/1500 |
| モココ・アビスガード         |   0 |  28 |  10 |   4 | center=content-4/1150 card=card-3/2100 content=content-1/1100                       |
| 音乃瀬奏                     |   0 |   0 |   0 |   4 |                                                                                     |
| 一条莉々華                   |   0 |   0 |   0 |   4 |                                                                                     |
| 儒烏風亭らでん               |   0 |   0 |   0 |   4 |                                                                                     |
| 轟はじめ                     |   0 |   0 |   0 |   4 |                                                                                     |

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

イベントメモリー +6.0%、メンバー強化ボーナス +3.00%。

## JSON（全文）

```json
{
  "format": "holodori-optimizer/account",
  "version": 1,
  "holomen": [
    {
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
      "holomenId": "ookami-mio",
      "red": [
        "R-001",
        "R-002",
        "R-003",
        "R-004",
        "R-005",
        "R-006",
        "R-007",
        "R-008",
        "R-021",
        "R-009",
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
        "B-021",
        "B-018",
        "B-017",
        "B-016",
        "B-013",
        "B-012",
        "B-011",
        "B-015",
        "B-014",
        "B-029",
        "B-028",
        "B-027",
        "B-022",
        "B-019",
        "B-020"
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
      "holomenId": "nekomata-okayu",
      "red": ["R-001"],
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
        "B-013",
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
        "B-020"
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
        "center": {
          "extent": "leader-2",
          "permil": 1650
        },
        "card": {
          "extent": "content-1",
          "permil": 1100
        }
      }
    },
    {
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
      "holomenId": "takane-lui",
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
        "center": {
          "extent": "content-4",
          "permil": 1150
        },
        "content": {
          "extent": "content-3",
          "permil": 1500
        }
      }
    },
    {
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
      "holomenId": "airani-iofifteen",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomenId": "kureiji-ollie",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
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
      "holomenId": "vestia-zeta",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomenId": "kaela-kovalskia",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomenId": "kobo-kanaeru",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomenId": "mori-calliope",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomenId": "takanashi-kiara",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomenId": "ninomae-inanis",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomenId": "irys",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomenId": "ouro-kronii",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
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
      "holomenId": "shiori-novella",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomenId": "koseki-bijou",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomenId": "nerissa-ravencroft",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
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
        "R-054",
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
        "R-004",
        "R-003"
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
        "Y-024",
        "Y-016",
        "Y-025",
        "Y-023",
        "Y-003"
      ],
      "connect": {
        "center": {
          "extent": "center-1",
          "permil": 1400
        },
        "card": {
          "extent": "content-3",
          "permil": 2000
        },
        "content": {
          "extent": "leader-3",
          "permil": 1500
        },
        "leader": {
          "extent": "leader-1",
          "permil": 1500
        }
      }
    },
    {
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
      "holomenId": "otonose-kanade",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomenId": "ichijou-ririka",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomenId": "juufuutei-raden",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomenId": "todoroki-hajime",
      "green": ["G-005", "G-002", "G-001", "G-004"]
    }
  ],
  "members": [
    {
      "cardId": "sakura-miko-02",
      "bloom": 1
    },
    {
      "cardId": "ookami-mio-01",
      "bloom": 1
    },
    {
      "cardId": "ookami-mio-02",
      "bloom": 1
    },
    {
      "cardId": "shirakami-fubuki-01",
      "bloom": 1
    },
    {
      "cardId": "inugami-korone-01",
      "bloom": 3
    },
    {
      "cardId": "inugami-korone-02",
      "bloom": 2
    },
    {
      "cardId": "usada-pekora-01",
      "bloom": 1
    },
    {
      "cardId": "shirogane-noel-02",
      "bloom": 0
    },
    {
      "cardId": "shirogane-noel-01",
      "bloom": 0
    },
    {
      "cardId": "houshou-marine-01",
      "bloom": 1
    },
    {
      "cardId": "shiranui-flare-01",
      "bloom": 0
    },
    {
      "cardId": "tokino-sora-01",
      "bloom": 0
    },
    {
      "cardId": "roboco-san-01",
      "bloom": 0
    },
    {
      "cardId": "omaru-polka-01",
      "bloom": 0
    },
    {
      "cardId": "sakura-miko-01",
      "bloom": 0
    },
    {
      "cardId": "oozora-subaru-01",
      "bloom": 0
    },
    {
      "cardId": "shirakami-fubuki-02",
      "bloom": 0
    },
    {
      "cardId": "nekomata-okayu-01",
      "bloom": 1
    },
    {
      "cardId": "nekomata-okayu-02",
      "bloom": 5
    },
    {
      "cardId": "aki-rosenthal-01",
      "bloom": 0
    },
    {
      "cardId": "shishiro-botan-01",
      "bloom": 0
    },
    {
      "cardId": "fuwawa-abyssgard-02",
      "bloom": 0
    }
  ],
  "memoryPercent": 6,
  "enhancementPercent": 3
}
```
