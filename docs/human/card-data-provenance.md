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

## 2026-09-12 棚卸し状態

- 既存の `bloomVariants` は全件 `bloomEvidence.ts` で分類済み。`recorded-variant-unclassified` が1件でも実データに残れば `bloomEvidence.test.ts` が失敗する。
- 0凸variantを1凸Active、3凸SP、4凸Passiveの強化境界後まで誤って持ち越す旧 `variantAt()` 挙動は修正済み。強化境界のテストを追加した。
- `cardAtBloomWithProvenance()` は、最大レコードそのもの・確認済みvariant・再構成観測・最大値からの推定を区別して返す。
- 一方、トップレベル `cards.json` 各レコードが歴史的に「初期公開データ転記 / 実機入力 / 後日訂正」のどれに由来したかは、古い元資料が残っていないものもある。根拠を追えないものを推測で `observed` に昇格しない。ここだけは継続棚卸し対象。

## 2026-09-12の訂正

水着フワワ `fuwawa-abyssgard-02` の衣装スキルはユーザーが実機で次の2行を再確認した。

```txt
ピュアタイプ2人以上で全員の全パラメータ30%UP
ピュアタイプ2人以上で全員のスコアサポート25%
```

両効果とも同じ条件付き。以前のデータには2行目だけを無条件と解釈した構造化があり、`cards.json` 本体と `cardCorrections.ts` の両方を訂正し、テストで固定した。「読点後に条件が再掲されなければ無条件」という一般ルールは廃止し、複合文はカードごとに実機原文を確認する。

## 2026-09-12 抽出マスターによる低開花値の確定

低開花で `estimated-from-max`（最大値 ÷1.1）だった 8 枚のスキル値を、外部で確認された抽出マスター `HolodoriDB/holodori-db-jpn-diff`（commit `f086e9093b07eaa47a102da307e7bfa58c3a9df6`。`LangCard_Jpn.json` と `LangGeneratedLive{Active,Passive,Special}SkillLevel_Jpn.json`）の Lv1 文言から `bloomVariants` に転記した。これは**抽出マスター由来（外部解析）であり実機観測ではない**。`bloomEvidence.ts` では `extracted-master-text`、解決時は `extracted-master-variant` になる。装飾タグ（`[highlight]` / `[attribute=...]`）は除去し、追加条件が別文のものは DB 規約どおり括弧で連結した。文言・条件・数値は変えていない。

| カード                | 開花段階 | スキル  | Lv1（0凸〜強化前）                                        | Lv2（最大側レコード。マスターと一致を確認） | 旧推定（廃止） |
| :-------------------- | :------- | :------ | :-------------------------------------------------------- | :------------------------------------------ | :------------- |
| `tokino-sora-01`      | 0凸      | Active  | 24秒毎に中確率で10秒間スコアが85%UP                       | 100%                                        | 90.9           |
| `aki-rosenthal-01`    | 0凸      | Active  | 21秒毎に中確率で8秒間スコアが50%UP、ライフ600以上で95%    | 55% / 115%                                  | 50 / 115       |
| `oozora-subaru-01`    | 0凸      | Active  | 34秒毎に高確率で12秒間スコアが95%UP                       | 115%                                        | 104.5          |
| `shiranui-flare-01`   | 0凸      | Active  | 26秒毎に高確率で9秒間スコアが50%UP、40コンボ以上で100%    | 60% / 120%                                  | 54.5 / 120     |
| `shishiro-botan-01`   | 0凸      | Active  | 27秒毎に高確率で9秒間スコアが50%UP、ハッピー2人以上で105% | 60% / 125%                                  | 54.5 / 125     |
| `houshou-marine-01`   | 0〜3凸   | Passive | 3期生が2人以上で3期生2人のスコアサポート効果9%            | 12%                                         | 10.9           |
| `inugami-korone-01`   | 0〜3凸   | Passive | ハッピータイプ2人のスコアサポート効果8%                   | 11%                                         | 10             |
| `shirakami-fubuki-01` | 0〜3凸   | Passive | 1期生が2人以上で1期生2人のパフォーマンスが34%UP           | 45%                                         | 40.9           |
| `shirakami-fubuki-01` | 0〜2凸   | SP      | 14秒間スコアサポート効果95%                               | 115%                                        | 104.5          |

- 旧推定は、条件つきアクティブの条件側の値を割らないなど、比率としても一貫していなかった。推定経路を再生成しない（`src/data/bloomMasterVariants.test.ts`）。
- これらのカードの Lv2 は 1凸（Active）/ 3凸（SP）/ 4凸（Passive）以降で、既存の `BLOOM_UPGRADE_STAGE` と一致した。全カードの一般則としてこれ以上広げない。
- ユーザー所持は そら / アキ / スバル / フレア / ぼたん 0凸、マリン 1凸、ころね 3凸、フブキ 1凸（[repro/20260912-account-snapshot.md](./repro/20260912-account-snapshot.md)）で、いずれも Lv1 側が解析入力になる。
- 影響: 2026-09-08 の表示スコア Golden 9.7〜9.12（恒常マリン 1凸 + 恒常ぺこら 1凸で 3期生 2 人が成立）のパッシブ欄のモデル値が 0.2 ずつ下がり、実機との不足が最大 1.6 → 1.8（9.10）に広がった。Golden は変えず、モデルの既知の近似として `displayScore.test.ts` の上限を入力訂正の理由つきで更新した。K5 clean control の評価器は 67.9 → 59.6 になり、実機 63.3 を逆側に外す（[display-score.md](./display-score.md)）。
- 残る `estimated-from-max`: 恒常そら / アキ / スバル / フレア / ぼたん 0凸の Passive / SP、恒常みこ 0凸の 4 スキルなど。解析コーパスの全スロットの provenance は `src/engine/displayScoreCategoryCorpus.audit.test.ts` で一覧・固定している。

## 事故防止

カード仕様を回答・実験設計へ使うときは、最低でも `cardId / holomenId / role / bloom / provenance` を並べて確認する。検索結果に隣接して表示された別カードのスキルを帰属しない。
