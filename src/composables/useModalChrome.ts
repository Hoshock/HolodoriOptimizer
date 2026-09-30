import { onMounted, onUnmounted } from "vue";

/**
 * モーダル共通のふるまい: 背景スクロールロック(iOS Safari 対応で body を
 * position:fixed にして退避/復元)+ Escape キーで閉じる。
 *
 * モーダルの入れ子(例: ガチャ → カードピッカー)に対応するため、開いている
 * モーダルをモジュールレベルのスタックで管理する: ロックは最初の 1 枚が
 * かけ最後の 1 枚が解除し、Escape は最前面のモーダルだけが処理する。
 *
 * 背景が見える小さなダイアログ(確認・番号選び)は `lockScroll: false` で開く。body を
 * position:fixed にすると文書全体が再レイアウトされ、背後のカルーセル(常時レイヤーに
 * 載せている)が作り直されて一瞬ちらつく(2026-09-09 ユーザー報告「お気に入りボタン押すと
 * 後ろの画面がチラつく」)。ロックの代わりに、その手のダイアログはオーバーレイ側で
 * touch-action / overscroll-behavior により背景のスクロールを止める。
 *
 * iOS Safari はロック中に検索欄へフォーカスしてキーボードが出ると、body が
 * fixed でもレイアウトビューポートを押し上げて文書の下に空白を足すことがあり、
 * 閉じたあとページ最下部の余白として残る(2026-09-02 / 09-05 報告)。対策として
 * (1) ロック中は html/body の overflow も hidden にし、(2) 入力欄からフォーカスが
 * 外れたら window のスクロールを 0 に戻し、(3) 解除時はフォーカスを外してから
 * 復元し、再描画後にもう一度スクロール位置を復元する。
 *
 * iOS（Chrome / Safari）では、ロックをかけてシートを開いた直後に、そのシートの一部が**描かれないまま**残ることがある
 * （2026-09-30 ユーザー報告。1 回目は検索欄と所属チップの 2 行ぶん、2 回目は検索後にメンバーのピッカーを開いたとき
 * 絞り込みの下の帯がページ背景色のまま。どちらも閉じて開き直すと直る = レイアウトではなく描画の取りこぼし）。
 * Linux の Chromium では再現しないので原因は未確定だが、ロックで長い文書の body を fixed に切り替えるのと同じタイミングで
 * 固定のオーバーレイが作られることが怪しい。**開いた直後に、オーバーレイを 1 フレームだけ別のレイヤーに載せて
 * 描き直させる**保険を入れた（`repaintOverlays`。実機では未検証 — 再発したら pending.md 17 を見る）。
 */

const stack: symbol[] = [];
/** スクロールロックを要求しているモーダルの数(ロックしないダイアログは数えない) */
let lockCount = 0;
let savedScrollY = 0;

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

// ロック中に入力欄のキーボードが閉じたら、Safari が押し上げたぶんを戻す
function onFocusOut(event: FocusEvent): void {
  if (!isTextField(event.target)) return;
  requestAnimationFrame(() => {
    if (lockCount > 0) window.scrollTo(0, 0);
  });
}

/**
 * 開いた直後のオーバーレイを 1 フレームだけ `translateZ(0)` にして、レイヤーの描き直しを促す
 * （iOS で一部が描かれないまま残る件の保険。見た目は変わらない）。レイアウトが落ち着く前と後の 2 回行う。
 * オーバーレイは各部品の `.overlay` — 閉じる途中で消えている要素は触らない
 */
export function repaintOverlays(): void {
  const nudge = (): void => {
    const layers = [...document.querySelectorAll<HTMLElement>(".overlay")];
    for (const el of layers) el.style.transform = "translateZ(0)";
    requestAnimationFrame(() => {
      for (const el of layers) if (el.isConnected) el.style.removeProperty("transform");
    });
  };
  requestAnimationFrame(() => requestAnimationFrame(nudge));
  window.setTimeout(nudge, 300);
}

function lock(): void {
  savedScrollY = window.scrollY;
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.top = `-${String(savedScrollY)}px`;
  document.body.style.width = "100%";
  document.addEventListener("focusout", onFocusOut);
}

function unlock(): void {
  document.removeEventListener("focusout", onFocusOut);
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.width = "";
  const y = savedScrollY;
  window.scrollTo(0, y);
  requestAnimationFrame(() => window.scrollTo(0, y));
}

/**
 * いまの縦スクロール位置。ロック中は body を固定する前に退避した値を返す
 * （ロック中の `window.scrollY` は 0 なので、サイドメニューを開いたまま位置を覚えるときはこちらを使う）
 */
export function currentScrollY(): number {
  return lockCount > 0 ? savedScrollY : window.scrollY;
}

/**
 * ライフサイクルに縛られない版: 呼んだ時点でロック+Escape 監視を始め、release() で終える。
 * 常時マウントしたまま open / close を切り替える部品(サイドメニュー)から使う
 */
export function acquireModalChrome(
  onClose: () => void,
  options?: { lockScroll?: boolean },
): { release: () => void } {
  const token = Symbol("modal");
  const lockScroll = options?.lockScroll !== false;

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && stack[stack.length - 1] === token) onClose();
  }

  document.addEventListener("keydown", onKeydown);
  if (lockScroll) {
    if (lockCount === 0) lock();
    lockCount += 1;
    repaintOverlays();
  }
  stack.push(token);

  let released = false;
  return {
    release(): void {
      if (released) return;
      released = true;
      document.removeEventListener("keydown", onKeydown);
      const index = stack.indexOf(token);
      if (index >= 0) stack.splice(index, 1);
      if (!lockScroll) return;
      lockCount -= 1;
      if (lockCount === 0) unlock();
    },
  };
}

/** マウント中ずっと開いているモーダル用(マウントでロック、アンマウントで解除) */
export function useModalChrome(onClose: () => void, options?: { lockScroll?: boolean }): void {
  let handle: { release: () => void } | null = null;
  onMounted(() => {
    handle = acquireModalChrome(onClose, options);
  });
  onUnmounted(() => {
    handle?.release();
    handle = null;
  });
}
