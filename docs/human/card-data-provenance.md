# カードデータの provenance

カード値を使う前に [evidence-policy.md](./evidence-policy.md) と併せて読む。

## どのファイルが何か

- `src/data/cards.json`: 取り込み元のカードレコード。トップレベルの `stats` / 4スキルは最大開花側として扱う。初期の多くは公開データ転記で、全件実機確認ではない。
- `src/data/cardCorrections.ts`: 後日、実機で誤りが確認されたレコードへ適用する補正。`src/data/index.ts` がexportする `cards` / `cardById` がランタイム正典。
- `src/data/bloomEvidence.ts`: `bloomVariants` の値・文言が何由来かを分類する。
- `cardAtBloomWithProvenance()`: 指定開花へ解決したカードと、各フィールドの出所を同時に返す。

## provenance の読み方

| source                             | 意味                                                                                                                                                                            |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `max-record`                       | 最大開花側として扱う取り込みレコード。実機確認済みとは限らない                                                                                                                  |
| `observed-variant`                 | そのvariantのゲーム内文言を実機情報として記録                                                                                                                                   |
| `reconstructed-observation`        | 数値・効果は実機確認したが、raw文は最大側文言を基に再構成                                                                                                                       |
| `extracted-master-variant`         | 外部で抽出されたマスターデータ由来のvariant。実機目視ではない（権威順位は「外部解析」）。出所は `bloomEvidence.ts` の `master`（repo / commit / ファイル / マスター側カードID） |
| `recorded-variant-unclassified`    | variantはあるが出典分類が未棚卸し。通常はテストで禁止                                                                                                                           |
| `derived-from-max-confirmed-ratio` | 2凸+10%という確認済み規則から最大値を逆算。ただし整数丸め不確実性あり                                                                                                           |
| `estimated-from-max`               | スキル×1.1等の仮定で最大値から推定。実測値ではない                                                                                                                              |

## 棚卸し状態

- 既存の `bloomVariants` は全件 `bloomEvidence.ts` で分類済み。`recorded-variant-unclassified` が1件でも実データに残れば `bloomEvidence.test.ts` が失敗する。
- 0凸variantを1凸Active、3凸SP、4凸Passiveの強化境界後まで誤って持ち越す旧 `variantAt()` 挙動は修正済み。強化境界のテストを追加した。
- `cardAtBloomWithProvenance()` は、最大レコードそのもの・確認済みvariant・再構成観測・抽出マスターvariant・最大値からの推定を区別して返す。
- 抽出マスターのスキル level 番号と画面の凸段階の対応はカード共通ではない（下の「低開花値の確定」）。実機 variant を最優先し、level 番号だけから未観測の凸値を確定扱いしない。
- 一方、トップレベル `cards.json` 各レコードが歴史的に「初期公開データ転記 / 実機入力 / 後日訂正」のどれに由来したかは、古い元資料が残っていないものもある。根拠を追えないものを推測で `observed` に昇格しない。ここだけは継続棚卸し対象。

## 2026-09-12の訂正

水着フワワ `fuwawa-abyssgard-02` の衣装スキルはユーザーが実機で次の2行を再確認した。

```txt
ピュアタイプ2人以上で全員の全パラメータ30%UP
ピュアタイプ2人以上で全員のスコアサポート25%
```

両効果とも同じ条件付き。以前のデータには2行目だけを無条件と解釈した構造化があり、`cards.json` 本体と `cardCorrections.ts` の両方を訂正し、テストで固定した。「読点後に条件が再掲されなければ無条件」という一般ルールは廃止し、複合文はカードごとに実機原文を確認する。

## 2026-09-12 / 13 低開花値の確定（抽出マスターと実機再確認）

低開花で `estimated-from-max`（最大値 ÷1.1）だった 8 枚のスキル値を、2026-09-12 に外部で確認された抽出マスター `HolodoriDB/holodori-db-jpn-diff`（commit `f086e9093b07eaa47a102da307e7bfa58c3a9df6`。`LangCard_Jpn.json` と `LangGeneratedLive{Active,Passive,Special}SkillLevel_Jpn.json`）の level 1 文言から `bloomVariants` に転記し、2026-09-13 に恒常 0凸 5 枚の Active をユーザーがカード詳細画面で再確認した。**そらとぼたんは master level 1 と実機 0凸が食い違い、アキ / スバル / フレアは一致した。** 現在の 0凸 Active 5 件は実機観測（`observed-text`、raw は報告文の表記のまま）で、Passive / SP の 4 件は抽出マスター由来（`extracted-master-text`。装飾タグは除去、文言・条件・数値は不変）のまま。

| カード                | 開花段階 | スキル  | 現在の variant（出所）                                                               | master level 1               | 最大側レコード（= master level 2） | 旧推定（廃止） |
| :-------------------- | :------- | :------ | :----------------------------------------------------------------------------------- | :--------------------------- | :--------------------------------- | :------------- |
| `tokino-sora-01`      | 0凸      | Active  | 24秒ごとに中確率で10秒間スコアが100%UP（実機 2026-09-13）                            | 85（**実機と不一致**）       | 100                                | 90.9           |
| `aki-rosenthal-01`    | 0凸      | Active  | 21秒ごとに中確率で8秒間スコアが50%UP、ライフ600以上でスコアが95%UP（実機）           | 50 / 95（一致）              | 55 / 115                           | 50 / 115       |
| `oozora-subaru-01`    | 0凸      | Active  | 34秒ごとに高確率で12秒間スコアが95%UP（実機）                                        | 95（一致）                   | 115                                | 104.5          |
| `shiranui-flare-01`   | 0凸      | Active  | 26秒ごとに高確率で9秒間スコアが50%UP、40コンボ以上でスコアが100%UP（実機）           | 50 / 100（一致）             | 60 / 120                           | 54.5 / 120     |
| `shishiro-botan-01`   | 0凸      | Active  | 27秒ごとに高確率で9秒間スコアが60%UP、ハッピータイプ2人以上でスコアが125%UP（実機）  | 50 / 105（**実機と不一致**） | 60 / 125                           | 54.5 / 125     |
| `houshou-marine-01`   | 0〜3凸   | Passive | 3期生が2人以上で3期生2人のスコアサポート効果9%（抽出マスター。実機原文でも確認済み） | 9                            | 12                                 | 10.9           |
| `inugami-korone-01`   | 0〜3凸   | Passive | ハッピータイプ2人のスコアサポート効果8%（抽出マスター）                              | 8                            | 11                                 | 10             |
| `shirakami-fubuki-01` | 0〜3凸   | Passive | 1期生が2人以上で1期生2人のパフォーマンスが34%UP（抽出マスター）                      | 34                           | 45                                 | 40.9           |
| `shirakami-fubuki-01` | 0〜2凸   | SP      | 14秒間スコアサポート効果95%（抽出マスター）                                          | 95                           | 115                                | 104.5          |

- **master のスキル level 番号と画面の凸段階をカード共通で一律対応させない。** 2026-09-12 は `LiveActiveSkillLevel level=1 / 2` と `CardPotential upgradeCount=1 → ACTIVE_SKILL_LEVEL_UP 2` から「0凸 = level 1、1凸以降 = level 2」と対応付けたが、同じ★5・0凸でも そら / ぼたん は level 2 側、アキ / スバル / フレア は level 1 側の値が表示された。これを「そら / ぼたんは特殊」「0凸は基本 level 2」等の新しい一般則に置き換えない。必要なのは、カードごとの実機 variant を最優先し、master の level 番号だけから未観測の凸値を確定扱いしない、というルール。master の値そのものは実機値へ書き換えない（`bloomEvidence.ts` の note に不一致を残す）。
- Passive / SP の 4 件（マリン / ころね / フブキ）はこの発見を理由に一括変更しない。それぞれ別の証拠（マリン 9% は実機原文でも確認済み）を持ち、スキル種別・カード別に一律の対応を仮定しない。
- 旧推定は、条件つきアクティブの条件側の値を割らないなど、比率としても一貫していなかった。推定経路を再生成しない（`src/data/bloomMasterVariants.test.ts`）。
- ユーザー所持は そら / アキ / スバル / フレア / ぼたん 0凸、マリン 1凸、ころね 3凸、フブキ 1凸（[repro/20260912-account-snapshot.md](./repro/20260912-account-snapshot.md)）。
- 影響: 恒常マリン 1凸 9% で 2026-09-08 の表示スコア Golden 9.7〜9.12（恒常ぺこら 1凸と 3期生 2 人が成立）のパッシブ欄のモデル値が 0.2 ずつ下がり、実機との不足が最大 1.6 → 1.8（9.10）に広がった。Golden は変えず、モデルの既知の近似として `displayScore.test.ts` の上限を入力訂正の理由つきで更新した。K5 / K6 のアクティブ欄は、実機 0凸値で production の 200 秒モデルが 63.3 / 73.7 を再現する（旧推定入力 67.9、master level 1 入力 59.6 はどちらも入力誤り。[display-score.md](./display-score.md)）。
- 残る `estimated-from-max`: 恒常そら / アキ / スバル / フレア / ぼたん 0凸の Passive / SP、恒常みこ 0凸の 4 スキルなど。解析コーパスの全スロットの provenance は `src/engine/displayScoreCategoryCorpus.audit.test.ts` で一覧・固定している。

## 事故防止

カード仕様を回答・実験設計へ使うときは、最低でも `cardId / holomenId / role / bloom / provenance` を並べて確認する。検索結果に隣接して表示された別カードのスキルを帰属しない。
