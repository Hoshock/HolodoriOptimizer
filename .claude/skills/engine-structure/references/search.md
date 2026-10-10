# 探索・評価器・Worker

編成の探索(`optimize.ts`)と、最適化の各段が編成を繰り返し測る評価器、Web Worker への分担の約束。どれも「何本で計算しても、何をキャッシュしても、1 本で素直に計算したのと同じ結果」を守るためのもの。

## 依頼の解決と評価器

- 依頼の解決と探索は 1 本にする。カード ID・マス ID から開花・ボードを解決して `optimize` を呼ぶまでは、`request.ts` の `prepareRunSearch` だけが持つ(`runOptimize` と、分担する各 Worker がここを通る)。Web Worker(`worker.ts` / `searchWorkerHandler.ts`)はメッセージの受け渡しに専念する。6 枠すべて決まっている編成(お気に入りの再評価)は組合せが 1 通りなので、同じ関数を UI スレッドから同期で呼ぶ。
- 最適化の各段が編成を繰り返し測る評価は、`request.ts` の `createTeamScorer` 1 つにする(ADR-018)。評価そのものは `optimize.ts` の `scoreTeam`(探索の正確な評価と同じもの)。
- 組み直しプラン 1 回で数千回測るので、値を変えずに計算を省く。
  - 全ホロメンにまたがる量(緑・黄)は、鍵(依頼の順のホロメン・その色のマス・配置の中身)が前と同じなら作り直さない。変わったときは `runOptimize` と同じ関数を同じ並びで呼ぶ。赤はリーダーのホロメンの分だけ作る。
  - カードの解決と評価の結果は、入力が同じなら使い回す。カードの数値表現(`compileMember` / `compileDisplayMember`)はカードごとに覚える(カードは作ったあと書き換えない)。
  - 配置の器はコネクトの最適化がその場で書き換えるので、同じかどうかは器ではなく中身で見る(盤面の `HolomenBoards` は readonly なので、器が同じなら中身も同じ)。
  - 覚えた値は評価器ごと捨てる(組み直しプラン 1 回、「組み直すと」の 1 編成ごと)。
  - 覚えた値を使っても 6 枠固定の `runOptimize` と 1 点も違わないことを `teamScorer.test.ts` で固定する。

## shortlist と厳密探索

- 探索は上限値での shortlist(近似)なので、小規模で真の上位と突き合わせられる厳密探索(`exactSearch.ts`)と比較テストを同時に保つ(ADR-005)。
- shortlist の上限値には、同時候補の正規化 `max(1, Σp)` を入れる。正規化を無視した線形和は、青を開けたアカウントで 1.3 倍近く緩み、おまかせの探索が固定メンバーの探索より低い結果を返した。上限を変えたら、`shortlistSize` を絞った `optimizeShortlist.test.ts` で実データの厳密探索と突き合わせる。

## Worker の分担と同点の決め方

- 探索は何本の Worker に分けても 1 本と同じ結果にする(ADR-018)。分担は、組合せの 1 枚目のプール内の添字の余り(`SearchPartition`)で決める。分担ごとに上限値の上位 `shortlistSize` 件を集め、全体の上位はそれらの和から選ぶ(`selectShortlist`)。
- 同点の決め方を、見つけた順に頼らない。
  - shortlist の境目と正確に評価する順: 上限値の高い順、同じなら番号(組合せの辞書順の番号 × クラス数 + クラス)の小さい順。
  - 結果の並び: `compareRanked`(順位づけの値 → 上限値 → 番号 → クラスの中のリーダーの順)。
  - 足切りは「最下位未満なら捨てる」で、同じ上限値はヒープの比較(番号)で決める。
- 手順(数える → 全体の上位を選ぶ → 分担ごとに正確に評価してまとめる → 要れば 2 パス目)は `optimize.ts` の `searchInProcess` と `useOptimizer` の 2 か所にある。片方を変えたらもう片方も変え、`searchPartition.test.ts` / `useOptimizer.test.ts` で 1 本の結果と突き合わせる。
- 葉ごとに全リーダーグループをまとめた上限 1 つで先に足切りする案は、まとめた上限が緩くて速くならなかったので入れていない。

## おまかせの候補(ADR-022)

- おまかせの候補は ★5 だけ。`prepareRunSearch` が、固定していない ★4(`star4Pool.ts` の `autoExcludedStar4Ids`)をリーダーとメンバーの両方の除外に足す。「組み直すと」の候補プール(`rankingPool`)と仮想ガチャの ★5 プールは `star5Cards` を使う。
- 例外はリーダーのおまかせ。次の ★4 はリーダーの候補に残し、メンバーの除外にだけ足す(`rankingPool` も同じ)。
  - ホロメンで指定したリーダー(`leaderCandidateIds`。おかゆモードも)の、そのホロメンの ★4
  - ★5 を 1 枚も使えない(`excludedCardIds` で全部外れている)ホロメンの ★4(`star4LeaderFallbackIds`)
- リーダーの指定・メンバーの固定に置いた ★4 は、そのまま解決して ★5 と同じ経路で評価する(`star4Pool.test.ts`)。ティア表の仮想アカウントには ★4 も除外して渡す。

## ティア表(ADR-024)

- ティア表の評価は探索そのもので、独自の点数式を足さない(`tier.ts`)。全カード前提(`tierBaseRequest`)で評価する。
- 段は仮想アカウント法の採用率で決める。★5 から所持 20〜50 枚のアカウントを均衡配置で 3,034 件作り、それぞれで `runOptimize` のおまかせを回して、そのカードを持っていたアカウントのうち最高編成に入った割合を採る。ラウンド数 1,100 は 95% 信頼区間 ±3 pt から決めた(`ACCOUNT_DESIGN`)。「そのカードを固定した最良 ÷ 全体の最良」は参考の観点として残す。
- 全部で 4 コア約 1 時間かかるので、`scripts/tier/build.mjs`(`pnpm tier`。`pnpm tier -- --accounts` は仮想アカウントだけ)で事前計算して `src/data/tierList.json` に置く。`tierFingerprint`(★5 カード・ホロメン・ボードのマス・`TIER_MODEL_VERSION`・`ACCOUNT_DESIGN`)が変わると、`tier.test.ts` が作り直しを求める。
- 評価の式(`displayScore` / `power` / 探索の順位づけ)を変えたら、`TIER_MODEL_VERSION` を上げて `pnpm tier` を回す。
- 説明文の「強み」の順位づけ(`src/ui/tier.ts`)はエンジンの量(`linearRaw`・SP の係数)を読むだけで、評価には使わない。
