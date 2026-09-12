# カードデータの provenance

カード値を使う前に [evidence-policy.md](./evidence-policy.md) と併せて読む。

## どのファイルが何か

- `src/data/cards.json`: 取り込み元のカードレコード。トップレベルの `stats` / 4スキルは最大開花側として扱う。初期の多くは公開データ転記で、全件実機確認ではない。
- `src/data/cardCorrections.ts`: 後日、実機で誤りが確認されたレコードへ適用する補正。`src/data/index.ts` がexportする `cards` / `cardById` がランタイム正典。
- `src/data/bloomEvidence.ts`: `bloomVariants` の値・文言が何由来かを分類する。
- `cardAtBloomWithProvenance()`: 指定開花へ解決したカードと、各フィールドの出所を同時に返す。

## provenance の読み方

| source                             | 意味                                                                  |
| :--------------------------------- | :-------------------------------------------------------------------- |
| `max-record`                       | 最大開花側として扱う取り込みレコード。実機確認済みとは限らない        |
| `observed-variant`                 | そのvariantのゲーム内文言を実機情報として記録                         |
| `reconstructed-observation`        | 数値・効果は実機確認したが、raw文は最大側文言を基に再構成             |
| `recorded-variant-unclassified`    | variantはあるが出典分類が未棚卸し。要確認                             |
| `derived-from-max-confirmed-ratio` | 2凸+10%という確認済み規則から最大値を逆算。ただし整数丸め不確実性あり |
| `estimated-from-max`               | スキル×1.1等の仮定で最大値から推定。実測値ではない                    |

## 2026-09-12の訂正

水着フワワ `fuwawa-abyssgard-02` の衣装スキルはユーザーが実機で次の2行を再確認した。

```txt
ピュアタイプ2人以上で全員の全パラメータ30%UP
ピュアタイプ2人以上で全員のスコアサポート25%
```

両効果とも同じ条件付き。以前のデータには2行目だけを無条件と解釈した構造化があり、`cardCorrections.ts` で訂正してテスト固定する。「読点後に条件が再掲されなければ無条件」という一般ルールは廃止し、複合文はカードごとに実機原文を確認する。

## 事故防止

カード仕様を回答・実験設計へ使うときは、最低でも `cardId / holomenId / role / bloom / provenance` を並べて確認する。検索結果に隣接して表示された別カードのスキルを帰属しない。
