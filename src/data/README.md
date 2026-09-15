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
- 抽出マスター（外部解析）由来: `extracted-master-variant`。実機目視ではない。`bloomEvidence.ts` に repo / commit / ファイル / マスター側カードIDを残す（入っていた 4 件は 2026-09-15 の実機確認で一致したので `observed-text` へ上げてあり、いまこの出所を返すデータはない）
- 2凸+10%からの逆算: `derived-from-max-confirmed-ratio`
- その段階の記録がない: `unknown`。文言は「未確認」と出し、計算には最近傍の凸（最大側レコード）の内容をそのまま流用する（2026-09-15。旧「最大値から÷1.1」の推定は廃止）

推定値をゲーム内実値として文書化しない。

## 更新ルール

- ソースにない値を推測でDBへ埋めない。試算上の推定は解決層で行いprovenanceを付ける。
- **追加条件（ライフ・コンボ・タイプ・所属）は読点「、」でつなぐ。括弧で囲まない**（2026-09-15 ユーザー指示。例:「25秒毎に中確率で10秒間スコアが55%UP、ライフ600以上でスコアが110%UP」）。
- 表記は 2026-09-15 の実機確認にそろえる: 「スキル発動率**が**50%UP」／所属は「3期生**が**2人以上で」（タイプは「ハッピータイプ2人以上で」と「が」を取らない）／周期は「26秒**毎に**」。条件つき衣装スキルのスコアサポートは原文が条件を再掲する。`src/data/cardText.test.ts` が固定している。
- **区切りは読点「、」だけ。** 括弧・改行・中黒・スラッシュ・句点を使わない（唯一の半角空白は「AREA15 2人の」）。**raw の区切りと `structured` はずれてはいけない** — 計算は `structured` を見るので、ずれると画面の文言と計算が食い違う（SP / アクティブの追加条件は raw 末尾に読点でつながり、衣装 / パッシブの読点の数は効果の数 − 1）。
- `raw` をゲーム内原文として追加するときは実際の表示文を確認する。数値だけ確認した場合は再構成文と明示する。抽出マスターから転記した場合は `extracted-master-text` とし、実機観測と表記しない。装飾タグは除去してよいが文言・条件・数値は変えない。
- 抽出マスターのスキル level 番号と画面の凸段階をカード共通で一律対応させない（2026-09-13: 恒常そら / ぼたんの 0凸 Active は level 2 側の値）。実機 variant があれば優先し、level 番号だけから未観測の凸値を確定扱いしない。
- 複合スキルの条件を句読点だけから一般化しない。カードごとに原文を確認する。
- 新しい実機訂正は `cardCorrections.ts` とテストに追加し、可能なら取り込み元も同期する。
- 公開済みcard/holomen IDは変更しない。
- songsで未確認なcomboはnull。曲長等から推測しない。
- 更新後は `meta.json` のasOfを更新し、`pnpm check && pnpm test && pnpm build`。

## アカウントスナップショット

`accountSnapshot.fixture.ts` は `docs/human/repro/*-account-snapshot.md` の raw export を読む**唯一の口**。解放マス + コネクトの配置から production の `connectFactorMapOf` → `*BoardEffects` を通して実効値を出す。

- マスの表記値（bare）を実効値として扱わない。解析 fixture に入れてよいのは実効のほう。
- 日付ごとに別ファイル。過去の観測を現在の snapshot で上書きしない。
- 一致は `src/engine/accountSnapshot.audit.test.ts` が固定する。

## その他

- アクティブ追加条件は `conditionalScoreUp`、SP発動率UPは `skillRateUp` に構造化する。
- イベント・曲・所属は既存IDを参照し、IDを発明しない。
- ★5探索プールと★3/★4仮想ガチャデータを混ぜない。
