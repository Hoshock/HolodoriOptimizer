# アカウント構造化データのスナップショット（2026-10-10）

ユーザーがサイトの「データの出力」でコピーした `holodori-optimizer/account` **version 1** を保存したもの（4 色ボードのマス ID・コネクトの解放と配置・ホロメンランク・所持メンバーと開花・余りのリソース・イベントメモリー・メンバー強化ボーナス）。**2026-10-10 時点の current snapshot** で、時点情報なので陳腐化を許容する。

- 保存の理由: 組み直しプランの再現（ユーザー指示「これスナップショットで残して置くこと」）。条件は 水着こぼ（`kobo-kanaeru-02`）リーダー + 恒常ミオ（`ookami-mio-01`）・恒常ころね（`inugami-korone-01`）・水着おかゆ（`nekomata-okayu-02`）・水着ハコス（`hakos-baelz-02`）・恒常クロニー（`ouro-kronii-01`）、曲はラミィのソロ曲。最小限オフで、メンバーに効かない 5期生の所属マス（ラミィ・ねね・ぼたんの G-008 / G-011 / G-021 と巻き込みの G-018）を外して緑キューブをほかへ回す推奨になる — ADR-026 のルール 2 のとおりで、ユーザーも「それは正しい」と確認した。
- **historical observation へ遡及適用しない。** 過去の観測は観測時点のボード状態で固定してある。
- JSON の中身は **raw export のまま**（推測による変更なし）。空白・改行だけを 2 スペースの整形にそろえた。
- 個人を特定する情報（プレイヤー名・ID・フレンドコード）は含まない。
- 下の表はすべて JSON から機械生成し、手で転記していない（`src/engine/accountSnapshot.audit.test.ts` が解放マス数の一致を固定する）。

## 概要（raw の解放マス数・ランク・コネクト）

| ホロメン                     | 赤  | 青  | 黄  | 緑  | Rank | 解放したコネクト    | コネクト（アンカー=形/‰）                                      |
| ---------------------------- | --- | --- | --- | --- | ---- | ------------------- | -------------------------------------------------------------- |
| ときのそら                   | 0   | 0   | 8   | 7   | 24   |                     | center=leader-2/2150                                           |
| ロボ子さん                   | 0   | 0   | 12  | 7   | 22   | content             | center=leader-2/2150 content=leader-2/2200                     |
| アキ・ローゼンタール         | 0   | 0   | 15  | 7   | 33   | content             | center=center-4/1150                                           |
| 赤井はあと                   | 0   | 0   | 0   | 7   | 18   |                     | center=center-5/1500                                           |
| 白上フブキ                   | 0   | 0   | 0   | 7   | 33   |                     | center=content-4/1650                                          |
| 夏色まつり                   | 0   | 0   | 0   | 7   | 19   |                     | center=center-4/1150                                           |
| 百鬼あやめ                   | 0   | 0   | 12  | 4   | 21   | content             | center=center-4/1150                                           |
| 癒月ちょこ                   | 0   | 0   | 0   | 4   | 20   |                     | center=content-4/1150                                          |
| 大空スバル                   | 0   | 0   | 0   | 4   | 23   |                     | center=leader-2/1650                                           |
| AZKi                         | 0   | 0   | 0   | 7   | 23   |                     | center=leader-2/1650                                           |
| 大神ミオ                     | 44  | 30  | 0   | 0   | 37   | leader card         | center=center-3/1400 card=card-3/2100                          |
| さくらみこ                   | 0   | 0   | 24  | 7   | 27   | content             | center=center-4/1150                                           |
| 猫又おかゆ                   | 0   | 28  | 24  | 9   | 39   | card content        | center=center-2/1400 card=content-3/2000                       |
| 戌神ころね                   | 0   | 31  | 24  | 9   | 33   | card content        | center=center-3/1400 card=card-3/2100 content=content-1/1100   |
| 星街すいせい                 | 0   | 0   | 0   | 7   | 20   |                     | center=leader-2/1650                                           |
| 兎田ぺこら                   | 0   | 28  | 0   | 7   | 26   | card                | center=content-4/1150 card=content-3/2000                      |
| 不知火フレア                 | 0   | 0   | 0   | 7   | 26   |                     | center=content-4/1150                                          |
| 白銀ノエル                   | 0   | 31  | 0   | 7   | 29   | card                | center=content-4/1150                                          |
| 宝鐘マリン                   | 32  | 31  | 0   | 7   | 36   | leader card         | center=leader-1/1500 leader=leader-1/1500 card=card-3/2100     |
| 角巻わため                   | 0   | 0   | 0   | 4   | 17   |                     | center=content-4/1150                                          |
| 常闇トワ                     | 0   | 0   | 0   | 4   | 19   |                     | center=center-4/1150                                           |
| 姫森ルーナ                   | 0   | 0   | 0   | 4   | 21   |                     | center=leader-2/1650                                           |
| 雪花ラミィ                   | 30  | 0   | 0   | 9   | 26   | leader              | center=center-5/1500 leader=leader-1/1500                      |
| 桃鈴ねね                     | 0   | 0   | 12  | 9   | 18   | content             | center=content-4/1150                                          |
| 獅白ぼたん                   | 0   | 0   | 12  | 9   | 25   | content             | center=center-4/1150                                           |
| 尾丸ポルカ                   | 44  | 14  | 17  | 0   | 36   | leader card content | card=card-3/2100 content=content-1/1100                        |
| ラプラス・ダークネス         | 0   | 0   | 0   | 7   | 25   |                     | center=center-4/1150                                           |
| 鷹嶺ルイ                     | 0   | 0   | 0   | 7   | 25   |                     | center=content-4/1150                                          |
| 博衣こより                   | 0   | 13  | 0   | 7   | 33   | card                | center=center-4/1650 card=content-3/2000                       |
| 風真いろは                   | 0   | 0   | 0   | 7   | 19   |                     | center=content-4/1150                                          |
| アユンダ・リス               | 0   | 0   | 0   | 4   | 21   |                     | center=center-4/1150                                           |
| ムーナ・ホシノヴァ           | 0   | 0   | 0   | 4   | 18   |                     | center=content-4/1150                                          |
| アイラニ・イオフィフティーン | 0   | 0   | 0   | 4   | 20   |                     |                                                                |
| クレイジー・オリー           | 0   | 0   | 0   | 4   | 20   |                     |                                                                |
| アーニャ・メルフィッサ       | 0   | 0   | 0   | 4   | 28   |                     |                                                                |
| パヴォリア・レイネ           | 0   | 0   | 0   | 4   | 20   |                     | center=content-4/1150                                          |
| ベスティア・ゼータ           | 0   | 0   | 0   | 7   | 19   |                     | center=center-4/1150                                           |
| カエラ・コヴァルスキア       | 0   | 0   | 0   | 7   | 20   |                     | center=leader-2/1650                                           |
| こぼ・かなえる               | 44  | 0   | 15  | 0   | 33   | leader content      | center=center-1/1400 leader=content-2/1350 content=card-1/1100 |
| 森カリオペ                   | 0   | 0   | 0   | 4   | 21   |                     |                                                                |
| 小鳥遊キアラ                 | 0   | 0   | 0   | 4   | 17   |                     |                                                                |
| 一伊那尓栖                   | 0   | 0   | 0   | 4   | 22   |                     |                                                                |
| IRyS                         | 0   | 0   | 0   | 4   | 22   |                     | center=center-4/1150                                           |
| オーロ・クロニー             | 0   | 29  | 0   | 10  | 25   | card                | center=center-3/1400 card=card-3/2100                          |
| ハコス・ベールズ             | 0   | 29  | 24  | 9   | 32   | card content        | center=center-2/1400 card=content-3/2000 content=card-1/1100   |
| シオリ・ノヴェラ             | 0   | 0   | 0   | 4   | 28   |                     |                                                                |
| 古石ビジュー                 | 0   | 0   | 0   | 4   | 20   |                     | center=leader-2/1650                                           |
| ネリッサ・レイヴンクロフト   | 0   | 0   | 0   | 4   | 20   |                     |                                                                |
| フワワ・アビスガード         | 0   | 0   | 24  | 7   | 33   | content             | center=center-4/1150                                           |
| モココ・アビスガード         | 0   | 0   | 0   | 4   | 29   |                     | center=content-4/1150                                          |
| 音乃瀬奏                     | 0   | 0   | 0   | 7   | 20   |                     | center=leader-2/1650                                           |
| 一条莉々華                   | 32  | 0   | 15  | 0   | 27   | leader content      | center=center-1/1400 leader=card-4/1500 content=card-1/1100    |
| 儒烏風亭らでん               | 0   | 0   | 0   | 7   | 20   |                     | center=leader-2/2200                                           |
| 轟はじめ                     | 0   | 0   | 0   | 7   | 17   |                     | center=leader-2/2200                                           |

## 余りのリソース

| 色  | キューブ | コアキューブ |
| --- | -------- | ------------ |
| 赤  | 4468     | 312          |
| 青  | 1225     | 641          |
| 黄  | 742      | 842          |
| 緑  | 1089     | 787          |

## アカウント補正

- `memoryPercent` = 6.6
- `enhancementPercent` = 4.27
- 所持メンバー: 99 枚（★4 を含む。一覧は下の JSON）

## 出力そのもの（raw export）

```json
{
  "format": "holodori-optimizer/account",
  "version": 1,
  "holomen": [
    {
      "holomen": "ときのそら",
      "holomenId": "tokino-sora",
      "rank": 24,
      "yellow": ["Y-003", "Y-002", "Y-001", "Y-004", "Y-008", "Y-007", "Y-006", "Y-005"],
      "green": ["G-005", "G-002", "G-001", "G-004", "G-003", "G-006", "G-007"],
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
      "rank": 22,
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
        "Y-015",
        "Y-014",
        "Y-003"
      ],
      "green": ["G-004", "G-002", "G-001", "G-005", "G-003", "G-006", "G-007"],
      "unlockedConnects": ["content"],
      "connect": {
        "center": {
          "extent": "leader-2",
          "permil": 2150
        },
        "content": {
          "extent": "leader-2",
          "permil": 2200
        }
      }
    },
    {
      "holomen": "アキ・ローゼンタール",
      "holomenId": "aki-rosenthal",
      "rank": 33,
      "yellow": [
        "Y-006",
        "Y-005",
        "Y-002",
        "Y-001",
        "Y-009",
        "Y-008",
        "Y-007",
        "Y-024",
        "Y-025",
        "Y-023",
        "Y-016",
        "Y-029",
        "Y-028",
        "Y-027",
        "Y-026"
      ],
      "green": ["G-001", "G-002", "G-003", "G-004", "G-005", "G-006", "G-007"],
      "unlockedConnects": ["content"],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "赤井はあと",
      "holomenId": "akai-haato",
      "rank": 18,
      "green": ["G-005", "G-002", "G-001", "G-004", "G-007", "G-006", "G-003"],
      "connect": {
        "center": {
          "extent": "center-5",
          "permil": 1500
        }
      }
    },
    {
      "holomen": "白上フブキ",
      "holomenId": "shirakami-fubuki",
      "rank": 33,
      "green": ["G-002", "G-001", "G-011", "G-008", "G-007", "G-006", "G-005"],
      "connect": {
        "center": {
          "extent": "content-4",
          "permil": 1650
        }
      }
    },
    {
      "holomen": "夏色まつり",
      "holomenId": "natsuiro-matsuri",
      "rank": 19,
      "green": ["G-001", "G-002", "G-003", "G-004", "G-005", "G-006", "G-007"],
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
      "rank": 21,
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
      "unlockedConnects": ["content"],
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
      "rank": 20,
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
      "rank": 23,
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
      "rank": 23,
      "green": ["G-005", "G-002", "G-001", "G-004", "G-003", "G-006", "G-007"],
      "connect": {
        "center": {
          "extent": "leader-2",
          "permil": 1650
        }
      }
    },
    {
      "holomen": "大神ミオ",
      "holomenId": "ookami-mio",
      "rank": 37,
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
        "R-040",
        "R-041",
        "R-042",
        "R-043",
        "R-044",
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
        "R-055",
        "R-004",
        "R-010",
        "R-009",
        "R-022",
        "R-057",
        "R-059",
        "R-011",
        "R-015",
        "R-016",
        "R-017",
        "R-018",
        "R-012",
        "R-013",
        "R-014"
      ],
      "blue": [
        "B-008",
        "B-007",
        "B-006",
        "B-005",
        "B-002",
        "B-001",
        "B-009",
        "B-023",
        "B-024",
        "B-016",
        "B-003",
        "B-004",
        "B-025",
        "B-014",
        "B-011",
        "B-010",
        "B-026",
        "B-017",
        "B-015",
        "B-012",
        "B-013",
        "B-027",
        "B-030",
        "B-028",
        "B-029",
        "B-018",
        "B-021",
        "B-022",
        "B-019",
        "B-020"
      ],
      "unlockedConnects": ["leader", "card"],
      "connect": {
        "center": {
          "extent": "center-3",
          "permil": 1400
        },
        "card": {
          "extent": "card-3",
          "permil": 2100
        }
      }
    },
    {
      "holomen": "さくらみこ",
      "holomenId": "sakura-miko",
      "rank": 27,
      "yellow": [
        "Y-001",
        "Y-002",
        "Y-005",
        "Y-006",
        "Y-007",
        "Y-008",
        "Y-009",
        "Y-010",
        "Y-011",
        "Y-012",
        "Y-013",
        "Y-014",
        "Y-023",
        "Y-026",
        "Y-027",
        "Y-030",
        "Y-031",
        "Y-028",
        "Y-016",
        "Y-017",
        "Y-018",
        "Y-019",
        "Y-020",
        "Y-021"
      ],
      "green": ["G-005", "G-002", "G-001", "G-004", "G-003", "G-006", "G-007"],
      "unlockedConnects": ["content"],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "猫又おかゆ",
      "holomenId": "nekomata-okayu",
      "rank": 39,
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
        "B-012"
      ],
      "yellow": [
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
        "Y-012",
        "Y-013",
        "Y-023",
        "Y-026",
        "Y-027",
        "Y-028",
        "Y-030",
        "Y-031",
        "Y-016",
        "Y-017",
        "Y-018",
        "Y-019",
        "Y-020",
        "Y-021"
      ],
      "green": ["G-021", "G-018", "G-011", "G-008", "G-007", "G-006", "G-005", "G-002", "G-001"],
      "unlockedConnects": ["card", "content"],
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
      "holomen": "戌神ころね",
      "holomenId": "inugami-korone",
      "rank": 33,
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
        "Y-023",
        "Y-028",
        "Y-027",
        "Y-026",
        "Y-012",
        "Y-013",
        "Y-014",
        "Y-030",
        "Y-031",
        "Y-017",
        "Y-018",
        "Y-021",
        "Y-019",
        "Y-020"
      ],
      "green": ["G-005", "G-002", "G-001", "G-021", "G-018", "G-011", "G-008", "G-007", "G-006"],
      "unlockedConnects": ["card", "content"],
      "connect": {
        "center": {
          "extent": "center-3",
          "permil": 1400
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
      "holomen": "星街すいせい",
      "holomenId": "hoshimachi-suisei",
      "rank": 20,
      "green": ["G-005", "G-002", "G-001", "G-004", "G-003", "G-006", "G-007"],
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
      "rank": 26,
      "blue": [
        "B-015",
        "B-014",
        "B-011",
        "B-010",
        "B-009",
        "B-008",
        "B-007",
        "B-006",
        "B-005",
        "B-002",
        "B-001",
        "B-016",
        "B-029",
        "B-028",
        "B-027",
        "B-026",
        "B-023",
        "B-024",
        "B-025",
        "B-030",
        "B-012",
        "B-004",
        "B-003",
        "B-022",
        "B-021",
        "B-018",
        "B-017",
        "B-019"
      ],
      "green": ["G-005", "G-002", "G-001", "G-007", "G-006", "G-003", "G-004"],
      "unlockedConnects": ["card"],
      "connect": {
        "center": {
          "extent": "content-4",
          "permil": 1150
        },
        "card": {
          "extent": "content-3",
          "permil": 2000
        }
      }
    },
    {
      "holomen": "不知火フレア",
      "holomenId": "shiranui-flare",
      "rank": 26,
      "green": ["G-005", "G-002", "G-001", "G-007", "G-006", "G-003", "G-004"],
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
      "rank": 29,
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
        "B-020",
        "B-031",
        "B-013"
      ],
      "green": ["G-002", "G-001", "G-005", "G-007", "G-006", "G-003", "G-004"],
      "unlockedConnects": ["card"],
      "connect": {
        "center": {
          "extent": "content-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "宝鐘マリン",
      "holomenId": "houshou-marine",
      "rank": 36,
      "red": [
        "R-008",
        "R-007",
        "R-006",
        "R-005",
        "R-002",
        "R-001",
        "R-003",
        "R-022",
        "R-032",
        "R-019",
        "R-020",
        "R-039",
        "R-038",
        "R-037",
        "R-036",
        "R-035",
        "R-034",
        "R-033",
        "R-004",
        "R-010",
        "R-009",
        "R-044",
        "R-043",
        "R-042",
        "R-041",
        "R-040",
        "R-063",
        "R-062",
        "R-048",
        "R-047",
        "R-046",
        "R-045"
      ],
      "blue": [
        "B-009",
        "B-008",
        "B-007",
        "B-006",
        "B-005",
        "B-002",
        "B-001",
        "B-023",
        "B-016",
        "B-004",
        "B-003",
        "B-017",
        "B-010",
        "B-011",
        "B-012",
        "B-014",
        "B-026",
        "B-025",
        "B-024",
        "B-015",
        "B-027",
        "B-028",
        "B-029",
        "B-030",
        "B-018",
        "B-021",
        "B-022",
        "B-019",
        "B-020",
        "B-031",
        "B-013"
      ],
      "green": ["G-001", "G-002", "G-003", "G-004", "G-005", "G-006", "G-007"],
      "unlockedConnects": ["leader", "card"],
      "connect": {
        "center": {
          "extent": "leader-1",
          "permil": 1500
        },
        "leader": {
          "extent": "leader-1",
          "permil": 1500
        },
        "card": {
          "extent": "card-3",
          "permil": 2100
        }
      }
    },
    {
      "holomen": "角巻わため",
      "holomenId": "tsunomaki-watame",
      "rank": 17,
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
      "rank": 19,
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
      "rank": 21,
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
      "rank": 26,
      "red": [
        "R-001",
        "R-002",
        "R-005",
        "R-006",
        "R-007",
        "R-008",
        "R-021",
        "R-049",
        "R-050",
        "R-051",
        "R-052",
        "R-055",
        "R-019",
        "R-020",
        "R-032",
        "R-022",
        "R-009",
        "R-010",
        "R-004",
        "R-003",
        "R-033",
        "R-034",
        "R-035",
        "R-040",
        "R-041",
        "R-042",
        "R-043",
        "R-044",
        "R-054",
        "R-053"
      ],
      "green": ["G-001", "G-002", "G-005", "G-006", "G-007", "G-008", "G-011", "G-018", "G-021"],
      "unlockedConnects": ["leader"],
      "connect": {
        "center": {
          "extent": "center-5",
          "permil": 1500
        },
        "leader": {
          "extent": "leader-1",
          "permil": 1500
        }
      }
    },
    {
      "holomen": "桃鈴ねね",
      "holomenId": "momosuzu-nene",
      "rank": 18,
      "yellow": [
        "Y-001",
        "Y-002",
        "Y-005",
        "Y-006",
        "Y-007",
        "Y-008",
        "Y-009",
        "Y-010",
        "Y-011",
        "Y-014",
        "Y-015",
        "Y-003"
      ],
      "green": ["G-002", "G-001", "G-005", "G-006", "G-007", "G-008", "G-011", "G-018", "G-021"],
      "unlockedConnects": ["content"],
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
      "rank": 25,
      "yellow": [
        "Y-001",
        "Y-002",
        "Y-005",
        "Y-006",
        "Y-007",
        "Y-008",
        "Y-009",
        "Y-010",
        "Y-011",
        "Y-014",
        "Y-015",
        "Y-003"
      ],
      "green": ["G-005", "G-002", "G-001", "G-006", "G-007", "G-008", "G-011", "G-018", "G-021"],
      "unlockedConnects": ["content"],
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
      "rank": 36,
      "red": [
        "R-001",
        "R-002",
        "R-004",
        "R-005",
        "R-006",
        "R-007",
        "R-008",
        "R-021",
        "R-049",
        "R-009",
        "R-022",
        "R-032",
        "R-033",
        "R-034",
        "R-035",
        "R-036",
        "R-037",
        "R-038",
        "R-039",
        "R-063",
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
        "R-050",
        "R-051",
        "R-052",
        "R-055",
        "R-003",
        "R-010",
        "R-058",
        "R-061",
        "R-053",
        "R-056",
        "R-060",
        "R-019",
        "R-054",
        "R-020"
      ],
      "blue": [
        "B-001",
        "B-002",
        "B-005",
        "B-006",
        "B-007",
        "B-008",
        "B-009",
        "B-010",
        "B-011",
        "B-023",
        "B-026",
        "B-014",
        "B-015",
        "B-016"
      ],
      "yellow": [
        "Y-003",
        "Y-002",
        "Y-001",
        "Y-004",
        "Y-008",
        "Y-007",
        "Y-006",
        "Y-005",
        "Y-016",
        "Y-023",
        "Y-009",
        "Y-025",
        "Y-024",
        "Y-026",
        "Y-027",
        "Y-028",
        "Y-029"
      ],
      "unlockedConnects": ["leader", "card", "content"],
      "connect": {
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
      "holomen": "ラプラス・ダークネス",
      "holomenId": "laplus-darknesss",
      "rank": 25,
      "green": ["G-001", "G-002", "G-003", "G-004", "G-005", "G-006", "G-007"],
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
      "rank": 25,
      "green": ["G-007", "G-006", "G-005", "G-002", "G-001", "G-003", "G-004"],
      "connect": {
        "center": {
          "extent": "content-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "博衣こより",
      "holomenId": "hakui-koyori",
      "rank": 33,
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
      "green": ["G-001", "G-002", "G-003", "G-004", "G-005", "G-006", "G-007"],
      "unlockedConnects": ["card"],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1650
        },
        "card": {
          "extent": "content-3",
          "permil": 2000
        }
      }
    },
    {
      "holomen": "風真いろは",
      "holomenId": "kazama-iroha",
      "rank": 19,
      "green": ["G-001", "G-002", "G-003", "G-005", "G-006", "G-007", "G-004"],
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
      "rank": 21,
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
      "rank": 18,
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
      "rank": 20,
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "クレイジー・オリー",
      "holomenId": "kureiji-ollie",
      "rank": 20,
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "アーニャ・メルフィッサ",
      "holomenId": "anya-melfissa",
      "rank": 28,
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "パヴォリア・レイネ",
      "holomenId": "pavolia-reine",
      "rank": 20,
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
      "rank": 19,
      "green": ["G-001", "G-002", "G-003", "G-004", "G-005", "G-006", "G-007"],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "カエラ・コヴァルスキア",
      "holomenId": "kaela-kovalskia",
      "rank": 20,
      "green": ["G-001", "G-002", "G-003", "G-004", "G-005", "G-006", "G-007"],
      "connect": {
        "center": {
          "extent": "leader-2",
          "permil": 1650
        }
      }
    },
    {
      "holomen": "こぼ・かなえる",
      "holomenId": "kobo-kanaeru",
      "rank": 33,
      "red": [
        "R-001",
        "R-002",
        "R-005",
        "R-006",
        "R-007",
        "R-008",
        "R-021",
        "R-049",
        "R-019",
        "R-020",
        "R-009",
        "R-010",
        "R-022",
        "R-032",
        "R-033",
        "R-034",
        "R-035",
        "R-036",
        "R-037",
        "R-038",
        "R-039",
        "R-063",
        "R-040",
        "R-041",
        "R-042",
        "R-043",
        "R-045",
        "R-046",
        "R-047",
        "R-048",
        "R-062",
        "R-044",
        "R-004",
        "R-003",
        "R-050",
        "R-051",
        "R-052",
        "R-054",
        "R-058",
        "R-061",
        "R-053",
        "R-056",
        "R-060",
        "R-055"
      ],
      "yellow": [
        "Y-008",
        "Y-007",
        "Y-006",
        "Y-005",
        "Y-002",
        "Y-001",
        "Y-009",
        "Y-024",
        "Y-025",
        "Y-016",
        "Y-023",
        "Y-028",
        "Y-027",
        "Y-026",
        "Y-029"
      ],
      "unlockedConnects": ["leader", "content"],
      "connect": {
        "center": {
          "extent": "center-1",
          "permil": 1400
        },
        "leader": {
          "extent": "content-2",
          "permil": 1350
        },
        "content": {
          "extent": "card-1",
          "permil": 1100
        }
      }
    },
    {
      "holomen": "森カリオペ",
      "holomenId": "mori-calliope",
      "rank": 21,
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "小鳥遊キアラ",
      "holomenId": "takanashi-kiara",
      "rank": 17,
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "一伊那尓栖",
      "holomenId": "ninomae-inanis",
      "rank": 22,
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "IRyS",
      "holomenId": "irys",
      "rank": 22,
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "オーロ・クロニー",
      "holomenId": "ouro-kronii",
      "rank": 25,
      "blue": [
        "B-015",
        "B-014",
        "B-011",
        "B-010",
        "B-009",
        "B-008",
        "B-007",
        "B-006",
        "B-005",
        "B-002",
        "B-001",
        "B-012",
        "B-025",
        "B-023",
        "B-024",
        "B-016",
        "B-027",
        "B-026",
        "B-029",
        "B-028",
        "B-030",
        "B-017",
        "B-021",
        "B-018",
        "B-022",
        "B-019",
        "B-004",
        "B-003",
        "B-013"
      ],
      "green": [
        "G-005",
        "G-002",
        "G-001",
        "G-004",
        "G-006",
        "G-007",
        "G-008",
        "G-011",
        "G-018",
        "G-021"
      ],
      "unlockedConnects": ["card"],
      "connect": {
        "center": {
          "extent": "center-3",
          "permil": 1400
        },
        "card": {
          "extent": "card-3",
          "permil": 2100
        }
      }
    },
    {
      "holomen": "ハコス・ベールズ",
      "holomenId": "hakos-baelz",
      "rank": 32,
      "blue": [
        "B-006",
        "B-005",
        "B-002",
        "B-001",
        "B-007",
        "B-008",
        "B-009",
        "B-010",
        "B-011",
        "B-014",
        "B-015",
        "B-016",
        "B-025",
        "B-024",
        "B-023",
        "B-026",
        "B-027",
        "B-028",
        "B-029",
        "B-017",
        "B-018",
        "B-021",
        "B-022",
        "B-012",
        "B-003",
        "B-004",
        "B-013",
        "B-019",
        "B-030"
      ],
      "yellow": [
        "Y-002",
        "Y-001",
        "Y-028",
        "Y-027",
        "Y-026",
        "Y-023",
        "Y-008",
        "Y-007",
        "Y-006",
        "Y-005",
        "Y-009",
        "Y-016",
        "Y-010",
        "Y-011",
        "Y-012",
        "Y-013",
        "Y-014",
        "Y-030",
        "Y-031",
        "Y-017",
        "Y-018",
        "Y-021",
        "Y-019",
        "Y-020"
      ],
      "green": ["G-001", "G-002", "G-005", "G-006", "G-007", "G-008", "G-011", "G-018", "G-021"],
      "unlockedConnects": ["card", "content"],
      "connect": {
        "center": {
          "extent": "center-2",
          "permil": 1400
        },
        "card": {
          "extent": "content-3",
          "permil": 2000
        },
        "content": {
          "extent": "card-1",
          "permil": 1100
        }
      }
    },
    {
      "holomen": "シオリ・ノヴェラ",
      "holomenId": "shiori-novella",
      "rank": 28,
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "古石ビジュー",
      "holomenId": "koseki-bijou",
      "rank": 20,
      "green": ["G-005", "G-002", "G-001", "G-004"],
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
      "rank": 20,
      "green": ["G-005", "G-002", "G-001", "G-004"]
    },
    {
      "holomen": "フワワ・アビスガード",
      "holomenId": "fuwawa-abyssgard",
      "rank": 33,
      "yellow": [
        "Y-001",
        "Y-002",
        "Y-005",
        "Y-006",
        "Y-007",
        "Y-008",
        "Y-009",
        "Y-010",
        "Y-011",
        "Y-014",
        "Y-012",
        "Y-013",
        "Y-023",
        "Y-026",
        "Y-027",
        "Y-028",
        "Y-030",
        "Y-031",
        "Y-016",
        "Y-017",
        "Y-018",
        "Y-019",
        "Y-020",
        "Y-021"
      ],
      "green": ["G-001", "G-002", "G-003", "G-004", "G-005", "G-006", "G-007"],
      "unlockedConnects": ["content"],
      "connect": {
        "center": {
          "extent": "center-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "モココ・アビスガード",
      "holomenId": "mococo-abyssgard",
      "rank": 29,
      "green": ["G-005", "G-002", "G-001", "G-004"],
      "connect": {
        "center": {
          "extent": "content-4",
          "permil": 1150
        }
      }
    },
    {
      "holomen": "音乃瀬奏",
      "holomenId": "otonose-kanade",
      "rank": 20,
      "green": ["G-005", "G-002", "G-001", "G-004", "G-006", "G-007", "G-003"],
      "connect": {
        "center": {
          "extent": "leader-2",
          "permil": 1650
        }
      }
    },
    {
      "holomen": "一条莉々華",
      "holomenId": "ichijou-ririka",
      "rank": 27,
      "red": [
        "R-001",
        "R-002",
        "R-005",
        "R-006",
        "R-003",
        "R-004",
        "R-007",
        "R-008",
        "R-009",
        "R-010",
        "R-021",
        "R-049",
        "R-050",
        "R-051",
        "R-052",
        "R-053",
        "R-056",
        "R-060",
        "R-054",
        "R-058",
        "R-061",
        "R-055",
        "R-032",
        "R-033",
        "R-034",
        "R-035",
        "R-020",
        "R-022",
        "R-019",
        "R-040",
        "R-041",
        "R-042"
      ],
      "yellow": [
        "Y-001",
        "Y-002",
        "Y-005",
        "Y-006",
        "Y-007",
        "Y-008",
        "Y-023",
        "Y-026",
        "Y-027",
        "Y-028",
        "Y-029",
        "Y-009",
        "Y-024",
        "Y-025",
        "Y-016"
      ],
      "unlockedConnects": ["leader", "content"],
      "connect": {
        "center": {
          "extent": "center-1",
          "permil": 1400
        },
        "leader": {
          "extent": "card-4",
          "permil": 1500
        },
        "content": {
          "extent": "card-1",
          "permil": 1100
        }
      }
    },
    {
      "holomen": "儒烏風亭らでん",
      "holomenId": "juufuutei-raden",
      "rank": 20,
      "green": ["G-005", "G-002", "G-001", "G-004", "G-006", "G-003", "G-007"],
      "connect": {
        "center": {
          "extent": "leader-2",
          "permil": 2200
        }
      }
    },
    {
      "holomen": "轟はじめ",
      "holomenId": "todoroki-hajime",
      "rank": 17,
      "green": ["G-005", "G-002", "G-001", "G-004", "G-006", "G-003", "G-007"],
      "connect": {
        "center": {
          "extent": "leader-2",
          "permil": 2200
        }
      }
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
      "bloom": 2
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
      "bloom": 2
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
      "bloom": 1
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
      "bloom": 1
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
      "bloom": 1
    },
    {
      "holomen": "音乃瀬奏",
      "card": "潮風にのせる、笑顔のハーモニー",
      "cardId": "otonose-kanade-02",
      "bloom": 0
    },
    {
      "holomen": "アキ・ローゼンタール",
      "card": "陽だまりのミスティカルスイング",
      "cardId": "aki-rosenthal-02",
      "bloom": 0
    },
    {
      "holomen": "宝鐘マリン",
      "card": "お宝独占♡ウォーターキャノン",
      "cardId": "houshou-marine-02",
      "bloom": 0
    },
    {
      "holomen": "博衣こより",
      "card": "振り向きざまのaventure",
      "cardId": "hakui-koyori-02",
      "bloom": 0
    },
    {
      "holomen": "ハコス・ベールズ",
      "card": "これがボクのイチオシ！",
      "cardId": "hakos-baelz-02",
      "bloom": 1
    },
    {
      "holomen": "大空スバル",
      "card": "Energeticスプラッシュ！",
      "cardId": "oozora-subaru-02",
      "bloom": 0
    },
    {
      "holomen": "百鬼あやめ",
      "card": "鬼神流・ぷかぷかリゾート",
      "cardId": "nakiri-ayame-02",
      "bloom": 0
    },
    {
      "holomen": "尾丸ポルカ",
      "card": "幸せ分け合うMeat For You",
      "cardId": "omaru-polka-02",
      "bloom": 0
    },
    {
      "holomen": "一伊那尓栖",
      "card": "ぽかぽかチャージなひととき",
      "cardId": "ninomae-inanis-01",
      "bloom": 0
    },
    {
      "holomen": "森カリオペ",
      "card": "ビーチに刺さるReaper's Spike",
      "cardId": "mori-calliope-02",
      "bloom": 0
    },
    {
      "holomen": "AZKi",
      "card": "やわらかな旋律に乗せて",
      "cardId": "azki-star4-01",
      "bloom": 1
    },
    {
      "holomen": "さくらみこ",
      "card": "両手広げるCheerful show",
      "cardId": "sakura-miko-star4-01",
      "bloom": 2
    },
    {
      "holomen": "ときのそら",
      "card": "空まで届け！まっすぐな歌声",
      "cardId": "tokino-sora-star4-01",
      "bloom": 5
    },
    {
      "holomen": "星街すいせい",
      "card": "フロア沸かす目映い存在",
      "cardId": "hoshimachi-suisei-star4-01",
      "bloom": 3
    },
    {
      "holomen": "ロボ子さん",
      "card": "ゆるふわウインクLIVE",
      "cardId": "roboco-san-star4-01",
      "bloom": 3
    },
    {
      "holomen": "赤井はあと",
      "card": "ハートくすぐる奔放ライブ",
      "cardId": "akai-haato-star4-01",
      "bloom": 4
    },
    {
      "holomen": "アキ・ローゼンタール",
      "card": "歌うcuriousハーフエルフ",
      "cardId": "aki-rosenthal-star4-01",
      "bloom": 5
    },
    {
      "holomen": "白上フブキ",
      "card": "ギアあげるFOXパフォーマンス",
      "cardId": "shirakami-fubuki-star4-01",
      "bloom": 3
    },
    {
      "holomen": "夏色まつり",
      "card": "あざとさ全開キュンキュンライブ",
      "cardId": "natsuiro-matsuri-star4-01",
      "bloom": 5
    },
    {
      "holomen": "大空スバル",
      "card": "心照らすActive Live",
      "cardId": "oozora-subaru-star4-01",
      "bloom": 3
    },
    {
      "holomen": "百鬼あやめ",
      "card": "鬼娘のほわっとアンコール",
      "cardId": "nakiri-ayame-star4-01",
      "bloom": 0
    },
    {
      "holomen": "癒月ちょこ",
      "card": "保健医さん魅惑のライブ",
      "cardId": "yuzuki-choco-star4-01",
      "bloom": 2
    },
    {
      "holomen": "戌神ころね",
      "card": "farout dogパンチライン",
      "cardId": "inugami-korone-star4-01",
      "bloom": 3
    },
    {
      "holomen": "大神ミオ",
      "card": "光射す狼の歌声",
      "cardId": "ookami-mio-star4-01",
      "bloom": 2
    },
    {
      "holomen": "猫又おかゆ",
      "card": "夢中にさせるいたずらCATライブ",
      "cardId": "nekomata-okayu-star4-01",
      "bloom": 1
    },
    {
      "holomen": "兎田ぺこら",
      "card": "cheekyホッピンバニー",
      "cardId": "usada-pekora-star4-01",
      "bloom": 1
    },
    {
      "holomen": "不知火フレア",
      "card": "ダンスから伝わる気遣い",
      "cardId": "shiranui-flare-star4-01",
      "bloom": 0
    },
    {
      "holomen": "白銀ノエル",
      "card": "歌う脳筋ゴリ押しナイト",
      "cardId": "shirogane-noel-star4-01",
      "bloom": 5
    },
    {
      "holomen": "宝鐘マリン",
      "card": "♡とらえる海賊のテリトリー",
      "cardId": "houshou-marine-star4-01",
      "bloom": 1
    },
    {
      "holomen": "角巻わため",
      "card": "広がるhealing sound",
      "cardId": "tsunomaki-watame-star4-01",
      "bloom": 1
    },
    {
      "holomen": "常闇トワ",
      "card": "余裕ぶっこくナイトライブ",
      "cardId": "tokoyami-towa-star4-01",
      "bloom": 4
    },
    {
      "holomen": "姫森ルーナ",
      "card": "ふんわりプリンセスステージ",
      "cardId": "himemori-luna-star4-01",
      "bloom": 4
    },
    {
      "holomen": "尾丸ポルカ",
      "card": "パーティーハード全開LIVE",
      "cardId": "omaru-polka-star4-01",
      "bloom": 4
    },
    {
      "holomen": "獅白ぼたん",
      "card": "魅せるLaughing Lion",
      "cardId": "shishiro-botan-star4-01",
      "bloom": 5
    },
    {
      "holomen": "桃鈴ねね",
      "card": "get excitedジャンプ！",
      "cardId": "momosuzu-nene-star4-01",
      "bloom": 2
    },
    {
      "holomen": "雪花ラミィ",
      "card": "照らすsnow mood！",
      "cardId": "yukihana-lamy-star4-01",
      "bloom": 3
    },
    {
      "holomen": "風真いろは",
      "card": "ステージで放つ！修行の成果",
      "cardId": "kazama-iroha-star4-01",
      "bloom": 4
    },
    {
      "holomen": "鷹嶺ルイ",
      "card": "どこでも信頼！切れ者LIVE",
      "cardId": "takane-lui-star4-01",
      "bloom": 1
    },
    {
      "holomen": "博衣こより",
      "card": "舞台に響くcute howl",
      "cardId": "hakui-koyori-star4-01",
      "bloom": 3
    },
    {
      "holomen": "ラプラス・ダークネス",
      "card": "今宵のライブ、吾輩が主役",
      "cardId": "laplus-darknesss-star4-01",
      "bloom": 1
    },
    {
      "holomen": "アイラニ・イオフィフティーン",
      "card": "麗らかなStage View",
      "cardId": "airani-iofifteen-star4-01",
      "bloom": 2
    },
    {
      "holomen": "アユンダ・リス",
      "card": "まんまるしっぽのキュートライブ",
      "cardId": "ayunda-risu-star4-01",
      "bloom": 4
    },
    {
      "holomen": "ムーナ・ホシノヴァ",
      "card": "月のヒカリに溶けこむ歌声",
      "cardId": "moona-hoshinova-star4-01",
      "bloom": 4
    },
    {
      "holomen": "アーニャ・メルフィッサ",
      "card": "Little Back気ままなステージ",
      "cardId": "anya-melfissa-star4-01",
      "bloom": 4
    },
    {
      "holomen": "クレイジー・オリー",
      "card": "Deadly Encore",
      "cardId": "kureiji-ollie-star4-01",
      "bloom": 3
    },
    {
      "holomen": "パヴォリア・レイネ",
      "card": "祝福のラグジュアリーナイト",
      "cardId": "pavolia-reine-star4-01",
      "bloom": 1
    },
    {
      "holomen": "カエラ・コヴァルスキア",
      "card": "鍛冶場に匹敵！激アツライブ",
      "cardId": "kaela-kovalskia-star4-01",
      "bloom": 5
    },
    {
      "holomen": "こぼ・かなえる",
      "card": "ドタバタフルスロットルステージ",
      "cardId": "kobo-kanaeru-star4-01",
      "bloom": 5
    },
    {
      "holomen": "ベスティア・ゼータ",
      "card": "childlikeるんるんライブ",
      "cardId": "vestia-zeta-star4-01",
      "bloom": 2
    },
    {
      "holomen": "小鳥遊キアラ",
      "card": "ようこそハピネスステージへ",
      "cardId": "takanashi-kiara-star4-01",
      "bloom": 2
    },
    {
      "holomen": "一伊那尓栖",
      "card": "舞台を飾る和やか笑顔",
      "cardId": "ninomae-inanis-star4-01",
      "bloom": 2
    },
    {
      "holomen": "森カリオペ",
      "card": "レペゼン冥土！ here we go",
      "cardId": "mori-calliope-star4-01",
      "bloom": 5
    },
    {
      "holomen": "IRyS",
      "card": "響き渡るホープフルボイス",
      "cardId": "irys-star4-01",
      "bloom": 5
    },
    {
      "holomen": "オーロ・クロニー",
      "card": "刻を忘れるパフォーマンス",
      "cardId": "ouro-kronii-star4-01",
      "bloom": 3
    },
    {
      "holomen": "ハコス・ベールズ",
      "card": "Let's dance more！",
      "cardId": "hakos-baelz-star4-01",
      "bloom": 1
    },
    {
      "holomen": "古石ビジュー",
      "card": "キラリと見せる無垢な素顔",
      "cardId": "koseki-bijou-star4-01",
      "bloom": 4
    },
    {
      "holomen": "シオリ・ノヴェラ",
      "card": "ステージでもKeep it real",
      "cardId": "shiori-novella-star4-01",
      "bloom": 3
    },
    {
      "holomen": "ネリッサ・レイヴンクロフト",
      "card": "美声届ける夕闇ステージ",
      "cardId": "nerissa-ravencroft-star4-01",
      "bloom": 4
    },
    {
      "holomen": "フワワ・アビスガード",
      "card": "ホッと安らぐフワフワライブ",
      "cardId": "fuwawa-abyssgard-star4-01",
      "bloom": 4
    },
    {
      "holomen": "モココ・アビスガード",
      "card": "パッと笑顔にモコモコライブ",
      "cardId": "mococo-abyssgard-star4-01",
      "bloom": 2
    },
    {
      "holomen": "一条莉々華",
      "card": "ずっきゅんばっきゅんLIVE♡",
      "cardId": "ichijou-ririka-star4-01",
      "bloom": 5
    },
    {
      "holomen": "音乃瀬奏",
      "card": "届け！とびっきりハーモニー",
      "cardId": "otonose-kanade-star4-01",
      "bloom": 4
    },
    {
      "holomen": "儒烏風亭らでん",
      "card": "cultural performer",
      "cardId": "juufuutei-raden-star4-01",
      "bloom": 2
    },
    {
      "holomen": "轟はじめ",
      "card": "番長の番長たる所以",
      "cardId": "todoroki-hajime-star4-01",
      "bloom": 3
    },
    {
      "holomen": "こぼ・かなえる",
      "card": "波間に揺れるBody ＆ Soul",
      "cardId": "kobo-kanaeru-02",
      "bloom": 0
    },
    {
      "holomen": "星街すいせい",
      "card": "心奪うComet Tune",
      "cardId": "hoshimachi-suisei-01",
      "bloom": 0
    }
  ],
  "resources": {
    "red": {
      "cube": 4468,
      "core": 312
    },
    "blue": {
      "cube": 1225,
      "core": 641
    },
    "yellow": {
      "cube": 742,
      "core": 842
    },
    "green": {
      "cube": 1089,
      "core": 787
    }
  },
  "memoryPercent": 6.6,
  "enhancementPercent": 4.27
}
```
