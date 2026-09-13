# 保留事項

**現在も未解決のものだけ**を置く。解決履歴はGit履歴へ、観測は `docs/human/repro/`、証拠の扱いは `docs/human/evidence-policy.md` を正典とする。

## 最優先: データ・観測の再監査

1. **トップレベルカードレコードの歴史的出典分類**
   - `cards.json` のトップレベルは最大開花側レコードとして扱う。
   - 既存 `bloomVariants` は `src/data/bloomEvidence.ts` で全件 `observed-text / observed-values-reconstructed-text` 等に分類済みで、未分類variantがあれば `bloomEvidence.test.ts` が失敗する。
   - 最大値から `÷1.1` した未確認スキル値は `estimated-from-max`、2凸+10%から逆算したpre-2凸statsは `derived-from-max-confirmed-ratio`、抽出マスター（外部解析）から転記した途中値は `extracted-master-variant` として `cardAtBloomWithProvenance()` が区別する。
   - 残る課題は、トップレベル各カードレコード自体が「初期公開データ転記 / 実機入力 / 後日訂正」のどれに由来するかを、Git履歴や元資料で追える範囲まで分類すること。追跡不能なものを推測で実機確認済みに昇格しない。
   - 実機訂正は `cardCorrections.ts` とテストで固定し、可能な範囲で取り込み元 `cards.json` も同期する。
2. **2026-09-12表示スコアGoldenの入力条件再確認**
   - 数値はモデル都合で変更しない。
   - 編成順、Lv、開花、青ボード状態などが会話由来のみのケースは `reported` とし、必要な実験に使う前に再確認する。
   - unit score式による算術cross-checkは入力条件の再確認とは別。
   - 水着フワワの青: 2026-09-09 の実機報告は発動率 +45% だが、2026-09-12 の構造化データにはフワワの青マスがない。`displayScore.test.ts` の `BLUE_AT_FUWAWA_OBSERVATION`（45 / 0）と `displayScoreExperimental.test.ts` / `displayScoreAttributionExperimental.test.ts`（0 / 0）で食い違うので、カード画面の表示値を再確認する。水着みこの青も 36（09-09）と 42（構造化データ）で同種の衝突。総量モデルの感度（0/0: RMSE 0.09、45/0: 0.20）は裁定に使わない。**3 の残差が集中する 水着フブキ 0凸 の青（15.0 / 0）も同じ種類の未確認入力**なので、カード画面を見るときはまとめて読む。

## 表示ユニットスコア

3. **スコアサポートのカテゴリ配賦 — 残るのは `W_blue` の式**
   - 決着済みで正典（`docs/human/display-score.md`）へ移した分はここに書かない: 総増分 `支援/100 × E_blue(乗算)`、支援 3 種の加算合成、青なしでは全量衣装欄（K5 / K6）、**非 native カテゴリの共通 scale**（現コーパスで確定扱い）、逐次 marginal / 秒 × 候補 5 ルール / Shapley / 衣装候補族の反証。
   - **未解明は `W_blue`（青ボード由来の配分の重み）だけ**。source 分離型 projective weight `(C,B,P) = T × W/ΣW` で、`H_C` = p0Only リーダー kernel・`H_B` = E_blue(乗算)・`H_P` = 静的 は gauge 非依存の比で支持された（`H_B/H_C` RMSE 0.031、`C/(L·P)` の共通部分が空でない、`B/C` は赤 X に affine）。逆算した `W_blue` は K1 24.43 / K2 19.91 / K3 14.27 / K4 19.18 で、`E_blue(加算) − H_C` は K1 +0.71 / K2 +0.06 に対し K3 +3.51 / K4 +3.68 とずれる。完全予測は primary 32 点で 衣装 0.65 / ボード 0.68 / パッシブ 0.17（成功条件 0.2）。`displayScoreProjectiveWeightExperimental.ts`。
   - **残差は 水着フブキ 0凸 を含む 8 点に集中**し、外すと 3 欄とも 0.21 以下。`W_blue` の式が悪いのか 水着フブキ 0凸 の入力（青 15.0 / 0、`reconstructed-observation` の Active）が悪いのかは未分離。
   - 表示のパッシブ欄が青ありで静的値の 40〜61% に縮む件は、この枠組みでは `λ = T/ΣW < 1` の帰結として同じ問題に含まれる（独立した謎ではない）。production の gated 型は総量で 0.6〜1.9 不足する**既知の実装ギャップ**として残す。配賦が決まるまで総増分を production へ繋がない。
   - exploratory 行（恒常みこ Lv 約 20）は総量モデルで約 +1.0 の未説明差。Lv・スキル Lv の再確認まで fit に入れない（恒常みこ 0凸の 4 スキルは `estimated-from-max` のまま）。
   - 残差 ≤ 0.2 pt の由来と、青の乗算型が一般仕様かどうかは別課題（K2 のリーダー支援なしボード欄 15.3 は乗算型 15.28 に一致し、production の加算型 18.9 と合わない）。
   - 次の観測は `display-score.md`「次の実機観測（1 つ）」の 1 件（クロニー / 恒常みこリーダー × 恒常そら0 / アキ0 / スバル0 / フレア0 / 水着フブキ0）。水着フブキ 0凸 が唯一の青持ちなので、`W_blue` と入力の切り分けを同時に見られる。
4. **5カテゴリの内部式**（3 の `W_blue` に還元されないものだけ）
   - Costume / Board / Passive のカテゴリ単位の 0.1% 量子化規則（欄ごとの切り上げ / 四捨五入が未確定。K5 は切り捨て、K6 は切り上げでしか出ない）。
   - production のパッシブ欄の表示換算は **既知の実装ギャップ**: 恒常マリン 1凸 9% の正しい入力で Golden 9.8〜9.11 の不足が 0.7〜1.8 に広がった（`displayScore.test.ts` の上限 1.85。Golden は変えない）。
   - Costume の絶対値・青の発動率 UP / 発動頻度 UP の Board 換算・パッシブ欄の分割規則は、いずれも 3 の projective weight では `H_C` / `W_blue` / `H_P` に対応する。独立の課題として二重に持たず 3 で追う。
5. **SP残差**
   - 発動率UPを含むケースなどのずれを説明する。

## パラメータ・ボード

6. **赤割合効果の丸め単位**
   - 現実装は一部で±1〜2程度ずれる。Goldenを丸め仮説へ合わせない。
7. **コネクト効果**
   - 範囲、重複、割合・‰丸め、黄/赤/緑への適用、5凸時の扱いを実機確認する。
8. **開花途中の実数値**
   - 未確認カードのvariantを追加し、最大値からの推定依存を減らす。抽出マスター由来の値は `extracted-master-text` として出所を残し、実機目視が取れたら `observed-text` へ昇格する。master の level 番号と凸段階の対応はカード共通ではないので、level 番号だけで未観測の凸値を確定扱いしない。
   - そら / ぼたん 0凸 の実機値と抽出マスター level 1 の不一致は、公開履歴（`LiveActiveSkillLevel.json` の最終変更は 2026-09-07 `fbbb04b...`、9/7 diff に両者の変更なし、低値は effect group 自体にある）から「生成文言だけが古い」では説明できない。9/10 以降の production サーバー側の hotfix / master 差は公開情報からは否定できないままで、そら / ぼたん専用の special rule は作らない（`docs/human/card-data-provenance.md`）。
   - 解析コーパスに残る `estimated-from-max`: 恒常そら / アキ / スバル / フレア / ぼたん 0凸の Passive / SP、恒常みこ 0凸の 4 スキル（`displayScoreCategoryCorpus.audit.test.ts` で列挙。コーパスの評価には効かない）。

## 実ライブ・イベント

9. **イベントスコアボーナスの適用位置**
10. **実ライブスコアエンジン**

## データ・公開

11. **権利ガイドライン原文の人間確認**
12. **初期データの抜き取り実機照合**
13. **仮想ガチャの未確認★3/★4・ダイヤパック**
