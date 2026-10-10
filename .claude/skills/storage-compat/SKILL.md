---
name: storage-compat
description: |
  What: ブラウザ(localStorage / sessionStorage)に保存するデータの後方互換の規則と、保存キーごとの形式・既定値・移行・廃止の約束を定める。
  Use when: `src/storage/` や保存を読み書きする `src/composables/` のコードを書く・変えるとき。保存キーを足す・形式を変える・項目を廃止するとき。「データの出力」の形式や、カード・ホロメンの ID(`src/data/*.json`)を足す・直すとき。
version: 2026-10-10-01
---

# Storage-Compat

ユーザーがブラウザに登録したデータは、機能追加・データ更新で読めなくならないようにする。登録は手入力の積み重ねで、消えると戻せないため。このスキルは保存形式の変え方の原則と、キーごとの約束を定める。

## 原則

- 保存形式を変えるときは、過去の全形式を読む移行を書き、旧形式の読み込みをテストで固定する。書き出しは常に最新形式。例: 所持カードは `src/storage/owned.ts` + `owned.test.ts`(v0 = ID の文字列配列 / v1 = `{id, bloom}` の配列 / v2 = 版番号つき封筒)。
- いまのデータに存在しない ID を、読み込み時に捨てない。配列に残したまま書き戻し、UI で使うときに既知の ID だけを選ぶ。データ側のミスで登録が永久に消えないようにするため。
- 公開済みのカード・ホロメン ID は改名・削除しない。全 ID は `src/data/published-ids.json` に凍結してあり、`dataset.test.ts` が「消えた ID」と「追記漏れ」を検知する。新しく足すときはここにも追記する。表記を直したい ID があっても改名せず、必要なら保存層で別名に対応する。
- 保存するのは入力だけで、そこから計算できる数値は保存しない。数値は登録した時点ではなく、表示した時点の最新の情報で計算する。例: お気に入りユニットはカード ID の組み合わせだけを持ち、開いたときに現在の開花・ボード・メモリー・強化ボーナス・曲で `runOptimize` して評価する。
- 保存キーは `holodori-optimizer:` 名前空間に置く。新しいキーを足すときも上の原則を満たす読み込みにする。真偽値・列挙だけの設定キーは、壊れていれば既定値に戻す読み込みで足りる。
- 後から足した任意の項目では、封筒の版を上げない。項目のない保存は、その項目なしとして読める形にする(`selection` の `poolMode` / 選択リスト、`units` の `name`、「データの出力」の `resources` / `rank` / `unlockedConnects` など)。外した任意の項目(「データの出力」の `connectInventory`)でも版は上げない。
- ゲーム側で決まっている値をユーザー入力からデータへ移したときは、保存済みの旧フィールドを読み飛ばすだけにし、版は上げない。例: `blue-boards` の `mirrored` は `holomen.json` の `board` へ移し、読み込みでは無視して書き出しに含めない(`boards.test.ts`)。
- UI の入口を外しても、保存済みの状態は消さない(除外するカードは、入口を一度外しても状態と探索への反映を保った)。
- 設定キーの既定値を変えるときは、保存済みの値を尊重する。既定値は「ほかの保存済みデータから導ける値」にしてよい。定数を切り替えると、まだ選んでいない既存ユーザーの見え方まで変わるため。導いた値は保存せず、ユーザーが自分で切り替えたときだけ書く。

## キーごとの約束

- さがすのオプション: `search-all` / `search-options`(`src/storage/searchOptions.ts`・`searchAll.ts`)と、除外・選択の `selection`(`src/storage/selection.ts`、封筒 v1)の 3 キー。常に保存する(保存を切り替えるトグルは廃止した)。枠の選択(リーダー・固定メンバー・曲)は保存しない。以前に保存されていた `selection` の `leaderId` / `memberIds` / `songId` は読み飛ばす(`selection.test.ts`)。
  - `search-all` は「未保存」と「false」を区別して読む(`parseSearchAll` は未保存・壊れた値を `null` にする)。既定は所持カードの枚数から決める(`resolveSearchAll(stored, ownedCount)`)。選んでいれば保存値、選んでいなければ所持カードが 0 枚のときだけ全カード。初めて来た人は所持カードから探しても 0 件にしかならず、既存ユーザーの見え方は変えないため。
  - `search-options` の旧項目 `costume` / `passives`(しぼりこみ)・`connect`(コネクト)・`boardColors`(色ごとのボード)と旧キー `skill-filters` は、未知の項目と同じく読み飛ばす。UI は「育成の前提」の 3 択(`src/ui/searchPremise.ts`)だが、保存の形は変えていない。`search-all` が true なら全カード、false なら `search-options` のボードの値で「いまの育成で / 育てきったら」を読み(開花の値は見ない)、書くときは board と bloom を同じ値にする(`searchPremise.test.ts`)。
  - `selection` は、役割別の除外リスト、「除外 / 選択」の種類 `poolMode`(`"select"` と明示されたときだけ選択)、役割別の選択リスト。壊れた値・重複は落とすが、いまのカードデータにない ID は落とさず持ち回る。所持カードから探す前提では、所持外のカードを枠から外す(`pool` の watch が `immediate`)。
  - ピッカーの絞り込み・並び順は保存しない(閉じても保ち、再読み込みでリセット)。
- 所持カード `owned`(上の v0〜v2)。★4 の ID(`<holomenId>-star4-01`)も同じ配列に入る。持っているコネクトはここから導く。
- お気に入りユニット `units`(`src/storage/units.ts`、封筒)。
  - 番号は 1〜10。範囲外・メンバー数が 5 でない項目は落とし、いまのカードデータにない ID は残して、UI 側で解決できるものだけ出す。
  - 番号は 1 から連続させる。`compactUnits` が読み込み・登録・解除・書き出しのすべてで詰め直し、歯抜けの過去データ(1, 3, 7)は読み込んだ時点で 1, 2, 3 になる(編成も名前もそのまま移り、登録は消えない)。登録できる番号は「登録済み」と「先頭の空き 1 つ」だけ(`canUseSlot`)。
  - 所持カードの登録と `units` は独立で、あとで所持から外しても登録は消さない(そのカードは 0凸 として計算し直す)。
  - 名前 `name`(最大 10 文字)は任意の項目で、付けていなければ書き出しにも入れない(表示は `unitDisplayName` が「ユニット{番号}」へ落とす)。上書き登録すると名前は残さない。
- ボード: 色ごとに別キーで同じ封筒(`red-boards` / `blue-boards` / `yellow-boards` / `green-boards`、`src/storage/boards.ts` の `BoardColor`)。既知のマス ID の絞り込みも色ごと(R-xxx / B-xxx / Y-xxx / G-xxx)。
- コネクトの配置 `connect-placements`(`src/storage/connect.ts`、封筒 v3。ホロメン ID → アンカー(center / leader / card / content)→ `{ extent, permil }`)。
  - v2 は、範囲の形を青 / 黄では青が右のホロメン、赤ではライフ系が右のホロメンで dx を反転して当てていた。読み込み時に、そのアンカーだけ左右反転した形へ写す(`unmirrorPlacements`。17 種すべてに幾何で相手がある)。
  - v1(値がカード ID)は形が分からないので読み飛ばす。キーがない旧データは「どこにも置いていない」。
  - 知らないアンカー・形・0 以下の ‰ は読み飛ばし、データにないホロメンは捨てない(`connect.test.ts`)。
- コネクトマス自体の解放状態 `board-connects`(`src/storage/boardConnects.ts`、封筒 v1。`{ holomenId, unlocked: ("leader" | "card" | "content")[] }`。中心は常に解放済みなので持たない)。
  - 配置とは別の状態で、「未解放なのに配置あり」は保存しない(`useBoards.ts` の `setHolomenBoards` が解放の外れた配置を外し、`placeConnect` は未解放への配置を拒否する)。
  - 旧データには解放状態がないので、キーがない(または壊れている)ときだけ、初回の読み込みで推定してすぐ明示保存する(`inferBoardConnects`。A: コネクトを通らないと届かない解放済みマスがある → 解放済み / B: 配置がある → 解放済み / C: それ以外 → 未解放)。以後は推定しない(`boardConnects.test.ts`)。
- ホロメンランク `holomen-ranks`(`src/storage/holomenRank.ts`、封筒 v1。`{ holomenId, rank }` の配列)。未登録は配列に載せないことで表し、0 を未登録の代わりにしない。キーがない旧データは「全員未登録 = ボードPt の制限なし」。1〜50 の整数でない行は読み飛ばし、データにないホロメンは捨てない。
- 所持しているコネクトは保存しない。所持カード `owned` と開花段階から `src/storage/connectInventory.ts` の `connectInventoryOf` が導く(カード 1 枚 = コネクト 1 枚。％ はカード固有の効果(`src/data/cardConnect.ts`)の 0〜4凸 = Lv1 / 5凸 = Lv2 — ADR-023)。
  - 使うのは、最適化のコネクトの段と、置いている配置との見比べ(アカウントの「コネクト」の使用 / 所持、ボードで置くときの残りと警告)だけ。ボードで置いている `connect-placements` とは別で、探索・お気に入りには効かない。
  - 手入力の旧キー `connect-inventory`(封筒 v1)は廃止した。読まずに起動時に消す(`clearLegacyConnectInventory`)。所持カードから導く値と二重にしないため。
- 余っているボード用リソース `board-resources`(`src/storage/boardResources.ts`、封筒 v1。`{ resources: { red | blue | yellow | green: { cube, core } } }`)。
  - 未登録は `null` = ∞(制限なし)で、0 は「0 個」という別の値。
  - 手動のボード操作はこの値に左右されず、手動の編集でこの値を自動で増減もしない。使うのは最適化(結果の「組み直すと」と組み直しプラン)だけで、推奨を反映するときだけ新しい盤面に合わせて置き換える(`replaceBoardResources`。総量は増減させない)。
  - 整数だけ受け付ける(小数は 0 方向へ切り捨て、±999,999 で止め、数値でない値は未登録)。知らない色・項目は読み飛ばす。
  - 負の値は推奨を反映したときだけ入る(所持リソースを考慮しなかった色の不足と、外せるマスが足りないとき — ADR-016 / ADR-026)。効かないマスで埋められるぶんは推奨の盤面で外す。旧い読み込みは負を 0 に丸めるだけで壊れない。手で入れる値は 0 以上(`setBoardResource`)。
- アカウント共通の補正(メモリー %・メンバー強化ボーナス %)`account-bonus`(`src/storage/account.ts`、封筒)。数値でない・負・NaN は 0 に戻し、未知のフィールドは読み飛ばす。キーがない・壊れているときの既定値は メモリー 3.0% / メンバー強化ボーナス 2.00%。封筒に保存されている値は 0 も含めてそのまま読む。
- データの出力(`ExportSheet.vue`。`holodori-optimizer/account`)は、ホロメンごとの 4 色ボードとコネクト(`rank`・`unlockedConnects` は該当するときだけ)、所持メンバーと開花、イベントメモリー、メンバー強化ボーナス、`resources`(4 色 × `cube` / `core`、未登録は `null`)を 1 つの JSON で出す(`accountExport.test.ts`)。所持メンバーから導ける `connectInventory` は外した。読む側は、無い項目を空・未登録として扱う。
- 仮想ガチャ `gacha`(`useGacha.ts`。ダイヤ・課金額・排出の累計・ピックアップのカード ID)。版番号は持たず、数値でない値・負の値・いまのデータにないカード ID は既定へ戻す。
- 表示の設定 `theme`(`"dark"` / `"light"`、既定はライト。壊れていれば既定)。
- 解説ページから戻る縦位置 `return-scroll`(`src/storage/returnScroll.ts`)。ユーザーが登録したデータではないので、localStorage ではなく sessionStorage に置き、トップページの起動時に 1 度読んで消す。解説ページ本文の「編成シミュレーターを開く」は遷移の前にこのキーを消す(戻すのはヘッダの「←」だけ)。
- 開発用の「開花文言」の入力 `bloom-text`(`useBloomText.ts` + `src/ui/bloomText.ts` の `normalizeBloomTextState`)。入力の途中で再読み込みしても続けられるように保存するだけで、カードデータは書き換えない。過去形式の移行は持たず、知らないスキル・段階の範囲外・文字列でない値は読み飛ばして残りを読む。
- 廃止したキーは読まない。残っていても害はないので書き換えもしない: `keep-options`(オプションの保持のトグル。OFF にしていた人もオプションを保存するようになった)/ `palette`(管理用画面の配色の上書き)/ `copy-tuning`(開発用の「文言・配置」の上書き。既定の文言は `src/ui/siteCopy.ts` の定数)。例外の `connect-inventory` だけは起動時に消す(上の「所持しているコネクト」)。
