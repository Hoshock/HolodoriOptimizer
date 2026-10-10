# プラットフォームの落とし穴

iOS Safari と Vue の挙動のうち、画面の作り方に効くもの。iOS Safari の多くは Linux の Chromium(playwright-cli)では再現しないので、実機の見え方を playwright-cli の結果から断定しない。

## iOS Safari の表示

- 電話番号の誤検出: iOS Safari は数字列を電話番号と誤検出して青いリンクにするので、`index.html` に `<meta name="format-detection" content="telephone=no">` を置く。保険として、`src/style.css` の `a[href^="tel:"], a[x-apple-data-detectors]` でリンク化された数字の見た目も打ち消す。
- `<button>` の既定の文字色: iOS の `<button>` の既定の文字色はシステムの青で、Linux の Chromium では黒く描かれる。`src/style.css` で `button { color: inherit }` を全体に当ててある。`<button>` を文字の器に使うときは、色を明示するか継承に任せ、既定色に頼らない(例: 結果一覧のスコアの数字が iPhone の Chrome で青くなった原因はこれで、電話番号の検出ではなかった)。
- 文字サイズの自動調整(text inflation): `html` に `text-size-adjust: 100%` を置かないと勝手に効く。指定した px が無視され(12px の `.card-name` が 14px の `.member-name` より大きく描かれる)、`text-overflow: ellipsis` が効かなくなる。レイアウトの再構成(`useModalChrome` の body `position: fixed` の付け外しなど)をまたぐと出たり消えたりする。`src/style.css` の `html` で全体に当ててある。
- `<button>` の中に `position: absolute` + % の幅で重ねた要素は、ボタンの左右の余白を除いた幅を基準に計算されることがある(さがすのゲージが件数の割合より短く、満ちても右端が残った)。ボタンの中の割合の表示はボタン自身の背景(`linear-gradient` + CSS 変数)で描き、文字は絶対配置にせず grid の同じ枡に重ねる。
- transform で送る部品(`PageCarousel`)は、全ページを 1 枚の帯にせず、現在ページの前後だけを個別に transform し、`will-change: transform` で常時レイヤーに載せる。横 35,000px を超える帯や、送りの開始・終了でのレイヤーの作り直しは、iOS で一瞬白く抜ける。

## タッチと入力

- iOS Safari は、要素かその親にタッチ / pointer のイベントリスナーがないと `:active` を適用しない。Linux の Chromium ではマウスで再現する。リスナーを足すと、それまで見えなかった `:active` の効果が実機で急に出る(カルーセルのリスナーで、結果一覧の行の押下効果が見えるようになった)。押下の効果を付けない規則は SKILL.md の「文言と情報量」。
- モバイルでキーボードを出させる入力には、代替のワンボタンを用意する(貼り付けは `navigator.clipboard.readText()` の「ペースト」ボタン)。数値の入力は `<input>` を置かず、自前のダイアログにする(`NumberPad.vue` / `StepperDialog.vue`。`references/parts.md`)。
- `readText()` は、環境によって解決も失敗もしない(headless の Chromium で確認。iOS Safari は純正の確認ダイアログを出すので、待つのは正常)。押しても無反応に見える状態を避けるため、数秒後に手貼りの案内を出す保険を入れる。書き込み(`writeText`)は素直に成功するので、結果はボタンのラベルで示す。
- 連打・トグルの操作にブラウザ既定のジェスチャ(ダブルタップズーム・文字選択)が割り込むのは、不具合として扱う。`button, [role="button"]` には `touch-action: manipulation`(`src/style.css`、全体に適用済み)、連打する記号には `user-select: none`。
- 文字を打てる入力欄(`<input>` / `<textarea>`)の `font-size` が 16px 未満だと、iOS Safari はフォーカスで勝手に拡大し、閉じても戻らない。打たせる欄はすべて 16px 以上にする(開発用の `BloomTextSheet` も 16px)。`maximum-scale` / `user-scalable=no` で塞がない(アクセシビリティ上よくないうえ、iOS は無視することがある)。
- `touch-action` でピンチ(拡大の戻し)を塞がない。`pan-y` や `none` だけを指定すると、その範囲でピンチが効かず、一度拡大されると戻せなくなる。横送りを拾う範囲は `pan-y pinch-zoom`(`PageCarousel` の `.swipe-area`)、背景のスクロールだけ止めたい中央ダイアログのオーバーレイは `pinch-zoom`。例外は自前で 2 本指を扱う画面(`BoardSheet` のボードのピンチ)。
- 自前のジェスチャも、2 本目の指が触れたら捨ててブラウザへ譲る。2 本目の `pointerdown` で横ドラッグが始まり直すと、ピンチが横送りと競合して縮小できない(`PageCarousel` の `pointers`。`PageCarousel.test.ts` で固定)。
- `touch-action` で縦パンを許した範囲は、JS で横と決めてもブラウザが縦へ動かす。横のジェスチャと決めたら、そのあいだの `touchmove` を `preventDefault` して縦スクロールを止める(`addEventListener("touchmove", ..., { passive: false })`。既定の passive では効かない)。向きは小さめの距離(6px)で 1 度だけ決めて途中で変えず、縦と決めたジェスチャでは止めない。

## スクロールロック(`useModalChrome`)

- モーダルの背景スクロールロック(`useModalChrome.ts`。body を `position: fixed`)中に検索欄でキーボードが出ると、iOS Safari がレイアウトビューポートを押し上げ、閉じた後にページ最下部へ空白を残すことがある。html/body の overflow hidden・入力欄の focusout でスクロール 0・解除時に blur してから復元、の対策を入れてある(実機では未検証)。
- 背景が見えるダイアログでスクロールロックをかけると、文書全体の再レイアウトで背後のカルーセル(常時レイヤー)が作り直され、一瞬ちらつく。この種のダイアログは `lockScroll: false` で開き、オーバーレイの `touch-action` + `overscroll-behavior: contain` で背景のスクロールを止める。

## Vue

- `boolean` の prop は、渡さないと `false` になる(Vue のブーリアンキャスト)。「省略時は有効」にしたい真偽値は否定形の名前にする(`PageCarousel` に `swipe?: boolean` で作ったら、全カルーセルのスワイプが止まった)。
- 子の部品のルート要素には、親の scoped なスタイルも当たる(Vue は子のルートに親のスコープを付ける)。ほかのダイアログ・シートの中に重ねる部品のルートに `.overlay` のような親と同じクラス名を付けると、親の余白などが効く(`InfoDialog` を絞り込みのダイアログの上に重ねたら、左右の余白が親の 24px になった)。ルートのクラスは部品固有の名前にする(`.info-overlay`)。
