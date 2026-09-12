# ゲームデータ

『hololive Dreams』のテキストデータ。画像・音声等の公式アセットは含めない。

## 最重要: cards.jsonは最終的な権威層ではない

`cards.json` は取り込み元レコード。初期カードの多くは公開データ転記で、トップレベルのスキル・statsを最大開花側として扱っているが、全件実機確認済みではない。

ランタイムは `src/data/index.ts` の `cards` / `cardById` を使う。後日実機で確認された訂正は `cardCorrections.ts` を適用する。

途中開花は `cardAtBloomWithProvenance()` を使う。`bloomVariants.raw` にはゲーム内原文そのものと、実機で確認した数値を最大側の文章へ差し替えた再構成文が混在していたため、`bloomEvidence.ts` で分類する。

詳しくは `docs/human/evidence-policy.md` と `docs/human/card-data-provenance.md`。

## 開花値の区分

- 最大開花側レコード: `max-record`。出典転記の場合があり、実機確認済みとは限らない。
- 実機variant: `observed-variant`
- 数値実測・文面再構成: `reconstructed-observation`
- 抽出マスター（外部解析）由来: `extracted-master-variant`。実機目視ではない。`bloomEvidence.ts` に repo / commit / ファイル / マスター側カードIDを残す
- 2凸+10%からの逆算: `derived-from-max-confirmed-ratio`
- 未確認スキルを最大値から÷1.1: `estimated-from-max`

推定値をゲーム内実値として文書化しない。

## 更新ルール

- ソースにない値を推測でDBへ埋めない。試算上の推定は解決層で行いprovenanceを付ける。
- `raw` をゲーム内原文として追加するときは実際の表示文を確認する。数値だけ確認した場合は再構成文と明示する。抽出マスターから転記した場合は `extracted-master-text` とし、実機観測と表記しない。装飾タグは除去してよいが文言・条件・数値は変えない。
- 抽出マスターのスキル level 番号と画面の凸段階をカード共通で一律対応させない（2026-09-13: 恒常そら / ぼたんの 0凸 Active は level 2 側の値）。実機 variant があれば優先し、level 番号だけから未観測の凸値を確定扱いしない。
- 複合スキルの条件を句読点だけから一般化しない。カードごとに原文を確認する。
- 新しい実機訂正は `cardCorrections.ts` とテストに追加し、可能なら取り込み元も同期する。
- 公開済みcard/holomen IDは変更しない。
- songsで不明なcomboはnull。曲長等から推測しない。
- 更新後は `meta.json` のasOfを更新し、`pnpm check && pnpm test && pnpm build`。

## 2026-09-12訂正

水着フワワの衣装は実機再確認で2行とも「ピュアタイプ2人以上」条件付き。旧structuredの「スコアサポート25%だけ無条件」は誤りで、補正層とテストで訂正する。

## その他

- アクティブ追加条件は `conditionalScoreUp`、SP発動率UPは `skillRateUp` に構造化する。
- イベント・曲・所属は既存IDを参照し、IDを発明しない。
- ★5探索プールと★3/★4仮想ガチャデータを混ぜない。
