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
   - 水着フワワの青: 2026-09-09 の実機報告は発動率 +45% だが、2026-09-12 の構造化データにはフワワの青マスがない。`displayScore.test.ts` の `BLUE_AT_FUWAWA_OBSERVATION`（45 / 0）と `displayScoreExperimental.test.ts` / `displayScoreAttributionExperimental.test.ts`（0 / 0）で食い違うので、カード画面の表示値を再確認する。水着みこの青も 36（09-09）と 42（構造化データ）で同種の衝突。総量モデルの感度（0/0: RMSE 0.09、45/0: 0.20）は裁定に使わない。**水着フブキ 0凸 の青（15.0 / 0）は 2026-09-13 に決着**: アカウントスナップショットの保存値（青 13 マス + 青コネクト `content-3` / 1500‰）を production の `connectFactorMapOf` → `blueBoardEffects` に通すと 15 / 0 が出る（`displayScoreCategoryCorpus.audit.test.ts`）。同じ経路で 9 件すべてが表と一致したので、残るのは 水着フワワ と 水着みこ の**実機側**の食い違いだけ。

## 表示ユニットスコア

3. **スコアサポートのカテゴリ配賦 — 残るのは `W_blue` の式**
   - 決着した分・棄却した候補族は正典（`docs/human/display-score.md`「source 分離型の projective weight」）が持つ。ここには**まだ答えが出ていないこと**だけを置く。
   - **未解明は `W_blue`（青ボード由来の配分の重み）だけ**。枠組み `(C,B,P) = T × W/ΣW` と `H_C` / `H_B` / `H_P` は gauge 非依存の比で支持済みで、完全予測の残差はすべて `W_blue` に帰着する（primary 34 点で 衣装 0.64 / ボード 0.69 / パッシブ 0.18、成功条件 0.2）。`displayScoreProjectiveWeightExperimental.ts`。
   - 棄却が確定しているのは「編成に依存しない member-local」型（`分母 = 正規化なし` の 8 kernel。K1 − K2 と K4 − K3 の要求区間が交わらない — K7 に依存しない）。「編成全体の評価値どうしの差」型は **K3 / K4 が反証**する（最有力の `E_blue(加算) − H_C` が +3.5 / +3.7 過大）。青が 1 人の K7 では同じ候補が要求区間の 0.7% 下まで来るので、K7 はこの族を棄却しない。
   - **2026-09-13 の最初の解析は 水着フブキ の青を マスの表記値 6% で入れた誤りがあり、そこから出した「global difference 型を 1 群として棄却」は撤回した**（正しくは青コネクト 1500‰ 込みの 15%）。
   - 残差が集中するのは「水着フブキ 0凸 を含む行」ではなく「水着フブキ 0凸 がほかの青持ちと同居している 8 点」。青が 1 人の K7 は 0.15 以内で当たる。入力側の疑いは消えた。
   - 表示のパッシブ欄が青ありで静的値の 40〜61% に縮む件は、この枠組みでは `λ = T/ΣW < 1` の帰結として同じ問題に含まれる（独立した謎ではない）。production の gated 型は総量で 0.6〜1.9 不足する**既知の実装ギャップ**として残す。配賦が決まるまで総増分を production へ繋がない。
   - exploratory 行（恒常みこ Lv 約 20）は総量モデルで約 +1.0 の未説明差。Lv・スキル Lv の再確認まで fit に入れない（恒常みこ 0凸の 4 スキルは `estimated-from-max` のまま）。
   - 残差 ≤ 0.2 pt の由来と、青の乗算型が一般仕様かどうかは別課題（K2 のリーダー支援なしボード欄 15.3 は乗算型 15.28 に一致し、production の加算型 18.9 と合わない）。
   - 次の観測は `display-score.md`「次の実機観測（1 つ）」の 1 件（同じ 5 人・同じリーダーのまま青のマスを 1 つだけ開けて発動率 % を 1 段変える前後）。`W_blue` が `R` に線形かどうかを直接測れる。
4. **5カテゴリの内部式**（3 の `W_blue` に還元されないものだけ）
   - Costume / Board / Passive のカテゴリ単位の 0.1% 量子化規則（欄ごとの切り上げ / 四捨五入が未確定。K5 は切り捨て、K6 は切り上げでしか出ない）。
   - production のパッシブ欄の表示換算は **既知の実装ギャップ**: 恒常マリン 1凸 9% の正しい入力で Golden 9.8〜9.11 の不足が 0.7〜1.8 に広がった（`displayScore.test.ts` の上限 1.85。Golden は変えない）。
   - Costume の絶対値・青の発動率 UP / 発動頻度 UP の Board 換算・パッシブ欄の分割規則は、いずれも 3 の projective weight では `H_C` / `W_blue` / `H_P` に対応する。独立の課題として二重に持たず 3 で追う（`display-score.md`「未解明」も同じ形に畳んである）。
5. **SP残差**
   - 発動率UPを含むケースなどのずれを説明する。

## パラメータ・ボード

6. **赤割合効果の丸め単位**
   - 現実装は一部で±1〜2程度ずれる。Goldenを丸め仮説へ合わせない。
7. **コネクト効果**
   - 範囲、重複、割合・‰丸め、黄/赤/緑への適用、5凸時の扱いを実機確認する。
   - **`liveFrequencyOptimizer.ts` はコネクト増幅を入れていない**（`blueBoardEffects(unlocked)` を倍率なしで呼ぶ）。発動頻度マスのおすすめが実効値より低い頻度で出る。ユニットスコア本体（`runOptimize` → `resolveCard` → `applyBlueBoard`）は 4 色ともコネクト込みで、こちらにバグはない（2026-09-13 に全経路を監査）。**既知の未対応**として残すか別 issue で直すかはユーザー判断待ち。直すときは ADR-007 の「発動率は表示側が加算・ライブ側が乗算で意図的に別式」を崩さないこと。
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
